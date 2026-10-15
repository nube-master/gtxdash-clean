// pacing-toggle-campaign — Manual pause/resume via Meta API
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { resolveCampaignAccount } from '../_shared/resolveCampaignAccount.ts';
import {
  getAllMetaAccessTokens,
  getAllMetaTokensForOperation,
  getOperationFromContext,
} from '../_shared/getMetaToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Payload {
  campaign_id: string;
  account_id: string;
  campaign_name?: string;
  new_status: 'ACTIVE' | 'PAUSED';
  reason?: string;
  /**
   * Só usado quando new_status='PAUSED':
   * - 'sticky' (default): cooldown set_by='manual' permanente até religar manual.
   * - 'wake_up': cooldown set_by='manual_until' expira no próximo HH:MM BRT
   *   (informados em wake_up_hour_brt/wake_up_minute_brt). Regras de activate
   *   (ATIVAR|TOP) NÃO são bloqueadas por esse tipo.
   * - 'until_5am_brt' (legacy): alias de wake_up com 05:00 BRT.
   */
  pause_mode?: 'sticky' | 'wake_up' | 'until_5am_brt';
  wake_up_hour_brt?: number;   // 0-23
  wake_up_minute_brt?: number; // 0 ou 30
}

/** Próximo HH:MM BRT em ISO UTC. BRT = UTC-3 sem DST → HH BRT = (HH+3) UTC. */
function nextWakeUpBrtIso(hourBrt: number, minuteBrt = 0, now: Date = new Date()): string {
  const h = Math.min(23, Math.max(0, Math.floor(hourBrt)));
  const m = minuteBrt === 30 ? 30 : 0;
  const d = new Date(now);
  const utcHour = h + 3;
  d.setUTCHours(utcHour % 24, m, 0, 0);
  if (utcHour >= 24) d.setUTCDate(d.getUTCDate() + 1);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}


function legacyTokenForAccount(accountId: string): string | null {
  const huIds = (Deno.env.get('HU_TOKEN_ACCOUNT_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const normalized = accountId.replace(/^act_/, '');
  return huIds.includes(normalized)
    ? Deno.env.get('META_TOKEN_HU') ?? null
    : Deno.env.get('META_TOKEN_CATALOG') ?? null;
}

// Resolve TODOS os tokens disponíveis (app_settings + secrets permanentes
// META_ACCESS_TOKEN / _2 / _HU / _CATALOG / META_ADS_ACCESS_TOKEN) via o
// helper compartilhado, mais o legacy split por conta como fallback final.
// Tentamos em sequência; o primeiro que aceitar a chamada vence.
async function resolveTokens(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
): Promise<string[]> {
  const tokens = await getAllMetaAccessTokens(supabase as any);
  const legacy = legacyTokenForAccount(accountId);
  if (legacy && !tokens.includes(legacy)) tokens.push(legacy);
  return tokens;
}

async function callMeta(campaignId: string, status: 'ACTIVE' | 'PAUSED', token: string) {
  const url = `https://graph.facebook.com/v22.0/${campaignId}`;
  const body = new URLSearchParams({ status, access_token: token });
  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta API ${res.status}`);
  }
  return json;
}

async function fetchMetaStatus(campaignId: string, token: string) {
  const url = `https://graph.facebook.com/v22.0/${campaignId}?fields=status,effective_status&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) return null;
  return json as { status?: string; effective_status?: string };
}

interface ToggleResult {
  success: boolean;
  error?: string;
  dry_run?: boolean;
  confirmed_status?: string;
  confirmed_effective_status?: string;
  account_id?: string;
  operation_id?: string;
}

async function processToggle(body: Payload): Promise<ToggleResult> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let campaignName = body.campaign_name?.trim() || '';
    if (!campaignName) {
      try {
        const { data: existing } = await supabase
          .from('meta_campaign_status')
          .select('campaign_name')
          .eq('campaign_id', body.campaign_id)
          .maybeSingle();
        campaignName = String((existing as any)?.campaign_name || body.campaign_id);
      } catch (_) {
        campaignName = body.campaign_id;
      }
    }

    // Conta REAL da campanha (frontend às vezes manda o campaign_id no account_id).
    const ctx = await resolveCampaignAccount(body.campaign_id, body.account_id);
    const accountId = ctx.accountId || body.account_id;

    // F8.B.6 batch 4.2 — Vault-first resolver (multi-tenant aware) with legacy fallback.
    const { operationId: rootOpId } = await getOperationFromContext({
      accountId,
      explicitOperationId: (body as any).operation_id || ctx.operationId || undefined,
    });
    const tokensWithMeta = await getAllMetaTokensForOperation(rootOpId);
    const tokens: string[] = tokensWithMeta.map((t) => t.token);

    // Defense in depth: se Vault + legacy do helper esvaziarem, cai no legacy split por conta.
    if (tokens.length === 0) {
      const legacyPool = await resolveTokens(supabase, accountId);
      tokens.push(...legacyPool);
    } else {
      const legacy = legacyTokenForAccount(accountId);
      if (legacy && !tokens.includes(legacy)) tokens.push(legacy);
    }

    if (tokens.length === 0) {
      throw new Error('no_meta_token_configured');
    }

    // Preflight log ANTES de acionar Meta API (ação irreversível).
    await supabase.from('integration_logs').insert({
      integration: 'meta_ads',
      status: 'info',
      operation_id: rootOpId,
      message: JSON.stringify({
        event: 'pacing_action_preflight',
        edge_function: 'pacing-toggle-campaign',
        action: body.new_status,
        campaign_id: body.campaign_id,
        account_id: accountId,
        account_id_input: body.account_id,
        account_resolved_from: ctx.source,
        token_pool_size: tokensWithMeta.length,
        token_sources: tokensWithMeta.map((t) => t.source),
        via_vault: tokensWithMeta.length > 0 && tokensWithMeta.every((t) => t.source === 'vault'),
      }),
    }).then(() => {}).catch(() => {});

    // Check dry-run
    const { data: dryRunRow } = await supabase
      .from('pacing_settings')
      .select('value')
      .eq('key', 'dry_run_global')
      .maybeSingle();
    const dryRun = dryRunRow?.value === true;

    let metaResponse: unknown = { dry_run: true };
    let confirmedStatus: string = body.new_status;
    let confirmedEffective: string = body.new_status;
    let metaError: string | null = null;
    let usedToken: string | null = tokens[0];
    const metaAttempts: Array<{ token_index: number; ok: boolean; error?: string }> = [];
    if (!dryRun) {
      for (const [idx, tk] of tokens.entries()) {
        try {
          metaResponse = await callMeta(body.campaign_id, body.new_status, tk);
          usedToken = tk;
          metaError = null;
          metaAttempts.push({ token_index: idx + 1, ok: true });
          break;
        } catch (e) {
          metaError = e instanceof Error ? e.message : String(e);
          metaAttempts.push({ token_index: idx + 1, ok: false, error: metaError.slice(0, 300) });
          // Só tenta o próximo token se for erro de permissão/token; outros erros (rate-limit etc) interrompem.
          if (!/does not exist|missing permissions|permission|OAuth|expired|invalid|access|#100|#200|#190/i.test(metaError)) {
            break;
          }
        }
      }
      if (metaError) {
        // Log falha e responde 200 com success:false (evita blank screen na UI)
        await supabase.from('pacing_action_log').insert({
          campaign_id: body.campaign_id,
          campaign_name: campaignName,
          account_id: accountId,
          operation_id: rootOpId,
          action_type: body.new_status === 'PAUSED' ? 'pause' : 'resume',
          reason: body.reason ?? `Manual ${body.new_status} via UI`,
          dry_run: false,
          success: false,
          meta_response: { error: metaError, tokens_tried: tokens.length, attempts: metaAttempts } as Record<string, unknown>,
        });
        const friendly = /does not exist|missing permissions|permission|OAuth|expired|invalid|#100|#190/i.test(metaError)
          ? `Nenhum dos ${tokens.length} token(s) Meta da operação tem acesso à conta ${accountId || '(desconhecida)'}. Verifique o token dessa operação em Integrações.`
          : metaError;
        console.error('[pacing-toggle-campaign] Meta falhou', friendly);
        return { success: false, error: friendly, account_id: accountId, operation_id: rootOpId };
      }
      // Confirmação proativa: relê o status real do Meta (1 GET) pra capturar
      // estados intermediários (IN_PROCESS, WITH_ISSUES, etc) e refletir já.
      const verified = await fetchMetaStatus(body.campaign_id, usedToken!);
      if (verified?.status) confirmedStatus = verified.status;
      if (verified?.effective_status) confirmedEffective = verified.effective_status;
    }

    // Update local cache com o status confirmado pelo Meta
    await supabase
      .from('meta_campaign_status')
      .update({
        status: confirmedStatus,
        effective_status: confirmedEffective,
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', body.campaign_id);

    // ─── Sticky manual pause (permanente até religar manual) ────────────────
    // Quando o operador PAUSA manualmente, grava cooldown set_by='manual' com
    // snoozed_until MUITO longo (praticamente "para sempre"). Isso bloqueia
    // TODAS as regras automáticas — inclusive religar amanhã — até que o
    // operador religue manualmente (RESUME manual limpa o cooldown).
    // Motivo: se o operador pausou na mão, ele quer que fique pausada por
    // algum motivo bom; nenhuma regra deve reverter essa decisão sozinha.
    if (!dryRun) {
      if (body.new_status === 'PAUSED') {
        const pauseMode = body.pause_mode ?? 'sticky';
        // Remove qualquer cooldown automático/lock anterior dessa campanha.
        // A pausa manual é soberana e deve virar o único estado de bloqueio.
        await supabase.from('pacing_cooldowns').delete().eq('campaign_id', body.campaign_id);
        if (pauseMode === 'wake_up' || pauseMode === 'until_5am_brt') {
          // Cooldown auto-expirável no próximo HH:MM BRT.
          // set_by='manual_until' → pacing-controller trata igual reactivation_lock:
          // bloqueia pause/reduce_budget, mas LIBERA regras de activate (ATIVAR|TOP).
          const legacyDefault = pauseMode === 'until_5am_brt';
          const hourBrt = legacyDefault ? 5 : (typeof body.wake_up_hour_brt === 'number' ? body.wake_up_hour_brt : 5);
          const minuteBrt = legacyDefault ? 0 : (body.wake_up_minute_brt === 30 ? 30 : 0);
          const snoozedUntil = nextWakeUpBrtIso(hourBrt, minuteBrt);
          const hhmm = `${String(hourBrt).padStart(2, '0')}:${String(minuteBrt).padStart(2, '0')}`;
          await supabase.from('pacing_cooldowns').insert({
            campaign_id: body.campaign_id,
            rule_id: null,
            operation_id: rootOpId,
            snoozed_until: snoozedUntil,
            reason: body.reason ?? `Pause manual via UI — expira ${snoozedUntil} (${hhmm} BRT; ATIVAR|TOP libera)`,
            set_by: 'manual_until',
          });
        } else {
          // Sticky: 100 anos, bloqueia TUDO até religar manual.
          const stickyUntil = new Date();
          stickyUntil.setUTCFullYear(stickyUntil.getUTCFullYear() + 100);
          await supabase.from('pacing_cooldowns').insert({
            campaign_id: body.campaign_id,
            rule_id: null,
            operation_id: rootOpId,
            snoozed_until: stickyUntil.toISOString(),
            reason: body.reason ?? 'Pause manual via UI — sticky até religar manual (nenhuma regra pode religar)',
            set_by: 'manual',
          });
        }
      } else {
        // RESUME manual: limpa qualquer cooldown (manual, manual_until ou de regra) para
        // não bloquear futuras decisões automáticas após o operador religar.
        await supabase.from('pacing_cooldowns').delete().eq('campaign_id', body.campaign_id);
      }
    }


    // Log
    const { error: logErr } = await supabase.from('pacing_action_log').insert({
      campaign_id: body.campaign_id,
      campaign_name: campaignName,
      account_id: accountId,
      operation_id: rootOpId,
      action_type: body.new_status === 'PAUSED' ? 'pause' : 'resume',
      reason: body.reason ?? `Manual ${body.new_status} via UI`,
      dry_run: dryRun,
      success: true,
      meta_response: metaResponse as Record<string, unknown>,
    });
    if (logErr) console.error('[pacing-toggle-campaign] falha ao gravar pacing_action_log', logErr);

    return {
      success: true,
      dry_run: dryRun,
      confirmed_status: confirmedStatus,
      confirmed_effective_status: confirmedEffective,
      account_id: accountId,
      operation_id: rootOpId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pacing-toggle-campaign]', msg);
    return { success: false, error: msg };
  }
}

import { requirePrivilegedAccess } from '../_shared/requirePrivilegedAccess.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Pacing toggle requires privileged access to the operation
  // We'll extract operation_id from the payload or from the account context
  let body: Payload;
  try {
    const clone = req.clone();
    body = await clone.json();
  } catch (_) {
    return jsonResponse({ error: 'invalid_payload' }, 400);
  }

  // Resolve a conta real da campanha antes de decidir o tenant (frontend pode
  // ter mandado o campaign_id no campo account_id).
  const preCtx = await resolveCampaignAccount(body.campaign_id, body.account_id);
  const { operationId } = await getOperationFromContext({
    accountId: preCtx.accountId || body.account_id,
    explicitOperationId: (body as any).operation_id || preCtx.operationId || undefined,
  });
  const guard = await requirePrivilegedAccess(req, operationId);
  if (!guard.ok) return guard.response;

  try {
    if (!body.campaign_id || !['ACTIVE', 'PAUSED'].includes(body.new_status)) {
      return jsonResponse({ error: 'invalid payload' }, 400);
    }

    // Síncrono de propósito: o operador precisa ver o erro do Meta na hora.
    const result = await processToggle(body);
    if (!result.success) {
      return jsonResponse({
        success: false,
        error: result.error ?? 'Falha desconhecida ao alterar a campanha no Meta',
        campaign_id: body.campaign_id,
      }, 200);
    }

    return jsonResponse({
      success: true,
      accepted: true,
      dry_run: Boolean(result.dry_run),
      campaign_id: body.campaign_id,
      new_status: body.new_status,
      confirmed_status: result.confirmed_status ?? body.new_status,
      confirmed_effective_status: result.confirmed_effective_status ?? body.new_status,
      account_id: result.account_id,
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: msg }, 500);
  }
});

