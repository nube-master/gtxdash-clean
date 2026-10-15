
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RateResponse {
  [key: string]: {
    bid: string;
    ask: string;
    create_date: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const pairs = ["EUR-BRL", "USD-BRL", "PLN-BRL", "RON-BRL"];
  const url = `https://economia.awesomeapi.com.br/json/last/${pairs.join(",")}`;

  try {
    console.log(`[sync-multi-fx] Fetching ${pairs.join(",")}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data: RateResponse = await res.json();
    const ratesToInsert = [];
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    for (const pair of pairs) {
      const key = pair.replace("-", "");
      const val = data[key];
      if (!val) continue;

      const [from, to] = pair.split("-");
      const buy = Number(val.bid);
      const sell = Number(val.ask);
      const avg = (buy + sell) / 2;

      // Inserir no cache Padrão (snapshot)
      ratesToInsert.push({
        base_currency: from,
        target_currency: to,
        rate: Number(avg.toFixed(6)),
        fetched_at: now
      });

      // Inserir no histórico Diário (Reconciliação)
      await supabase.from("exchange_rates_daily").upsert({
        rate_date: today,
        currency_from: from,
        currency_to: to,
        rate_buy: buy,
        rate_sell: sell,
        rate_avg: Number(avg.toFixed(6)),
        source: "awesomeapi",
        source_payload: val
      }, {
        onConflict: "rate_date,currency_from,currency_to,source"
      });
    }

    if (ratesToInsert.length > 0) {
      await supabase.from("exchange_rates_cache").upsert(ratesToInsert, {
        onConflict: "base_currency,target_currency"
      });
    }

    return new Response(JSON.stringify({ success: true, count: ratesToInsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(`[sync-multi-fx] Erro:`, err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
