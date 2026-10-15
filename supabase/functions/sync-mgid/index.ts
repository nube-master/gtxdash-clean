// MGID Ads sync — pulls campaigns + daily stats per campaign.
// Multi-account, multi-operation. Stores in mgid_traffic_data + mgid_campaign_status.
//
// MGID REST API base: https://api.mgid.com
//   Prefix for advertiser endpoints: /v1/goodhits/clients/{clientId}/...
//   Docs: https://help.mgid.com/api-advertisers
//
// Spend is returned in the account currency (USD for this integration).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MGID_BASE = "https://api.mgid.com/v1";

interface SyncResult {
  account_id: string;
  account_name: string;
  campaigns_upserted: number;
  rows_upserted: number;
  days: number;
  wallet_balance?: number | null;
  error?: string;
}

function todayBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function daysAgoBRT(days: number): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  brt.setUTCDate(brt.getUTCDate() - days);
  return brt.toISOString().slice(0, 10);
}

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function mgidFetch(path: string, token: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${MGID_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
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
      `MGID API ${res.status} ${path}: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json;
}

async function syncAccount(
  supabase: any,
  account: {
    id: string;
    account_id: string;
    account_name: string;
    api_token: string;
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
    days: 0,
  };

  try {
    const clientId = account.account_id;

    // 1) Wallet balance snapshot
    let walletBalance: number | null = null;
    let walletCredit: number | null = null;
    let currency = "usd";
    let timezone: string | null = null;
    try {
      const client = await mgidFetch(`/clients/${clientId}`, account.api_token);
      walletBalance = Number(client?.wallet?.balance ?? 0);
      walletCredit = Number(client?.wallet?.credit ?? 0);
      currency = String(client?.wallet?.currency || "usd").toLowerCase();
      timezone = client?.timezone || null;
      result.wallet_balance = walletBalance;
    } catch (e) {
      console.warn(`[sync-mgid] client info failed: ${(e as Error).message}`);
    }

    // 2) Campaigns list (for names + status metadata)
    let campaigns: any[] = [];
    try {
      const list = await mgidFetch(
        `/goodhits/clients/${clientId}/campaigns`,
        account.api_token,
      );
      // Response is an object keyed by campaign id (or array). Normalize.
      if (Array.isArray(list)) {
        campaigns = list;
      } else if (list && typeof list === "object") {
        campaigns = Object.values(list).filter(
          (v: any) => v && typeof v === "object" && v.id,
        );
      }
    } catch (e) {
      console.warn(`[sync-mgid] campaigns list failed: ${(e as Error).message}`);
    }

    const campaignNameById = new Map<string, string>();
    if (campaigns.length > 0) {
      const rows = campaigns.map((c: any) => {
        const id = String(c.id);
        const name = c.name || `Campaign ${id}`;
        campaignNameById.set(id, name);
        return {
          operation_id: account.operation_id,
          account_id: clientId,
          campaign_id: id,
          campaign_name: name,
          status: c.status || null,
          status_reason: c.statusReason || c.reason || null,
          campaign_type: c.campaignType || c.type || null,
          daily_limit_cents:
            c.limitsFilter?.dailyLimit != null
              ? Math.round(Number(c.limitsFilter.dailyLimit))
              : null,
          overall_limit_cents:
            c.limitsFilter?.overallLimit != null
              ? Math.round(Number(c.limitsFilter.overallLimit))
              : null,
          limit_type: c.limitsFilter?.limitType || null,
          language: c.language || null,
          utm_source: c.trackingOptions?.utm_source || null,
          utm_campaign: c.trackingOptions?.utm_campaign || null,
          utm_medium: c.trackingOptions?.utm_medium || null,
          when_add: c.whenAdd ? new Date(c.whenAdd).toISOString() : null,
          last_synced_at: new Date().toISOString(),
        };
      });
      // Chunk upsert
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("mgid_campaign_status")
          .upsert(chunk, { onConflict: "operation_id,campaign_id" });
        if (error) throw new Error(`campaign upsert: ${error.message}`);
      }
      result.campaigns_upserted = rows.length;
    }

    // 3) Daily stats — loop each day (endpoint only aggregates over interval, so 1 call per day)
    const dates = eachDate(startDate, endDate);
    result.days = dates.length;
    const allTraffic: any[] = [];
    for (const d of dates) {
      try {
        const q = new URLSearchParams({
          dateInterval: "interval",
          startDate: d,
          endDate: d,
        });
        const stats = await mgidFetch(
          `/goodhits/clients/${clientId}/campaigns-stat?${q.toString()}`,
          account.api_token,
        );
        const bucket = stats?.["campaigns-stat"] || {};
        for (const [campaignId, s] of Object.entries<any>(bucket)) {
          const spend = Number(s?.spent ?? 0);
          const imps = Number(s?.imps ?? 0);
          const clicks = Number(s?.clicks ?? 0);
          // Skip fully-zero rows to keep DB clean
          if (spend === 0 && imps === 0 && clicks === 0) continue;
          allTraffic.push({
            operation_id: account.operation_id,
            date: d,
            account_id: clientId,
            campaign_id: String(campaignId),
            campaign_name:
              campaignNameById.get(String(campaignId)) || null,
            spend,
            impressions: imps,
            clicks,
            avg_cpc: Number(s?.avcpc ?? 0),
            conversions_decision: Math.round(Number(s?.decision ?? 0)),
            conversions_buying: Math.round(Number(s?.buying ?? 0)),
            conversion_cost: Number(s?.decisionCost ?? s?.buyingCost ?? 0),
            revenue: Number(s?.revenue ?? 0),
            profit: Number(s?.profit ?? 0),
            epc: Number(s?.epc ?? 0),
          });
        }
      } catch (e) {
        const msg = (e as Error).message;
        // THERE_NO_DATA_IN_CHOSEN_PERIOD is normal — swallow
        if (!/THERE_NO_DATA/i.test(msg)) {
          console.warn(`[sync-mgid] stats ${d} failed: ${msg}`);
        }
      }
    }

    if (allTraffic.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < allTraffic.length; i += chunkSize) {
        const chunk = allTraffic.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("mgid_traffic_data")
          .upsert(chunk, {
            onConflict: "operation_id,date,account_id,campaign_id",
          });
        if (error) throw new Error(`traffic upsert: ${error.message}`);
      }
      result.rows_upserted = allTraffic.length;
    }

    // 4) Update account status
    await supabase
      .from("mgid_ad_accounts")
      .update({
        wallet_balance: walletBalance,
        wallet_credit: walletCredit,
        currency,
        timezone,
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_error: null,
      })
      .eq("id", account.id);

    return result;
  } catch (err: any) {
    result.error = err?.message || String(err);
    await supabase
      .from("mgid_ad_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: result.error!.slice(0, 500),
      })
      .eq("id", account.id);
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

    const {
      account_id,
      operation_id,
      days = 7,
      mode = "default",
      start_date,
      end_date,
    } = body;

    let startDate: string;
    let endDate: string;
    if (start_date && end_date) {
      startDate = start_date;
      endDate = end_date;
    } else if (mode === "today") {
      startDate = todayBRT();
      endDate = todayBRT();
    } else {
      startDate = daysAgoBRT(Number(days) || 7);
      endDate = todayBRT();
    }

    let q = supabase
      .from("mgid_ad_accounts")
      .select("id, account_id, account_name, api_token, operation_id")
      .eq("is_active", true);
    if (account_id) q = q.eq("account_id", account_id);
    if (operation_id) q = q.eq("operation_id", operation_id);

    const { data: accounts, error } = await q;
    if (error) throw error;

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active MGID accounts found",
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
      const r = await syncAccount(supabase, acc as any, startDate, endDate);
      results.push(r);
    }

    // Integration log (per operation)
    const byOp = new Map<string, SyncResult[]>();
    for (let i = 0; i < accounts.length; i++) {
      const opId = (accounts[i] as any).operation_id;
      const arr = byOp.get(opId) || [];
      arr.push(results[i]);
      byOp.set(opId, arr);
    }
    for (const [opId, res] of byOp) {
      await supabase.from("integration_logs").insert({
        integration: "mgid",
        status: res.every((r) => !r.error) ? "success" : "partial",
        message: `MGID sync ${startDate}..${endDate}`,
        details: { results: res, range: { startDate, endDate } },
        operation_id: opId,
      });
    }

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
    console.error("[sync-mgid] fatal:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || String(err) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
