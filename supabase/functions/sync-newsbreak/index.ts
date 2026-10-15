// Newsbreak Ads sync — pulls campaigns + ads + integrated report (spend/impressions/clicks)
// Multi-account, multi-operation. Stores into newsbreak_traffic_data + newsbreak_campaign_status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NB_BASE = "https://business.newsbreak.com/business-api/v1";

interface SyncResult {
  account_id: string;
  account_name: string;
  campaigns_upserted: number;
  rows_upserted: number;
  error?: string;
}

function todayBRT(): string {
  const now = new Date();
  // BRT = UTC-3
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function daysAgoBRT(days: number): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  brt.setUTCDate(brt.getUTCDate() - days);
  return brt.toISOString().slice(0, 10);
}

async function nbFetch(path: string, token: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${NB_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Token": token,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Newsbreak API ${res.status}: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json;
}

async function syncAccount(
  supabase: any,
  account: {
    account_id: string;
    account_name: string;
    access_token: string;
    operation_id: string;
  },
  startDate: string,
  endDate: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    account_id: account.account_id,
    account_name: account.account_name,
    campaigns_upserted: 0,
    rows_upserted: 0,
  };

  try {
    // --- 1) Pull campaigns (paged) ---
    const campaigns: any[] = [];
    let pageNo = 1;
    const pageSize = 200;
    // Loop pagination
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({
        adAccountId: account.account_id,
        pageNo: String(pageNo),
        pageSize: String(pageSize),
      });
      const json = await nbFetch(
        `/campaign/getList?${params.toString()}`,
        account.access_token,
      );
      const list = json?.data?.list || [];
      campaigns.push(...list);
      if (!json?.data?.hasNext || list.length === 0) break;
      pageNo += 1;
      if (pageNo > 50) break; // safety
    }

    // Upsert campaign_status
    if (campaigns.length > 0) {
      const rows = campaigns.map((c) => ({
        campaign_id: String(c.id),
        campaign_name: c.name || `Campaign ${c.id}`,
        account_id: account.account_id,
        status: c.status || null,
        online_status: c.onlineStatus || null,
        objective: c.objective || null,
        budget: c.budget ? Number(c.budget) : null,
        operation_id: account.operation_id,
        last_synced_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("newsbreak_campaign_status")
        .upsert(rows, { onConflict: "campaign_id,operation_id" });
      if (error) throw new Error(`campaign upsert: ${error.message}`);
      result.campaigns_upserted = rows.length;
    }

    // --- 2) Pull integrated report (spend/impressions/clicks per DATE/CAMPAIGN) ---
    // ⚠️ FORMATO CORRETO descoberto via diagnóstico:
    //    Use `adAccountId` (singular, int) — NÃO `filter`/`filterIds`.
    //    Cost vem em CENTS (divide por 100). CTR em basis points (×10000 → divide /100 p/ %).
    const accountIdInt = Number(account.account_id);
    if (!Number.isFinite(accountIdInt)) {
      throw new Error(
        `account_id "${account.account_id}" is not numeric — Newsbreak adAccountId requires int`,
      );
    }
    const reportPayload = {
      name: `sync_${account.account_id}_${Date.now()}`,
      timezone: "America/New_York", // Newsbreak default; convertemos depois
      dateRange: "FIXED",
      startDate,
      endDate,
      adAccountId: accountIdInt,
      dimensions: ["DATE", "CAMPAIGN"],
      metrics: ["COST", "IMPRESSION", "CLICK", "CTR", "CPC", "CONVERSION"],
    };

    const report = await nbFetch(
      "/reports/getIntegratedReport",
      account.access_token,
      { method: "POST", body: JSON.stringify(reportPayload) },
    );

    // Newsbreak report response shapes observed:
    //   data.rows | data.list | data.data | data.results | data.records
    const reportRows: any[] =
      report?.data?.rows ||
      report?.data?.list ||
      report?.data?.data ||
      report?.data?.results ||
      report?.data?.records ||
      report?.rows ||
      report?.list ||
      [];

    console.log(
      `[sync-newsbreak] account=${account.account_id} range=${startDate}..${endDate} reportRows=${reportRows.length} sample=${JSON.stringify(reportRows[0] || report?.data || report).slice(0, 500)}`,
    );
    const campaignNameById = new Map<string, string>();
    for (const c of campaigns) campaignNameById.set(String(c.id), c.name || "");

    if (reportRows.length > 0) {
      const trafficRows = reportRows
        .map((r: any) => {
          const date = r.date || r.DATE || null;
          const campaignId = String(r.campaignId || r.CAMPAIGN_ID || "");
          const adId = String(r.adId || r.AD_ID || "");
          if (!date || !campaignId) return null;
          // cost/cpc/cpm come in CENTS — convert to currency units
          const costCents = Number(r.costDecimal ?? r.cost ?? 0);
          const spend = costCents / 100;
          const impressions = Number(r.impression ?? 0);
          const clicks = Number(r.click ?? 0);
          // ctr is basis points (×10000) — convert to percentage
          const ctrRaw = Number(r.ctr ?? 0);
          const ctr = ctrRaw > 0 ? ctrRaw / 100 : 0;
          const cpcCents = Number(r.cpcDecimal ?? r.cpc ?? 0);
          const cpc = cpcCents > 0 ? cpcCents / 100 : 0;
          const cpmCents = Number(r.cpmDecimal ?? r.cpm ?? 0);
          const cpm = cpmCents > 0
            ? cpmCents / 100
            : impressions > 0
              ? (spend / impressions) * 1000
              : 0;
          return {
            date,
            account_id: account.account_id,
            campaign_id: campaignId,
            campaign_name:
              r.campaign || campaignNameById.get(campaignId) || null,
            ad_id: adId || "_aggregated_", // sentinel para upsert funcionar com NULL constraint
            ad_name: r.ad || null,
            spend,
            impressions,
            clicks,
            ctr,
            cpc,
            cpm,
            operation_id: account.operation_id,
          };
        })
        .filter(Boolean);

      if (trafficRows.length > 0) {
        // Chunked upsert (avoid payloads >1MB)
        const chunkSize = 500;
        for (let i = 0; i < trafficRows.length; i += chunkSize) {
          const chunk = trafficRows.slice(i, i + chunkSize);
          const { error } = await supabase
            .from("newsbreak_traffic_data")
            .upsert(chunk, {
              onConflict: "date,account_id,campaign_id,ad_id,operation_id",
            });
          if (error) throw new Error(`traffic upsert: ${error.message}`);
        }
        result.rows_upserted = trafficRows.length;
      }
    }

    // Update sync status
    await supabase
      .from("newsbreak_ad_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_error: null,
      })
      .eq("account_id", account.account_id)
      .eq("operation_id", account.operation_id);

    return result;
  } catch (err: any) {
    result.error = err?.message || String(err);
    await supabase
      .from("newsbreak_ad_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: result.error!.slice(0, 500),
      })
      .eq("account_id", account.account_id)
      .eq("operation_id", account.operation_id);
    return result;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // Optional filters
    const { account_id, operation_id, days = 7, mode = "default" } = body;

    let startDate: string;
    let endDate: string;
    if (mode === "today") {
      startDate = todayBRT();
      endDate = todayBRT();
    } else {
      startDate = daysAgoBRT(Number(days) || 7);
      endDate = todayBRT();
    }

    // Fetch active accounts
    let q = supabase
      .from("newsbreak_ad_accounts")
      .select("account_id, account_name, access_token, operation_id")
      .eq("is_active", true);
    if (account_id) q = q.eq("account_id", account_id);
    if (operation_id) q = q.eq("operation_id", operation_id);

    const { data: accounts, error } = await q;
    if (error) throw error;

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active Newsbreak accounts found",
          results: [],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const results: SyncResult[] = [];
    for (const acc of accounts) {
      const r = await syncAccount(supabase, acc, startDate, endDate);
      results.push(r);
    }

    // Log
    await supabase.from("integration_logs").insert({
      integration: "newsbreak",
      status: results.every((r) => !r.error) ? "success" : "partial",
      message: `Newsbreak sync ${startDate}..${endDate}`,
      details: { results, range: { startDate, endDate } },
    });

    return new Response(
      JSON.stringify({
        success: true,
        range: { startDate, endDate },
        accounts_processed: accounts.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err: any) {
    console.error("[sync-newsbreak] fatal:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || String(err) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
