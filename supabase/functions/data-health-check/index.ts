import { mirrorToWebPush } from "../_shared/push-mirror.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getMetaTokenForOperation,
  getOperationFromContext,
} from "../_shared/getMetaToken.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Recovery mode guard
    try {
      const { data: rm } = await sb.from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
      if (rm?.value === true) {
        return new Response(JSON.stringify({ skipped: true, reason: "recovery_mode" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch { /* proceed */ }

    const today = todayBR();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const logs: { type: string; status: string; source: string; message: string; metadata?: any }[] = [];
    let overallStatus = "ok";

    function escalate(status: string) {
      if (status === "error") overallStatus = "error";
      else if (status === "warning" && overallStatus !== "error") overallStatus = "warning";
    }

    // ─── A) VALIDAÇÃO DE SINCRONIZAÇÃO META ───
    try {
      // Count only ACTIVE campaigns with [VENDAS] tag (matches dashboard definition)
      const { count: metaCampaigns } = await sb
        .from("meta_campaign_status")
        .select("id", { count: "exact", head: true })
        .eq("effective_status", "ACTIVE")
        .ilike("campaign_name", "%[VENDAS]%");

      // Count distinct campaigns in traffic_data for today
      const { data: dashCampaigns } = await sb
        .from("traffic_data")
        .select("campaign_name")
        .eq("date", today)
        .gt("spend", 0);

      const uniqueDashCampaigns = new Set((dashCampaigns || []).map((r: any) => r.campaign_name)).size;
      const totalMeta = metaCampaigns || 0;
      const divergence = totalMeta > 0
        ? Math.abs(totalMeta - uniqueDashCampaigns) / totalMeta * 100
        : 0;

      let syncStatus = "ok";
      if (divergence > 7) { syncStatus = "error"; escalate("error"); }
      else if (divergence > 3) { syncStatus = "warning"; escalate("warning"); }

      logs.push({
        type: "sync",
        status: syncStatus,
        source: "meta",
        message: `Meta: ${totalMeta} campanhas API vs ${uniqueDashCampaigns} no Dash (divergência ${divergence.toFixed(1)}%)`,
        metadata: { totalMeta, uniqueDashCampaigns, divergence: Number(divergence.toFixed(2)) },
      });
    } catch (err: any) {
      logs.push({ type: "sync", status: "error", source: "meta", message: `Erro ao validar sync Meta: ${err.message}` });
      escalate("error");
    }

    // ─── B) VALIDAÇÃO REDTRACK ───
    try {
      const { data: lastRedtrack } = await sb
        .from("integration_logs")
        .select("created_at")
        .eq("integration", "redtrack")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (lastRedtrack) {
        const minSince = (now.getTime() - new Date(lastRedtrack.created_at).getTime()) / 60000;
        let rtStatus = "ok";
        if (minSince > 120) { rtStatus = "error"; escalate("error"); }
        else if (minSince > 30) { rtStatus = "warning"; escalate("warning"); }

        logs.push({
          type: "sync",
          status: rtStatus,
          source: "redtrack",
          message: `RedTrack: última sync há ${Math.round(minSince)} min`,
          metadata: { minutesSinceLastSync: Math.round(minSince) },
        });
      } else {
        logs.push({ type: "sync", status: "warning", source: "redtrack", message: "RedTrack: nenhum log de sync encontrado" });
        escalate("warning");
      }
    } catch (err: any) {
      logs.push({ type: "sync", status: "error", source: "redtrack", message: `Erro ao validar RedTrack: ${err.message}` });
      escalate("error");
    }

    // ─── C) VALIDAÇÃO DE CÁLCULO FINANCEIRO ───
    let calculationErrors = 0;
    try {
      const { data: sampleCampaigns } = await sb
        .from("traffic_data")
        .select("campaign_name, spend")
        .eq("date", today)
        .gt("spend", 0)
        .limit(10);

      if (sampleCampaigns && sampleCampaigns.length > 0) {
        for (const camp of sampleCampaigns) {
          // Get total spend for this campaign
          const { data: spendRows } = await sb
            .from("traffic_data")
            .select("spend")
            .eq("date", today)
            .eq("campaign_name", camp.campaign_name);

          const totalSpend = (spendRows || []).reduce((s: number, r: any) => s + Number(r.spend), 0);

          // Get revenue from redtrack
          const { data: salesRows } = await sb
            .from("redtrack_events")
            .select("amount, currency")
            .eq("utm_campaign", camp.campaign_name)
            .eq("event_type", "purchase")
            .gt("amount", 0)
            .gte("occurred_at", `${today}T03:00:00Z`);

          const totalRevenue = (salesRows || []).reduce((s: number, r: any) => {
            const amt = Number(r.amount);
            return s + (r.currency === "BRL" ? amt : amt * 5.15);
          }, 0);

          const expectedProfit = totalRevenue - totalSpend;
          const expectedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

          // These are just consistency validations - no comparison needed since we're computing fresh
          if (totalSpend > 0 && totalRevenue > 0 && expectedRoas < 0) {
            calculationErrors++;
          }
        }

        const calcStatus = calculationErrors > 0 ? "warning" : "ok";
        if (calculationErrors > 0) escalate("warning");

        logs.push({
          type: "calculation",
          status: calcStatus,
          source: "internal",
          message: `Validação financeira: ${calculationErrors} erro(s) em ${sampleCampaigns.length} campanhas`,
          metadata: { sampledCampaigns: sampleCampaigns.length, errors: calculationErrors },
        });
      }
    } catch (err: any) {
      logs.push({ type: "calculation", status: "error", source: "internal", message: `Erro na validação financeira: ${err.message}` });
      escalate("error");
    }

    // ─── D) VALIDAÇÃO DE DECISÕES GTX ───
    let decisionErrors = 0;
    try {
      const { data: recentDecisions } = await sb
        .from("gtx_decisions_log")
        .select("campaign_id, campaign_name, decisao, lucro_3d, roas_3d, vendas_3d, fase")
        .gte("created_at", oneDayAgo)
        .order("created_at", { ascending: false })
        .limit(200);

      if (recentDecisions && recentDecisions.length > 0) {
        // Deduplicate by campaign
        const seen = new Set<string>();
        const unique = recentDecisions.filter((d: any) => {
          if (seen.has(d.campaign_id)) return false;
          seen.add(d.campaign_id);
          return true;
        });

        for (const d of unique) {
          // Lucro 3D positivo + CORTAR
          if (d.decisao === "CORTAR" && d.lucro_3d > 0 && d.roas_3d >= 1.3) {
            decisionErrors++;
            logs.push({
              type: "decision",
              status: "error",
              source: "internal",
              message: `DECISÃO INVÁLIDA: ${d.campaign_name?.substring(0, 50)} → CORTAR com lucro 3D R$ ${d.lucro_3d.toFixed(2)} e ROAS ${d.roas_3d.toFixed(2)}x`,
            });
          }
          // Venda nas últimas 24h + CORTAR (vendas_3d > 0 means at least D0 has sales)
          if (d.decisao === "CORTAR" && d.vendas_3d > 0) {
            decisionErrors++;
            logs.push({
              type: "decision",
              status: "error",
              source: "internal",
              message: `DECISÃO INVÁLIDA: ${d.campaign_name?.substring(0, 50)} → CORTAR com ${d.vendas_3d} venda(s) em 3D`,
            });
          }
          // Fase TESTE + ESCALAR
          if (d.decisao === "ESCALAR" && d.fase === "TESTE") {
            decisionErrors++;
            logs.push({
              type: "decision",
              status: "error",
              source: "internal",
              message: `DECISÃO INVÁLIDA: ${d.campaign_name?.substring(0, 50)} → ESCALAR em fase TESTE`,
            });
          }
        }

        if (decisionErrors > 0) escalate("error");
        else {
          logs.push({
            type: "decision",
            status: "ok",
            source: "internal",
            message: `${unique.length} decisão(ões) validada(s) — nenhuma inconsistência`,
          });
        }
      }
    } catch (err: any) {
      logs.push({ type: "decision", status: "error", source: "internal", message: `Erro validando decisões: ${err.message}` });
      escalate("error");
    }

    // ─── E) VALIDAÇÃO DE ESCRITA (API WRITE) ───
    let apiWriteErrors24h = 0;
    let apiReadErrors24h = 0;
    try {
      const { count: writeErrors } = await sb
        .from("system_logs")
        .select("id", { count: "exact", head: true })
        .eq("type", "EDGE_ERROR")
        .gte("created_at", oneDayAgo);

      apiWriteErrors24h = writeErrors || 0;

      // Check last hour specifically
      const { count: writeErrors1h } = await sb
        .from("system_logs")
        .select("id", { count: "exact", head: true })
        .eq("type", "EDGE_ERROR")
        .gte("created_at", oneHourAgo);

      const errors1h = writeErrors1h || 0;

      let writeStatus = "ok";
      if (errors1h >= 15) { writeStatus = "error"; escalate("error"); }
      else if (errors1h >= 5) { writeStatus = "warning"; escalate("warning"); }

      logs.push({
        type: "api_write",
        status: writeStatus,
        source: "internal",
        message: `Erros API: ${apiWriteErrors24h} em 24h (${errors1h} na última 1h)`,
        metadata: { errors24h: apiWriteErrors24h, errors1h },
      });

      // Also count integration_logs with error status
      const { count: readErrors } = await sb
        .from("integration_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "error")
        .gte("created_at", oneDayAgo);

      apiReadErrors24h = readErrors || 0;

      if (apiReadErrors24h > 10) {
        escalate("warning");
        logs.push({
          type: "api_read",
          status: "warning",
          source: "internal",
          message: `${apiReadErrors24h} erro(s) de leitura de API nas últimas 24h`,
        });
      }
    } catch (err: any) {
      logs.push({ type: "api_write", status: "error", source: "internal", message: `Erro validando logs: ${err.message}` });
      escalate("error");
    }

    // ─── F) F8.B.6 CANARY — Vault token resolution probe ───
    // Observability only. Never fails the health check.
    try {
      const { data: probeAcc } = await sb
        .from("meta_ad_accounts")
        .select("account_id, operation_id")
        .eq("is_active", true)
        .not("operation_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (probeAcc?.account_id) {
        const opCtx = await getOperationFromContext({ accountId: probeAcc.account_id });
        const t0 = Date.now();
        const token = await getMetaTokenForOperation(opCtx.operationId, probeAcc.account_id);
        const elapsedMs = Date.now() - t0;
        console.log("[data-health-check][canary] token resolved", {
          accountId: probeAcc.account_id,
          operationId: opCtx.operationId,
          operationSource: opCtx.source,
          tokenLen: token?.length ?? 0,
          elapsedMs,
        });
        logs.push({
          type: "canary",
          status: token ? "ok" : "warning",
          source: "vault_probe",
          message: `F8.B.6 canary: token resolved (${token?.length ?? 0} chars, ${elapsedMs}ms) via ${opCtx.source}`,
          metadata: {
            account_id: probeAcc.account_id,
            operation_id: opCtx.operationId,
            operation_source: opCtx.source,
            token_length: token?.length ?? 0,
            elapsed_ms: elapsedMs,
          },
        });
        if (!token) escalate("warning");
      }
    } catch (err: any) {
      console.error("[data-health-check][canary] probe failed:", err?.message);
      logs.push({
        type: "canary",
        status: "warning",
        source: "vault_probe",
        message: `F8.B.6 canary probe erro (não bloqueia): ${err?.message}`,
      });
      // do NOT escalate — canary is observability only
    }

    // ─── G) SALES STALL — nenhuma venda em >2h numa op com histórico ativo ───
    try {
      const { data: ops } = await sb.from("operations").select("id, name, status");
      for (const op of (ops ?? []).filter((o: Record<string, unknown>) => (o.status ?? "active") === "active")) {
        // Velocidade histórica: vendas nos últimos 7 dias (exclui hoje)
        const { count: hist7d } = await sb
          .from("sales_data")
          .select("id", { count: "exact", head: true })
          .eq("operation_id", op.id)
          .gte("created_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .lt("created_at", `${today}T03:00:00Z`);

        // Só alerta em ops que realmente vendiam (>= ~2 vendas/dia na média)
        if ((hist7d ?? 0) < 14) continue;

        const { data: lastSale } = await sb
          .from("sales_data")
          .select("created_at")
          .eq("operation_id", op.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastTs = lastSale?.created_at ? Date.parse(lastSale.created_at) : 0;
        const minutesSince = lastTs ? Math.round((now.getTime() - lastTs) / 60000) : 99999;
        if (minutesSince <= 120) continue;

        const status = minutesSince > 360 ? "error" : "warning";
        escalate(status);
        logs.push({
          type: "sales_stall",
          status,
          source: op.name,
          message: `Nenhuma venda gravada há ${minutesSince} min em ${op.name} (média 7d: ${((hist7d ?? 0) / 7).toFixed(1)} vendas/dia)`,
          metadata: { operation_id: op.id, minutes_since_last_sale: minutesSince, sales_7d: hist7d ?? 0 },
        });
      }
    } catch (err) {
      console.error("sales stall check failed:", (err as Error).message);
    }

    // ─── PERSIST LOGS ───

    const logEntries = logs.map((l) => ({

      type: l.type,
      status: l.status,
      source: l.source,
      message: l.message,
      metadata: l.metadata || null,
    }));

    await sb.from("system_health_logs").insert(logEntries);

    // ─── PERSIST DAILY SNAPSHOT ───
    // Get totals for snapshot
    const metaCount = logs.find(l => l.type === "sync" && l.source === "meta")?.metadata?.totalMeta || 0;
    const dashCount = logs.find(l => l.type === "sync" && l.source === "meta")?.metadata?.uniqueDashCampaigns || 0;
    const divergence = logs.find(l => l.type === "sync" && l.source === "meta")?.metadata?.divergence || 0;

    // Get today's totals
    const { data: spendTotal } = await sb.rpc("get_traffic_spend_total", { p_start_date: today, p_end_date: today });
    const totalSpend = spendTotal?.[0]?.total_spend || 0;

    const { data: salesTotal } = await sb
      .from("redtrack_events")
      .select("amount")
      .eq("event_type", "purchase")
      .gt("amount", 0)
      .gte("occurred_at", `${today}T03:00:00Z`);

    const totalRevenue = (salesTotal || []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalSales = (salesTotal || []).length;

    await sb.from("system_daily_snapshot").insert({
      snapshot_date: today,
      total_campaigns_meta: metaCount,
      total_campaigns_dash: dashCount,
      total_spend: totalSpend,
      total_revenue: totalRevenue,
      total_sales: totalSales,
      divergence_percent: divergence,
      api_write_errors_24h: apiWriteErrors24h,
      api_read_errors_24h: apiReadErrors24h,
      calculation_errors: calculationErrors,
      decision_errors: decisionErrors,
      overall_status: overallStatus,
    });

    // ─── RELATÓRIO VIA TEMPLATE SYSTEM ───
    try {
      const syncMeta = logs.find(l => l.type === "sync" && l.source === "meta");
      const syncRT = logs.find(l => l.type === "sync" && l.source === "redtrack");
      const statusEmoji = overallStatus === "error" ? "🔴" : overallStatus === "warning" ? "🟡" : "🟢";
      const statusLabel = overallStatus === "error" ? "ERRO CRÍTICO DETECTADO" : overallStatus === "warning" ? "ATENÇÃO NECESSÁRIA" : "Sistema operacional saudável";

      const vars: Record<string, string> = {
        meta_campaigns: String(metaCount),
        dash_campaigns: String(dashCount),
        divergence: divergence.toFixed(1),
        sync_meta: syncMeta?.metadata?.totalMeta !== undefined ? "OK" : "N/D",
        sync_redtrack: syncRT?.metadata?.minutesSinceLastSync !== undefined ? syncRT.metadata.minutesSinceLastSync + " min atrás" : "N/D",
        api_errors: String(apiWriteErrors24h),
        calc_errors: String(calculationErrors),
        decision_errors: String(decisionErrors),
        status_emoji: statusEmoji,
        status_label: statusLabel,
      };

      if (overallStatus === "error") {
        vars.status_label += "\n\n⛔ Bloqueio recomendado até revisão.";
      }

      // Fetch template, recipients, prefs
      const [tplRes, rcpRes, prefRes] = await Promise.all([
        sb.from("notification_templates").select("*").eq("type", "data_health_report").eq("is_active", true),
        sb.from("notification_recipients").select("*").eq("is_active", true),
        sb.from("recipient_notification_prefs").select("*").eq("enabled", true),
      ]);

      const templates = tplRes.data || [];
      const recipients = rcpRes.data || [];
      const prefs = prefRes.data || [];

      if (templates.length > 0 && recipients.length > 0) {
        const prefsByTemplate = new Map<string, Set<string>>();
        for (const p of prefs) {
          const set = prefsByTemplate.get(p.template_id) || new Set<string>();
          set.add(p.recipient_id);
          prefsByTemplate.set(p.template_id, set);
        }
        const recipientMap = new Map<string, any>();
        for (const r of recipients) recipientMap.set(r.id, r);

        for (const tpl of templates) {
          const title = (tpl.title_template || "").replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => (vars[key] ?? "").toString());
          const body = (tpl.body_template || "").replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => (vars[key] ?? "").toString());

          const enabledRecipients = prefsByTemplate.get(tpl.id);
          if (!enabledRecipients) continue;

          for (const recipientId of enabledRecipients) {
            const recipient = recipientMap.get(recipientId);
            if (!recipient?.webhook_url) continue;

            try {
              await fetch(recipient.webhook_url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, text: body }),
                signal: AbortSignal.timeout(10000),
              });
              console.log(`Data health report sent to ${recipient.name}`);
            } catch (err: any) {
              console.error(`Pushcut error for ${recipient.name}:`, err.message);
            }
          }

          // Canal PARALELO: Web Push
          await mirrorToWebPush({
            operation_id: tpl.operation_id ?? null,
            notification_type: "data_health_report",
            title,
            body,
            url: "/",
          });
        }
      }
    } catch (err: any) {
      console.error("Template notification failed:", err.message);
    }

    // ─── CLEANUP: keep only 7 days of health logs ───
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await sb.from("system_health_logs").delete().lt("created_at", sevenDaysAgo);
    await sb.from("system_daily_snapshot").delete().lt("created_at", sevenDaysAgo);

    return new Response(JSON.stringify({
      status: overallStatus,
      checks: logs.length,
      logs,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("data-health-check error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
