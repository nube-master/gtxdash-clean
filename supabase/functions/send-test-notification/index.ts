import { mirrorToWebPush } from "../_shared/push-mirror.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { custom_title, custom_text, recipient_webhook_url } = await req.json();

    if (!custom_title || !custom_text) {
      return new Response(JSON.stringify({ error: "custom_title and custom_text are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!recipient_webhook_url) {
      return new Response(JSON.stringify({ error: "recipient_webhook_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const title = `🧪 TESTE | ${custom_title}`;
    const text = custom_text;

    // Send to Pushcut
    console.log(`Sending test to: ${recipient_webhook_url}`);
    const pushRes = await fetch(recipient_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text }),
    });

    const pushStatus = pushRes.status;
    const pushBody = await pushRes.text();
    console.log(`Pushcut response: ${pushStatus} - ${pushBody}`);

    // Canal PARALELO: Web Push
    await mirrorToWebPush({
      operation_id: null,
      notification_type: "test_notification",
      title,
      body: text,
      url: "/notifications",
    });

    if (!pushRes.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: `Pushcut retornou status ${pushStatus}`,
        pushcut_response: pushBody,
        title,
        text,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, title, text, pushcut_status: pushStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-test-notification error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
