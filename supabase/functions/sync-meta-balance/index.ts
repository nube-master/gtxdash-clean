import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    const { getAllMetaAccessTokens, getAllMetaTokensForOperation, getMetaTokenForOperation, getOperationFromContext } = await import("../_shared/getMetaToken.ts");
    const { operationId: baseOpId } = await getOperationFromContext({});
    const vaultEntries = await getAllMetaTokensForOperation(baseOpId);
    const legacyFallbackTokens = await getAllMetaAccessTokens(sb);
    const seenTok = new Set<string>();
    const metaTokens: string[] = [];
    for (const e of vaultEntries) { if (!seenTok.has(e.token)) { seenTok.add(e.token); metaTokens.push(e.token); } }
    for (const t of legacyFallbackTokens) { if (!seenTok.has(t)) { seenTok.add(t); metaTokens.push(t); } }
    console.log("[sync-meta-balance] tokens resolved", {
      operation_id: baseOpId,
      vault_count: vaultEntries.length,
      total_after_dedupe: metaTokens.length,
      sources: vaultEntries.map((e) => e.source),
    });


    if (metaTokens.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "META_ADS_ACCESS_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch active ad accounts for this operation
    let accountsQuery = sb
      .from("meta_ad_accounts")
      .select("account_id, account_name, currency")
      .eq("is_active", true);
    
    if (baseOpId) {
      accountsQuery = accountsQuery.eq("operation_id", baseOpId);
    }

    const { data: accounts, error: accErr } = await accountsQuery;

    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No active accounts for this operation" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: any[] = [];
    let errors = 0;
    const fetchedAccountIds = new Set<string>();

    // Sequential processing (concurrency = 1) to avoid rate limits
    for (const acc of accounts) {
      try {
        const actId = acc.account_id.startsWith("act_")
          ? acc.account_id
          : `act_${acc.account_id}`;

        let data: any = null;
        let lastError = "";

        // Resolve per-account operation + preferred Vault token
        const { operationId: acctOpId } = await getOperationFromContext({ accountId: acc.account_id });
        let preferred: string | null = null;
        try {
          preferred = await getMetaTokenForOperation(acctOpId, acc.account_id);
        } catch (_) { /* ignore, use pool */ }
        const orderedTokens = preferred
          ? [preferred, ...metaTokens.filter((t) => t !== preferred)]
          : metaTokens;

        for (const metaToken of orderedTokens) {
          // Use v22.0 per user request
          const url = `https://graph.facebook.com/v22.0/${actId}?fields=name,amount_spent,balance,spend_cap,currency,funding_source_details&access_token=${metaToken}`;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          try {
            const resp = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!resp.ok) {
              const errBody = await resp.text();
              lastError = `${resp.status} ${errBody}`;
              console.warn(`[sync-meta-balance] Meta API Error for ${actId}: ${lastError}`);
              continue;
            }

            data = await resp.json();
            lastError = "";
            break;
          } catch (e) {
            clearTimeout(timeout);
            lastError = e instanceof Error ? e.message : String(e);
          }
        }

        if (!data) {
          console.error(`Error fetching ${actId} with all configured tokens: ${lastError}`);
          errors++;
          continue;
        }

        fetchedAccountIds.add(acc.account_id);

        // Meta returns amounts in cents (integer string)
        const amountSpent = Number(data.amount_spent || 0) / 100;
        const balance = Number(data.balance || 0) / 100;
        const spendCap = Number(data.spend_cap || 0) / 100;

        // Extract payment method info from funding_source_details
        let paymentMethodType = "";
        let cardBrand = "";
        let cardLast4 = "";
        const fsd = data.funding_source_details;
        if (fsd) {
          const displayStr = fsd.display_string || "";
          if (displayStr) {
            const match = displayStr.match(/^(\w+)\s*\*(\d{4})$/);
            if (match) {
              cardBrand = match[1];
              cardLast4 = match[2];
            } else {
              cardBrand = displayStr;
            }
          }
          const typeMap: Record<number, string> = { 1: "credit_card", 2: "debit", 3: "prepaid", 4: "paypal", 5: "line_of_credit" };
          paymentMethodType = typeMap[fsd.type] || (fsd.type ? `type_${fsd.type}` : "");
        }

        // UPSERT by account_id
        const { error: upsertErr } = await sb
          .from("meta_account_financials")
          .upsert(
            {
              account_id: acc.account_id,
              operation_id: acctOpId,
              account_name: data.name || acc.account_name || "",
              amount_spent: amountSpent,
              account_balance: balance,
              spend_cap: spendCap,
              currency: data.currency || acc.currency || "USD",
              payment_method_type: paymentMethodType,
              card_brand: cardBrand,
              card_last4: cardLast4,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "account_id" }
          );

        if (upsertErr) {
          console.error(`Upsert error for ${actId}:`, upsertErr);
          errors++;
        } else {
          results.push({ account_id: acc.account_id, amountSpent, balance });
        }
      } catch (e) {
        console.error(`Exception for ${acc.account_id}:`, e);
        errors++;
      }
    }

    // Cleanup: Mark accounts as inactive if they are active in our DB but NOT returned by Meta
    // Only for the current operation scope to be safe.
    const activeInDb = accounts.map(a => a.account_id);
    const missingFromMeta = activeInDb.filter(id => !fetchedAccountIds.has(id));
    
    if (missingFromMeta.length > 0) {
      console.log(`[sync-meta-balance] Marking ${missingFromMeta.length} accounts as inactive (not in Meta API response)`);
      await sb
        .from("meta_ad_accounts")
        .update({ is_active: false, disable_reason: "Removed from Meta BM/Token" })
        .in("account_id", missingFromMeta);
    }

    // Log integration result
    await sb.from("integration_logs").insert({
      integration: "sync-meta-balance",
      status: errors > 0 ? "partial" : "success",
      records_processed: results.length,
      operation_id: baseOpId,
      message: `Synced ${results.length}/${accounts.length} accounts. Errors: ${errors}. Results: ${JSON.stringify(results.map(r => r.account_id))}`,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        synced: results.length,
        total: accounts.length,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-meta-balance fatal:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
