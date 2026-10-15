import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Vendors loaded dynamically below; legacy fallback
let VENDORS = ["guipiresp", "gtxndr", "gtxwl", "gtxndb2", "nrptgtx"];

/**
 * Cross-validates ClickBank revenue from 3 sources:
 * 1. IPN audit table (clickbank_audit) — BRL values at transaction-time rate
 * 2. Clerk API Quickstats — USD totals per vendor (Pacific timezone)
 * 3. RedTrack events — USD amounts from postbacks
 *
 * Reports discrepancies and which source is most reliable.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clerkKey = Deno.env.get("CLICKBANK_CLERK_API_KEY") || "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const targetDate = url.searchParams.get("date") ||
    new Date().toISOString().slice(0, 10);

  // For Clerk API: also fetch previous day (PST overlap with BRT early morning)
  const prevDate = new Date(`${targetDate}T12:00:00Z`);
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0, 10);

  const h = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Load dynamic vendor list from app_settings
    try {
      const { data: vendorData } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "clickbank_vendors")
        .single();
      if (vendorData?.value && Array.isArray(vendorData.value)) {
        VENDORS = (vendorData.value as { nickname: string }[]).map(v => v.nickname).filter(Boolean);
        console.log(`[validate-cb] Loaded ${VENDORS.length} vendors from app_settings`);
      }
    } catch (e) { console.warn("[validate-cb] Using legacy vendor list", e); }

    // 1. IPN Audit totals (BRT date, source of truth)
    const { data: ipnData } = await supabase
      .from("clickbank_audit")
      .select("amount_usd, amount_brl, transaction_type, vendor, created_at")
      .eq("date", targetDate)
      .eq("transaction_type", "SALE");

    const ipnSales = ipnData || [];
    const ipnTotalUsd = ipnSales.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
    const ipnTotalBrl = ipnSales.reduce((s: number, r: any) => s + Number(r.amount_brl || 0), 0);
    const ipnCount = ipnSales.length;
    const ipnImpliedRate = ipnTotalUsd > 0 ? ipnTotalBrl / ipnTotalUsd : 0;

    // Break down IPN early morning (00:00-03:59 BRT = still prev day in PST)
    const earlyMorningCutoff = `${targetDate}T07:00:00Z`; // 04:00 BRT = 07:00 UTC
    const ipnEarlyMorning = ipnSales.filter((r: any) =>
      r.created_at < earlyMorningCutoff
    );
    const ipnEarlyUsd = ipnEarlyMorning.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
    const ipnEarlyCount = ipnEarlyMorning.length;

    // 2. Clerk API Quickstats (PST dates)
    let clerkTodayUsd = 0;
    let clerkPrevUsd = 0;
    let clerkTodaySales = 0;
    let clerkPrevSales = 0;
    const clerkErrors: string[] = [];

    if (clerkKey) {
      for (const vendor of VENDORS) {
        // Today (PST)
        try {
          const res = await fetch(
            `https://api.clickbank.com/rest/1.3/quickstats/list?account=${vendor}&startDate=${targetDate}&endDate=${targetDate}`,
            { headers: { Authorization: clerkKey, Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
          );
          if (res.ok) {
            const data = await res.json();
            const rows = data?.quickStatList?.quickStatData;
            if (Array.isArray(rows)) {
              for (const r of rows) {
                clerkTodayUsd += Number(r.completeSale || 0);
                clerkTodaySales += Number(r.completeSaleCount || 0);
              }
            }
          } else {
            clerkErrors.push(`${vendor}-today:${res.status}`);
          }
        } catch (e) {
          clerkErrors.push(`${vendor}-today:timeout`);
        }

        // Previous day (PST) — captures BRT early morning sales
        try {
          const res = await fetch(
            `https://api.clickbank.com/rest/1.3/quickstats/list?account=${vendor}&startDate=${prevDateStr}&endDate=${prevDateStr}`,
            { headers: { Authorization: clerkKey, Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
          );
          if (res.ok) {
            const data = await res.json();
            const rows = data?.quickStatList?.quickStatData;
            if (Array.isArray(rows)) {
              for (const r of rows) {
                clerkPrevUsd += Number(r.completeSale || 0);
                clerkPrevSales += Number(r.completeSaleCount || 0);
              }
            }
          } else {
            clerkErrors.push(`${vendor}-prev:${res.status}`);
          }
        } catch (e) {
          clerkErrors.push(`${vendor}-prev:timeout`);
        }
      }
    }

    // Clerk "BRT day" estimate = today PST + early morning from prev PST day
    // Early morning sales (~00:00-03:59 BRT) are in the previous PST day
    // We can't perfectly extract them from quickstats, but we know the IPN count
    const clerkBrtEstimateUsd = clerkTodayUsd + ipnEarlyUsd;
    const clerkBrtEstimateSales = clerkTodaySales + ipnEarlyCount;

    // 3. RedTrack totals
    const startUtc = `${targetDate}T03:00:00Z`;
    const nextDay = new Date(`${targetDate}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endUtc = `${nextDay.toISOString().slice(0, 10)}T03:00:00Z`;

    const { data: rtData } = await supabase
      .from("redtrack_events")
      .select("amount, currency")
      .eq("event_type", "purchase")
      .gte("occurred_at", startUtc)
      .lt("occurred_at", endUtc);

    const rtSales = rtData || [];
    const rtTotalUsd = rtSales.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const rtCount = rtSales.length;

    // Analysis
    const ipnVsRtGapCount = ipnCount - rtCount;
    const ipnVsRtGapUsd = ipnTotalUsd - rtTotalUsd;
    const ipnVsClerkGapUsd = ipnTotalUsd - clerkBrtEstimateUsd;

    const validation = {
      date: targetDate,
      ipn: {
        count: ipnCount,
        totalUsd: Math.round(ipnTotalUsd * 100) / 100,
        totalBrl: Math.round(ipnTotalBrl * 100) / 100,
        impliedRate: Math.round(ipnImpliedRate * 10000) / 10000,
        earlyMorning: { count: ipnEarlyCount, usd: Math.round(ipnEarlyUsd * 100) / 100 },
      },
      clerkApi: {
        todayPst: { count: clerkTodaySales, usd: Math.round(clerkTodayUsd * 100) / 100 },
        prevDayPst: { count: clerkPrevSales, usd: Math.round(clerkPrevUsd * 100) / 100 },
        brtEstimate: { count: clerkBrtEstimateSales, usd: Math.round(clerkBrtEstimateUsd * 100) / 100 },
        errors: clerkErrors,
      },
      redtrack: {
        count: rtCount,
        totalUsd: Math.round(rtTotalUsd * 100) / 100,
      },
      gaps: {
        ipnVsRedtrack: { count: ipnVsRtGapCount, usd: Math.round(ipnVsRtGapUsd * 100) / 100 },
        ipnVsClerk: { usd: Math.round(ipnVsClerkGapUsd * 100) / 100 },
      },
      recommendation: ipnCount > 0
        ? "IPN amount_brl is the most accurate source (uses CB transaction-time exchange rate)"
        : "No IPN data — falling back to RedTrack USD conversion",
      ts: new Date().toISOString(),
    };

    console.log(`[validate-cb] IPN=${ipnCount}/$${ipnTotalUsd.toFixed(0)} RT=${rtCount}/$${rtTotalUsd.toFixed(0)} Clerk=${clerkTodaySales}/$${clerkTodayUsd.toFixed(0)} gaps: RT=${ipnVsRtGapCount} Clerk=$${ipnVsClerkGapUsd.toFixed(0)}`);

    return new Response(JSON.stringify(validation, null, 2), { headers: h });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: h }
    );
  }
});
