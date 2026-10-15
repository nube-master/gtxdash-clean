import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function checkPermissions() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const operationId = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a';
  const userId = '65453504-89d7-4c18-92c0-19c45b6cd9f4';

  console.log(`Checking permissions for User ${userId} on Operation ${operationId}`);

  // 1. Check Super Admin
  const { data: sa, error: saErr } = await supabase
    .from("super_admins")
    .select("user_id, is_restricted")
    .eq("user_id", userId)
    .maybeSingle();
  
  console.log("Super Admin check:", { data: sa, error: saErr });

  // 2. Check Operation Member
  const { data: member, error: memErr } = await supabase
    .from("operation_members")
    .select("role, status")
    .eq("operation_id", operationId)
    .eq("user_id", userId)
    .maybeSingle();

  console.log("Operation Member check:", { data: member, error: memErr });

  // 3. Test Vault Access via wrapper
  // We use a dummy secret name to see if we can at least call the RPC
  const { data: vaultId, error: vaultErr } = await supabase.rpc("vault_create_secret_wrapper", {
    secret_value: "test-permissions-check",
    secret_name: `perm_check_${Date.now()}`,
    secret_description: "Checking permissions"
  });

  console.log("Vault RPC test:", { id: vaultId, error: vaultErr });

  return { sa, member, vaultTest: { id: vaultId, error: vaultErr } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const result = await checkPermissions();
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
