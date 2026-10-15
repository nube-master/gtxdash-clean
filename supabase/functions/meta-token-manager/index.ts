import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requirePrivilegedAccess } from "../_shared/requirePrivilegedAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const GRAPH_VERSION = "v21.0";

async function fetchMeta(path: string, token: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Meta API error ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { operation_id, mode, token, profile_key, credential_id } = await req.json();
    
    // Auth guard: member of operation or super admin
    const guard = await requirePrivilegedAccess(req, operation_id);
    if (!guard.ok) return guard.response;
    const { supabase } = guard;

    if (mode === "verify") {
      if (!token) return json({ error: "Token is required" }, 400);
      
      const [me, debug, adaccounts] = await Promise.all([
        fetchMeta("me?fields=id,name", token).catch(e => ({ error: e.message })),
        fetchMeta(`debug_token?input_token=${encodeURIComponent(token)}`, token).catch(e => ({ error: e.message })),
        fetchMeta("me/adaccounts?fields=id,account_id,name,account_status,tasks&limit=500", token).catch(e => ({ error: e.message }))
      ]);

      return json({
        me,
        debug: debug.data || debug,
        adaccounts: adaccounts.data || [],
        adaccounts_error: adaccounts.error || null
      });
    }

    if (mode === "list") {
      const { data: credentials, error } = await supabase
        .from("operation_credentials")
        .select("*")
        .eq("operation_id", operation_id)
        .eq("provider", "meta_ads");
      
      if (error) throw error;
      return json({ credentials });
    }

    if (mode === "delete") {
      if (!credential_id) return json({ error: "Credential ID is required" }, 400);
      const { error } = await supabase
        .from("operation_credentials")
        .delete()
        .eq("id", credential_id)
        .eq("operation_id", operation_id);
      
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Invalid mode" }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
});
