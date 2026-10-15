import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getUsdToBrlRate(): Promise<number> {
  // Try multiple APIs for reliability
  const apis = [
    { url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", parse: (json: any) => json?.usd?.brl },
    { url: "https://open.er-api.com/v6/latest/USD", parse: (json: any) => json?.rates?.BRL },
  ];
  for (const api of apis) {
    try {
      const res = await fetch(api.url);
      if (!res.ok) { console.warn(`API ${api.url} error [${res.status}]`); continue; }
      const json = await res.json();
      const rate = api.parse(json);
      if (rate && !isNaN(rate) && rate > 0) {
        console.log(`USD→BRL rate: ${rate} (from ${api.url})`);
        return rate;
      }
    } catch (e) { console.warn(`API ${api.url} failed:`, e); }
  }
  console.warn("All exchange rate APIs failed, using fallback 5.15");
  return 5.15;
}

// This function is called by cron every minute.
// It reads the current offset from integration_logs and calls sync-meta-ads with the next offset.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // RECOVERY MODE guard
    const { data: rm } = await supabase.from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
    if (rm?.value === true) {
      return new Response(JSON.stringify({ skipped: true, reason: "recovery_mode" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for date override from request body
    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    if (req.method === "POST") {
      try {
        const body = await req.clone().json();
        if (body.date_from) dateFrom = body.date_from;
        if (body.date_to) dateTo = body.date_to;
        // Save backfill config so cron picks it up automatically
        if (dateFrom) {
          await supabase.from("integration_logs").insert({
            integration: "meta-ads-backfill",
            status: "active",
            message: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
            records_processed: 0,
          });
        }
      } catch { /* no body */ }
    }

    // If no date override, check for active backfill config
    if (!dateFrom) {
      const { data: backfill } = await supabase
        .from("integration_logs")
        .select("message")
        .eq("integration", "meta-ads-backfill")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (backfill?.message) {
        try {
          const cfg = JSON.parse(backfill.message);
          dateFrom = cfg.date_from;
          dateTo = cfg.date_to;
        } catch { /* ignore */ }
      }
    }

    // Read current offset from latest sync log
    const { data: lastLog } = await supabase
      .from("integration_logs")
      .select("message")
      .eq("integration", "meta-ads-offset")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let currentOffset = 0;
    if (lastLog?.message) {
      const parsed = parseInt(lastLog.message, 10);
      if (!isNaN(parsed)) currentOffset = parsed;
    }

    console.log(`Orchestrator: calling sync-meta-ads with offset=${currentOffset}${dateFrom ? `, date_from=${dateFrom}` : ""}`);

    // Fetch exchange rate once in orchestrator to avoid rate limiting
    const exchangeRate = await getUsdToBrlRate();

    // If no explicit date range, default to last 2 days (today+yesterday) for speed
    if (!dateFrom) {
      const brFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
      const now = new Date();
      dateTo = brFmt.format(now);
      const twoDaysAgo = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }).split(',')[0]);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      dateFrom = brFmt.format(twoDaysAgo);

    }

    // Call sync-meta-ads
    const syncBody: Record<string, unknown> = { offset: currentOffset, exchange_rate: exchangeRate };
    if (dateFrom) syncBody.date_from = dateFrom;
    if (dateTo) syncBody.date_to = dateTo;

    const syncRes = await fetch(`${supabaseUrl}/functions/v1/sync-meta-ads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(syncBody),
    });

    const result = await syncRes.json();
    console.log(`Orchestrator result:`, JSON.stringify(result));

    // Save next offset
    const nextOffset = result.done ? 0 : result.next_offset || 0;

    // If backfill is complete (all accounts processed), mark it as done
    if (result.done && dateFrom) {
      await supabase
        .from("integration_logs")
        .update({ status: "done" })
        .eq("integration", "meta-ads-backfill")
        .eq("status", "active");
      console.log("Backfill complete, marked as done");
    }

    await supabase.from("integration_logs").insert({
      integration: "meta-ads-offset",
      status: "success",
      message: String(nextOffset),
      records_processed: result.records || 0,
    });

    return new Response(JSON.stringify({ ok: true, offset: currentOffset, next_offset: nextOffset, result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("Orchestrator error:", msg);

    // Persist error to system_logs
    await supabase.from("system_logs").insert({
      type: "EDGE_ERROR",
      function_name: "sync-meta-orchestrator",
      message: msg,
      stack,
      metadata: { timestamp: new Date().toISOString() },
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
