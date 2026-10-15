// Salva um token Meta Ads no Vault + operation_credentials.
// Fluxo em duas etapas:
//   1) POST { mode: "preview", token }  → valida token contra /me e retorna
//      lista de contas de anúncio acessíveis (sem persistir nada).
//   2) POST { mode: "save", operation_id, token, label, account_ids: string[] }
//      → cria secret no Vault, insere operation_credentials, upsert em
//      meta_ad_accounts para as contas selecionadas.
//
// Autorização: JWT válido + usuário super_admin OU membro admin/owner da
// operação alvo. Não é usado por integrações públicas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ---- Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // ---- Body
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const mode = body?.mode;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token || token.length < 40) return json({ error: "invalid_token_format" }, 400);

  // ---- Validate against Meta
  const graphVersion = "v23.0";
  const probe = await fetch(
    `https://graph.facebook.com/${graphVersion}/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
  );
  const probeBody = await probe.json().catch(() => ({}));
  if (!probe.ok || probeBody?.error) {
    return json({
      error: "meta_rejected_token",
      details: probeBody?.error?.message ?? `HTTP ${probe.status}`,
    }, 400);
  }
  const meId = probeBody?.id;
  const meName = probeBody?.name;

  // ---- Fetch accessible ad accounts
  const fields = "id,account_id,name,account_status,currency,timezone_name,business{id,name}";
  type DiscoveredAccount = {
    account_id: string;
    name: string;
    account_status?: number;
    currency?: string | null;
    timezone_name?: string | null;
    business_id?: string | null;
    business_name?: string | null;
  };

  function normalizeAccount(a: any, fallbackBusiness?: { id?: string; name?: string }): DiscoveredAccount | null {
    const accountId = String(a?.id ?? (a?.account_id ? `act_${a.account_id}` : "")).trim();
    if (!accountId) return null;
    const business = a?.business ?? fallbackBusiness ?? null;
    return {
      account_id: accountId,
      name: a?.name ?? `Conta ${accountId}`,
      account_status: a?.account_status,
      currency: a?.currency ?? null,
      timezone_name: a?.timezone_name ?? null,
      business_id: business?.id ?? null,
      business_name: business?.name ?? null,
    };
  }

  async function pullPaged(url: string, onItem: (item: any) => void): Promise<void> {
    let next: string | null = url;
    let pages = 0;
    while (next) {
      const r: Response = await fetch(next);
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      if (Array.isArray(j.data)) j.data.forEach(onItem);
      next = j.paging?.next ?? null;
      if (++pages > 50) break;
    }
  }

  async function fetchAllAccounts(): Promise<any[]> {
    const byId = new Map<string, DiscoveredAccount>();
    const add = (raw: any, business?: { id?: string; name?: string }) => {
      const normalized = normalizeAccount(raw, business);
      if (normalized && !byId.has(normalized.account_id)) byId.set(normalized.account_id, normalized);
    };

    // 1) Contas atribuídas diretamente ao usuário/system user do token.
    await pullPaged(
      `https://graph.facebook.com/${graphVersion}/me/adaccounts?fields=${fields}&limit=500&access_token=${encodeURIComponent(token)}`,
      (item) => add(item),
    );

    // 2) BMs visíveis pelo token + contas owned/client dentro de cada BM.
    // Algumas contas não aparecem em /me/adaccounts, mas aparecem via BM — esse
    // era o caso das contas novas da Escola do Dólar.
    const businesses: Array<{ id: string; name: string }> = [];
    await pullPaged(
      `https://graph.facebook.com/${graphVersion}/me/businesses?fields=id,name&limit=200&access_token=${encodeURIComponent(token)}`,
      (item) => {
        if (item?.id) businesses.push({ id: item.id, name: item.name ?? item.id });
      },
    );

    await Promise.all(
      businesses.flatMap((business) => [
        pullPaged(
          `https://graph.facebook.com/${graphVersion}/${business.id}/owned_ad_accounts?fields=${fields}&limit=500&access_token=${encodeURIComponent(token)}`,
          (item) => add(item, business),
        ),
        pullPaged(
          `https://graph.facebook.com/${graphVersion}/${business.id}/client_ad_accounts?fields=${fields}&limit=500&access_token=${encodeURIComponent(token)}`,
          (item) => add(item, business),
        ),
      ]),
    );

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  let accounts: any[] = [];
  try { accounts = await fetchAllAccounts(); }
  catch (e) {
    return json({ error: "meta_accounts_fetch_failed", details: (e as Error).message }, 400);
  }

  const normalizedAccounts = accounts.map((a) => normalizeAccount(a)).filter((a): a is DiscoveredAccount => !!a);

  // ---- PREVIEW mode
  if (mode === "preview") {
    return json({
      ok: true,
      me: { id: meId, name: meName },
      total: normalizedAccounts.length,
      accounts: normalizedAccounts,
    });
  }

  // ---- SAVE mode
  if (mode !== "save") return json({ error: "invalid_mode" }, 400);

  const operationId = typeof body?.operation_id === "string" ? body.operation_id : "";
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const selected: string[] = Array.isArray(body?.account_ids)
    ? body.account_ids.map((s: any) => String(s).startsWith("act_") ? String(s).trim() : `act_${s}`).filter(Boolean)
    : [];
  if (!operationId) return json({ error: "operation_id_required" }, 400);
  if (!label || !/^[a-z0-9_\-\|\s]{2,60}$/i.test(label))
    return json({ error: "invalid_label", details: "use 2-60 chars: letras, números, _, -, | ou espaços" }, 400);
  if (selected.length === 0) return json({ error: "no_accounts_selected" }, 400);

  // ---- AuthZ: super_admin OU membro admin/owner da operação
  const { data: sa } = await admin.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
  let authorized = !!sa;
  if (!authorized) {
    const { data: member } = await admin
      .from("operation_members")
      .select("role")
      .eq("operation_id", operationId)
      .eq("user_id", userId)
      .maybeSingle();
    authorized = !!member && ["owner", "admin"].includes(String(member.role));
  }
  if (!authorized) return json({ error: "forbidden" }, 403);

  // ---- Vault: create/rotate secret
  const profileKey = label;
  const vaultSecretName = `op_${operationId.replace(/-/g, "").slice(0, 12)}_meta_${profileKey}`.toLowerCase();

  // Se já existe credencial com esse profile_key, faz rotação (novo vault secret + update row)
  const { data: existingCred } = await admin
    .from("operation_credentials")
    .select("id, vault_secret_name")
    .eq("operation_id", operationId)
    .eq("provider", "meta_ads")
    .eq("profile_key", profileKey)
    .maybeSingle();

  const { data: vaultSecretId, error: vaultErr } = await admin.rpc("vault_create_secret_wrapper", {
    secret_value: token,
    secret_name: `${vaultSecretName}_${Date.now()}`,
    secret_description: `Meta Ads token '${profileKey}' (op ${operationId}) — set by ${userId}`,
  });
  if (vaultErr) return json({ error: "vault_error", details: vaultErr.message }, 500);

  const credentialPayload = {
    operation_id: operationId,
    provider: "meta_ads",
    profile_key: profileKey,
    vault_secret_id: vaultSecretId,
    vault_secret_name: `${vaultSecretName}_${Date.now()}`,
    account_ids: selected,
    status: "active",
    metadata: {
      set_by: userId,
      set_at: new Date().toISOString(),
      me_id: meId,
      me_name: meName,
      source: "save-meta-token",
    },
  };

  let credentialId = existingCred?.id;
  if (existingCred) {
    const { error: upErr } = await admin
      .from("operation_credentials")
      .update({
        vault_secret_id: vaultSecretId,
        vault_secret_name: credentialPayload.vault_secret_name,
        account_ids: selected,
        status: "active",
        rotated_at: new Date().toISOString(),
        metadata: credentialPayload.metadata,
      })
      .eq("id", existingCred.id);
    if (upErr) return json({ error: "update_failed", details: upErr.message }, 500);
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("operation_credentials")
      .insert(credentialPayload)
      .select("id")
      .single();
    if (insErr) return json({ error: "insert_failed", details: insErr.message }, 500);
    credentialId = inserted.id;
  }

  // ---- Upsert das contas selecionadas em meta_ad_accounts
  const byId = new Map(normalizedAccounts.map((a) => [a.account_id, a]));
  const rows = await Promise.all(selected.map(async (id) => {
    const normalizedId = String(id).startsWith("act_") ? String(id) : `act_${id}`;
    const a = byId.get(id) ?? byId.get(normalizedId);
    let name = a?.name && !a.name.startsWith("Conta act_") ? a.name : null;
    let currency = a?.currency ?? null;
    let timezone = a?.timezone_name ?? null;

    // Nome ausente na descoberta: busca direto na conta para evitar "Conta act_...".
    if (!name) {
      try {
        const r = await fetch(
          `https://graph.facebook.com/${graphVersion}/${normalizedId}?fields=name,currency,timezone_name&access_token=${encodeURIComponent(token)}`,
        );
        const j = await r.json().catch(() => ({}));
        if (j?.name) {
          name = String(j.name);
          currency = currency ?? j.currency ?? null;
          timezone = timezone ?? j.timezone_name ?? null;
        }
      } catch { /* mantém fallback */ }
    }

    return {
      account_id: normalizedId,
      account_name: name ?? `Conta ${normalizedId}`,
      currency: currency ?? "USD",
      timezone: timezone ?? "America/Sao_Paulo",
      is_active: true,
      operation_id: operationId,
    };
  }));
  const { error: accErr } = await admin
    .from("meta_ad_accounts")
    .upsert(rows, { onConflict: "account_id" });
  if (accErr) return json({ error: "accounts_upsert_failed", details: accErr.message }, 500);

  return json({
    ok: true,
    credential_id: credentialId,
    profile_key: profileKey,
    accounts_saved: selected.length,
    total_accounts_available: normalizedAccounts.length,
  });
});
