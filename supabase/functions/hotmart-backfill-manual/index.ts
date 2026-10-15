import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getHotmartToken(clientId: string, clientSecret: string) {
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  console.log(`[BACKFILL] Getting token from Hotmart...`);
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[BACKFILL] Hotmart Auth failed:`, errorText);
    throw new Error(`Hotmart Auth failed: ${errorText}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const { operation_id, start_date, end_date } = await req.json()
    if (!operation_id) throw new Error('operation_id is required')
    
    const { data: config } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'hotmart_config')
      .eq('operation_id', operation_id)
      .maybeSingle()

    const { client_id, client_secret } = (config?.value as any) || {}
    if (!client_id || !client_secret) {
      throw new Error('Hotmart API credentials (client_id/client_secret) not found in app_settings')
    }

    const { access_token } = await getHotmartToken(client_id, client_secret);

    // V2 API use milliseconds and different base URL
    const end = end_date || new Date().toISOString().split('T')[0];
    const start = start_date || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const startTime = new Date(`${start}T00:00:00Z`).getTime();
    const endTime = new Date(`${end}T23:59:59Z`).getTime();

    // Endpoints API V2 (most accounts use this now)
    const endpoints = [
      'https://developers.hotmart.com/payments/api/v1/sales/history',
      'https://api-sec-vlc.hotmart.com/payments/api/v1/sales/history',
      'https://api-sec-vlc.hotmart.com/payments/api/v1/sales/summary'
    ];
    
    let items: any[] = [];
    let success = false;
    let usedEndpoint = '';

    for (const baseUrl of endpoints) {
      try {
        let pageToken: string | null = null;
        let pages = 0;
        const collected: any[] = [];
        let endpointOk = false;

        do {
          const params = new URLSearchParams({
            start_date: startTime.toString(),
            end_date: endTime.toString(),
            max_results: '500',
          });
          if (pageToken) params.set('page_token', pageToken);
          const url = `${baseUrl}?${params.toString()}`;
          console.log(`[BACKFILL] Trying: ${url}`);

          const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${access_token}` }
          });

          if (!res.ok) {
            console.log(`[BACKFILL] Failed ${baseUrl}: ${res.status}`);
            break;
          }

          const data = await res.json();
          const batch = data.items || data.data?.items || (Array.isArray(data) ? data : []);
          collected.push(...batch);
          endpointOk = true;
          pageToken = data?.page_info?.next_page_token || null;
          pages++;
          console.log(`[BACKFILL] page ${pages}: +${batch.length} (total ${collected.length}) next=${pageToken ? 'yes' : 'no'}`);
        } while (pageToken && pages < 40);

        if (endpointOk) {
          items = collected;
          success = true;
          usedEndpoint = baseUrl;
          console.log(`[BACKFILL] Success with ${baseUrl}, found ${items.length} items`);
          break;
        }
      } catch (e) {
        console.error(`[BACKFILL] Error trying ${baseUrl}:`, e);
      }
    }

    if (!success) {
       throw new Error(`Hotmart API history 404/Error em todos os endpoints. Verifique se as credenciais estão corretas e se a API está habilitada.`);
    }


    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/hotmart-webhook?op=escola-do-dolar&backfill=true`;
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const errorSamples: string[] = [];

    // Já existentes em clickbank_audit (evita reprocessar milhares de vendas antigas)
    const existing = new Set<string>();
    {
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data } = await supabase
          .from('clickbank_audit')
          .select('receipt')
          .eq('operation_id', operation_id)
          .eq('vendor', 'hotmart')
          .gte('date', start)
          .lte('date', end)
          .range(from, from + PAGE - 1);
        (data || []).forEach((r: any) => existing.add(String(r.receipt || '').toLowerCase()));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
    }
    console.log(`[BACKFILL] ${existing.size} vendas já registradas no período`);

    const txCode = (item: any) =>
      item?.purchase?.transaction || item?.transaction || item?.purchase?.order_date_transaction || null;

    const pending = items.filter((item: any) => {
      const tx = txCode(item);
      if (!tx) return true;
      if (existing.has(`hotmart_${String(tx).toLowerCase()}`) || existing.has(String(tx).toLowerCase())) {
        skipped++;
        return false;
      }
      return true;
    });
    console.log(`[BACKFILL] ${pending.length} vendas pendentes de ${items.length}`);

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const BATCH = 50;

    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH).map((item: any) => ({ event: 'PURCHASE_APPROVED', data: item }));
      try {
        let res: Response | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hotmart-hottok': (config?.value as any)?.hottok
            },
            body: JSON.stringify({ batch: chunk })
          });
          if (res.status !== 429) break;
          const body = await res.clone().text();
          const m = body.match(/Retry after (\d+)ms/);
          await sleep(m ? Math.min(Number(m[1]) + 300, 30000) : 2000);
        }

        if (res && res.ok) {
          const r = await res.json();
          processed += Number(r.ok || 0);
          skipped += Number(r.skipped || 0);
          errors += Number(r.failed || 0);
          if (Array.isArray(r.samples)) {
            for (const s of r.samples) if (errorSamples.length < 5) errorSamples.push(s);
          }
        } else {
          const errText = res ? await res.text() : 'no response';
          console.error(`[BACKFILL] batch failed:`, errText);
          if (errorSamples.length < 5) errorSamples.push(`${res?.status ?? 0}: ${errText.slice(0, 200)}`);
          errors += chunk.length;
        }
      } catch (e) {
        console.error(`[BACKFILL] Error sending batch:`, e);
        if (errorSamples.length < 5) errorSamples.push(String((e as Error).message).slice(0, 200));
        errors += chunk.length;
      }
      await sleep(120);
    }


    return new Response(JSON.stringify({ 
      success: true,
      message: 'Backfill completed', 
      endpoint: usedEndpoint,
      total_found: items.length,
      processed,
      skipped,
      errors,
      error_samples: errorSamples,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })


  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
