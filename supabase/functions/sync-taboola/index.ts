// Taboola Ads sync — pulls campaigns + integrated report (spend/impressions/clicks)
// Multi-account, multi-operation. Stores into taboola_traffic_data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TABOOLA_BASE = "https://backstage.taboola.com/backstage/api/1.0";

interface SyncResult {
  account_id: string;
  account_name: string;
  rows_upserted: number;
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

async function getAccessToken(clientId: string, clientSecret: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const res = await fetch(`${TABOOLA_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Taboola Auth Error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function syncAccount(
  supabase: any,
  account: {
    account_id: string;
    account_name: string;
    client_id: string;
    client_secret: string;
    operation_id: string;
  },
  startDate: string,
  endDate: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    account_id: account.account_id,
    account_name: account.account_name,
    rows_upserted: 0,
  };

  try {
    const token = await getAccessToken(account.client_id, account.client_secret);

    // Fetch Campaign Summary Report by Day
    // Docs: https://api.taboola.com/backstage-api/v1.0/index.html#campaign-summary-report
    const url = `${TABOOLA_BASE}/${account.account_id}/reports/campaign-summary/dimensions/day?start_date=${startDate}&end_date=${endDate}`;
    
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Taboola API Error: ${res.status} - ${errorText}`);
    }

    const report = await res.json();
    const rows = report.results || [];

    if (rows.length > 0) {
      const trafficRows = rows.map((r: any) => ({
        date: r.date.split(" ")[0], // "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD"
        operation_id: account.operation_id,
        account_id: account.account_id,
        campaign_id: String(r.campaign),
        campaign_name: r.campaign_name || null,
        spend: Number(r.spent || 0),
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        ctr: Number(r.ctr || 0),
        cpc: Number(r.cpc || 0),
        cpm: Number(r.cpm || 0),
      }));

      const { error } = await supabase
        .from("taboola_traffic_data")
        .upsert(trafficRows, {
          onConflict: "date,operation_id,account_id,campaign_id",
        });

      if (error) throw error;
      result.rows_upserted = trafficRows.length;
    }

    await supabase
      .from("taboola_ad_accounts")
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
      .from("taboola_ad_accounts")
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

    const { account_id, operation_id, days = 7, mode = "default", client_id, client_secret } = body;

    let startDate: string;
    let endDate: string;
    if (mode === "today") {
      startDate = todayBRT();
      endDate = todayBRT();
    } else {
      startDate = daysAgoBRT(Number(days) || 7);
      endDate = todayBRT();
    }

    if (mode === "validate") {
      if (!account_id || !client_id || !client_secret) {
        throw new Error("account_id, client_id and client_secret are required for validation");
      }
      const token = await getAccessToken(client_id, client_secret);
      // Try to fetch account info to validate account_id
      const url = `${TABOOLA_BASE}/${account_id}/reports/campaign-summary/dimensions/day?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Taboola Validation Error: ${res.status} - ${errorText}`);
      }
      
      return new Response(JSON.stringify({ success: true, message: "Validado com sucesso" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = supabase
      .from("taboola_ad_accounts")
      .select("account_id, account_name, client_id, client_secret, operation_id")
      .eq("is_active", true);
    
    if (account_id) q = q.eq("account_id", account_id);
    if (operation_id) q = q.eq("operation_id", operation_id);

    const { data: accounts, error } = await q;
    if (error) throw error;

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ success: true, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: SyncResult[] = [];
    for (const acc of accounts) {
      results.push(await syncAccount(supabase, acc, startDate, endDate));
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
