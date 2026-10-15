import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API = "https://graph.facebook.com/v22.0";
const OP = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";

// Códigos oficiais de disable_reason da Meta
const REASONS: Record<number, string> = {
  0: "NONE",
  1: "ADS_INTEGRITY_POLICY (violação de política de anúncios)",
  2: "ADS_IP_REVIEW",
  3: "RISK_PAYMENT",
  4: "GRAY_ACCOUNT_SHUT_DOWN",
  5: "ADS_AFC_REVIEW",
  6: "BUSINESS_INTEGRITY_RAR (integridade do BM)",
  7: "PERMANENT_CLOSE",
  8: "UNUSED_RESELLER_ACCOUNT",
  9: "UNUSED_ACCOUNT",
  10: "UMBRELLA_AD_ACCOUNT",
  11: "BUSINESS_MANAGER_INTEGRITY_POLICY",
  12: "MISREPRESENTED_AD_ACCOUNT",
  13: "AOAB_DESHARE_LEGAL_ENTITY",
  14: "CTX_THREAD_REVIEW",
  15: "COMPROMISED_AD_ACCOUNT",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({} as any));
    const accountIds: string[] = body.account_ids || [];

    const { getAllMetaTokensForOperation } = await import("../_shared/getMetaToken.ts");
    const tokens = await getAllMetaTokensForOperation(OP);
    if (!tokens.length) throw new Error("nenhum token meta para FAHTO");

    const out: any[] = [];

    for (const acct of accountIds) {
      let acctInfo: any = null;
      let lastErr = "";
      for (const t of tokens) {
        const res = await fetch(
          `${META_API}/${acct}?fields=name,account_status,disable_reason,currency,business{id,name},funding_source_details,created_time,amount_spent&access_token=${t.token}`,
        );
        const j = await res.json();
        if (j.error) { lastErr = j.error.message; continue; }
        acctInfo = j;
        // páginas/criativos ativos recentes
        const adsRes = await fetch(
          `${META_API}/${acct}/ads?fields=name,effective_status,creative{effective_object_story_id,object_story_spec},updated_time&limit=25&access_token=${t.token}`,
        );
        const adsJson = await adsRes.json();
        acctInfo._ads = (adsJson.data || []).map((a: any) => ({
          name: a.name,
          status: a.effective_status,
          page_id:
            a.creative?.object_story_spec?.page_id ||
            String(a.creative?.effective_object_story_id || "").split("_")[0] ||
            null,
          updated_time: a.updated_time,
        }));
        break;
      }
      out.push({
        account_id: acct,
        error: acctInfo ? null : lastErr,
        name: acctInfo?.name,
        account_status: acctInfo?.account_status,
        disable_reason_code: acctInfo?.disable_reason,
        disable_reason: REASONS[acctInfo?.disable_reason] ?? String(acctInfo?.disable_reason ?? ""),
        bm_id: acctInfo?.business?.id ?? null,
        bm_name: acctInfo?.business?.name ?? null,
        created_time: acctInfo?.created_time,
        amount_spent: acctInfo?.amount_spent,
        pages: [...new Set((acctInfo?._ads || []).map((a: any) => a.page_id).filter(Boolean))],
        ads_sample: (acctInfo?._ads || []).slice(0, 5),
      });
    }

    return new Response(JSON.stringify({ results: out }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
