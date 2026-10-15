// pacing-update-campaign — Atualiza nome e/ou daily_budget de uma campanha via Meta API
// Recebe daily_budget em BRL (UI já vê tudo em BRL após conversão de sync-campaign-status);
// converte BRL → moeda da conta → centavos antes de enviar pro Meta.
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
  name?: string;
  daily_budget_brl?: number; // valor absoluto em BRL (após qualquer % aplicada no client)
  reason?: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function legacyTokenForAccount(accountId: string): string | null {
  const huIds = (Deno.env.get('HU_TOKEN_ACCOUNT_IDS') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const normalized = accountId.replace(/^act_/, '');
  return huIds.includes(normalized)
    ? Deno.env.get('META_TOKEN_HU') ?? null
    : Deno.env.get('META_TOKEN_CATALOG') ?? null;
}

async function resolveTokens(supabase: ReturnType<typeof createClient>, accountId: string): Promise<string[]> {
  const tokens = await getAllMetaAccessTokens(supabase as any);
  const legacy = legacyTokenForAccount(accountId);
  if (legacy && !tokens.includes(legacy)) tokens.push(legacy);
  return tokens;
}

async function tryWithTokens<T>(tokens: string[], fn: (t: string) => Promise<T>): Promise<T> {
  let lastErr: any = null;
  for (const t of tokens) {
    try { return await fn(t); } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('no_token_worked');
}

async function callMetaUpdate(campaignId: string, params: Record<string, string>, token: string) {
  const url = `https://graph.facebook.com/v22.0/${campaignId}`;
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta API ${res.status}`);
  }
  return json;
}

interface UpdateResult {
  success: boolean;
  error?: string;
  updates?: string[];
  daily_budget_brl?: number | null;
  daily_budget_cents?: number | null;
  account_currency?: string;
  account_id?: string;
}

async function processUpdate(body: Payload): Promise<UpdateResult> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Conta REAL da campanha (frontend às vezes manda o campaign_id no account_id).
    const ctx = await resolveCampaignAccount(body.campaign_id, body.account_id);
    const accountId = ctx.accountId || body.account_id;

    // F8.B.6 batch 4.3 — Vault-first resolver (multi-tenant aware) with legacy fallback.
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

    const hasName = typeof body.name === 'string' && body.name.trim().length > 0;
    const hasBudget = typeof body.daily_budget_brl === 'number' && isFinite(body.daily_budget_brl) && body.daily_budget_brl > 0;

    // Captura budget antigo pra preflight delta (best-effort)
    let oldBudgetBrl: number | null = null;
    try {
      const { data: existingBudget } = await supabase
        .from('meta_campaign_status')
        .select('daily_budget')
        .eq('campaign_id', body.campaign_id)
        .maybeSingle();
      const v = Number((existingBudget as any)?.daily_budget);
      if (isFinite(v) && v > 0) oldBudgetBrl = v;
    } catch (_) { /* ignore */ }

    // Preflight log ANTES de acionar Meta API (budget_update é irreversível).
    await supabase.from('integration_logs').insert({
      integration: 'meta_ads',
      status: 'info',
      operation_id: rootOpId,
      message: JSON.stringify({
        event: 'pacing_action_preflight',
        edge_function: 'pacing-update-campaign',
        action: hasBudget && hasName ? 'name_and_budget_update' : hasBudget ? 'budget_update' : 'name_update',
        campaign_id: body.campaign_id,
        account_id: accountId,
        new_budget_brl: hasBudget ? Number(body.daily_budget_brl!.toFixed(2)) : null,
        old_budget_brl: oldBudgetBrl,
        delta_pct: hasBudget && oldBudgetBrl
          ? Number((((body.daily_budget_brl! - oldBudgetBrl) / oldBudgetBrl) * 100).toFixed(1))
          : null,
        token_pool_size: tokensWithMeta.length,
        token_sources: tokensWithMeta.map((t) => t.source),
        via_vault: tokensWithMeta.length > 0 && tokensWithMeta.every((t) => t.source === 'vault'),
      }),
    }).then(() => {}).catch(() => {});

    // ===== Resolver moeda da conta + FX (BRL -> currency) =====
    let accountCurrency = 'USD';
    try {
      const { data: acc } = await supabase
        .from('meta_ad_accounts').select('currency')
        .eq('account_id', accountId).maybeSingle();
      if (acc?.currency) accountCurrency = String(acc.currency).trim().toUpperCase();
    } catch (_) { /* ignore */ }

    const fxBrlPer = new Map<string, number>([['BRL', 1]]);
    try {
      const { data: cached } = await supabase
        .from('exchange_rates_cache')
        .select('base_currency, target_currency, rate, fetched_at')
        .eq('target_currency', 'BRL').order('fetched_at', { ascending: false });
      for (const row of cached ?? []) {
        const code = String((row as any).base_currency || '').trim().toUpperCase();
        const rate = Number((row as any).rate);
        if (code && rate > 0 && !fxBrlPer.has(code)) fxBrlPer.set(code, rate);
      }
      if (!fxBrlPer.has('USD')) {
        const { data: usdLog } = await supabase
          .from('exchange_rate_log').select('rate')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        const r = Number((usdLog as any)?.rate);
        if (r > 0) fxBrlPer.set('USD', r);
      }
    } catch (_) { /* ignore */ }
    if (!fxBrlPer.has('USD')) fxBrlPer.set('USD', 5.15);
    if (!fxBrlPer.has('EUR')) fxBrlPer.set('EUR', 5.60);

    const brlPerUnit = fxBrlPer.get(accountCurrency) ?? 1;

    const updates: string[] = [];
    let newBudgetBrl: number | null = null;
    let newBudgetCents: number | null = null;

    // ===== Atualiza nome =====
    if (hasName) {
      const newName = body.name!.trim().slice(0, 400);
      await tryWithTokens(tokens, (t) => callMetaUpdate(body.campaign_id, { name: newName }, t));
      updates.push('name');
    }

    // ===== Atualiza daily_budget =====
    if (hasBudget) {
      const targetBrl = Number(body.daily_budget_brl!.toFixed(2));
      // BRL -> moeda da conta (major) -> centavos
      const majorInAccountCurrency = targetBrl / brlPerUnit;
      const cents = Math.max(1, Math.round(majorInAccountCurrency * 100));
      await tryWithTokens(tokens, (t) => callMetaUpdate(body.campaign_id, { daily_budget: String(cents) }, t));
      newBudgetBrl = targetBrl;
      newBudgetCents = cents;
      updates.push('daily_budget');
    }

    // ===== Reflete localmente em meta_campaign_status =====
    // Captura o nome antigo ANTES de atualizar pra poder propagar pro traffic_data
    // (que é joinado por campaign_name — sem isso, a campanha renomeada some da
    // listagem porque o spend de hoje fica "órfão" no nome antigo).
    let oldName: string | null = null;
    try {
      const { data: existing } = await supabase
        .from('meta_campaign_status')
        .select('campaign_name')
        .eq('campaign_id', body.campaign_id)
        .maybeSingle();
      oldName = (existing as any)?.campaign_name ?? null;
    } catch (_) { /* ignore */ }

    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (hasName) patch.campaign_name = body.name!.trim().slice(0, 400);
      if (hasBudget && newBudgetBrl != null) patch.daily_budget = newBudgetBrl;
      await supabase.from('meta_campaign_status')
        .update(patch).eq('campaign_id', body.campaign_id);
    } catch (e) {
      console.warn('[pacing-update-campaign] falha ao atualizar meta_campaign_status', e);
    }

    // ===== Propaga rename para traffic_data =====
    // traffic_data não tem campaign_id (chave é account_id+campaign_name+adset+ad+date),
    // então depois de renomear no Meta precisamos reescrever as linhas existentes pra
    // que o RPC get_live_pacing_campaigns continue casando o spend com a campanha.
    if (hasName) {
      const newName = body.name!.trim().slice(0, 400);
      if (oldName && oldName !== newName) {
        try {
          const { error: tdErr } = await supabase
            .from('traffic_data')
            .update({ campaign_name: newName, updated_at: new Date().toISOString() })
            .eq('account_id', accountId)
            .eq('campaign_name', oldName);
          if (tdErr) console.warn('[pacing-update-campaign] traffic_data rename falhou', tdErr);
        } catch (e) {
          console.warn('[pacing-update-campaign] traffic_data rename exception', e);
        }
      }
    }

    // Log auditável da ação manual (histórico do Pacing).
    if (updates.length > 0) {
      const { error: logErr } = await supabase.from('pacing_action_log').insert({
        campaign_id: body.campaign_id,
        campaign_name: (hasName ? body.name!.trim().slice(0, 400) : oldName) ?? body.campaign_id,
        account_id: accountId,
        operation_id: rootOpId,
        action_type: hasBudget
          ? ((oldBudgetBrl ?? 0) > 0 && newBudgetBrl != null && newBudgetBrl < oldBudgetBrl!
              ? 'reduce_budget'
              : 'increase_budget')
          : 'alert',
        reason: body.reason ?? `Manual ${updates.join('+')} via UI`,
        dry_run: false,
        success: true,
        daily_budget: newBudgetBrl,
        meta_response: {
          updates,
          old_budget_brl: oldBudgetBrl,
          new_budget_brl: newBudgetBrl,
          new_budget_cents: newBudgetCents,
          account_currency: accountCurrency,
        } as Record<string, unknown>,
      });
      if (logErr) console.error('[pacing-update-campaign] falha ao gravar pacing_action_log', logErr);
    }

    return {
      success: true,
      updates,
      daily_budget_brl: newBudgetBrl,
      daily_budget_cents: newBudgetCents,
      account_currency: accountCurrency,
      account_id: accountId,
    };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error('[pacing-update-campaign]', msg);
    return { success: false, error: msg };
  }
}

import { requirePrivilegedAccess } from '../_shared/requirePrivilegedAccess.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Pacing update requires privileged access to the operation
  let body: Payload;
  try {
    const clone = req.clone();
    body = await clone.json();
  } catch (_) {
    return jsonResponse({ error: 'invalid_payload' }, 400);
  }

  const preCtx = await resolveCampaignAccount(body.campaign_id, body.account_id);
  const { operationId } = await getOperationFromContext({
    accountId: preCtx.accountId || body.account_id,
    explicitOperationId: (body as any).operation_id || preCtx.operationId || undefined,
  });
  const guard = await requirePrivilegedAccess(req, operationId);
  if (!guard.ok) return guard.response;



  try {
    if (!body.campaign_id) {
      return jsonResponse({ error: 'invalid_payload' }, 400);
    }
    const hasName = typeof body.name === 'string' && body.name.trim().length > 0;
    const hasBudget = typeof body.daily_budget_brl === 'number' && isFinite(body.daily_budget_brl) && body.daily_budget_brl > 0;
    if (!hasName && !hasBudget) {
      return jsonResponse({ error: 'nothing_to_update' }, 400);
    }

    // Síncrono de propósito: erro do Meta precisa aparecer pro operador na hora.
    const result = await processUpdate(body);
    if (!result.success) {
      return jsonResponse({
        success: false,
        error: result.error ?? 'Falha desconhecida ao atualizar a campanha no Meta',
        campaign_id: body.campaign_id,
      }, 200);
    }

    return jsonResponse({
      success: true,
      accepted: true,
      campaign_id: body.campaign_id,
      updated: result.updates ?? [hasName ? 'name' : null, hasBudget ? 'daily_budget' : null].filter(Boolean),
      daily_budget_brl: result.daily_budget_brl ?? null,
      daily_budget_cents: result.daily_budget_cents ?? null,
      account_currency: result.account_currency ?? null,
    }, 200);
  } catch (e: any) {
    console.error('[pacing-update-campaign:accept]', e);
    return jsonResponse({ error: String(e?.message ?? e) }, 500);
  }
});
