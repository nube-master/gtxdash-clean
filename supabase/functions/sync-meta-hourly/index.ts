import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v22.0";
const SP_TZ = "America/Sao_Paulo";

/**
 * Converte (data local, hora local) do TZ da conta pra (data BRT, hora BRT).
 * Usado pra normalizar traffic_data_hourly em horário de Brasília
 * independente do fuso onde a conta Meta foi criada.
 */
function convertLocalHourToBrt(localDate: string, localHour: number, timezone: string): { brtDate: string; brtHour: number } {
  if (timezone === SP_TZ) return { brtDate: localDate, brtHour: localHour };
  try {
    const probe = new Date(`${localDate}T${String(localHour).padStart(2, "0")}:30:00Z`);
    const probeDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(probe);
    const probeHour = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(probe),
      10,
    );
    const targetDayMs = new Date(`${localDate}T00:00:00Z`).getTime();
    const probeDayMs = new Date(`${probeDate}T00:00:00Z`).getTime();
    const dayDiffHours = (probeDayMs - targetDayMs) / 3_600_000;
    const totalOffsetHours = dayDiffHours + probeHour - localHour;
    const utcInstant = new Date(probe.getTime() - totalOffsetHours * 3_600_000);
    return {
      brtDate: new Intl.DateTimeFormat("en-CA", { timeZone: SP_TZ }).format(utcInstant),
      brtHour: parseInt(
        new Intl.DateTimeFormat("en-US", { timeZone: SP_TZ, hour: "numeric", hour12: false }).format(utcInstant),
        10,
      ),
    };
  } catch {
    return { brtDate: localDate, brtHour: localHour };
  }
}

async function getUsdToBrlRate(): Promise<number> {
  const apis = [
    { url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", parse: (json: any) => json?.usd?.brl },
    { url: "https://open.er-api.com/v6/latest/USD", parse: (json: any) => json?.rates?.BRL },
  ];
  for (const api of apis) {
    try {
      const res = await fetch(api.url);
      if (!res.ok) continue;
      const json = await res.json();
      const rate = api.parse(json);
      if (rate && !isNaN(rate) && rate > 0) return rate;
    } catch { /* skip */ }
  }
  return 5.15;
}

interface HourlyInsight {
  hourly_stats_aggregated_by_advertiser_time_zone: string; // "00:00:00 - 00:59:59"
  spend: string;
  impressions: string;
  clicks: string;
}

/**
 * Determines which dates to fetch from Meta for a given account timezone,
 * ensuring we cover the full São Paulo "today" window.
 * 
 * For accounts ahead of SP (e.g. Europe/Belgrade = UTC+1, SP = UTC-3, diff = +4h):
 *   SP today 00:00 = Account today 04:00
 *   SP today 23:59 = Account tomorrow 03:59
 *   → Need to fetch account's TODAY and TOMORROW (tomorrow only has partial data)
 * 
 * For accounts behind SP (e.g. America/Los_Angeles = UTC-8, SP = UTC-3, diff = -5h):
 *   SP today 00:00 = Account yesterday 19:00
 *   SP today 23:59 = Account today 18:59
 *   → Need to fetch account's YESTERDAY and TODAY
 */
function getDatesToFetch(todaySP: string, accountTz: string): string[] {
  const SP_TZ = "America/Sao_Paulo";

  // Same timezone: only need today (BRT).
  if (accountTz === SP_TZ) return [todaySP];

  // Non-BRT: ALWAYS fetch account's yesterday+today+tomorrow.
  // - Ensures full coverage of SP's "today" window regardless of whether the
  //   account is ahead (Sydney/HK/Kiev) or behind (LA/NY) SP.
  // - Idempotent: upsert on (date,hour,account_id) means fetching neighboring
  //   days more than once has no negative effect; it just plugs any gap where
  //   Meta's hourly bucket lands on a different local date than expected.
  const refDate = new Date(`${todaySP}T12:00:00Z`);
  const accFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: accountTz });
  const accToday = accFormatter.format(refDate);
  const accYesterday = accFormatter.format(new Date(refDate.getTime() - 86_400_000));
  const accTomorrow = accFormatter.format(new Date(refDate.getTime() + 86_400_000));

  return Array.from(new Set([accYesterday, accToday, accTomorrow])).sort();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // MULTI-TENANT: resolve tokens PER account.operation_id (cache).
  // Antes esta função só carregava tokens da op raiz (GTX) → contas de outras
  // operações (Escola do Dólar, etc.) falhavam silenciosamente e o gráfico
  // "Lucro por Hora" ficava sem investimento.
  const { getAllMetaTokensForOperation } = await import("../_shared/getMetaToken.ts");
  const tokenCache = new Map<string, { token: string; profile_key: string }[]>();
  async function tokensForOperation(operationId?: string | null): Promise<{ token: string; profile_key: string }[]> {
    const key = operationId || "__legacy__";
    if (!tokenCache.has(key)) {
      let t = await getAllMetaTokensForOperation(operationId || "");
      
      // FAHTO safety: if no tokens found but it's FAHTO, try direct app_settings lookup
      const FAHTO_OP = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
      if (t.length === 0 && operationId === FAHTO_OP) {
        console.log(`[sync-meta-hourly] No tokens found via resolver for FAHTO, trying direct app_settings lookup...`);
        const { data: setting } = await supabase
          .from("app_settings")
          .select("value")
          .eq("operation_id", FAHTO_OP)
          .eq("key", "meta_ads_access_token")
          .maybeSingle();
        
        const tokenVal = (setting?.value as any)?.token || (typeof setting?.value === "string" ? setting.value : null);
        if (tokenVal) {
          t = [{
            token: tokenVal,
            profile_key: "direct_app_settings_fahto",
            credential_id: "direct",
            account_ids: [],
            source: "legacy_fallback"
          }];
        }
      }

      tokenCache.set(key, t.map((x) => ({ token: x.token, profile_key: x.profile_key })));
    }
    return tokenCache.get(key) ?? [];
  }


  try {
    // RECOVERY MODE guard
    const { data: rm } = await supabase.from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
    if (rm?.value === true) {
      return new Response(JSON.stringify({ skipped: true, reason: "recovery_mode" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse optional date param
    const brFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
    let todaySP = brFormatter.format(new Date());

    let operationId = "";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.date) todaySP = body.date;
        operationId = String(body.operation_id || body.operationId || "").trim();
      } catch { /* use default */ }
    }

    console.log(`[sync-meta-hourly] Syncing hourly spend for SP date ${todaySP}`);

    // F9-DIA3: Filtra contas por gasto recente (3 dias)
    // FIX 26/08: PostgREST corta em 1000 linhas por padrão. Sem paginação, a
    // maioria das contas caía fora do Set e era pulada silenciosamente —
    // causa raiz do buraco de traffic_data_hourly entre 02/08 e 20/08.
    const cutoff3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const accountsWithRecentSpend = new Set<string>();
    {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: page, error: pageErr } = await supabase
          .from("traffic_data")
          .select("account_id")
          .gte("date", cutoff3d)
          .gt("spend", 0)
          .range(from, from + PAGE - 1);
        if (pageErr) { console.warn("[sync-meta-hourly] recent spend page error:", pageErr); break; }
        (page ?? []).forEach((r: any) => accountsWithRecentSpend.add(r.account_id));
        if (!page || page.length < PAGE) break;
      }
      console.log(`[sync-meta-hourly] ${accountsWithRecentSpend.size} contas com gasto nos últimos 3 dias`);
    }


    // Get active accounts
    let accountsQuery = supabase
      .from("meta_ad_accounts")
      .select("account_id, currency, timezone, operation_id, disable_reason")
      .eq("is_active", true);
    if (operationId) accountsQuery = accountsQuery.eq("operation_id", operationId);
    let { data: accountsRaw, error: accErr } = await accountsQuery;
    if (accErr) throw accErr;

    const FAHTO_OP = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
    const accounts = (accountsRaw ?? []).filter((a: any) => {
      const hasRecentSpend = accountsWithRecentSpend.has(a.account_id);
      const isFahto = a.operation_id === FAHTO_OP;
      const dr = String(a.disable_reason || "").toLowerCase();
      const noAccess = dr.includes("sem permissão api") || dr.includes("sem acesso via api") || dr.includes("api access blocked");
      // Só contas com gasto recente (incluir todas as 97 da FAHTO estourava o tempo da função).
      void isFahto;
      return hasRecentSpend && !noAccess;
    });

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ message: "No active accounts with recent spend" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Use raw commercial exchange rate (no spread correction)
    const hasUsd = accounts.some((a) => a.currency === "USD");
    const usdRate = hasUsd ? await getUsdToBrlRate() : 1;

    let totalRows = 0;

    const syncAccount = async (account: any) => {
      const isBrl = account.currency === "BRL";
      
      const accountTz = account.timezone || "America/Sao_Paulo";
      const accessTokens = await tokensForOperation(account.operation_id);
      if (accessTokens.length === 0) {
        console.warn(`[sync-meta-hourly] Account ${account.account_id} — no tokens for operation ${account.operation_id}, skipping.`);
        return;
      }

      // Determine which dates to fetch based on timezone difference
      const datesToFetch = getDatesToFetch(todaySP, accountTz);

      for (const targetDate of datesToFetch) {
        // Federação: tenta cada token da operação até um retornar OK.
        let json: any = null;
        let lastErr = "";
        for (const { token, profile_key } of accessTokens) {
          const accIdStr = account.account_id.toString();
          const actId = accIdStr.startsWith("act_") ? accIdStr : `act_${accIdStr}`;
          const timeRange = `{"since":"${targetDate}","until":"${targetDate}"}`;
          const url = `${META_API}/${actId}/insights?` +

            `fields=spend,impressions,clicks` +
            `&time_range=${encodeURIComponent(timeRange)}` +
            `&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone` +
            `&level=account` +
            `&limit=500` +
            `&access_token=${token}`;

          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);

            if (!res.ok) {
              lastErr = (await res.text()).slice(0, 200);
              console.warn(`[sync-meta-hourly] Token profile ${profile_key} failed for ${account.account_id}: ${lastErr}`);
              continue; // tenta próximo token
            }
            json = await res.json();
            break; // token OK, para de iterar
          } catch (e) {
            lastErr = String(e).slice(0, 200);
          }
        }

        if (!json) {
          console.warn(`[sync-meta-hourly] Account ${account.account_id} date ${targetDate} — nenhum token funcionou. Último erro: ${lastErr}`);
          continue;
        }

        try {
          const rows = json.data || [];
          if (rows.length === 0) continue;


          const inserts = rows
            .map((r: HourlyInsight) => {
              const hourStr = r.hourly_stats_aggregated_by_advertiser_time_zone || "";
              const hourMatch = hourStr.match(/^(\d{2}):/);
              const localHour = hourMatch ? parseInt(hourMatch[1], 10) : 0;

              // Converte (targetDate, localHour) do TZ da conta pra (BRT date, BRT hour).
              // Assim traffic_data_hourly fica SEMPRE em horário de Brasília,
              // independente do fuso da conta. Watchdog e dashboards somam direto.
              const { brtDate, brtHour } = convertLocalHourToBrt(targetDate, localHour, accountTz);

              return {
                date: brtDate,
                hour: brtHour,
                account_id: account.account_id,
                spend: parseFloat(r.spend || "0"),
                impressions: parseInt(r.impressions || "0", 10),
                clicks: parseInt(r.clicks || "0", 10),
                operation_id: account.operation_id || null,
              };
            })
            // Dedup por (date,hour,account_id) caso 2 horas locais caiam no mesmo bucket BRT (DST/edge)
            .reduce((acc: any[], row: any) => {
              const key = `${row.date}|${row.hour}|${row.account_id}`;
              const existing = acc.find((r) => `${r.date}|${r.hour}|${r.account_id}` === key);
              if (existing) {
                existing.spend += row.spend;
                existing.impressions += row.impressions;
                existing.clicks += row.clicks;
              } else {
                acc.push(row);
              }
              return acc;
            }, [] as any[]);

          if (inserts.length > 0) {
            const { error: insErr } = await supabase
              .from("traffic_data_hourly")
              .upsert(inserts, { onConflict: "date,hour,account_id" });

            if (insErr) {
              console.warn(`[sync-meta-hourly] Insert error for ${account.account_id} date ${targetDate}:`, insErr);
            } else {
              totalRows += inserts.length;
            }
          }
        } catch (e) {
          console.warn(`[sync-meta-hourly] Failed for account ${account.account_id} date ${targetDate}:`, e);
        }
      }
    };

    // Paralelo em lotes de 10 contas (sequencial estourava o tempo limite).
    for (let i = 0; i < accounts.length; i += 10) {
      await Promise.all(accounts.slice(i, i + 10).map((a: any) => syncAccount(a).catch((e) => console.warn("[sync-meta-hourly]", e))));
    }

    console.log(`[sync-meta-hourly] Done. ${totalRows} hourly rows synced for SP date ${todaySP}`);

    // Log
    await supabase.from("integration_logs").insert({
      integration: "meta-hourly",
      status: "success",
      message: `Synced ${totalRows} hourly rows for SP date ${todaySP}`,
      records_processed: totalRows,
    });

    return new Response(JSON.stringify({ success: true, rows: totalRows, date: todaySP }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[sync-meta-hourly] Error:", e);
    await supabase.from("integration_logs").insert({
      integration: "meta-hourly",
      status: "error",
      message: e.message?.slice(0, 500),
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
