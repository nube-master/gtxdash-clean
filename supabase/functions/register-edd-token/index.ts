// One-shot: registra META_ACCESS_TOKEN_EDD (env var) como um segundo perfil
// Meta Ads da operação ESCOLA DO DÓLAR no Vault + operation_credentials.
// Depois disso, list-meta-accounts / sync-meta-* passam a enxergar todas as
// contas visíveis por esse token (Peregriya, Arsenal, etc).
//
// Auth: super_admin obrigatório.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EDD_OP_ID = "1dd606e3-dac2-4064-b863-9784307c9e98";
const PROFILE_KEY = "perfil_edd_2";
const GRAPH = "https://graph.facebook.com/v23.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // AuthZ: super_admin
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: sa } = await admin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!sa) return json({ error: "forbidden" }, 403);

  const token = Deno.env.get("META_ACCESS_TOKEN_EDD");
  if (!token || token.length < 40) {
    return json({ error: "META_ACCESS_TOKEN_EDD not configured" }, 400);
  }

  // 1) Validar token
  const probe = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const probeBody = await probe.json().catch(() => ({}));
  if (!probe.ok || probeBody?.error) {
    return json({ error: "meta_rejected_token", details: probeBody?.error?.message ?? `HTTP ${probe.status}` }, 400);
  }

  // 2) Descobrir contas: me/adaccounts + BMs owned/client
  type Acc = { id: string; account_id?: string; name?: string; account_status?: number; currency?: string; timezone_name?: string };
  const seen = new Map<string, Acc>();
  async function pull(url: string) {
    let next: string | null = url;
    let pages = 0;
    while (next) {
      const r: Response = await fetch(next);
      if (!r.ok) return;
      const j: any = await r.json();
      for (const a of (j.data ?? []) as Acc[]) {
        const id = (a.account_id ?? a.id ?? "").replace(/^act_/, "");
        if (id && !seen.has(id)) seen.set(id, { ...a, account_id: id });
      }
      next = j.paging?.next ?? null;
      if (++pages > 50) break;
    }
  }
  const f = "id,account_id,name,account_status,currency,timezone_name";
  await pull(`${GRAPH}/me/adaccounts?fields=${f}&limit=500&access_token=${encodeURIComponent(token)}`);

  const bms: Array<{ id: string; name: string }> = [];
  let bmsUrl: string | null = `${GRAPH}/me/businesses?fields=id,name&limit=200&access_token=${encodeURIComponent(token)}`;
  while (bmsUrl) {
    const r = await fetch(bmsUrl);
    if (!r.ok) break;
    const j: any = await r.json();
    if (Array.isArray(j.data)) bms.push(...j.data);
    bmsUrl = j.paging?.next ?? null;
  }
  await Promise.all(bms.flatMap((bm) => [
    pull(`${GRAPH}/${bm.id}/owned_ad_accounts?fields=${f}&limit=500&access_token=${encodeURIComponent(token)}`),
    pull(`${GRAPH}/${bm.id}/client_ad_accounts?fields=${f}&limit=500&access_token=${encodeURIComponent(token)}`),
  ]));

  const accounts = Array.from(seen.values());
  const accountIds = accounts.map((a) => a.account_id!).filter(Boolean);

  // 3) Vault: criar segredo
  const vaultName = `op_${EDD_OP_ID.replace(/-/g, "").slice(0, 12)}_meta_${PROFILE_KEY}_${Date.now()}`.toLowerCase();
  const { data: vaultSecretId, error: vaultErr } = await admin.rpc("vault_create_secret_wrapper", {
    secret_value: token,
    secret_name: vaultName,
    secret_description: `Meta Ads token '${PROFILE_KEY}' (op ${EDD_OP_ID}) — registered by register-edd-token`,
  });
  if (vaultErr) return json({ error: "vault_error", details: vaultErr.message }, 500);

  // 4) operation_credentials: upsert perfil_edd_2
  const { data: existing } = await admin
    .from("operation_credentials")
    .select("id")
    .eq("operation_id", EDD_OP_ID)
    .eq("provider", "meta_ads")
    .eq("profile_key", PROFILE_KEY)
    .maybeSingle();

  const metadata = {
    set_by: "register-edd-token",
    set_at: new Date().toISOString(),
    me_id: probeBody?.id,
    me_name: probeBody?.name,
    accounts_discovered: accounts.length,
    bms_discovered: bms.length,
  };

  let credentialId: string;
  if (existing) {
    const { error } = await admin.from("operation_credentials").update({
      vault_secret_id: vaultSecretId,
      vault_secret_name: vaultName,
      account_ids: accountIds,
      status: "active",
      rotated_at: new Date().toISOString(),
      metadata,
    }).eq("id", existing.id);
    if (error) return json({ error: "update_failed", details: error.message }, 500);
    credentialId = existing.id;
  } else {
    const { data: ins, error } = await admin.from("operation_credentials").insert({
      operation_id: EDD_OP_ID,
      provider: "meta_ads",
      profile_key: PROFILE_KEY,
      vault_secret_id: vaultSecretId,
      vault_secret_name: vaultName,
      account_ids: accountIds,
      status: "active",
      metadata,
    }).select("id").single();
    if (error) return json({ error: "insert_failed", details: error.message }, 500);
    credentialId = ins.id;
  }

  return json({
    ok: true,
    credential_id: credentialId,
    profile_key: PROFILE_KEY,
    me: { id: probeBody?.id, name: probeBody?.name },
    bms_count: bms.length,
    bms: bms.map((b) => b.name),
    accounts_count: accounts.length,
    accounts: accounts.map((a) => ({
      account_id: a.account_id,
      name: a.name,
      status: a.account_status,
      currency: a.currency,
    })),
  });
});
