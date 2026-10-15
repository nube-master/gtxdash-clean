import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API = "https://graph.facebook.com/v21.0";

interface MetaTransaction {
  id: string;
  time?: string;
  billing_reason?: string;
  billing_period?: string;
  billing_reference_number?: string;
  status?: string;
  vat_invoice_id?: string;
  amount?: { total?: string; currency?: string } | string;
  payment_option?: string;
  provider_amount?: { total?: string; currency?: string };
  card_brand?: string;
  card_last_4?: string;
}

async function fetchUsdToBrl(): Promise<number> {
  try {
    const r = await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
    const j = await r.json();
    return j?.usd?.brl || 5.15;
  } catch {
    return 5.15;
  }
}

function parseAmount(amount: MetaTransaction["amount"]): { value: number; currency: string } {
  if (!amount) return { value: 0, currency: "USD" };
  if (typeof amount === "string") {
    const n = Number(amount) / 100;
    return { value: isNaN(n) ? 0 : n, currency: "USD" };
  }
  const total = Number(amount.total || 0) / 100;
  return { value: isNaN(total) ? 0 : total, currency: amount.currency || "USD" };
}

function parsePaymentOption(payOpt?: string): { brand: string; last4: string } {
  if (!payOpt) return { brand: "", last4: "" };
  // Format examples: "VISA *1234", "Mastercard *5678", "PayPal"
  const m = payOpt.match(/^([A-Za-z]+)\s*\*\s*(\d{4})$/);
  if (m) return { brand: m[1], last4: m[2] };
  return { brand: payOpt, last4: "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const metaToken = Deno.env.get("META_ADS_ACCESS_TOKEN");
  if (!metaToken) {
    return new Response(JSON.stringify({ error: "META_ADS_ACCESS_TOKEN not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Recovery mode guard
  const { data: rm } = await supabase.from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
  if (rm?.value === true) {
    return new Response(JSON.stringify({ skipped: true, reason: "recovery_mode" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse body for backfill window
  let days = 30;
  let onlyAccount: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (typeof body.days === "number" && body.days > 0 && body.days <= 365) days = body.days;
      if (body.account_id) onlyAccount = String(body.account_id);
    } catch { /* no body */ }
  }

  const sinceTs = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const usdToBrl = await fetchUsdToBrl();

  // Fetch active accounts
  let accQuery = supabase
    .from("meta_ad_accounts")
    .select("account_id, account_name, operation_id")
    .eq("is_active", true);
  if (onlyAccount) accQuery = accQuery.eq("account_id", onlyAccount);
  const { data: accounts, error: accErr } = await accQuery;
  if (accErr) {
    return new Response(JSON.stringify({ error: accErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!accounts || accounts.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: "No active accounts" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let totalInserted = 0;
  let totalErrors = 0;
  const accountResults: Array<{ account_id: string; transactions: number; error?: string }> = [];

  for (const acc of accounts) {
    try {
      const actId = acc.account_id.startsWith("act_") ? acc.account_id : `act_${acc.account_id}`;
      const fields = [
        "id", "time", "billing_reason", "billing_period", "billing_reference_number",
        "status", "vat_invoice_id", "amount", "payment_option", "provider_amount",
        "card_brand", "card_last_4",
      ].join(",");

      const allTx: MetaTransaction[] = [];
      let nextUrl: string | null =
        `${META_API}/${actId}/transactions?fields=${fields}&since=${sinceTs}&limit=200&access_token=${metaToken}`;

      // Pagination guard: max 20 pages = 4000 transactions per account per run
      let pages = 0;
      while (nextUrl && pages < 20) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const res: Response = await fetch(nextUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Meta API ${res.status}: ${errBody.slice(0, 200)}`);
        }
        const json: { data?: MetaTransaction[]; paging?: { next?: string } } = await res.json();
        if (json.data?.length) allTx.push(...json.data);
        nextUrl = json.paging?.next || null;
        pages++;
      }

      if (allTx.length === 0) {
        accountResults.push({ account_id: acc.account_id, transactions: 0 });
        continue;
      }

      const rows = allTx.map((tx) => {
        const { value, currency } = parseAmount(tx.amount);
        const { brand, last4 } = parsePaymentOption(tx.payment_option);
        const amountBrl = currency === "USD" ? +(value * usdToBrl).toFixed(2)
          : currency === "BRL" ? value
            : null;
        return {
          operation_id: acc.operation_id,
          meta_transaction_id: tx.id,
          billing_reference: tx.billing_reference_number || null,
          account_id: acc.account_id,
          account_name: acc.account_name || "",
          amount: value,
          currency,
          amount_brl: amountBrl,
          charged_at: tx.time || new Date().toISOString(),
          status: tx.status || "",
          billing_reason: tx.billing_reason || "",
          payment_method_type: "",
          card_brand: tx.card_brand || brand || "",
          card_last4: tx.card_last_4 || last4 || "",
          vat_invoice_id: tx.vat_invoice_id || null,
          raw_payload: tx as unknown as Record<string, unknown>,
        };
      });

      // Upsert in chunks of 500
      let insertedThisAcc = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error: upErr } = await supabase
          .from("meta_payment_transactions")
          .upsert(chunk, { onConflict: "account_id,meta_transaction_id", ignoreDuplicates: false });
        if (upErr) {
          console.error(`Upsert error ${acc.account_id}:`, upErr.message);
          totalErrors++;
        } else {
          insertedThisAcc += chunk.length;
        }
      }
      totalInserted += insertedThisAcc;
      accountResults.push({ account_id: acc.account_id, transactions: insertedThisAcc });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Account ${acc.account_id} failed:`, msg);
      totalErrors++;
      accountResults.push({ account_id: acc.account_id, transactions: 0, error: msg });
    }
  }

  await supabase.from("integration_logs").insert({
    integration: "sync-meta-transactions",
    status: totalErrors > 0 ? "partial" : "success",
    records_processed: totalInserted,
    message: `Days=${days} | Accounts=${accounts.length} | Errors=${totalErrors} | Inserted=${totalInserted}`,
  });

  return new Response(
    JSON.stringify({ ok: true, days, accounts: accounts.length, inserted: totalInserted, errors: totalErrors, details: accountResults }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
