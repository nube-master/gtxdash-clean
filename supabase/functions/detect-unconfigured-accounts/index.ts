import { mirrorToWebPush } from "../_shared/push-mirror.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const accessToken = Deno.env.get("META_ADS_ACCESS_TOKEN");
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "META_ADS_ACCESS_TOKEN not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Fetch ALL accounts from Meta API
    const metaAccounts: Array<{
      id: string;
      name: string;
      account_status: number;
      currency?: string;
      timezone_name?: string;
    }> = [];

    let nextUrl: string | null = `${META_API}/me/adaccounts?fields=id,name,account_status,currency,timezone_name,insights.date_preset(last_3d){spend}&limit=500&access_token=${accessToken}`;
    while (nextUrl) {
      const res: Response = await fetch(nextUrl);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Meta API error: ${err}`);
      }
      const json: any = await res.json();
      if (json.data) metaAccounts.push(...json.data);
      nextUrl = json.paging?.next || null;
    }

    // 2. Get registered accounts from DB
    const { data: savedAccounts } = await supabase
      .from("meta_ad_accounts")
      .select("account_id, is_active");

    const savedSet = new Set((savedAccounts || []).map((a: any) => a.account_id));
    const activeSet = new Set((savedAccounts || []).filter((a: any) => a.is_active).map((a: any) => a.account_id));

    // 3. Find unconfigured accounts (exist in Meta but NOT registered or registered but inactive)
    const unconfigured = metaAccounts
      .filter((a: any) => {
        const cleanId = a.id;
        // Só alerta se a conta NÃO estiver ativa no banco
        return !activeSet.has(cleanId);
      })
      .map((a: any) => {
        const hasSpend = (a.insights?.data || []).some((i: any) => Number(i.spend || 0) > 0);
        return {
          account_id: a.id,
          account_name: a.name,
          account_status: a.account_status,
          currency: a.currency || "USD",
          timezone: a.timezone_name || "America/Sao_Paulo",
          is_registered: savedSet.has(a.id),
          has_spend_3d: hasSpend
        };
      });

    // F9-DIA3: Filtra apenas contas com status 1 (active on Meta) QUE TIVERAM GASTO nos últimos 3 dias
    const newUnconfigured = unconfigured.filter(
      (a) => a.account_status === 1 && !a.is_registered && a.has_spend_3d
    );

    console.log(
      `[detect-unconfigured] Meta: ${metaAccounts.length} total, DB: ${savedAccounts?.length || 0} registered, ${activeSet.size} active, ${newUnconfigured.length} NEW unconfigured`
    );

    // 4. If there are NEW unconfigured accounts, send Pushcut alert
    if (newUnconfigured.length > 0) {
      const pushcutUrl = Deno.env.get("PUSHCUT_WEBHOOK_URL");
      if (pushcutUrl) {
        const accountList = newUnconfigured
          .map((a) => `• ${a.account_name} (${a.currency}, ${a.timezone})`)
          .join("\n");

        const title = `🚨 ${newUnconfigured.length} conta(s) nova(s) não configurada(s)!`;
        const body = `As seguintes contas têm acesso no token mas NÃO estão ativas no dashboard:\n\n${accountList}\n\n⚠️ Configure-as em Integrações → Meta Ads para não perder dados de gasto.`;

        try {
          const pushRes = await fetch(pushcutUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, text: body }),
          });
          console.log(`[detect-unconfigured] Pushcut alert sent: ${pushRes.status}`);
        } catch (pushErr) {
          console.error(`[detect-unconfigured] Pushcut error: ${pushErr}`);
        }

        // Canal PARALELO: Web Push
        await mirrorToWebPush({
          operation_id: null,
          notification_type: "unconfigured_accounts",
          title,
          body,
          url: "/integracoes",
        });
      }

      // Also log to system_health_logs for dashboard visibility
      await supabase.from("system_health_logs").insert({
        type: "unconfigured_accounts",
        source: "detect-unconfigured-accounts",
        status: "warning",
        message: `${newUnconfigured.length} conta(s) ativa(s) no Meta não configurada(s): ${newUnconfigured.map((a) => a.account_name).join(", ")}`,
        metadata: { accounts: newUnconfigured },
      });
    }

    return new Response(
      JSON.stringify({
        total_meta: metaAccounts.length,
        total_registered: savedAccounts?.length || 0,
        total_active: activeSet.size,
        unconfigured: newUnconfigured,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[detect-unconfigured] Error: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
