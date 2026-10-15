// One-shot endpoint: pausa N campanhas via Meta + grava bloqueio manual sticky.
// Útil quando a regra `campaign_hourly_cap` não viu a campanha (token sem visibilidade
// no fetch /campaigns mas com permissão de write/status). Use simulate=true pra ver
// sem executar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  campaign_ids: string[];
  rule_id?: string;
  cooldown_minutes?: number;
  reason?: string;
  simulate?: boolean;
  operation_id?: string;
}

async function pauseCampaignMeta(campaignId: string, token: string): Promise<unknown> {
  const url = `https://graph.facebook.com/v23.0/${campaignId}?access_token=${encodeURIComponent(token)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'PAUSED' }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Meta ${resp.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

async function getCampaignName(campaignId: string, token: string): Promise<string | null> {
  const url = `https://graph.facebook.com/v23.0/${campaignId}?fields=name,status,account_id&access_token=${encodeURIComponent(token)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const json = await resp.json().catch(() => ({} as Record<string, unknown>));
  return (json?.name as string) ?? null;
}

import { requirePrivilegedAccess } from '../_shared/requirePrivilegedAccess.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const bodyClone = await req.clone().json().catch(() => ({}));
  const operationId = bodyClone.operation_id || '0b758a2b-1b92-4769-b47b-416c567e320d'; // GTX fallback

  const guard = await requirePrivilegedAccess(req, operationId);
  if (!guard.ok) return guard.response;



  try {
    const body = (await req.json()) as Body;
    if (!Array.isArray(body.campaign_ids) || body.campaign_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'campaign_ids required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const cooldownMin = body.cooldown_minutes ?? 60;
    const simulate = Boolean(body.simulate);
    const reason = body.reason ?? `manual_pause — sticky até religar manualmente`;
    const ruleId = body.rule_id ?? '2d1a1f4e-1afd-4992-accb-d77925b011af'; // F3 R$200

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Token isolado por operação
    const opId = body.operation_id;
    let tokens: string[] = [];
    
    if (opId) {
      const { data: token, error: tokenErr } = await supabase.rpc('get_operation_credential', {
        p_operation_id: opId,
        p_provider: 'meta_ads',
        p_profile_key: 'default'
      });
      if (!tokenErr && token) {
        tokens = [token];
      }
    }

    if (tokens.length === 0) {
      // Fallback global legível
      const { data: tokenRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'meta_ads_access_token')
        .maybeSingle();
      const tokenRaw = (tokenRow?.value ?? null) as string | { token?: string } | null;
      const globalToken = typeof tokenRaw === 'string' ? tokenRaw : tokenRaw?.token ?? null;
      tokens = [
        globalToken,
        Deno.env.get('META_TOKEN_CATALOG'),
        Deno.env.get('META_TOKEN_HU'),
      ].filter((t): t is string => Boolean(t && t.length > 0));
    }

    const results: Array<Record<string, unknown>> = [];
    const stickyUntil = new Date();
    stickyUntil.setUTCFullYear(stickyUntil.getUTCFullYear() + 100);
    const snoozedUntil = stickyUntil.toISOString();

    for (const campaignId of body.campaign_ids) {
      const item: Record<string, unknown> = { campaign_id: campaignId };
      let workingToken: string | null = null;
      let name: string | null = null;
      // descobre token que funciona
      for (const t of tokens) {
        const n = await getCampaignName(campaignId, t).catch(() => null);
        if (n) { workingToken = t; name = n; break; }
      }
      item.name = name;
      if (!workingToken) {
        item.error = 'nenhum token Meta conseguiu ler a campanha';
        results.push(item);
        continue;
      }

      if (simulate) {
        item.simulated = true;
      } else {
        try {
          item.meta_response = await pauseCampaignMeta(campaignId, workingToken);
          item.paused = true;
        } catch (err) {
          item.error = (err as Error).message;
          results.push(item);
          continue;
        }

        // bloqueio manual soberano: limpa locks automáticos e grava uma trava sem regra.
        await supabase.from('pacing_cooldowns').delete().eq('campaign_id', campaignId);
        const { error: cdErr } = await supabase.from('pacing_cooldowns').insert({
          campaign_id: campaignId,
          rule_id: null,
          snoozed_until: snoozedUntil,
          reason,
          set_by: 'manual',
        });
        if (cdErr) item.cooldown_error = cdErr.message;
        else item.cooldown_until = snoozedUntil;

        // action log
        await supabase.from('pacing_action_log').insert({
          rule_id: ruleId,
          campaign_id: campaignId,
          campaign_name: name ?? campaignId,
          account_id: 'unknown',
          operation_id: operationId,
          action_type: 'pause',
          reason,
          spend_at_action: 0,
          spend_last_hour: null,
          daily_budget: null,
          sales_last_hour: null,
          dry_run: false,
          success: true,
          meta_response: { manual: true },
          error_message: null,
          pushcut_sent: false,
          pushcut_response: null,
          triggered_at: new Date().toISOString(),
        });
      }
      results.push(item);
    }

    return new Response(JSON.stringify({ ok: true, simulate, sticky_manual_pause: true, ignored_cooldown_minutes: cooldownMin, results }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
