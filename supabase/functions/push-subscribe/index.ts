import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    const sub = body?.subscription;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    const operationId = body?.operation_id ?? null;
    const deviceLabel = body?.device_label ?? null;

    if (!endpoint || !p256dh || !auth) {
      return json({ error: 'subscription.endpoint / keys.p256dh / keys.auth are required' }, 400);
    }

    const { data, error } = await admin
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          operation_id: operationId,
          endpoint,
          p256dh,
          auth,
          device_label: deviceLabel,
          enabled: true,
          deleted_at: null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' },
      )
      .select('id')
      .single();

    if (error) return json({ error: error.message }, 400);

    return json({ id: data.id, ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
