import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * freeze-daily-totals
 *
 * Called once per day (04:00 BRT via cron) to snapshot yesterday's totals.
 * Iterates all active operations and creates one snapshot per operation.
 * Also creates a global (no operation_id) snapshot for backward compatibility.
 *
 * Can also be called manually with { "date": "2026-03-15", "operation_id": "..." } to backfill.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Determine target date and optional operation_id from body
    let targetDate: string | null = null;
    let specificOpId: string | null = null;
    try {
      const body = await req.json();
      targetDate = body?.date || null;
      specificOpId = body?.operation_id || null;
    } catch { /* no body */ }

    if (!targetDate) {
      const now = new Date();
      const spFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
      const todaySP = spFormatter.format(now);
      const yesterday = new Date(`${todaySP}T12:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      targetDate = yesterday.toISOString().slice(0, 10);
    }

    console.log(`[freeze-daily-totals] Freezing date: ${targetDate}`);

    // Determine which operations to freeze
    let operationIds: (string | null)[] = [];
    if (specificOpId) {
      operationIds = [specificOpId];
    } else {
      // Fetch all active operations
      const { data: ops } = await supabase
        .from("operations")
        .select("id")
        .eq("status", "active");
      operationIds = (ops || []).map((o: any) => o.id);
      // Also include global (null) for backward compat
      operationIds.push(null);
    }

    const results: any[] = [];

    for (const opId of operationIds) {
      try {
        let dtUrl = `${supabaseUrl}/functions/v1/dashboard-totals?start=${targetDate}&end=${targetDate}&force_live=true`;
        if (opId) dtUrl += `&operation_id=${opId}`;

        const dtRes = await fetch(dtUrl, {
          headers: {
            "Authorization": `Bearer ${anonKey || serviceKey}`,
            "apikey": anonKey || serviceKey,
          },
        });

        if (!dtRes.ok) {
          const errText = await dtRes.text();
          console.error(`[freeze-daily-totals] dashboard-totals failed for op=${opId}: ${dtRes.status} ${errText}`);
          continue;
        }

        const totals = await dtRes.json();

        const upsertRow: any = {
          date: targetDate,
          total_spend: totals.totalSpend || 0,
          total_revenue: totals.totalRevenue || 0,
          total_conversions: totals.totalConversions || 0,
          total_clicks: totals.totalClicks || 0,
          total_impressions: totals.totalImpressions || 0,
          roas: totals.roas || 0,
          cac: totals.cac || 0,
          ticket_medio: totals.ticketMedio || 0,
          lucro_bruto: totals.lucroBruto || 0,
          usd_to_brl: totals.usdToBrl || 5.15,
          cp_revenue: totals.cpRevenue || 0,
          cp_count: totals.cpCount || 0,
          rt_revenue_brl: totals.rtRevenueBrl || 0,
          rt_count: totals.rtCount || 0,
          spend_source: totals.spendSource || "unknown",
        };
        if (opId) upsertRow.operation_id = opId;

        // Check if snapshot already exists for this date+operation
        let existingId: string | null = null;
        {
          let q = supabase
            .from("daily_totals_snapshot")
            .select("id")
            .eq("date", targetDate!);
          if (opId) {
            q = q.eq("operation_id", opId);
          } else {
            q = q.is("operation_id", null);
          }
          const { data: existing } = await q.maybeSingle();
          existingId = existing?.id || null;
        }

        let error: any;
        if (existingId) {
          const res = await supabase.from("daily_totals_snapshot").update(upsertRow).eq("id", existingId);
          error = res.error;
        } else {
          const res = await supabase.from("daily_totals_snapshot").insert(upsertRow);
          error = res.error;
        }

        if (error) {
          console.error(`[freeze-daily-totals] Upsert failed for op=${opId}: ${error.message}`);
          continue;
        }

        console.log(`[freeze-daily-totals] ✅ Frozen ${targetDate} op=${opId || 'global'}: rev=${totals.totalRevenue?.toFixed(2)} spend=${totals.totalSpend?.toFixed(2)} conv=${totals.totalConversions} source=${totals.spendSource}`);
        results.push({
          operation_id: opId,
          totalRevenue: totals.totalRevenue,
          totalSpend: totals.totalSpend,
          totalConversions: totals.totalConversions,
          spendSource: totals.spendSource,
        });
      } catch (opErr) {
        console.error(`[freeze-daily-totals] Error for op=${opId}:`, opErr instanceof Error ? opErr.message : String(opErr));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      date: targetDate,
      operations: results,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[freeze-daily-totals] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
