// Health check diário do spend_brl (guard rail do bug de valor congelado).
// Roda via cron 00:30 BRT. Chama a RPC get_spend_brl_consistency() e, se houver
// drift, dispara push data_health_report por operação.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { mirrorToWebPush } from '../_shared/push-mirror.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Row {
  operation_id: string;
  operation_name: string;
  date: string;
  table_name: string;
  total_rows: number;
  suspect_rows: number;
  bug_rows: number;
  sum_spend_brl: number;
  sum_expected_brl: number;
  diff_pct: number;
  status: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_spend_brl_consistency`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const details = await res.text();
      console.error(`[spend-brl-health] RPC failed [${res.status}]: ${details}`);
      return new Response(JSON.stringify({ error: 'RPC failed', status: res.status, details }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows: Row[] = await res.json();
    const bad = rows.filter((r) => r.status !== 'OK');
    console.log(`[spend-brl-health] ${rows.length} linhas avaliadas, ${bad.length} com drift`);

    // Agrupa por operação e notifica só quem tem problema.
    const byOp = new Map<string, Row[]>();
    for (const r of bad) {
      const list = byOp.get(r.operation_id) ?? [];
      list.push(r);
      byOp.set(r.operation_id, list);
    }

    for (const [opId, list] of byOp) {
      const name = list[0].operation_name ?? 'Operação';
      const detalhes = list
        .map(
          (r) =>
            `${r.date} ${r.table_name}: ${r.bug_rows} bug / ${r.suspect_rows} suspeitas — R$ ${Number(
              r.sum_spend_brl,
            ).toFixed(2)} vs esperado R$ ${Number(r.sum_expected_brl).toFixed(2)} (${Number(r.diff_pct).toFixed(1)}%)`,
        )
        .join('\n');

      await mirrorToWebPush({
        operation_id: opId,
        notification_type: 'data_health_report',
        title: `⚠️ Investimento (BRL) inconsistente — ${name}`,
        body: detalhes.slice(0, 600),
        url: '/system-health',
        payload: { detalhes: detalhes.slice(0, 600), total_linhas: String(list.length) },
      });
    }

    return new Response(JSON.stringify({ checked: rows.length, drift: bad.length, rows }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[spend-brl-health] fatal:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
