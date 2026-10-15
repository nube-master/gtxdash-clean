// meta-audit-probe — READ-ONLY. Consulta a Meta API (business real + insights)
// para auditoria de atribuição de contas. Não grava nada no banco.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getAllMetaTokensForOperation } from "../_shared/getMetaToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API = "https://graph.facebook.com/v22.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const operationId: string = body.operation_id;
    const accounts: string[] = body.accounts || [];
    const since: string | null = body.since ?? null;
    const until: string | null = body.until ?? null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    void supabase;

    const toks = (await getAllMetaTokensForOperation(operationId)).map((t) => t.token);
    const results: any[] = [];

    for (const acc of accounts) {
      const row: any = { account_id: acc, business_id: null, business_name: null, error: null };
      for (const tk of toks) {
        const r = await fetch(
          `${META_API}/${acc}?fields=name,currency,account_status,timezone_name,business{id,name},owner&access_token=${tk}`,
        );
        const j = await r.json();
        if (j.error) { row.error = j.error.message; continue; }
        row.error = null;
        row.name = j.name;
        row.currency = j.currency;
        row.account_status = j.account_status;
        row.timezone_name = j.timezone_name;
        row.business_id = j.business?.id ?? null;
        row.business_name = j.business?.name ?? null;
        row.owner = j.owner ?? null;

        if (since && until) {
          const ir = await fetch(
            `${META_API}/${acc}/insights?level=account&fields=spend,impressions,clicks&time_increment=1` +
              `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&access_token=${tk}`,
          );
          const ij = await ir.json();
          row.insights = ij.error ? { error: ij.error.message } : (ij.data ?? []);
        }
        break;
      }
      results.push(row);
    }

    return new Response(JSON.stringify({ tokens_tried: toks.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
