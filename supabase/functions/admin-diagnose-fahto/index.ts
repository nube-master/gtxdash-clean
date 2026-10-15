import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const OP = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a';

  const results: any = {};

  // Q1: traffic_data últimos 2 dias
  const { data: q1 } = await supabase
    .from('traffic_data')
    .select('date, spend, updated_at, account_id')
    .eq('operation_id', OP)
    .gte('date', '2026-08-19')
    .order('date', { ascending: false });
  
  const byDate: any = {};
  (q1 || []).forEach((r: any) => {
    if (!byDate[r.date]) byDate[r.date] = { contas: new Set(), total: 0, lastSync: null };
    byDate[r.date].contas.add(r.account_id);
    byDate[r.date].total += Number(r.spend || 0);
    if (!byDate[r.date].lastSync || r.updated_at > byDate[r.date].lastSync) 
      byDate[r.date].lastSync = r.updated_at;
  });
  results.Q1_traffic_data = Object.entries(byDate).map(([date, v]: any) => ({
    date, contas: v.contas.size, total: v.total, lastSync: v.lastSync
  }));

  // Q2: cron runs hoje (using new RPC)
  const { data: q2, error: q2Err } = await supabase.rpc('admin_list_cron_runs');
  results.Q2_cron_runs_hoje = q2Err ? q2Err.message : q2;

  // Q3: pacing_action_log FAHTO
  const { data: q3 } = await supabase
    .from('pacing_action_log')
    .select('*')
    .eq('operation_id', OP)
    .order('created_at', { ascending: false })
    .limit(5);
  results.Q3_pacing_actions = q3 || [];

  // Q4: última atualização traffic_data hoje 20/08
  const { data: q4 } = await supabase
    .from('traffic_data')
    .select('account_id, spend, updated_at')
    .eq('operation_id', OP)
    .eq('date', '2026-08-20')
    .order('updated_at', { ascending: false })
    .limit(20);
  results.Q4_traffic_today = q4 || [];

  // Q5: cron jobs configurados (using new RPC)
  const { data: jobs, error: jobsErr } = await supabase.rpc('admin_list_cron_jobs');
  results.Q5_cron_config = jobsErr ? jobsErr.message : jobs;

  // Q6: cron runs últimos (using new RPC)
  const { data: runs, error: runsErr } = await supabase.rpc('admin_list_cron_runs');
  results.Q6_cron_runs_ultimos = runsErr ? runsErr.message : runs;

  // --- NOVAS QUERIES DE AUDITORIA (Q7, Q8, Q9) REWRITTEN ---

  // Q7 - traffic_data agrupado por dia (client-side agg)
  const { data: trafficRaw } = await supabase
    .from('traffic_data')
    .select('date, account_id, spend')
    .eq('operation_id', OP)
    .gte('date', '2026-08-14')
    .lte('date', '2026-08-20');

  const q7Map = new Map();
  (trafficRaw || []).forEach((r: any) => {
    const key = r.date;
    if (!q7Map.has(key)) q7Map.set(key, { total_linhas: 0, contas_unicas: new Set(), total_spend: 0 });
    const entry = q7Map.get(key);
    entry.total_linhas++;
    entry.contas_unicas.add(r.account_id);
    entry.total_spend += Number(r.spend || 0);
  });
  results.Q7_traffic_por_dia = Array.from(q7Map.entries()).map(([date, v]: any) => ({
    date,
    total_linhas: v.total_linhas,
    contas_unicas: v.contas_unicas.size,
    total_spend: v.total_spend,
    ratio_linhas_contas: (v.total_linhas / v.contas_unicas.size).toFixed(2)
  })).sort((a, b) => a.date < b.date ? 1 : -1);

  // Q8 - duplicatas explícitas
  const q8Map = new Map();
  (trafficRaw || []).forEach((r: any) => {
    const key = `${r.date}|${r.account_id}`;
    q8Map.set(key, (q8Map.get(key) || 0) + 1);
  });
  results.Q8_duplicatas = Array.from(q8Map.entries())
    .filter(([_, count]) => count > 1)
    .map(([key, count]) => ({ key, count }))
    .slice(0, 30);

  // Q9 - meta_ad_accounts duplicados
  const { data: accs } = await supabase
    .from('meta_ad_accounts')
    .select('account_id, id')
    .eq('operation_id', OP);

  const accMap = new Map();
  (accs || []).forEach((a: any) => {
    const arr = accMap.get(a.account_id) || [];
    arr.push(a.id);
    accMap.set(a.account_id, arr);
  });
  results.Q9_accounts_dup = Array.from(accMap.entries())
    .filter(([_, ids]) => ids.length > 1)
    .map(([account_id, ids]) => ({ account_id, vezes: ids.length, ids }));

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*" 
    }
  });
});
