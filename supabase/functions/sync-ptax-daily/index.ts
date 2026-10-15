// =====================================================
// sync-ptax-daily
// Sprint 1 Reconciliação Financeira - D1
// 
// Busca cotação USD->BRL do dia em 2 fontes:
//   1. BCB PTAX (oficial Banco Central) - PRIMARY
//   2. AwesomeAPI (cross-check) - BACKUP
// 
// Insere em exchange_rates_daily com ON CONFLICT DO NOTHING
// Loga em integration_logs
// 
// Schedule: diariamente às 23h BRT (02h UTC do dia seguinte)
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RateRecord {
  rate_date: string;
  currency_from: string;
  currency_to: string;
  rate_buy: number | null;
  rate_sell: number | null;
  rate_avg: number;
  source: string;
  source_payload: any;
}

// =====================================================
// FONTE 1: BCB PTAX (oficial)
// =====================================================
async function fetchBcbPtax(targetDate: Date): Promise<RateRecord | null> {
  // BCB API exige formato MM-DD-YYYY
  const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
  const dd = String(targetDate.getDate()).padStart(2, "0");
  const yyyy = targetDate.getFullYear();
  const dateStr = `${mm}-${dd}-${yyyy}`;

  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$top=1&$format=json`;

  try {
    console.log(`[BCB] Fetching PTAX for ${dateStr}...`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[BCB] HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data?.value?.length) {
      console.log(`[BCB] No data for ${dateStr} (provavelmente fim de semana/feriado)`);
      return null;
    }
    const row = data.value[0];
    const buy = Number(row.cotacaoCompra);
    const sell = Number(row.cotacaoVenda);
    const avg = (buy + sell) / 2;

    return {
      rate_date: targetDate.toISOString().slice(0, 10),
      currency_from: "USD",
      currency_to: "BRL",
      rate_buy: buy,
      rate_sell: sell,
      rate_avg: Number(avg.toFixed(6)),
      source: "bcb_ptax",
      source_payload: row,
    };
  } catch (err) {
    console.error(`[BCB] Erro:`, err);
    return null;
  }
}

// =====================================================
// FONTE 2: AwesomeAPI (cross-check)
// =====================================================
async function fetchAwesomeApi(targetDate: Date): Promise<RateRecord | null> {
  const url = "https://economia.awesomeapi.com.br/json/last/USD-BRL";

  try {
    console.log(`[AwesomeAPI] Fetching USD-BRL...`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[AwesomeAPI] HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const usdBrl = data?.USDBRL;
    if (!usdBrl) {
      console.error(`[AwesomeAPI] Payload inválido`);
      return null;
    }
    const buy = Number(usdBrl.bid);
    const sell = Number(usdBrl.ask);
    const avg = (buy + sell) / 2;

    return {
      rate_date: targetDate.toISOString().slice(0, 10),
      currency_from: "USD",
      currency_to: "BRL",
      rate_buy: buy,
      rate_sell: sell,
      rate_avg: Number(avg.toFixed(6)),
      source: "awesomeapi",
      source_payload: usdBrl,
    };
  } catch (err) {
    console.error(`[AwesomeAPI] Erro:`, err);
    return null;
  }
}

// =====================================================
// HANDLER
// =====================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Permite forçar uma data específica via body { target_date: "YYYY-MM-DD" }
  let targetDate = new Date();
  // Ajusta para BRT (UTC-3) - pega a data de "hoje" em São Paulo
  const sp = new Date(targetDate.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  targetDate = new Date(sp.getFullYear(), sp.getMonth(), sp.getDate());

  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.target_date) {
        targetDate = new Date(body.target_date + "T12:00:00Z");
      }
    }
  } catch {
    // ignora body inválido
  }

  console.log(`[sync-ptax-daily] Target date: ${targetDate.toISOString().slice(0, 10)}`);

  const results: Record<string, any> = {
    target_date: targetDate.toISOString().slice(0, 10),
    sources: {},
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  // Busca em paralelo nas 2 fontes
  const [bcbRate, awesomeRate] = await Promise.all([
    fetchBcbPtax(targetDate),
    fetchAwesomeApi(targetDate),
  ]);

  const ratesToInsert: RateRecord[] = [];
  if (bcbRate) {
    ratesToInsert.push(bcbRate);
    results.sources.bcb_ptax = { rate_avg: bcbRate.rate_avg, ok: true };
  } else {
    results.sources.bcb_ptax = { ok: false };
  }

  if (awesomeRate) {
    ratesToInsert.push(awesomeRate);
    results.sources.awesomeapi = { rate_avg: awesomeRate.rate_avg, ok: true };
  } else {
    results.sources.awesomeapi = { ok: false };
  }

  // Cross-check: se as 2 fontes diferirem em mais de 5%, loga warning
  if (bcbRate && awesomeRate) {
    const diff = Math.abs(bcbRate.rate_avg - awesomeRate.rate_avg);
    const pct = (diff / bcbRate.rate_avg) * 100;
    results.cross_check = {
      bcb: bcbRate.rate_avg,
      awesome: awesomeRate.rate_avg,
      diff_pct: Number(pct.toFixed(4)),
      flagged: pct > 5,
    };
    if (pct > 5) {
      console.warn(`[CROSS-CHECK] Divergência ${pct.toFixed(2)}% entre BCB e AwesomeAPI!`);
    }
  }

  // Insere com ON CONFLICT DO NOTHING (via upsert ignoreDuplicates)
  if (ratesToInsert.length > 0) {
    const { data, error } = await supabase
      .from("exchange_rates_daily")
      .upsert(ratesToInsert, {
        onConflict: "rate_date,currency_from,currency_to,source",
        ignoreDuplicates: true,
      })
      .select("id, source");

    if (error) {
      console.error(`[INSERT] Erro:`, error);
      results.errors.push({ stage: "insert", message: error.message });
    } else {
      results.inserted = data?.length || 0;
      results.skipped = ratesToInsert.length - results.inserted;
    }
  }

  // Log em integration_logs
  const status = results.errors.length > 0
    ? "error"
    : ratesToInsert.length === 0
    ? "warning"
    : "success";

  await supabase.from("integration_logs").insert({
    integration: "sync-ptax-daily",
    status,
    records_processed: results.inserted,
    message: JSON.stringify(results),
  });

  console.log(`[sync-ptax-daily] DONE:`, JSON.stringify(results));

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
