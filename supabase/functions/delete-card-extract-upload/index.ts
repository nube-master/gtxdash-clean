// Edge function: delete-card-extract-upload
// Remove um upload de extrato (Lot/Payoneer) e todas as cobranças/transações/topups
// vinculados via upload_log_id. Apenas usuários autenticados podem chamar (verify_jwt
// está desligado por padrão; validamos JWT manualmente).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valida o usuário
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const logId = String(body?.log_id || "").trim();
    if (!logId) {
      return new Response(JSON.stringify({ error: "missing_log_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role para fazer delete em cascata
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Busca o log para confirmar provider
    const { data: log, error: logErr } = await admin
      .from("integration_logs")
      .select("id, integration")
      .eq("id", logId)
      .maybeSingle();
    if (logErr || !log) {
      return new Response(JSON.stringify({ error: "log_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!String(log.integration).startsWith("card_extract_")) {
      return new Response(JSON.stringify({ error: "not_a_card_upload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Conta antes de apagar
    const [{ count: chargesCount }, { count: txCount }, { count: topupsCount }] =
      await Promise.all([
        admin
          .from("daily_card_charges")
          .select("id", { count: "exact", head: true })
          .eq("upload_log_id", logId),
        admin
          .from("payoneer_transactions")
          .select("id", { count: "exact", head: true })
          .eq("upload_log_id", logId),
        admin
          .from("treasury_topups")
          .select("id", { count: "exact", head: true })
          .eq("upload_log_id", logId),
      ]);

    // Deleta na ordem: topups → tx → charges → log
    const { error: delTopupsErr } = await admin
      .from("treasury_topups")
      .delete()
      .eq("upload_log_id", logId);
    if (delTopupsErr) throw delTopupsErr;

    const { error: delTxErr } = await admin
      .from("payoneer_transactions")
      .delete()
      .eq("upload_log_id", logId);
    if (delTxErr) throw delTxErr;

    const { error: delChargesErr } = await admin
      .from("daily_card_charges")
      .delete()
      .eq("upload_log_id", logId);
    if (delChargesErr) throw delChargesErr;

    const { error: delLogErr } = await admin
      .from("integration_logs")
      .delete()
      .eq("id", logId);
    if (delLogErr) throw delLogErr;

    return new Response(
      JSON.stringify({
        ok: true,
        deleted: {
          charges: chargesCount ?? 0,
          payoneer_transactions: txCount ?? 0,
          treasury_topups: topupsCount ?? 0,
          log: 1,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    console.error("[delete-card-extract-upload]", e);
    return new Response(
      JSON.stringify({ error: e?.message || "internal_error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
