/**
 * Espelha vendas Hotmart de clickbank_audit → sales_data (SOMENTE Escola do Dólar).
 * Alimenta Pacing, Criativos e Meta Ads com utm_campaign/utm_content resolvidos
 * (meta_campaign_name / meta_ad_name via UTMfy) para cruzamento por campanha.
 *
 * POST { days?: number = 90 }  — janela em dias para backfill.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ESCOLA_SLUG = "escola-do-dolar";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let days = 90;
    try {
      const b = await req.json();
      if (b?.days && Number(b.days) > 0) days = Math.min(365, Number(b.days));
    } catch { /* no body ok */ }

    const { data: op, error: opErr } = await supabase
      .from("operations").select("id").eq("slug", ESCOLA_SLUG).maybeSingle();
    if (opErr || !op?.id) {
      return new Response(JSON.stringify({ error: "escola operation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const operationId = op.id as string;

    const start = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

    const PAGE = 1000;
    let from = 0;
    let scanned = 0, upserted = 0, skipped = 0, errors = 0;

    while (true) {
      const { data: rows, error } = await supabase
        .from("clickbank_audit")
        .select("receipt, date, created_at, amount_brl, product_name, utm_source, utm_campaign, utm_content, utm_term, src, meta_campaign_name, meta_ad_name")
        .eq("vendor", "hotmart")
        .eq("operation_id", operationId)
        .eq("transaction_type", "SALE")
        .gte("date", start)
        .order("date", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = rows || [];
      if (batch.length === 0) break;

      for (const r of batch) {
        scanned++;
        // Extrai orderId do receipt "hotmart_<orderId>"
        const orderId = String(r.receipt || "").replace(/^hotmart_/, "");
        if (!orderId) { skipped++; continue; }
        const revenue = Number(r.amount_brl || 0);
        if (!(revenue > 0)) { skipped++; continue; }

        const { error: upErr } = await supabase.from("sales_data").upsert(
          {
            order_id: `hm_${orderId}`,
            date: r.date,
            revenue: Math.round(revenue * 100) / 100,
            product_name: r.product_name || null,
            utm_source: r.utm_source || null,
            utm_campaign: r.meta_campaign_name || r.utm_campaign || null,
            utm_content: r.meta_ad_name || r.utm_content || null,
            utm_term: r.utm_term || null,
            status: "approved",
            store: "hotmart",
            operation_id: operationId,
          },
          { onConflict: "order_id" },
        );
        if (upErr) { errors++; console.warn("[MIRROR-FAIL]", orderId, upErr.message); }
        else upserted++;
      }

      if (batch.length < PAGE) break;
      from += PAGE;
    }

    return new Response(
      JSON.stringify({ ok: true, days, operation: ESCOLA_SLUG, scanned, upserted, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[hotmart-mirror-sales-data] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
