import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  if (!publicKey) {
    return new Response(JSON.stringify({ error: 'VAPID_PUBLIC_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ publicKey }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
