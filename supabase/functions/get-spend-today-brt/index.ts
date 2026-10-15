import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Retorna a janela de tempo UTC correspondente ao dia atual em Brasília (BRT).
 * 00:00:00 BRT = 03:00:00 UTC
 */
export function getBrtDayWindow(): { since_utc: number; until_utc: number } {
  const now = new Date();
  const brtOffsetHours = -3;
  
  // Agora em BRT
  const brtNow = new Date(now.getTime() + brtOffsetHours * 3600 * 1000);
  
  // Meia-noite BRT hoje em UTC absoluto
  const brtMidnight = new Date(Date.UTC(
    brtNow.getUTCFullYear(),
    brtNow.getUTCMonth(),
    brtNow.getUTCDate(),
    0, 0, 0
  ));
  
  // Voltar para UTC (subtrair -3 = adicionar 3)
  const midnightUtc = new Date(brtMidnight.getTime() - brtOffsetHours * 3600 * 1000);
  
  return {
    since_utc: Math.floor(midnightUtc.getTime() / 1000),
    until_utc: Math.floor(now.getTime() / 1000),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    
    const url = new URL(req.url);
    const operationId = url.searchParams.get("operation_id") || "1dd606e3-dac2-4064-b863-9784307c9e98";
    
    // Obter contas ativas
    const { data: accounts } = await supabase
      .from("meta_ad_accounts")
      .select("account_id, currency, name")
      .eq("operation_id", operationId)
      .eq("is_active", true);

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ total_brl: 0, error: "No active accounts found", operation_id: operationId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { since_utc, until_utc } = getBrtDayWindow();
    const sinceDateStr = new Date(since_utc * 1000).toISOString().slice(0, 10);
    const untilDateStr = new Date(until_utc * 1000).toISOString().slice(0, 10);

    // Cotação fixa conforme instrução
    const FX_RATE = 5.5;
    const accessToken = authHeader.replace("Bearer ", "");

    const results = await Promise.all(accounts.map(async (acc) => {
      const accId = acc.account_id;
      
      const fbUrl = new URL(`https://graph.facebook.com/v22.0/act_${accId}/insights`);
      fbUrl.searchParams.set('access_token', accessToken);
      fbUrl.searchParams.set('time_range', JSON.stringify({
        since: sinceDateStr,
        until: untilDateStr,
      }));
      fbUrl.searchParams.set('time_increment', 'hourly');
      fbUrl.searchParams.set('fields', 'spend,date_start,hourly_stats_aggregated_by_advertiser_time_zone');
      fbUrl.searchParams.set('level', 'account');

      try {
        const resp = await fetch(fbUrl.toString()).then(r => r.json());
        
        if (resp.error) {
          return { account_id: accId, name: acc.name, spend_brt_today: 0, error: resp.error.message };
        }

        const filtered = (resp.data || []).filter((h: any) => {
          const range = h.hourly_stats_aggregated_by_advertiser_time_zone.split(' - ');
          const hourStart = new Date(range[0].replace(' ', 'T') + 'Z').getTime() / 1000;
          return hourStart >= since_utc && hourStart <= until_utc;
        });

        const spendRaw = filtered.reduce((sum: number, h: any) => sum + parseFloat(h.spend || 0), 0);
        const spendBrl = acc.currency === 'USD' ? spendRaw * FX_RATE : spendRaw;

        return { account_id: accId, name: acc.name, spend_brt_today: spendBrl };
      } catch (err) {
        return { account_id: accId, name: acc.name, spend_brt_today: 0, error: err.message };
      }
    }));

    const totalBrl = results.reduce((s, r) => s + r.spend_brt_today, 0);

    // Auditoria
    await supabase.from("pacing_action_log").insert({
      operation_id: operationId,
      action_type: "spend_fetch_brt_v2",
      details: {
        total_brl: totalBrl,
        window: { since_utc, until_utc },
        accounts_count: accounts.length,
        results
      }
    });

    return new Response(JSON.stringify({
      total_brl: totalBrl,
      per_account: results,
      window_utc: { since_utc, until_utc },
      fx_rate: FX_RATE,
      ts: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(', ', 'T')
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
