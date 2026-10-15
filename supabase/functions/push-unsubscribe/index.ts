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
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;
    const subscriptionId = typeof body?.subscription_id === 'string' ? body.subscription_id : null;

    if (!endpoint && !subscriptionId) {
      return json({ error: 'endpoint or subscription_id is required' }, 400);
    }

    // Soft delete: preserva histórico de entrega e permite reativar o mesmo endpoint.
    let q = admin
      .from('push_subscriptions')
      .update({ enabled: false, deleted_at: new Date().toISOString() })
      .eq('user_id', userId);

    q = subscriptionId ? q.eq('id', subscriptionId) : q.eq('endpoint', endpoint!);

    const { data, error } = await q.select('id');
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true, removed: (data ?? []).length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
