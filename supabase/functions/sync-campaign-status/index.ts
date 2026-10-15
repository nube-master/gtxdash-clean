import { mirrorToWebPush } from "../_shared/push-mirror.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v21.0";

type MetaAccountSnapshot = {
  account_status?: number;
  disable_reason?: number | string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { getAllMetaTokensForOperation } = await import("../_shared/getMetaToken.ts");
  const tokenCache = new Map<string, string[]>();
  async function tokensForOperation(operationId?: string | null): Promise<string[]> {
    const key = operationId || "__legacy__";
    if (!tokenCache.has(key)) {
      const tokensWithMeta = await getAllMetaTokensForOperation(operationId || "");
      tokenCache.set(key, tokensWithMeta.map((t) => t.token));
    }
    return tokenCache.get(key) ?? [];
  }

  try {
    let operationFilter: string | null = null;
    try {
      const url = new URL(req.url);
      operationFilter = url.searchParams.get("operation_id") || null;
      if (!operationFilter) {
        const body = await req.clone().json().catch(() => null);
        operationFilter = body?.operation_id || null;
      }
    } catch { /* ignore */ }

    const accountsFromMetaApi = new Set<string>();
    // F9-DIA3: Filtra contas por gasto recente (3 dias)
    const cutoff3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: recentSpendIds } = await supabase
      .from("traffic_data")
      .select("account_id")
      .gte("date", cutoff3d)
      .gt("spend", 0);
    const accountsWithRecentSpend = new Set(recentSpendIds?.map(r => r.account_id) ?? []);

    // Get active accounts
    let accountsQuery = supabase
      .from("meta_ad_accounts")
      .select("account_id, account_name, currency, operation_id, disable_reason")
      .eq("is_active", true);
    if (operationFilter) accountsQuery = accountsQuery.eq("operation_id", operationFilter);
    const { data: accountsRaw } = await accountsQuery;
    
    const accounts = (accountsRaw ?? []).filter((a: any) => {
      // Regra F9-DIA3: contas com gasto recente sempre entram.
      const hasRecentSpend = accountsWithRecentSpend.has(a.account_id);

      // EXCEÇÃO: Escola do Dólar (EDD) sempre processa para evitar "chavinha zumbi"
      const isEddAccount = a.operation_id === "1dd606e3-dac2-4064-b863-9784307c9e98";

      // BUGFIX (modo contingência): antes, qualquer conta cujo disable_reason
      // tivesse "sem permissão API" era excluída PARA SEMPRE do sync. Um erro
      // 200/403 transiente congelava o status em "Ativa" e a conta nunca mais
      // era reavaliada → quedas reais não geravam transição nem push.
      // Agora toda conta ativa é sempre reprobada; o disable_reason deixa de
      // ser critério de exclusão.
      const shouldInclude = Boolean(operationFilter) || hasRecentSpend || isEddAccount || a.is_active !== false;
      if (shouldInclude) accountsFromMetaApi.add(a.account_id);
      return shouldInclude;
    });


    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active accounts with recent spend", campaigns: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fxRates = new Map<string, number>([["BRL", 1]]);
    try {
      const { data: cachedRates } = await supabase
        .from("exchange_rates_cache")
        .select("base_currency, target_currency, rate, fetched_at")
        .eq("target_currency", "BRL")
        .order("fetched_at", { ascending: false });
      for (const row of cachedRates ?? []) {
        const code = String(row.base_currency || "").trim().toUpperCase();
        const rate = Number(row.rate);
        if (code && rate > 0 && !fxRates.has(code)) fxRates.set(code, rate);
      }
      if (!fxRates.has("USD")) {
        const { data: usdLog } = await supabase
          .from("exchange_rate_log")
          .select("rate")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const usdRate = Number(usdLog?.rate);
        if (usdRate > 0) fxRates.set("USD", usdRate);
      }
    } catch (e) {
      console.warn("[sync-campaign-status] Falha ao carregar câmbio para budget CBO; usando fallback USD=5.15", e);
    }
    if (!fxRates.has("USD")) fxRates.set("USD", 5.15);
    if (!fxRates.has("EUR")) fxRates.set("EUR", 5.60);

    
    const toBudgetBrl = (majorAmount: number, currencyRaw: unknown, campaignId: string, campaignName: string) => {
      if (!(majorAmount > 0)) return 0;
      const currency = String(currencyRaw || "USD").trim().toUpperCase();
      const rate = fxRates.get(currency);
      if (!rate) {
        console.warn(`[sync-campaign-status] SCALE ALERT: sem câmbio ${currency}->BRL para campanha ${campaignId} (${campaignName}). Mantendo budget sem conversão.`);
        return majorAmount;
      }
      return Number((majorAmount * rate).toFixed(2));
    };

    let totalCampaigns = 0;
    let totalStaleArchived = 0;
    let apiPermissionErrors = 0;
    const errors: string[] = [];
    const allRows: Array<{
      account_id: string;
      campaign_id: string;
      campaign_name: string;
      status: string;
      effective_status: string;
      daily_budget: number;
      lifetime_budget: number;
      operation_id: string | null;
    }> = [];
    // Tracks per-account which campaigns Meta returned in this run, so we can
    // mark rows that disappeared (archived/deleted) as ARCHIVED instead of
    // leaving them as a stale ACTIVE forever.
    const fetchedByAccount = new Map<string, Set<string>>();
    const accountFetchSucceeded = new Set<string>();


    // Build map of previous statuses for change detection
    let prevStatusesQuery = supabase
      .from("meta_ad_accounts")
      .select("account_id, account_status, account_name")
      .eq("is_active", true);
    if (operationFilter) prevStatusesQuery = prevStatusesQuery.eq("operation_id", operationFilter);
    const { data: prevStatuses } = await prevStatusesQuery;
    const prevStatusMap = new Map<string, number>();
    for (const ps of prevStatuses ?? []) prevStatusMap.set(ps.account_id, ps.account_status);

    const statusChanges: Array<{ name: string; from: number; to: number; reason: string; operation_id: string | null }> = [];

  const STATUS_LABELS: Record<number, string> = {
    1: "Ativa", 2: "Desabilitada", 3: "Pendente", 7: "Em Revisão",
    9: "Período de Graça", 100: "Fechamento Pendente", 101: "Fechada",
  };

  const DISABLE_REASON_LABELS: Record<number, string> = {
    0: "Nenhum",
    1: "Violação de Políticas de Anúncios",
    2: "Revisão de PI de Anúncios",
    3: "Pagamento Pendente / Risco de Pagamento",
    4: "Conta Cinza Encerrada",
    5: "Revisão AFC de Anúncios",
    6: "Integridade do Business Manager (RAR)",
    7: "Fechamento Permanente",
    8: "Conta de Revendedor não utilizada",
    9: "Conta não utilizada",
    10: "Conta Umbrella",
    11: "Violação de Integridade do Business Manager",
    12: "Conta duplicada do Facebook",
    13: "Risco de Criação",
    14: "Risco de Receita Irregular",
    15: "Violação de Política (Reciprocidade)",
  };

    async function fetchAccountStatusWithTokens(actId: string, accessTokens: string[]): Promise<{ snapshot: MetaAccountSnapshot | null; invalidToken: boolean; lastError: { code: number; status: number; message: string } | null }> {
      let lastError: { code: number; status: number; message: string } | null = null;
      for (const tk of accessTokens) {
        const res = await fetch(`${META_API}/${actId}?fields=account_status,disable_reason&access_token=${tk}`);
        if (res.ok) return { snapshot: await res.json(), invalidToken: false, lastError: null };
        const errText = await res.text().catch(() => "");
        let errCode = 0;
        let errMsg = "";
        try {
          const errJson = JSON.parse(errText);
          errCode = errJson?.error?.code || 0;
          errMsg = errJson?.error?.message || "";
        } catch { errMsg = errText.slice(0, 200); }
        lastError = { code: errCode || res.status, status: res.status, message: errMsg };
        if (errCode === 190) return { snapshot: null, invalidToken: true, lastError };
      }
      return { snapshot: null, invalidToken: false, lastError };
    }

    // Fetch account status AND campaigns for each account
    for (const acc of accounts) {
      const cleanId = acc.account_id.replace(/^act_/, '');
      const actId = 'act_' + cleanId;
      const accessTokens = await tokensForOperation(acc.operation_id);
      if (accessTokens.length === 0) {
        errors.push(`${acc.account_name}: nenhum token Meta para esta operação`);
        console.warn(`[sync-campaign-status] ${acc.account_name}: nenhum token Meta para operation_id=${acc.operation_id || "legacy"}`);
        continue;
      }

      // 1. Fetch account status using tokens scoped to this account's operation.
      const statusProbe = await fetchAccountStatusWithTokens(actId, accessTokens);
      if (statusProbe.invalidToken) {
        // Não aborta todo o sync — só marca essa conta e continua as outras
        const reason = `Token inválido (190): ${statusProbe.lastError?.message?.slice(0, 120) || "não confirmado"}`;
        apiPermissionErrors += 1;
        await supabase
          .from("meta_ad_accounts")
          .update({ disable_reason: reason })
          .eq("account_id", acc.account_id);
        errors.push(`${acc.account_name}: ${reason}`);
        console.warn(`[sync-campaign-status] ${acc.account_name}: token inválido, pulando`);
        continue;
      }
      if (statusProbe.snapshot) {
        const accountStatus = statusProbe.snapshot.account_status || 1;
        const disableReasonCode = statusProbe.snapshot.disable_reason ?? 0;
        const disableReasonNum = typeof disableReasonCode === "number" ? disableReasonCode : parseInt(String(disableReasonCode), 10) || 0;
        const disableReasonLabel = DISABLE_REASON_LABELS[disableReasonNum] || `Código ${disableReasonNum}`;

        const prevStatus = prevStatusMap.get(acc.account_id) ?? 1;
        if (prevStatus !== accountStatus) {
          statusChanges.push({
            name: acc.account_name,
            from: prevStatus,
            to: accountStatus,
            reason: disableReasonNum > 0 ? disableReasonLabel : "Sem motivo informado",
            operation_id: acc.operation_id || null,
          });
        }

        await supabase
          .from("meta_ad_accounts")
          .update({ account_status: accountStatus, disable_reason: disableReasonLabel })
          .eq("account_id", acc.account_id);
      } else {
        const errCode = statusProbe.lastError?.code || 0;
        const errStatus = statusProbe.lastError?.status || 0;
        const errMsg = statusProbe.lastError?.message || "";
        if (errCode === 200 || errStatus === 403) {
          apiPermissionErrors += 1;
          const reason = `Sem permissão API (${errCode || errStatus}): ${errMsg.slice(0, 120)}`;
          await supabase
            .from("meta_ad_accounts")
            // Erro 200/403 da Graph API não prova que a conta está desabilitada
            // na Meta; ele prova apenas que o token atual não consegue consultar
            // esse ativo. Preservamos o último status real conhecido para não
            // zerar Central de Contingência/Pacing por falso positivo de API.
            .update({ disable_reason: reason })
            .eq("account_id", acc.account_id);
          errors.push(`${acc.account_name}: ${reason}`);
          console.warn(`[sync-campaign-status] ${acc.account_name} sem permissão API; status real preservado.`);
          continue;
        }
        const isAccessLost = (errCode === 803) || (accountsFromMetaApi.has(acc.account_id) === false);
        const reason = isAccessLost
          ? `Sem acesso via API (${errCode || errStatus}): ${errMsg.slice(0, 120)}`
          : `Erro Meta API ${errStatus}: ${errMsg.slice(0, 120)}`;
        
        if (isAccessLost) {
          const prevStatus = prevStatusMap.get(acc.account_id) ?? 1;
          if (prevStatus === 1) {
            statusChanges.push({ name: acc.account_name, from: prevStatus, to: 2, reason, operation_id: acc.operation_id || null });
          }
          await supabase
            .from("meta_ad_accounts")
            .update({ account_status: 2, disable_reason: reason })
            .eq("account_id", acc.account_id);
          console.warn(`[sync-campaign-status] ${acc.account_name} marcada como Desabilitada: ${reason}`);
        } else {
          // Erro transiente (200, 429, 500, timeout, etc. exceto 803 ou sumiço da lista)
          // MANTER account_status=1 e NÃO preencher disable_reason (ou manter o atual se for apenas erro de rede)
          console.warn(`[sync-campaign-status] ${acc.account_name}: Erro transiente [${errCode}/${errStatus}], mantendo status ativo.`);
        }
      }

      // 2. Fetch campaigns — try every token; different System Users see different accounts.
      const fetchedIds = new Set<string>();
      let fetchFailed = false;
      let anyTokenWorked = false;
      let lastErrCode = 0;
      let lastErrMsg = "";
      for (let ti = 0; ti < accessTokens.length; ti++) {
        const tk = accessTokens[ti];
        try {
          let nextUrl: string | null =
            `${META_API}/${actId}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget,objective&limit=500&access_token=${tk}`;
          let tokenOk = true;
          while (nextUrl) {
            const res: Response = await fetch(nextUrl);
            if (!res.ok) {
              const errBody = await res.text();
              let errCode = 0;
              let errMsg = "";
              try {
                const errJson = JSON.parse(errBody);
                errCode = errJson?.error?.code || 0;
                errMsg = errJson?.error?.message || "";
              } catch { errMsg = errBody.slice(0, 200); }
              lastErrCode = errCode || res.status;
              lastErrMsg = errMsg;
              tokenOk = false;
              break;
            }
            const json: any = await res.json();
            const campaigns = json.data || [];
            for (const c of campaigns) {
              fetchedIds.add(String(c.id));
              const rawDaily = c.daily_budget ? parseFloat(c.daily_budget) : 0;
              const rawLifetime = c.lifetime_budget ? parseFloat(c.lifetime_budget) : 0;
              if (rawDaily > 0 && !Number.isInteger(rawDaily)) {
                console.warn(
                  `[sync-campaign-status] SCALE WARNING: daily_budget não-inteiro para campanha ${c.id} (${c.name}): "${c.daily_budget}".`
                );
              }
              const dailyMajor = rawDaily > 0 ? rawDaily / 100 : 0;
              const lifetimeMajor = rawLifetime > 0 ? rawLifetime / 100 : 0;
              const dailyBudgetBrl = toBudgetBrl(dailyMajor, acc.currency, c.id, c.name || "");
              const lifetimeBudgetBrl = toBudgetBrl(lifetimeMajor, acc.currency, c.id, c.name || "");
              if (
                (c.status === "ACTIVE" || c.effective_status === "ACTIVE") &&
                dailyBudgetBrl > 0 &&
                dailyBudgetBrl < 1
              ) {
                console.warn(
                  `[sync-campaign-status] SCALE ALERT: campanha ${c.id} (${c.name}) ACTIVE com daily_budget_brl=${dailyBudgetBrl.toFixed(4)} (raw=${c.daily_budget}, currency=${acc.currency}).`
                );
              }
              allRows.push({
                account_id: acc.account_id,
                campaign_id: c.id,
                campaign_name: c.name || "",
                status: c.status || "UNKNOWN",
                effective_status: c.effective_status || "UNKNOWN",
                daily_budget: dailyBudgetBrl,
                lifetime_budget: lifetimeBudgetBrl,
                objective: c.objective || null,
                operation_id: acc.operation_id || null,
              });
            }
            nextUrl = json.paging?.next || null;
          }
          if (tokenOk) {
            anyTokenWorked = true;
            break; // this token has access; stop trying others
          }
        } catch (e) {
          lastErrMsg = e instanceof Error ? e.message : String(e);
        }
      }
      if (!anyTokenWorked) {
        fetchFailed = true;
        errors.push(`${acc.account_name}: API error [${lastErrCode}] ${lastErrMsg.slice(0, 120)}`);
        console.warn(
          `[sync-campaign-status] Nenhum token teve acesso a ${acc.account_name} (${acc.account_id}). code=${lastErrCode}`
        );
      }

      // Only trust the diff if Meta answered successfully for this account.
      // Otherwise we'd archive everything just because the API blinked.
      if (!fetchFailed) {
        fetchedByAccount.set(acc.account_id, fetchedIds);
        accountFetchSucceeded.add(acc.account_id);
      }
    }



    console.log(`Fetched ${allRows.length} campaigns from ${accounts.length} accounts`);

    // Guard anti-"chavinha zumbi": se o operador pausou manualmente uma campanha
    // nos últimos 60s, o Meta Graph pode levar 5-15s pra propagar o PAUSED no
    // endpoint de leitura. Se nesse intervalo o sync ler ACTIVE, ele SOBREGRAVA
    // o PAUSED local e a UI "religa" a chavinha por 1 ciclo, forçando o operador
    // a clicar de novo. Aqui a gente lista as campanhas com pausa manual recente
    // e força status=PAUSED no que vai pro DB — a pausa manual é soberana.
    const manualPausedRecent = new Set<string>();
    if (allRows.length > 0) {
      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { data: recentPauses, error: rpErr } = await supabase
        .from("pacing_action_log")
        .select("campaign_id")
        .eq("action_type", "pause")
        .eq("success", true)
        .eq("dry_run", false)
        .gte("created_at", cutoff)
        .ilike("reason", "%manual%");
      if (rpErr) {
        console.warn("[sync-campaign-status] manual-pause guard lookup falhou:", rpErr.message);
      } else {
        for (const r of recentPauses ?? []) {
          if (r.campaign_id) manualPausedRecent.add(String(r.campaign_id));
        }
        if (manualPausedRecent.size > 0) {
          console.log(`[sync-campaign-status] manual-pause guard: preservando PAUSED em ${manualPausedRecent.size} campanha(s) (janela 60s)`);
        }
      }
    }

    // Upsert all campaigns
    if (allRows.length > 0) {
      for (let i = 0; i < allRows.length; i += 500) {
        const batch = allRows.slice(i, i + 500).map((r) => {
          if (manualPausedRecent.has(String(r.campaign_id)) && (r.status === "ACTIVE" || r.effective_status === "ACTIVE")) {
            return {
              ...r,
              status: "PAUSED",
              effective_status: "PAUSED",
              updated_at: new Date().toISOString(),
            };
          }
          return { ...r, updated_at: new Date().toISOString() };
        });
        const { error } = await supabase
          .from("meta_campaign_status")
          .upsert(batch, { onConflict: "account_id,campaign_id" });
        if (error) {
          console.error("Upsert error:", error.message);
          errors.push(`DB upsert: ${error.message}`);
        } else {
          totalCampaigns += batch.length;
        }
      }
    }

    // Archive stale rows: any campaign in DB for an account where Meta answered
    // successfully but did NOT come back in this run is archived/deleted on
    // Meta — must not keep showing as ACTIVE in Pace Control.
    for (const accountId of accountFetchSucceeded) {
      const fetchedIds = fetchedByAccount.get(accountId) ?? new Set<string>();

      // Pull current DB ids for this account (paginated)
      const dbRows: { campaign_id: string; effective_status: string }[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("meta_campaign_status")
          .select("campaign_id, effective_status")
          .eq("account_id", accountId)
          .range(from, from + PAGE - 1);
        if (error) { console.error("stale fetch error:", error.message); break; }
        if (!data || data.length === 0) break;
        for (const r of data) dbRows.push(r as any);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const stale = dbRows
        .filter((r) => r.effective_status !== "ARCHIVED" && r.effective_status !== "DELETED")
        .map((r) => String(r.campaign_id))
        .filter((id) => !fetchedIds.has(id));
      if (stale.length === 0) continue;

      for (let i = 0; i < stale.length; i += 200) {
        const chunk = stale.slice(i, i + 200);
        const { error: upErr } = await supabase
          .from("meta_campaign_status")
          .update({
            status: "ARCHIVED",
            effective_status: "ARCHIVED",
            updated_at: new Date().toISOString(),
          })
          .eq("account_id", accountId)
          .in("campaign_id", chunk);
        if (upErr) {
          console.error(`stale archive error account ${accountId}:`, upErr.message);
          errors.push(`Stale archive ${accountId}: ${upErr.message}`);
        } else {
          totalStaleArchived += chunk.length;
        }
      }
    }
    if (totalStaleArchived > 0) {
      console.log(`[sync-campaign-status] Archived ${totalStaleArchived} stale campaign rows.`);
    }



    // Send Pushcut alert for status changes via template system — SCOPED BY OPERATION
    if (statusChanges.length > 0) {
      try {
        // Group changes by operation_id (null = legacy/GTX fallback via template op scope)
        const changesByOp = new Map<string | null, typeof statusChanges>();
        for (const c of statusChanges) {
          const key = c.operation_id;
          const arr = changesByOp.get(key) || [];
          arr.push(c);
          changesByOp.set(key, arr);
        }

        for (const [opId, changes] of changesByOp.entries()) {
          if (!opId) {
            console.warn(`[sync-campaign-status] Skipping ${changes.length} status changes without operation_id (no tenant scope)`);
            continue;
          }

          // Fetch template + recipients + prefs SCOPED to this operation
          // Templates: operation-specific OR system (is_system=true, operation_id NULL) allowed as global fallback
          const [tplRes, rcpRes, prefRes] = await Promise.all([
            supabase.from("notification_templates")
              .select("*")
              .eq("type", "account_status_change")
              .eq("is_active", true)
              .or(`operation_id.eq.${opId},and(operation_id.is.null,is_system.eq.true)`),
            supabase.from("notification_recipients")
              .select("*")
              .eq("is_active", true)
              .eq("operation_id", opId),
            supabase.from("recipient_notification_prefs").select("*").eq("enabled", true),
          ]);

          const templates = tplRes.data || [];
          const recipients = rcpRes.data || [];
          const prefs = prefRes.data || [];

          if (templates.length === 0 || recipients.length === 0) {
            // BUGFIX: antes a operação sem template/destinatário Pushcut ficava
            // TOTALMENTE muda (nem Web Push). Agora mandamos push nativo com
            // texto padrão — vale para SPACE/ESCALIFY e qualquer op nova.
            console.log(`[sync-campaign-status] op=${opId}: sem template/recipient Pushcut (${templates.length}t/${recipients.length}r) — enviando Web Push padrão para ${changes.length} mudanças`);
            const fallbackBody = changes.map((c) => {
              const fromLabel = STATUS_LABELS[c.from] || `Status ${c.from}`;
              const toLabel = STATUS_LABELS[c.to] || `Status ${c.to}`;
              return `${c.name}: ${fromLabel} → ${toLabel} (${c.reason})`;
            }).join("\n");
            await mirrorToWebPush({
              operation_id: opId,
              notification_type: "account_status_change",
              title: `🚨 ${changes.length} conta(s) mudaram de status`,
              body: fallbackBody.slice(0, 600),
              url: "/contingency",
              payload: { total_mudancas: String(changes.length), detalhes: fallbackBody.slice(0, 600) },
            });

            continue;
          }


          const prefsByTemplate = new Map<string, Set<string>>();
          for (const p of prefs) {
            const set = prefsByTemplate.get(p.template_id) || new Set<string>();
            set.add(p.recipient_id);
            prefsByTemplate.set(p.template_id, set);
          }
          const recipientMap = new Map<string, any>();
          for (const r of recipients) recipientMap.set(r.id, r);

          const detalhes = changes.map((c) => {
            const fromLabel = STATUS_LABELS[c.from] || `Status ${c.from}`;
            const toLabel = STATUS_LABELS[c.to] || `Status ${c.to}`;
            return `⚠️ ${c.name}\n${fromLabel} → ${toLabel}\nMotivo: ${c.reason}`;
          }).join("\n\n");

          const vars: Record<string, string> = {
            total_mudancas: String(changes.length),
            detalhes,
          };

          for (const tpl of templates) {
            const title = (tpl.title_template || "").replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] || `{{${key}}}`);
            const body = (tpl.body_template || "").replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] || `{{${key}}}`);

            const enabledRecipients = prefsByTemplate.get(tpl.id);
            if (!enabledRecipients) continue;

            for (const recipientId of enabledRecipients) {
              const recipient = recipientMap.get(recipientId);
              // Double-guard: recipient must belong to this operation
              if (!recipient?.webhook_url || recipient.operation_id !== opId) continue;

              try {
                await fetch(recipient.webhook_url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title, text: body }),
                  signal: AbortSignal.timeout(8000),
                });
                console.log(`[sync-campaign-status] Pushcut sent op=${opId} to ${recipient.name}`);
              } catch (e) {
                console.error(`Pushcut alert error for ${recipient.name}:`, e);
              }
            }

            // Canal PARALELO: Web Push.
            // push-send re-interpola o template pelo tipo — sem estas vars no
            // payload o título saía "🚨 conta(s)..." e o corpo vazio.
            await mirrorToWebPush({
              operation_id: opId,
              notification_type: "account_status_change",
              title,
              body,
              url: "/contingency",
              payload: { total_mudancas: String(changes.length), detalhes },
            });

          }
        }
      } catch (e) {
        console.error("Template-based notification error:", e);
      }
    }

    // Log
    await supabase.from("integration_logs").insert({
      integration: "campaign-status",
      status: errors.length > 0 ? "partial" : "success",
      message: `Synced ${totalCampaigns} campaigns + ${totalStaleArchived} stale archived from ${accounts.length} accounts${operationFilter ? " [operation scoped]" : ""}${apiPermissionErrors > 0 ? ` (${apiPermissionErrors} API-permission accounts; account status preserved)` : ""}${errors.length > 0 ? ` (${errors.length} errors)` : ""}`,
      records_processed: totalCampaigns,
      operation_id: operationFilter || accounts[0]?.operation_id || null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        campaigns: totalCampaigns,
        stale_archived: totalStaleArchived,
        accounts: accounts.length,
        errors: errors.length,
        api_permission_errors: apiPermissionErrors,
        operation_id: operationFilter,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("sync-campaign-status error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
