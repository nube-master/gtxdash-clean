import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fixPermissions() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const operationId = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a';
  const userId = '65453504-89d7-4c18-92c0-19c45b6cd9f4';

  console.log(`Granting permissions for User ${userId} on Operation ${operationId}`);

  // 1. Insert Operation Member
  const { data: member, error: memErr } = await supabase
    .from("operation_members")
    .upsert({
      operation_id: operationId,
      user_id: userId,
      role: 'admin',
      status: 'active'
    }, { onConflict: 'operation_id,user_id' })
    .select();

  console.log("Operation Member upsert:", { data: member, error: memErr });

  return { success: !memErr, data: member, error: memErr?.message };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const result = await fixPermissions();
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
