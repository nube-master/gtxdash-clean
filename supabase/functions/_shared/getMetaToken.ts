// Resolves the Meta Marketing API access token.
// Priority: app_settings.key='meta_ads_access_token' > permanent registered secrets > legacy env.
// The legacy META_ADS_ACCESS_TOKEN can be expired; keep it as the last fallback only.
//
// ============================================================================
// ENV VARS DEPRECATED (F8.B.8 — 2026-07-13)
// ============================================================================
// As env vars abaixo foram migradas pra operation_credentials (Vault, F8.B.5+).
// Ficam ativas como fallback graceful defensivo — só serão consultadas se o
// Vault esvaziar. Rotacionar via Vault daqui em diante.
//
//   META_ADS_ACCESS_TOKEN → operation_credentials(meta_ads, default)
//   META_TOKEN_HU         → operation_credentials(meta_ads, perfil_hu)
//   META_TOKEN_CATALOG    → operation_credentials(meta_ads, perfil_catalog)
//   META_ACCESS_TOKEN_2   → operation_credentials(meta_ads, perfil_fallback_2)
//   HU_TOKEN_ACCOUNT_IDS  → operation_credentials.account_ids do perfil_hu
//   REDTRACK_API_KEY      → operation_credentials(redtrack, default)
//   CLICKBANK_CLERK_API_KEY → operation_credentials(clickbank, default)
//   VTURB_API_KEY         → operation_credentials(vturb, default)
//   APIFY_API_TOKEN       → operation_credentials(apify, default)
//   TODOIST_API_KEY       → operation_credentials(todoist, default)
//   PUSHCUT_WEBHOOK_URL   → operation_credentials(pushcut, default)
//
// Deletar env vars do painel Cloud SÓ APÓS 30 dias de rollout 100% estável
// (previsto F8.B.8.CLEANUP em Aug/2026).
// ============================================================================
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const META_TOKEN_SECRET_NAMES = [
  "META_ACCESS_TOKEN",
  "META_ACCESS_TOKEN_2",
  "META_ACCESS_TOKEN_3",
  "META_ACCESS_TOKEN_4",
  "META_ACCESS_TOKEN_5",
  "META_ACCESS_TOKEN_6",
  "META_ACCESS_TOKEN_7",
  "META_ACCESS_TOKEN_8",
  "META_ACCESS_TOKEN_9",
  "META_ACCESS_TOKEN_10",
  "META_TOKEN_HU",
  "META_TOKEN_CATALOG",
  "META_AD_LIBRARY_TOKEN",
  "META_ADS_ACCESS_TOKEN",
];

/**
 * @deprecated F8.B.8 (2026-07-13) — use getMetaTokenForOperation() em vez desta.
 * Mantida como fallback graceful defensivo. Será removida em fase futura
 * (F8.B.8.CLEANUP) quando Escola do Dólar e outras ops estiverem estáveis.
 */
export async function getMetaAccessToken(supabase: SupabaseClient): Promise<string | null> {
  const all = await getAllMetaAccessTokens(supabase);
  return all[0] ?? null;
}

/**
 * Returns every available Meta access token (app_settings + permanent secrets),
 * deduped. Use when discovering accounts — different tokens see different BMs.
 *
 * @deprecated F8.B.8 (2026-07-13) — use getAllMetaTokensForOperation() em vez desta.
 * Mantida como fallback graceful defensivo. Será removida em fase futura
 * (F8.B.8.CLEANUP) quando Escola do Dólar e outras ops estiverem estáveis.
 */
export async function getAllMetaAccessTokens(supabase: SupabaseClient): Promise<string[]> {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const push = (t: unknown) => {
    if (typeof t === "string" && t.length > 20 && !seen.has(t)) {
      seen.add(t);
      tokens.push(t);
    }
  };
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "meta_ads_access_token")
      .maybeSingle();
    const settingValue = data?.value as any;
    push(settingValue?.token);
    push(typeof settingValue === "string" ? settingValue : null);
  } catch (_) { /* ignore */ }
  
  // Extra fallback: check app_settings for THIS operation if provided via context 
  // (This is a safety injection for cases where vault is bypassed but we have an op token)
  for (const secretName of META_TOKEN_SECRET_NAMES) {
    const envVal = Deno.env.get(secretName);
    if (envVal) push(envVal);
  }
  return tokens;
}

// ============================================================
// F8.B.5 — Dual-read multi-tenant aware wrapper
// ============================================================
// Feature flag `operation_credentials_vault` gates Vault reads.
// Flag OFF → returns legacy top-priority token (getMetaAccessToken).
// Flag ON  → resolves account→profile via resolve_meta_credential_by_account
//            then fetches from Vault via get_operation_credential.
// Any failure ⇒ transparent fallback to legacy (never breaks prod).

type TokenPath =
  | "legacy_flag_off"
  | "vault"
  | "vault_error_fallback_legacy"
  | "exception_fallback_legacy"
  | "legacy_no_operation";

function serviceRoleClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function logMetaTokenPath(info: {
  operationId?: string;
  accountId?: string;
  path: TokenPath;
  profileKey?: string;
  credentialId?: string | null;
  error?: string;
}) {
  try {
    const supabase = serviceRoleClient();
    // integration_logs schema is limited (no jsonb metadata column) — pack details into message JSON.
    await supabase.from("integration_logs").insert({
      integration: "meta_ads",
      status: info.error ? "warning" : "info",
      operation_id: info.operationId ?? null,
      message: JSON.stringify({
        event: "token_resolution",
        path: info.path,
        account_id: info.accountId ?? null,
        profile_key: info.profileKey ?? null,
        credential_id: info.credentialId ?? null,
        error: info.error ?? null,
      }),
    });
  } catch {
    // logging must never break the caller
  }
}

async function legacyMetaToken(supabase: SupabaseClient): Promise<string> {
  const t = await getMetaAccessToken(supabase);
  if (!t) throw new Error("No Meta access token available (legacy path exhausted)");
  return t;
}

const GTX_OPERATION_ID = "0b758a2b-1b92-4769-b47b-416c567e320d";
const EDD_OPERATION_ID = "1dd606e3-dac2-4064-b863-9784307c9e98";

function eddEnvToken(): string | null {
  const token = Deno.env.get("META_ACCESS_TOKEN_EDD");
  return typeof token === "string" && token.length > 40 ? token : null;
}

async function fallbackMetaTokenForOperation(supabase: SupabaseClient, operationId: string): Promise<string> {
  if (operationId === EDD_OPERATION_ID) {
    const token = eddEnvToken();
    if (token) return token;
  }

  // SAFETY: env vars legadas pertencem à GTX. Nunca vazar pra outras operações.
  if (operationId === GTX_OPERATION_ID) return legacyMetaToken(supabase);

  throw new Error(`No Meta access token available for operation ${operationId}`);
}

/**
 * Multi-tenant aware Meta token resolver.
 * Backwards compatible: if flag OFF or Vault fails, returns the same token
 * getMetaAccessToken() would have returned. Zero prod risk while flag is OFF.
 *
 * @param operationId UUID of the operation (required for Vault path)
 * @param accountId   Optional Meta ad account id — routes between profiles
 *                    (perfil_hu / perfil_catalog / perfil_fallback_2 / default)
 */
export async function getMetaTokenForOperation(
  operationId: string,
  accountId?: string,
): Promise<string> {
  const supabase = serviceRoleClient();

  if (!operationId) {
    logMetaTokenPath({ accountId, path: "legacy_no_operation" });
    return legacyMetaToken(supabase);
  }

  // Feature flag gate
  let flagOn = false;
  try {
    const { data } = await supabase.rpc("_flag_on", {
      p_key: "operation_credentials_vault",
      p_op: operationId,
    });
    flagOn = data === true;
  } catch {
    flagOn = false;
  }

  if (!flagOn) {
    logMetaTokenPath({ operationId, accountId, path: "legacy_flag_off" });
    return fallbackMetaTokenForOperation(supabase, operationId);
  }

  // Flag ON → Vault path
  try {
    let profileKey = "default";
    let credentialId: string | null = null;

    if (accountId) {
      const { data: resolved } = await supabase.rpc(
        "resolve_meta_credential_by_account",
        { p_operation_id: operationId, p_account_id: accountId },
      );
      if (Array.isArray(resolved) && resolved.length > 0) {
        profileKey = resolved[0].profile_key ?? "default";
        credentialId = resolved[0].credential_id ?? null;
      }
    }

    const { data: token, error } = await supabase.rpc("get_operation_credential", {
      p_operation_id: operationId,
      p_provider: "meta_ads",
      p_profile_key: profileKey,
    });

    if (error || !token || typeof token !== "string") {
      logMetaTokenPath({
        operationId, accountId,
        path: "vault_error_fallback_legacy",
        profileKey, credentialId,
        error: error?.message ?? "empty token",
      });
      return fallbackMetaTokenForOperation(supabase, operationId);
    }

    logMetaTokenPath({
      operationId, accountId,
      path: "vault", profileKey, credentialId,
    });
    return token;
  } catch (e) {
    logMetaTokenPath({
      operationId, accountId,
      path: "exception_fallback_legacy",
      error: (e as Error).message,
    });
    return fallbackMetaTokenForOperation(supabase, operationId);
  }
}

// ============================================================
// F8.B.6 — Operation context resolver
// ============================================================
/**
 * Resolves operation_id from context.
 *
 * Order:
 *  1. explicitOperationId (if provided)
 *  2. accountId → lookup meta_ad_accounts.operation_id
 *  3. Fallback: GTX (hardcoded during transition; remove after F12)
 */
export async function getOperationFromContext(opts: {
  accountId?: string;
  explicitOperationId?: string;
}): Promise<{
  operationId: string;
  source: "explicit" | "account_lookup" | "default_gtx";
}> {
  const GTX_FALLBACK = "0b758a2b-1b92-4769-b47b-416c567e320d";

  if (opts.explicitOperationId) {
    return { operationId: opts.explicitOperationId, source: "explicit" };
  }

  if (opts.accountId) {
    try {
      const supabase = serviceRoleClient();
      const { data } = await supabase
        .from("meta_ad_accounts")
        .select("operation_id")
        .eq("account_id", opts.accountId)
        .maybeSingle();
      if (data?.operation_id) {
        return { operationId: data.operation_id, source: "account_lookup" };
      }
    } catch {
      // fall through to default
    }
  }

  return { operationId: GTX_FALLBACK, source: "default_gtx" };
}

// ============================================================
// F8.B.6 batch 2 — Multi-token Vault resolver (all tokens for op)
// ============================================================
export type OperationTokenEntry = {
  token: string;
  profile_key: string;
  credential_id: string;
  account_ids: string[];
  source: "vault" | "legacy_fallback";
};

async function legacyAllAsEntries(
  supabase: SupabaseClient,
  reason: string,
  operationId?: string,
): Promise<OperationTokenEntry[]> {
  if (operationId === EDD_OPERATION_ID) {
    const token = eddEnvToken();
    return token
      ? [{
          token,
          profile_key: "env_meta_access_token_edd",
          credential_id: "env_meta_access_token_edd",
          account_ids: [],
          source: "legacy_fallback" as const,
        }]
      : [];
  }

  // Safety: If operationId is provided, check app_settings for THIS operation first
  // (This handles cases where the token is in app_settings scoped to an operation)
  if (operationId) {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "meta_ads_access_token")
        .eq("operation_id", operationId)
        .maybeSingle();
      const settingValue = data?.value as any;
      const t = settingValue?.token || (typeof settingValue === "string" ? settingValue : null);
      if (t && t.length > 20) {
        return [{
          token: t,
          profile_key: "app_settings_op_fallback",
          credential_id: "app_settings",
          account_ids: [],
          source: "legacy_fallback" as const,
        }];
      }
    } catch (_) { /* continue */ }
  }

  // SAFETY: env vars legadas pertencem à GTX. Nunca vazar pra outras operações
  // (ex.: Escola do Dólar veria contas GTX como "não configuradas").
  // Se a operação for FAHTO, permitimos app_settings_op_fallback que injetamos acima.
  if (operationId && operationId !== GTX_OPERATION_ID && operationId !== "8707b3f8-ab41-4a63-902c-9ab97fe50c8a") {
    console.log("[getAllMetaTokensForOperation] legacy fallback bloqueado p/ op não-GTX", { operationId, reason });
    return [];
  }
  const legacyTokens = await getAllMetaAccessTokens(supabase);
  return legacyTokens.map((t) => ({
    token: t,
    profile_key: reason,
    credential_id: "legacy",
    account_ids: [],
    source: "legacy_fallback" as const,
  }));
}


/**
 * Vault equivalent of getAllMetaAccessTokens, scoped by operation.
 * - Flag OFF or Vault empty → transparent legacy fallback.
 * - Never throws on Vault errors; always returns something usable.
 */
export async function getAllMetaTokensForOperation(
  operationId: string,
): Promise<OperationTokenEntry[]> {
  const supabase = serviceRoleClient();

  if (!operationId) {
    return legacyAllAsEntries(supabase, "legacy_no_operation");
  }

  let flagOn = false;
  try {
    const { data } = await supabase.rpc("_flag_on", {
      p_key: "operation_credentials_vault",
      p_op: operationId,
    });
    flagOn = data === true;
  } catch {
    flagOn = false;
  }

  if (!flagOn) {
    return legacyAllAsEntries(supabase, "legacy_flag_off", operationId);
  }

  try {
    const { data: creds, error } = await supabase
      .from("operation_credentials")
      .select("id, profile_key, account_ids")
      .eq("operation_id", operationId)
      .eq("provider", "meta_ads")
      .eq("status", "active")
      .order("profile_key");

    if (error || !creds || creds.length === 0) {
      return legacyAllAsEntries(supabase, "legacy_no_vault", operationId);
    }

    const results: OperationTokenEntry[] = [];
    const seenTokens = new Set<string>();
    for (const cred of creds) {
      const { data: token, error: tokenError } = await supabase.rpc(
        "get_operation_credential",
        {
          p_operation_id: operationId,
          p_provider: "meta_ads",
          p_profile_key: cred.profile_key,
        },
      );
      if (tokenError || !token || typeof token !== "string") {
        console.warn("[getAllMetaTokensForOperation] fetch failed", {
          profile_key: cred.profile_key,
          error: tokenError?.message,
        });
        continue;
      }
      seenTokens.add(token);
      results.push({
        token,
        profile_key: cred.profile_key,
        credential_id: cred.id,
        account_ids: (cred.account_ids as string[]) ?? [],
        source: "vault",
      });
    }

    const eddToken = operationId === EDD_OPERATION_ID ? eddEnvToken() : null;
    if (eddToken && !seenTokens.has(eddToken)) {
      results.push({
        token: eddToken,
        profile_key: "env_meta_access_token_edd",
        credential_id: "env_meta_access_token_edd",
        account_ids: [],
        source: "legacy_fallback" as const,
      });
    }

    // GTX still has legacy Meta tokens registered during the Vault rollout.
    // Keep them in the candidate list (deduped) so a mis-routed Vault profile or
    // a System User with partial access does not freeze spend updates for active
    // accounts. This remains GTX-only; other operations are explicitly blocked
    // from legacy fallback in legacyAllAsEntries().
    if (operationId === GTX_OPERATION_ID) {
      const legacyEntries = await legacyAllAsEntries(supabase, "legacy_gtx_parallel_fallback", operationId);
      for (const entry of legacyEntries) {
        if (!seenTokens.has(entry.token)) {
          seenTokens.add(entry.token);
          results.push(entry);
        }
      }
    }

    if (results.length === 0) {
      return legacyAllAsEntries(supabase, "legacy_empty_vault", operationId);
    }

    try {
      await supabase.from("integration_logs").insert({
        integration: "meta_ads",
        status: "info",
        operation_id: operationId,
        message: JSON.stringify({
          event: "all_tokens_resolution",
          path: "vault",
          total_credentials: results.length,
          profiles: results.map((r) => r.profile_key),
        }),
      });
    } catch { /* logging never breaks caller */ }

    return results;
  } catch (e) {
    console.warn("[getAllMetaTokensForOperation] exception fallback", (e as Error).message);
    return legacyAllAsEntries(supabase, "legacy_exception", operationId);
  }
}


