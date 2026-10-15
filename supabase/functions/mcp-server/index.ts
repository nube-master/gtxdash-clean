import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SUPABASE_ANON_TOKEN = Deno.env.get("SUPABASE_ANON_KEY") || "";
const BASE_URL = `${SUPABASE_URL}/functions/v1`;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

// In-memory SSE sessions (per isolate). Streamable HTTP: GET opens stream, POST can target session.
type SseSession = { controller: ReadableStreamDefaultController<Uint8Array>; createdAt: number };
const SSE_SESSIONS = new Map<string, SseSession>();
const SSE_ENCODER = new TextEncoder();

function sseSend(sessionId: string, payload: unknown, eventId?: string) {
  const s = SSE_SESSIONS.get(sessionId);
  if (!s) return false;
  try {
    const lines: string[] = [];
    if (eventId) lines.push(`id: ${eventId}`);
    lines.push(`event: message`);
    lines.push(`data: ${JSON.stringify(payload)}`);
    s.controller.enqueue(SSE_ENCODER.encode(lines.join("\n") + "\n\n"));
    return true;
  } catch {
    SSE_SESSIONS.delete(sessionId);
    return false;
  }
}

async function callInternal(endpoint: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${SUPABASE_ANON_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// ── TOOL DEFINITIONS ──
const TOOLS = [
  { name: "get_dashboard", description: "Retorna os totais consolidados da operação: spend, revenue, lucro, ROAS, CPA e número de vendas.", inputSchema: { type: "object" as const, properties: { days: { type: "number", description: "Número de dias (1=hoje, 7=semana, 30=mês)" } }, required: ["days"] } },
  { name: "get_campaigns", description: "Performance detalhada por campanha: spend, revenue, ROAS, CPA de cada campanha ativa.", inputSchema: { type: "object" as const, properties: { days: { type: "number", description: "Período em dias" } }, required: ["days"] } },
  { name: "get_campaign_statuses", description: "Lista todas as campanhas com status atual (ACTIVE, PAUSED, etc.), orçamento diário e lifetime.", inputSchema: { type: "object" as const, properties: {} } },
  { name: "get_daily_performance", description: "Performance diária (snapshots): spend, revenue, lucro, ROAS, CPA, cliques, impressões.", inputSchema: { type: "object" as const, properties: { days: { type: "number", description: "Número de dias" } }, required: ["days"] } },
  { name: "get_traffic_by_campaign", description: "Breakdown de tráfego por campanha: spend, cliques, impressões agrupados por campanha e dia.", inputSchema: { type: "object" as const, properties: { days: { type: "number", description: "Período em dias" } }, required: ["days"] } },
  { name: "get_spend_by_account", description: "Investimento (spend) diário por conta Meta Ads.", inputSchema: { type: "object" as const, properties: { days: { type: "number", description: "Período em dias" } }, required: ["days"] } },
  { name: "get_creatives", description: "Performance de criativos (ad_name): spend, cliques, impressões, views de vídeo, thruplays.", inputSchema: { type: "object" as const, properties: { days: { type: "number", description: "Período em dias" } }, required: ["days"] } },
  { name: "get_vsl_performance", description: "Performance das VSLs (Vturb): retenção (25/50/75/100%), CTA clicks, conversões e curva segundo-a-segundo. Filtra por projeto (NDM, ERX, GLP, CRT, LDR, NDR, NEURO), período (days) e VSL específica (vsl_id) ou utm_campaign. Cruza com criativos do Meta via utm_campaign.", inputSchema: { type: "object" as const, properties: { days: { type: "number", description: "Período em dias (padrão: 7)" }, project: { type: "string", description: "Filtra por projeto: NDM, ERX, GLP, CRT, LDR, NDR, NEURO (opcional)" }, vsl_id: { type: "string", description: "ID específico da VSL no Vturb (opcional)" }, utm_campaign: { type: "string", description: "Filtra por utm_campaign exata (opcional)" } } } },
  { name: "get_financial_summary", description: "Resumo financeiro completo: custos fixos, ajustes manuais e metas mensais.", inputSchema: { type: "object" as const, properties: { month: { type: "string", description: "Mês YYYY-MM (padrão: atual)" } } } },
  { name: "get_fixed_costs", description: "Lista todos os custos fixos ativos: nome, valor mensal, categoria, setor e recorrência.", inputSchema: { type: "object" as const, properties: {} } },
  { name: "get_cashflow", description: "Dados do fluxo de caixa: configurações do mês e ajustes/lançamentos.", inputSchema: { type: "object" as const, properties: { month: { type: "string", description: "Mês YYYY-MM (padrão: atual)" } } } },
  { name: "get_planning", description: "Metas de planejamento e projeções: meta mensal de faturamento e lucro, progresso atual.", inputSchema: { type: "object" as const, properties: { month: { type: "string", description: "Mês YYYY-MM (padrão: atual)" } } } },
  { name: "get_contingency", description: "Infraestrutura: contas Meta Ads, Business Managers, regras de mapeamento.", inputSchema: { type: "object" as const, properties: {} } },
  { name: "get_account_statuses", description: "Status atual de todas as contas Meta Ads.", inputSchema: { type: "object" as const, properties: {} } },
  { name: "get_account_status_history", description: "Histórico de mudanças de status das contas Meta Ads.", inputSchema: { type: "object" as const, properties: { days: { type: "number", description: "Últimos N dias (padrão: 30)" } } } },
  { name: "get_sales", description: "Vendas recentes: CartPanda, ClickBank e RedTrack. Inclui valor, UTM, produto, status.", inputSchema: { type: "object" as const, properties: { days: { type: "number", description: "Período em dias (padrão: 7)" }, source: { type: "string", description: "Fonte: 'all', 'cartpanda', 'clickbank', 'redtrack'" } } } },
  { name: "get_meta_financials", description: "Financeiro das contas Meta: saldo, gasto acumulado, spend cap, método de pagamento.", inputSchema: { type: "object" as const, properties: {} } },
  { name: "get_exchange_rate", description: "Taxa de câmbio atual USD → BRL e histórico recente.", inputSchema: { type: "object" as const, properties: {} } },
  { name: "get_notification_config", description: "Configuração de notificações: destinatários, templates ativos.", inputSchema: { type: "object" as const, properties: {} } },
  { name: "get_integration_logs", description: "Logs recentes das integrações: status de sincronização, registros processados, erros.", inputSchema: { type: "object" as const, properties: { limit: { type: "number", description: "Número de logs (padrão: 50)" } } } },
  { name: "ask_analyst", description: "Faz uma pergunta livre ao analista de IA do Traffic OS.", inputSchema: { type: "object" as const, properties: { question: { type: "string", description: "A pergunta em português ou inglês" } }, required: ["question"] } },
  { name: "health_check", description: "Status geral do sistema Traffic OS e das integrações.", inputSchema: { type: "object" as const, properties: {} } },
  { name: "get_app_settings", description: "Configurações globais da aplicação (recovery mode, feature flags, etc.).", inputSchema: { type: "object" as const, properties: {} } },

  // ── SPY MODULE ──
  { name: "spy_get_radar_competitors", description: "Lista concorrentes monitorados no Spy Radar com métricas atuais (# ads, variação 7d, tendência, status, último sync).", inputSchema: { type: "object" as const, properties: { project: { type: "string", description: "Nome ou ID do projeto Spy (opcional)" }, status: { type: "string", description: "active | paused | aposentado" }, operation_id: { type: "string", description: "ID da operação (opcional)" }, limit: { type: "number", description: "Limite de resultados (padrão 100)" } } } },
  { name: "spy_add_competitor", description: "Cadastra um novo concorrente no Spy Radar e dispara primeiro sync automaticamente.", inputSchema: { type: "object" as const, properties: { name: { type: "string" }, project: { type: "string", description: "Nome ou ID do projeto Spy" }, country: { type: "string", description: "Código país (US, UK, BR...)" }, ad_library_url: { type: "string", description: "URL da Meta Ad Library (extrai page_id automaticamente)" }, niche: { type: "string" }, hook: { type: "string", description: "Anotação livre — armazenada em funnel_type" }, model_funnel: { type: "string", description: "Tipo de funil — armazenado em funnel_type" }, operation_id: { type: "string" } }, required: ["name", "project", "country", "ad_library_url"] } },
  { name: "spy_update_competitor", description: "Atualiza campos de um concorrente. Aceita name, country, niche, library_url, status, meta_page_id, meta_search_term, funnel_type, funnel_url.", inputSchema: { type: "object" as const, properties: { id: { type: "string" }, fields_to_update: { type: "object", description: "Objeto com campos a atualizar" } }, required: ["id", "fields_to_update"] } },
  { name: "spy_delete_competitor", description: "Soft delete: marca concorrente como aposentado (deleted_at + status='aposentado').", inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "spy_get_competitor_detail", description: "Detalhe de um concorrente: dados + últimos 30 snapshots + alertas relacionados + criativos ativos.", inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "spy_trigger_sync", description: "Força resync manual (igual o botão 🔄). Retorna status, ads_found, delta vs último snapshot, e erro se falhar.", inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "spy_get_alerts", description: "Lista alertas do Spy (sync_error, surge_50, stopped, started). Filtra por acknowledged (read_at) e tipo.", inputSchema: { type: "object" as const, properties: { acknowledged: { type: "boolean", description: "true=lidos, false=não lidos, omitir=todos" }, severity: { type: "string", description: "Tipo: sync_error, surge_50, stopped, started" }, operation_id: { type: "string" }, limit: { type: "number", description: "Padrão 50" } } } },
  { name: "spy_ack_alert", description: "Marca alerta como lido (read_at = now).", inputSchema: { type: "object" as const, properties: { alert_id: { type: "string" } }, required: ["alert_id"] } },
  { name: "spy_get_swipe_file", description: "Lista itens do Swipe File (criativos curados). Filtra por projeto, nicho e tags.", inputSchema: { type: "object" as const, properties: { project: { type: "string" }, niche: { type: "string" }, operation_id: { type: "string" }, limit: { type: "number", description: "Padrão 100" } } } },
  { name: "spy_add_to_swipe_file", description: "Adiciona criativo ao Swipe File. ad_library_id pode ser meta_ad_archive_id ou spy_creative.id.", inputSchema: { type: "object" as const, properties: { ad_library_id: { type: "string" }, tags: { type: "array", items: { type: "string" } }, notes: { type: "string" } }, required: ["ad_library_id"] } },
  { name: "spy_trigger_ia_analysis", description: "Dispara análise IA (Gemini) num item do swipe. Retorna ângulo, gancho, CTA, público e tom em JSON estruturado.", inputSchema: { type: "object" as const, properties: { swipe_file_id: { type: "string", description: "ID do spy_swipe (ou spy_creative diretamente)" } }, required: ["swipe_file_id"] } },

  // ── PACING CONTROLLER (GTX) ──
  { name: "gtx_list_pacing_rules", description: "Lista regras do Pacing Controller. Filtra por enabled, projeto (string buscada em filter_config) e paginação.", inputSchema: { type: "object" as const, properties: { enabled: { type: "boolean" }, project: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "gtx_get_pacing_rule", description: "Retorna uma regra de pacing por ID com todos os configs (filter, trigger, action, notification).", inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "gtx_create_pacing_rule", description: "Cria nova regra de pacing. Aceita name, description, budget_group_id, enabled, dry_run, filter_config, trigger_config, action_config, notification_config.", inputSchema: { type: "object" as const, properties: { name: { type: "string" }, description: { type: "string" }, budget_group_id: { type: "string" }, enabled: { type: "boolean" }, dry_run: { type: "boolean" }, filter_config: { type: "object" }, trigger_config: { type: "object" }, action_config: { type: "object" }, notification_config: { type: "object" } }, required: ["name", "filter_config", "trigger_config", "action_config"] } },
  { name: "gtx_update_pacing_rule", description: "Atualiza campos de uma regra de pacing.", inputSchema: { type: "object" as const, properties: { id: { type: "string" }, updates: { type: "object" } }, required: ["id", "updates"] } },
  { name: "gtx_delete_pacing_rule", description: "Remove uma regra de pacing.", inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "gtx_toggle_pacing_rule", description: "Habilita/desabilita uma regra de pacing.", inputSchema: { type: "object" as const, properties: { id: { type: "string" }, enabled: { type: "boolean" } }, required: ["id", "enabled"] } },
  { name: "gtx_list_budget_groups", description: "Lista budget groups do Pacing (teto horário/diário por grupo).", inputSchema: { type: "object" as const, properties: { enabled: { type: "boolean" } } } },
  { name: "gtx_create_budget_group", description: "Cria budget group. Aceita name, description, max_spend_per_hour, max_daily_total, currency, enabled, config.", inputSchema: { type: "object" as const, properties: { name: { type: "string" }, description: { type: "string" }, max_spend_per_hour: { type: "number" }, max_daily_total: { type: "number" }, currency: { type: "string" }, enabled: { type: "boolean" }, config: { type: "object" } }, required: ["name"] } },
  { name: "gtx_update_budget_group", description: "Atualiza campos de um budget group.", inputSchema: { type: "object" as const, properties: { id: { type: "string" }, updates: { type: "object" } }, required: ["id", "updates"] } },
  { name: "gtx_delete_budget_group", description: "Remove um budget group.", inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "gtx_get_action_log", description: "Lista entradas do pacing_action_log filtrando por range (from/to ISO), rule_id, campaign_id, action_type.", inputSchema: { type: "object" as const, properties: { from: { type: "string" }, to: { type: "string" }, rule_id: { type: "string" }, campaign_id: { type: "string" }, action_type: { type: "string" }, limit: { type: "number" } } } },
  { name: "gtx_get_action_log_stats", description: "Agregados do action_log: total, breakdown por action_type, top regras, economia estimada (soma de spend_expected − spend_at_action em pauses bem-sucedidos).", inputSchema: { type: "object" as const, properties: { from: { type: "string" }, to: { type: "string" } } } },
  { name: "gtx_force_pause_campaign", description: "Pausa manualmente uma campanha via Meta API. Cria bloqueio manual sticky até religar manualmente.", inputSchema: { type: "object" as const, properties: { campaign_id: { type: "string" }, reason: { type: "string" }, cooldown_minutes: { type: "number" } }, required: ["campaign_id", "reason"] } },
  { name: "gtx_force_resume_campaign", description: "Religa manualmente uma campanha via Meta API, remove cooldown ativo e registra no action_log.", inputSchema: { type: "object" as const, properties: { campaign_id: { type: "string" }, reason: { type: "string" } }, required: ["campaign_id", "reason"] } },
  { name: "gtx_get_settings", description: "Retorna chaves de app_settings. Sem args = todas; com keys=array de strings = só as solicitadas.", inputSchema: { type: "object" as const, properties: { keys: { type: "array", items: { type: "string" } } } } },
  { name: "list_orders", description: "Lista pedidos COD de afiliado recebidos por webhook (Sphere/Fahto) em cod_orders. Paginação por cursor keyset, ordenação created_at DESC. Params: from/to (YYYY-MM-DD, obrigatórios), platform (sphere|fahto|all), status (paid|pending|refused|expired|delivered|all), operation (slug ou uuid), cursor, limit (1..200), include_total.", inputSchema: { type: "object" as const, properties: { from: { type: "string", description: "Data inicial YYYY-MM-DD (created_at UTC)" }, to: { type: "string", description: "Data final YYYY-MM-DD (inclusive)" }, platform: { type: "string", description: "sphere | fahto | all" }, status: { type: "string", description: "paid | pending | refused | expired | delivered | all" }, operation_id: { type: "string", description: "UUID da operação (obrigatório salvo se o token já for fixo em uma operação)" }, operation: { type: "string", description: "slug ou uuid da operação (alias de operation_id)" }, cursor: { type: "string", description: "Cursor opaco da página anterior" }, limit: { type: "number", description: "1..200 (padrão 100)" }, include_total: { type: "boolean", description: "Inclui total (padrão true)" } }, required: ["from", "to"] } },
];

// ── TOOL EXECUTION ──
async function executeTool(name: string, args: Record<string, unknown>, mcpToken?: { id: string; name: string; scopes: string[]; operation_id?: string | null }): Promise<string> {
  const apiKey = Deno.env.get("DASHBOARD_API_KEY") || "";
  const tokenOpId = mcpToken?.operation_id;

  switch (name) {
    case "get_dashboard": {
      const opId = String(args.operation_id || tokenOpId || "");
      const data = await callInternal(`dashboard-api?days=${Number(args.days) || 7}&key=${apiKey}${opId ? `&operation_id=${opId}` : ""}`);
      return JSON.stringify(data, null, 2);
    }
    case "get_campaigns": {
      const data = await callInternal(`dashboard-totals?days=${Number(args.days) || 7}`);
      return JSON.stringify(data, null, 2);
    }
    case "get_campaign_statuses": {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from("meta_campaign_status")
          .select("campaign_id, campaign_name, account_id, status, effective_status, daily_budget, lifetime_budget, updated_at");
        
        const opId = args.operation_id || tokenOpId;
        if (opId) q = q.eq("operation_id", opId);

        const { data, error } = await q
          .order("updated_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const batch = data || [];
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return JSON.stringify(all, null, 2);
    }
    case "get_daily_performance": {
      const { start } = dateRange(Number(args.days) || 30);
      const opId = args.operation_id || tokenOpId;
      let q = supabase.from("daily_totals_snapshot").select("date, total_spend, total_revenue, lucro_bruto, roas, cac, total_conversions, total_clicks, total_impressions, usd_to_brl, ticket_medio, cp_count, cp_revenue, rt_count, rt_revenue_brl").gte("date", start);
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q.order("date", { ascending: true });
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "get_traffic_by_campaign": {
      const { start, end } = dateRange(Number(args.days) || 7);
      const opId = args.operation_id || tokenOpId;
      const { data, error } = await supabase.rpc("get_traffic_by_campaign", { p_start_date: start, p_end_date: end, p_operation_id: opId || null });
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "get_spend_by_account": {
      const { start, end } = dateRange(Number(args.days) || 7);
      const opId = args.operation_id || tokenOpId;
      const { data, error } = await supabase.rpc("get_traffic_spend_by_account", { p_start_date: start, p_end_date: end, p_operation_id: opId || null });
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "get_creatives": {
      const { start, end } = dateRange(Number(args.days) || 7);
      const opId = args.operation_id || tokenOpId;
      const { data, error } = await supabase.rpc("get_creative_traffic_aggregated", { p_start_date: start, p_end_date: end, p_operation_id: opId || null });
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "get_vsl_performance": {
      const days = Number(args.days) || 7;
      const { start, end } = dateRange(days);
      const project = args.project ? String(args.project).toUpperCase() : null;
      const vslId = args.vsl_id ? String(args.vsl_id) : null;
      const utmCampaign = args.utm_campaign ? String(args.utm_campaign) : null;

      // Query granular: vturb_performance_daily
      let query = supabase
        .from("vturb_performance_daily")
        .select("date, vsl_id, vsl_name, utm_campaign, project, views, unique_views, retention_25, retention_50, retention_75, retention_100, retention_avg, cta_clicks, conversions, conversion_rate, retention_curve, is_mock")
        .gte("date", start)
        .lte("date", end);
      if (project) query = query.eq("project", project);
      if (vslId) query = query.eq("vsl_id", vslId);
      if (utmCampaign) query = query.eq("utm_campaign", utmCampaign);

      const { data: granular, error } = await query.order("date", { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);

      // Agregação por VSL/utm_campaign — usa média ponderada por views para retenções
      const agg = new Map<string, any>();
      for (const row of granular || []) {
        const key = `${row.vsl_id}|${row.utm_campaign || "—"}`;
        const cur = agg.get(key) || {
          vsl_id: row.vsl_id, vsl_name: row.vsl_name, utm_campaign: row.utm_campaign, project: row.project,
          views: 0, unique_views: 0, cta_clicks: 0, conversions: 0,
          _r25_w: 0, _r50_w: 0, _r75_w: 0, _r100_w: 0, _ravg_w: 0,
          days_count: 0,
        };
        const v = Number(row.views || 0);
        cur.views += v;
        cur.unique_views += Number(row.unique_views || 0);
        cur.cta_clicks += Number(row.cta_clicks || 0);
        cur.conversions += Number(row.conversions || 0);
        cur._r25_w += Number(row.retention_25 || 0) * v;
        cur._r50_w += Number(row.retention_50 || 0) * v;
        cur._r75_w += Number(row.retention_75 || 0) * v;
        cur._r100_w += Number(row.retention_100 || 0) * v;
        cur._ravg_w += Number(row.retention_avg || 0) * v;
        cur.days_count += 1;
        agg.set(key, cur);
      }

      const aggregated = Array.from(agg.values()).map((r: any) => {
        const v = r.views || 1;
        return {
          vsl_id: r.vsl_id, vsl_name: r.vsl_name, utm_campaign: r.utm_campaign, project: r.project,
          views: r.views, unique_views: r.unique_views, cta_clicks: r.cta_clicks, conversions: r.conversions,
          retention_25_pct: +(r._r25_w / v).toFixed(2),
          retention_50_pct: +(r._r50_w / v).toFixed(2),
          retention_75_pct: +(r._r75_w / v).toFixed(2),
          retention_100_pct: +(r._r100_w / v).toFixed(2),
          retention_avg_pct: +(r._ravg_w / v).toFixed(2),
          cta_rate_pct: r.views > 0 ? +(((r.cta_clicks / r.views) * 100)).toFixed(2) : 0,
          conversion_rate_pct: r.cta_clicks > 0 ? +(((r.conversions / r.cta_clicks) * 100)).toFixed(2) : 0,
          days_count: r.days_count,
        };
      }).sort((a: any, b: any) => b.views - a.views);

      return JSON.stringify({
        period: { start, end, days },
        filters: { project, vsl_id: vslId, utm_campaign: utmCampaign },
        summary: {
          total_vsls: aggregated.length,
          total_views: aggregated.reduce((s, r) => s + r.views, 0),
          total_cta_clicks: aggregated.reduce((s, r) => s + r.cta_clicks, 0),
          total_conversions: aggregated.reduce((s, r) => s + r.conversions, 0),
        },
        aggregated,
        granular: granular || [],
      }, null, 2);
    }
    case "get_financial_summary": {
      const m = String(args.month || new Date().toISOString().slice(0, 7));
      const [fixedCosts, adjustments, goals] = await Promise.all([
        supabase.from("fixed_costs").select("*").eq("is_active", true),
        supabase.from("manual_adjustments").select("*").eq("is_active", true),
        supabase.from("monthly_goals").select("*").eq("month", m).maybeSingle(),
      ]);
      const totalFixed = (fixedCosts.data || []).reduce((s: number, c: any) => s + Number(c.monthly_value || 0), 0);
      const totalAdj = (adjustments.data || []).reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
      return JSON.stringify({ month: m, fixed_costs: { total: totalFixed, count: (fixedCosts.data || []).length, items: fixedCosts.data }, manual_adjustments: { total: totalAdj, count: (adjustments.data || []).length, items: adjustments.data }, monthly_goal: goals.data || null }, null, 2);
    }
    case "get_fixed_costs": {
      const opId = args.operation_id || tokenOpId;
      let q = supabase.from("fixed_costs").select("name, monthly_value, category, sector, recurrence, cost_type, is_active").eq("is_active", true);
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q.order("monthly_value", { ascending: false });
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "get_cashflow": {
      const m = String(args.month || new Date().toISOString().slice(0, 7));
      const [settings, adjustments] = await Promise.all([
        supabase.from("cashflow_settings").select("*").eq("month", m).maybeSingle(),
        supabase.from("cashflow_adjustments").select("*").gte("date", `${m}-01`).lte("date", `${m}-31`).order("date"),
      ]);
      return JSON.stringify({ month: m, settings: settings.data || null, adjustments: adjustments.data || [] }, null, 2);
    }
    case "get_planning": {
      const m = String(args.month || new Date().toISOString().slice(0, 7));
      const [goal, snapshots] = await Promise.all([
        supabase.from("monthly_goals").select("*").eq("month", m).maybeSingle(),
        supabase.from("daily_totals_snapshot").select("date, total_revenue, total_spend, lucro_bruto, total_conversions").gte("date", `${m}-01`).lte("date", `${m}-31`).order("date"),
      ]);
      const days = snapshots.data || [];
      const totalRevenue = days.reduce((s: number, d: any) => s + Number(d.total_revenue || 0), 0);
      const totalSpend = days.reduce((s: number, d: any) => s + Number(d.total_spend || 0), 0);
      const totalProfit = days.reduce((s: number, d: any) => s + Number(d.lucro_bruto || 0), 0);
      const totalSales = days.reduce((s: number, d: any) => s + Number(d.total_conversions || 0), 0);
      const goalData = goal.data;
      const revenueGoal = goalData?.goal_value || 0;
      const profitGoal = goalData?.profit_goal || 0;
      return JSON.stringify({ month: m, goal: goalData, progress: { revenue: totalRevenue, revenue_goal: revenueGoal, revenue_pct: revenueGoal > 0 ? ((totalRevenue / revenueGoal) * 100).toFixed(1) : null, spend: totalSpend, profit: totalProfit, profit_goal: profitGoal, profit_pct: profitGoal > 0 ? ((totalProfit / profitGoal) * 100).toFixed(1) : null, sales: totalSales, days_elapsed: days.length }, daily_breakdown: days }, null, 2);
    }
    case "get_contingency": {
      const [accounts, bms, rules] = await Promise.all([
        supabase.from("meta_ad_accounts").select("account_id, account_name, account_status, is_active, currency, timezone, category, bm_id, disable_reason").order("account_name"),
        supabase.from("business_managers").select("bm_id, name, status"),
        supabase.from("campaign_mapping_rules").select("pattern, pattern_type, display_name, account_id, account_type, currency, is_active").eq("is_active", true),
      ]);
      const active = (accounts.data || []).filter((a: any) => a.is_active && a.account_status === 1).length;
      const disabled = (accounts.data || []).filter((a: any) => a.account_status !== 1).length;
      return JSON.stringify({ summary: { total_accounts: (accounts.data || []).length, active, disabled, business_managers: (bms.data || []).length }, accounts: accounts.data, business_managers: bms.data, mapping_rules: rules.data }, null, 2);
    }
    case "get_account_statuses": {
      const { data, error } = await supabase.from("meta_ad_accounts").select("account_id, account_name, account_status, is_active, disable_reason, category, timezone, currency, bm_id").order("account_name");
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "get_account_status_history": {
      const since = new Date(); since.setDate(since.getDate() - (Number(args.days) || 30));
      const { data, error } = await supabase.from("account_status_log").select("account_id, account_name, old_status, new_status, changed_at").gte("changed_at", since.toISOString()).order("changed_at", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "get_sales": {
      const d = Number(args.days) || 7;
      const src = String(args.source || "all");
      const { start } = dateRange(d);
      const results: Record<string, unknown> = {};
      if (src === "all" || src === "cartpanda") {
        const opId = args.operation_id || tokenOpId;
        let q = supabase.from("sales_data").select("date, revenue, status, utm_campaign, utm_source, product_name, created_at").gte("date", start);
        if (opId) q = q.eq("operation_id", opId);
        const { data } = await q.order("created_at", { ascending: false }).limit(500);
        results.cartpanda = data;
      }
      if (src === "all" || src === "clickbank") {
        const { data } = await supabase.from("clickbank_audit").select("date, receipt, transaction_type, amount_usd, amount_brl, product_name, vendor, affiliate, aff_sub2, item_name, quantity, created_at").gte("date", start).order("created_at", { ascending: false }).limit(500);
        results.clickbank = data;
      }
      if (src === "all" || src === "redtrack") {
        const since = new Date(); since.setDate(since.getDate() - d);
        const { data } = await supabase.from("redtrack_events").select("utm_campaign, event_type, amount, offer_name, occurred_at").in("event_type", ["purchase", "upsell"]).gte("occurred_at", since.toISOString()).order("occurred_at", { ascending: false }).limit(500);
        results.redtrack = data;
      }
      return JSON.stringify(results, null, 2);
    }
    case "get_meta_financials": {
      const opId = args.operation_id || tokenOpId;
      let q = supabase.from("meta_account_financials").select("account_id, account_name, account_balance, amount_spent, spend_cap, currency, payment_method_type, card_brand, card_last4, updated_at");
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q.order("account_name");
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "get_exchange_rate": {
      const { data } = await supabase.from("exchange_rate_log").select("rate, source, created_at").order("created_at", { ascending: false }).limit(10);
      return JSON.stringify(data, null, 2);
    }
    case "get_notification_config": {
      const [recipients, templates] = await Promise.all([
        supabase.from("notification_recipients").select("name, webhook_url, is_active, schedule, project_filter"),
        supabase.from("notification_templates").select("name, type, title_template, body_template, is_active, project_scope").eq("is_active", true),
      ]);
      return JSON.stringify({ recipients: recipients.data, templates: templates.data }, null, 2);
    }
    case "get_integration_logs": {
      const { data, error } = await supabase.from("integration_logs").select("integration, status, message, records_processed, created_at").order("created_at", { ascending: false }).limit(Number(args.limit) || 50);
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "ask_analyst": {
      const data = await callInternal("analyst-chat", "POST", { message: String(args.question || "") });
      return JSON.stringify(data, null, 2);
    }
    case "health_check": {
      const data = await callInternal("health-check");
      return JSON.stringify(data, null, 2);
    }
    case "get_app_settings": {
      const { data, error } = await supabase.from("app_settings").select("key, value, updated_at");
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }

    // ── SPY MODULE HANDLERS ──
    case "spy_get_radar_competitors": {
      let q = supabase.from("spy_advertiser")
        .select("id, name, project_id, country, niche, status, current_ads_count, last_synced_at, last_sync_error, library_url, meta_page_id, funnel_type")
        .is("deleted_at", null)
        .order("current_ads_count", { ascending: false })
        .limit(Number(args.limit) || 100);
      if (args.status) q = q.eq("status", String(args.status));
      if (args.operation_id) q = q.eq("operation_id", String(args.operation_id));
      if (args.project) {
        const proj = String(args.project);
        const isUuid = /^[0-9a-f-]{36}$/i.test(proj);
        const projQ = isUuid
          ? supabase.from("spy_project").select("id").eq("id", proj).maybeSingle()
          : supabase.from("spy_project").select("id").ilike("name", `%${proj}%`).limit(1).maybeSingle();
        const { data: p } = await projQ;
        if (p?.id) q = q.eq("project_id", p.id);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const ids = (data || []).map((r: any) => r.id);
      const since = new Date(); since.setDate(since.getDate() - 7);
      const { data: hist } = await supabase.from("spy_advertiser_history")
        .select("advertiser_id, date, active_ads_count")
        .in("advertiser_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      const histByAdv: Record<string, any[]> = {};
      for (const h of hist || []) (histByAdv[h.advertiser_id] = histByAdv[h.advertiser_id] || []).push(h);
      const enriched = (data || []).map((r: any) => {
        const h = histByAdv[r.id] || [];
        const oldest = h[0]?.active_ads_count ?? r.current_ads_count;
        const variation_7d_pct = oldest > 0 ? Math.round(((r.current_ads_count - oldest) / oldest) * 100) : null;
        const trend = variation_7d_pct === null ? "flat" : variation_7d_pct > 10 ? "up" : variation_7d_pct < -10 ? "down" : "flat";
        return { ...r, variation_7d_pct, trend, snapshots_7d: h.length };
      });
      return JSON.stringify(enriched, null, 2);
    }

    case "spy_add_competitor": {
      const name = String(args.name || "").trim();
      const projectInput = String(args.project || "").trim();
      const country = String(args.country || "US").toUpperCase();
      const url = String(args.ad_library_url || "");
      if (!name || !projectInput || !url) throw new Error("name, project e ad_library_url são obrigatórios");
      const isUuid = /^[0-9a-f-]{36}$/i.test(projectInput);
      const pq = isUuid
        ? supabase.from("spy_project").select("id, operation_id").eq("id", projectInput).maybeSingle()
        : supabase.from("spy_project").select("id, operation_id").ilike("name", `%${projectInput}%`).limit(1).maybeSingle();
      const { data: projectRow } = await pq;
      if (!projectRow) throw new Error(`Projeto Spy não encontrado: ${projectInput}`);
      const operation_id = String(args.operation_id || projectRow.operation_id);
      const pageIdMatch = url.match(/view_all_page_id=(\d+)/) || url.match(/[?&]id=(\d+)/);
      const meta_page_id = pageIdMatch?.[1] || null;
      const searchTermMatch = url.match(/[?&]q=([^&]+)/);
      const meta_search_term = searchTermMatch ? decodeURIComponent(searchTermMatch[1]) : null;
      const funnel_type = [args.hook, args.model_funnel].filter(Boolean).join(" | ") || null;
      const { data: created, error: insErr } = await supabase.from("spy_advertiser").insert({
        operation_id, project_id: projectRow.id, name, country,
        library_url: url, meta_page_id, meta_search_term,
        niche: args.niche ? String(args.niche) : null,
        funnel_type, status: "active",
      }).select("id, operation_id").single();
      if (insErr) throw new Error(`Insert falhou: ${insErr.message}`);
      const syncRes = await fetch(`${BASE_URL}/spy-sync-advertiser`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ advertiser_id: created.id, source: "manual_refresh" }),
      });
      const syncJson = await syncRes.json().catch(() => ({}));
      return JSON.stringify({ id: created.id, status: "created", initial_sync: syncJson }, null, 2);
    }

    case "spy_update_competitor": {
      const id = String(args.id || "");
      const fields = (args.fields_to_update || {}) as Record<string, unknown>;
      const allowed = ["name", "country", "niche", "library_url", "status", "meta_page_id", "meta_search_term", "funnel_type", "funnel_url"];
      const upd: Record<string, unknown> = {};
      for (const k of allowed) if (k in fields) upd[k] = (fields as any)[k];
      if (!Object.keys(upd).length) throw new Error("Nenhum campo válido para atualizar");
      const { data, error } = await supabase.from("spy_advertiser").update(upd).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return JSON.stringify({ status: "updated", competitor: data }, null, 2);
    }

    case "spy_delete_competitor": {
      const id = String(args.id || "");
      const { error } = await supabase.from("spy_advertiser").update({ status: "aposentado", deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
      return JSON.stringify({ status: "deleted", id }, null, 2);
    }

    case "spy_get_competitor_detail": {
      const id = String(args.id || "");
      const [adv, hist, alerts, creatives] = await Promise.all([
        supabase.from("spy_advertiser").select("*").eq("id", id).maybeSingle(),
        supabase.from("spy_advertiser_history").select("date, active_ads_count, source").eq("advertiser_id", id).order("date", { ascending: false }).limit(30),
        supabase.from("spy_alert").select("id, type, message, trigger_value, triggered_at, read_at").eq("advertiser_id", id).order("triggered_at", { ascending: false }).limit(20),
        supabase.from("spy_creative").select("id, meta_ad_archive_id, ad_creative_body, ad_creative_link_title, media_type, ad_snapshot_url, is_active, first_seen_at, last_seen_at").eq("advertiser_id", id).order("last_seen_at", { ascending: false }).limit(50),
      ]);
      if (adv.error) throw new Error(adv.error.message);
      return JSON.stringify({ competitor: adv.data, history_30d: hist.data, alerts: alerts.data, creatives: creatives.data }, null, 2);
    }

    case "spy_trigger_sync": {
      const id = String(args.id || "");
      const before = await supabase.from("spy_advertiser").select("current_ads_count").eq("id", id).maybeSingle();
      const res = await fetch(`${BASE_URL}/spy-sync-advertiser`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ advertiser_id: id, source: "manual_refresh" }),
      });
      const json = await res.json();
      const delta_from_last = (json?.count ?? 0) - (before.data?.current_ads_count ?? 0);
      return JSON.stringify({ status: json.success ? "ok" : "error", ads_found: json.count, source_used: json.source_used, alerts_triggered: json.alerts_triggered, delta_from_last, error: json.error }, null, 2);
    }

    case "spy_get_alerts": {
      let q = supabase.from("spy_alert")
        .select("id, advertiser_id, type, message, trigger_value, triggered_at, read_at, operation_id")
        .order("triggered_at", { ascending: false })
        .limit(Number(args.limit) || 50);
      if (args.severity) q = q.eq("type", String(args.severity));
      if (args.operation_id) q = q.eq("operation_id", String(args.operation_id));
      if (args.acknowledged === true) q = q.not("read_at", "is", null);
      if (args.acknowledged === false) q = q.is("read_at", null);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }

    case "spy_ack_alert": {
      const alert_id = String(args.alert_id || "");
      const { error } = await supabase.from("spy_alert").update({ read_at: new Date().toISOString() }).eq("id", alert_id);
      if (error) throw new Error(error.message);
      return JSON.stringify({ status: "acknowledged", alert_id }, null, 2);
    }

    case "spy_get_swipe_file": {
      let q = supabase.from("spy_swipe")
        .select("id, creative_id, tags, note, created_at, operation_id, spy_creative:creative_id(id, advertiser_id, meta_ad_archive_id, ad_creative_body, ad_creative_link_title, media_type, ad_snapshot_url, transcript, spy_advertiser:advertiser_id(name, niche, project_id))")
        .order("created_at", { ascending: false })
        .limit(Number(args.limit) || 100);
      if (args.operation_id) q = q.eq("operation_id", String(args.operation_id));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      let filtered = data || [];
      if (args.niche) {
        const n = String(args.niche).toLowerCase();
        filtered = filtered.filter((r: any) => (r.spy_creative?.spy_advertiser?.niche || "").toLowerCase().includes(n));
      }
      return JSON.stringify(filtered, null, 2);
    }

    case "spy_add_to_swipe_file": {
      const ref = String(args.ad_library_id || "");
      let creative: any = null;
      if (/^[0-9a-f-]{36}$/i.test(ref)) {
        const r = await supabase.from("spy_creative").select("id, operation_id").eq("id", ref).maybeSingle();
        creative = r.data;
      }
      if (!creative) {
        const r = await supabase.from("spy_creative").select("id, operation_id").eq("meta_ad_archive_id", ref).limit(1).maybeSingle();
        creative = r.data;
      }
      if (!creative) throw new Error(`Criativo não encontrado: ${ref}`);
      const { data, error } = await supabase.from("spy_swipe").insert({
        operation_id: creative.operation_id,
        creative_id: creative.id,
        tags: Array.isArray(args.tags) ? args.tags : null,
        note: args.notes ? String(args.notes) : null,
      }).select().single();
      if (error) throw new Error(error.message);
      return JSON.stringify({ status: "added", swipe: data }, null, 2);
    }

    case "spy_trigger_ia_analysis": {
      const ref = String(args.swipe_file_id || "");
      let creative_id: string | null = null;
      const swipe = await supabase.from("spy_swipe").select("creative_id").eq("id", ref).maybeSingle();
      if (swipe.data?.creative_id) creative_id = swipe.data.creative_id;
      else {
        const cr = await supabase.from("spy_creative").select("id").eq("id", ref).maybeSingle();
        if (cr.data?.id) creative_id = cr.data.id;
      }
      if (!creative_id) throw new Error(`Swipe/criativo não encontrado: ${ref}`);
      const res = await fetch(`${BASE_URL}/spy-transcribe-creative`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ creative_id }),
      });
      const json = await res.json();
      return JSON.stringify(json, null, 2);
    }

    // ── PACING CONTROLLER (GTX) ──
    case "gtx_list_pacing_rules": {
      let q = supabase.from("pacing_rules").select("*").order("created_at", { ascending: false });
      if (typeof args.enabled === "boolean") q = q.eq("enabled", args.enabled);
      const limit = Math.min(Number(args.limit) || 100, 500);
      const offset = Number(args.offset) || 0;
      q = q.range(offset, offset + limit - 1);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      let rows = data || [];
      if (args.project) {
        const p = String(args.project).toLowerCase();
        rows = rows.filter((r: any) => JSON.stringify(r.filter_config || {}).toLowerCase().includes(p));
      }
      return JSON.stringify(rows, null, 2);
    }
    case "gtx_get_pacing_rule": {
      const { data, error } = await supabase.from("pacing_rules").select("*").eq("id", String(args.id)).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(`Regra não encontrada: ${args.id}`);
      return JSON.stringify(data, null, 2);
    }
    case "gtx_create_pacing_rule": {
      const payload: any = {
        name: String(args.name || ""),
        description: args.description ? String(args.description) : null,
        budget_group_id: args.budget_group_id ? String(args.budget_group_id) : null,
        enabled: args.enabled !== false,
        dry_run: args.dry_run === true,
        filter_config: args.filter_config || {},
        trigger_config: args.trigger_config || {},
        action_config: args.action_config || {},
        notification_config: args.notification_config || {},
      };
      const { data, error } = await supabase.from("pacing_rules").insert(payload).select().single();
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "gtx_update_pacing_rule": {
      const id = String(args.id);
      const updates = (args.updates || {}) as Record<string, unknown>;
      const { data, error } = await supabase.from("pacing_rules").update(updates).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "gtx_delete_pacing_rule": {
      const { error } = await supabase.from("pacing_rules").delete().eq("id", String(args.id));
      if (error) throw new Error(error.message);
      return JSON.stringify({ success: true, id: args.id }, null, 2);
    }
    case "gtx_toggle_pacing_rule": {
      const { data, error } = await supabase.from("pacing_rules").update({ enabled: !!args.enabled }).eq("id", String(args.id)).select().single();
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "gtx_list_budget_groups": {
      let q = supabase.from("pacing_budget_groups").select("*").order("name", { ascending: true });
      if (typeof args.enabled === "boolean") q = q.eq("enabled", args.enabled);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return JSON.stringify(data || [], null, 2);
    }
    case "gtx_create_budget_group": {
      const payload: any = {
        name: String(args.name || ""),
        description: args.description ? String(args.description) : null,
        max_spend_per_hour: args.max_spend_per_hour != null ? Number(args.max_spend_per_hour) : null,
        max_daily_total: args.max_daily_total != null ? Number(args.max_daily_total) : null,
        currency: args.currency ? String(args.currency) : "BRL",
        enabled: args.enabled !== false,
        config: args.config || {},
      };
      const { data, error } = await supabase.from("pacing_budget_groups").insert(payload).select().single();
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "gtx_update_budget_group": {
      const { data, error } = await supabase.from("pacing_budget_groups").update((args.updates || {}) as any).eq("id", String(args.id)).select().single();
      if (error) throw new Error(error.message);
      return JSON.stringify(data, null, 2);
    }
    case "gtx_delete_budget_group": {
      const { error } = await supabase.from("pacing_budget_groups").delete().eq("id", String(args.id));
      if (error) throw new Error(error.message);
      return JSON.stringify({ success: true, id: args.id }, null, 2);
    }
    case "gtx_get_action_log": {
      let q = supabase.from("pacing_action_log").select("*").order("triggered_at", { ascending: false });
      if (args.from) q = q.gte("triggered_at", String(args.from));
      if (args.to) q = q.lte("triggered_at", String(args.to));
      if (args.rule_id) q = q.eq("rule_id", String(args.rule_id));
      if (args.campaign_id) q = q.eq("campaign_id", String(args.campaign_id));
      if (args.action_type) q = q.eq("action_type", String(args.action_type));
      q = q.limit(Math.min(Number(args.limit) || 200, 1000));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return JSON.stringify(data || [], null, 2);
    }
    case "gtx_get_action_log_stats": {
      let q = supabase.from("pacing_action_log").select("action_type, rule_id, success, spend_at_action, spend_expected");
      if (args.from) q = q.gte("triggered_at", String(args.from));
      if (args.to) q = q.lte("triggered_at", String(args.to));
      const { data, error } = await q.limit(10000);
      if (error) throw new Error(error.message);
      const rows = data || [];
      const by_type: Record<string, number> = {};
      const by_rule: Record<string, number> = {};
      let economy = 0;
      for (const r of rows as any[]) {
        by_type[r.action_type] = (by_type[r.action_type] || 0) + 1;
        if (r.rule_id) by_rule[r.rule_id] = (by_rule[r.rule_id] || 0) + 1;
        if (r.success && (r.action_type === "pause" || r.action_type === "reduce_budget")) {
          economy += Math.max(0, Number(r.spend_expected || 0) - Number(r.spend_at_action || 0));
        }
      }
      return JSON.stringify({
        total: rows.length,
        by_type,
        by_rule: Object.entries(by_rule).map(([rule_id, count]) => ({ rule_id, count })).sort((a, b) => b.count - a.count).slice(0, 20),
        economy_estimated_brl: +economy.toFixed(2),
      }, null, 2);
    }
    case "gtx_force_pause_campaign":
    case "gtx_force_resume_campaign": {
      const campaign_id = String(args.campaign_id || "");
      const reason = String(args.reason || "mcp_manual");
      const newStatus = name === "gtx_force_pause_campaign" ? "PAUSED" : "ACTIVE";
      const meta = await supabase.from("meta_campaign_status").select("account_id, campaign_name").eq("campaign_id", campaign_id).maybeSingle();
      if (meta.error) throw new Error(meta.error.message);
      if (!meta.data?.account_id) throw new Error(`account_id não encontrado para campaign_id=${campaign_id}`);
      const res = await fetch(`${BASE_URL}/pacing-toggle-campaign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id, account_id: meta.data.account_id, new_status: newStatus, reason: `mcp:${reason}` }),
      });
      const metaResponse = await res.json();
      // pacing-toggle-campaign já grava o bloqueio manual sticky em PAUSED.
      // Não sobrescrevemos por cooldown temporário: pausa manual nunca deve auto-religar.
      if (newStatus === "ACTIVE") {
        await supabase.from("pacing_cooldowns").delete().eq("campaign_id", campaign_id);
      }
      await supabase.from("pacing_action_log").insert({
        campaign_id, campaign_name: meta.data.campaign_name || null, account_id: meta.data.account_id,
        action_type: newStatus === "PAUSED" ? "pause" : "resume",
        reason: `mcp:${reason}`, dry_run: false, success: res.ok,
        meta_response: metaResponse, error_message: res.ok ? null : (metaResponse?.error || `HTTP ${res.status}`),
      });
      return JSON.stringify({ success: res.ok, meta_response: metaResponse }, null, 2);
    }
    case "gtx_get_settings": {
      let q = supabase.from("app_settings").select("key, value, updated_at");
      const keys = Array.isArray(args.keys) ? (args.keys as string[]) : null;
      if (keys && keys.length > 0) q = q.in("key", keys);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return JSON.stringify(data || [], null, 2);
    }

    case "list_orders": {
      return await listOrders(args, tokenOpId ?? null);
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}


// ── list_orders (Torre / pedidos COD via webhook) ──
class BadRequest extends Error {}

const ORDER_STATUS_FILTERS: Record<string, string[]> = {
  paid: ["paid", "commission_approved", "approved"],
  pending: ["pending", "created", "processing"],
  refused: ["refused", "cancelled", "canceled", "rejected"],
  expired: ["expired"],
  delivered: ["delivered", "entregue"],
};

const PLATFORM_FILTERS: Record<string, string[]> = {
  sphere: ["shphere", "sphere"],
  fahto: ["fahto"],
};

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00Z` : String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function digInto(payload: any, keys: string[]): any {
  if (!payload || typeof payload !== "object") return null;
  const stack: any[] = [payload];
  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== "object") continue;
    for (const k of keys) {
      const v = (node as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    for (const v of Object.values(node)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
}

function encodeCursor(createdAt: string, id: string): string {
  return btoa(`${createdAt}|${id}`).replace(/=+$/, "");
}

function decodeCursor(cursor: string): { created_at: string; id: string } {
  let raw: string;
  try {
    raw = atob(cursor + "===".slice((cursor.length + 3) % 4));
  } catch {
    throw new BadRequest("cursor inválido");
  }
  const idx = raw.lastIndexOf("|");
  if (idx < 0) throw new BadRequest("cursor inválido");
  return { created_at: raw.slice(0, idx), id: raw.slice(idx + 1) };
}

async function listOrders(args: Record<string, unknown>, tokenOpId: string | null): Promise<string> {
  const from = String(args.from ?? "");
  const to = String(args.to ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new BadRequest("from/to obrigatórios no formato YYYY-MM-DD");
  }
  if (from > to) throw new BadRequest("from não pode ser maior que to");

  const limit = args.limit === undefined ? 100 : Number(args.limit);
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) throw new BadRequest("limit deve estar entre 1 e 200");

  const platform = String(args.platform ?? "all").toLowerCase();
  if (platform !== "all" && !PLATFORM_FILTERS[platform]) throw new BadRequest("platform inválida (sphere | fahto | all)");

  const status = String(args.status ?? "all").toLowerCase();
  if (status !== "all" && !ORDER_STATUS_FILTERS[status]) {
    throw new BadRequest("status inválido (paid | pending | refused | expired | delivered | all)");
  }

  const includeTotal = args.include_total === undefined ? true : Boolean(args.include_total);

  // operação: aceita operation_id (uuid) ou operation (slug/uuid); token com operação fixa prevalece
  let operationId: string | null = tokenOpId;
  const opArg = String(args.operation_id ?? args.operation ?? "").trim();
  if (opArg && !tokenOpId) {
    if (/^[0-9a-f-]{36}$/i.test(opArg)) {
      const { data: op } = await supabase.from("operations").select("id").eq("id", opArg).maybeSingle();
      if (!op) throw new BadRequest(`404 operation_not_found: ${opArg}`);
      operationId = op.id as string;
    } else {
      const { data: op } = await supabase.from("operations").select("id").eq("slug", opArg).maybeSingle();
      if (!op) throw new BadRequest(`404 operation_not_found: ${opArg}`);
      operationId = op.id as string;
    }
  }


  const startISO = `${from}T00:00:00.000Z`;
  const endISO = `${to}T23:59:59.999Z`;

  const baseFilter = (q: any) => {
    q = q.eq("received_via", "webhook").gte("created_at", startISO).lte("created_at", endISO);
    if (operationId) q = q.eq("operation_id", operationId);
    if (platform !== "all") q = q.in("platform", PLATFORM_FILTERS[platform]);
    if (status !== "all") q = q.in("status", ORDER_STATUS_FILTERS[status]);
    return q;
  };

  let total: number | undefined;
  if (includeTotal) {
    const { count, error } = await baseFilter(supabase.from("cod_orders").select("id", { count: "exact", head: true }));
    if (error) throw new Error(error.message);
    total = count ?? 0;
  }

  let q = baseFilter(
    supabase.from("cod_orders").select(
      "id, platform, webhook_endpoint_slug, operation_id, status, created_at, paid_at, refused_at, expired_at, cancelled_at, delivery_date, product_name, product_key, program_id, country_code, customer_country, order_value, commission_value, commission_currency, raw_payload",
    ),
  );

  if (args.cursor) {
    const c = decodeCursor(String(args.cursor));
    q = q.or(`created_at.lt.${c.created_at},and(created_at.eq.${c.created_at},id.lt.${c.id})`);
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items = page.map((r: any) => {
    const p = r.raw_payload;
    const currency = digInto(p, ["currency", "moeda"]);
    const clickid = digInto(p, ["clickid", "click_id", "sub1"]);
    const utmCampaign = digInto(p, ["utm_campaign", "campaign"]);
    return {
      order_id: r.id,
      platform: r.platform,
      endpoint_slug: r.webhook_endpoint_slug ?? null,
      operation_id: r.operation_id,
      status: r.status,
      created_at: isoOrNull(r.created_at),
      paid_at: isoOrNull(r.paid_at),
      refused_at: isoOrNull(r.refused_at ?? r.cancelled_at),
      expired_at: isoOrNull(r.expired_at),
      delivered_at: isoOrNull(r.delivery_date),
      product: r.product_name ?? r.product_key ?? null,
      program: r.program_id ?? digInto(p, ["program", "programa"]),
      country: r.country_code ?? r.customer_country ?? null,
      currency: currency ? String(currency) : null,
      amount: r.order_value === null || r.order_value === undefined ? null : Number(r.order_value),
      commission: (() => {
        const raw = r.commission_value ?? digInto(p, ["commission_value", "comissao_valor"]);
        const nested = digInto(p, ["commission", "comissao"]);
        const nestedVal = nested && typeof nested === "object" ? (nested as any).value ?? (nested as any).valor : nested;
        const val = raw ?? nestedVal;
        const cur =
          r.commission_currency ??
          (nested && typeof nested === "object" ? (nested as any).currency ?? (nested as any).moeda : null) ??
          null;
        return {
          value: val === null || val === undefined || val === "" ? null : Number(val),
          currency: cur ? String(cur) : null,
        };
      })(),

      clickid: clickid ? String(clickid) : null,
      utm_campaign: utmCampaign ? String(utmCampaign) : null,
    };
  });

  const last = page[page.length - 1];
  const response: Record<string, unknown> = {
    items,
    next_cursor: hasMore && last ? encodeCursor(new Date(last.created_at).toISOString(), last.id) : null,
    generated_at: new Date().toISOString(),
  };
  if (includeTotal) response.total = total;

  return JSON.stringify(response, null, 2);
}

// ── MCP Streamable HTTP Protocol Handler ──
const SERVER_INFO = {
  name: "traffic-os",
  version: "3.1.0",
};

const PROTOCOL_VERSION = "2024-11-05";

function jsonRpcResponse(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}


// ── OAuth 2.1 helpers ──
const ISSUER = `${SUPABASE_URL}/functions/v1/mcp-server`;
const APP_BASE_URL = Deno.env.get("MCP_APP_BASE_URL") || "https://gtxmidiadash.lovable.app";
const ALL_SCOPES = ["rules:read","rules:write","groups:read","groups:write","log:read","campaigns:write","settings:read"];

async function sha256b64url(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(prefix: string, bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${hex}`;
}

async function parseBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return await req.json(); } catch { return {}; }
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  const obj: Record<string, string> = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return obj;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  // Subpath relative to /functions/v1/mcp-server
  const subpath = url.pathname.replace(/^.*\/mcp-server/, "") || "/";

  // ══════════════════════════════════════════════════
  // OAuth 2.1 endpoints (public, no bearer required)
  // ══════════════════════════════════════════════════

  // RFC 9728 — Protected Resource Metadata
  if (req.method === "GET" && subpath === "/.well-known/oauth-protected-resource") {
    return new Response(JSON.stringify({
      resource: ISSUER,
      authorization_servers: [ISSUER],
      bearer_methods_supported: ["header"],
      scopes_supported: ALL_SCOPES,
    }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  // RFC 8414 — Authorization Server Metadata
  if (req.method === "GET" && subpath === "/.well-known/oauth-authorization-server") {
    return new Response(JSON.stringify({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      registration_endpoint: `${ISSUER}/register`,
      scopes_supported: ALL_SCOPES,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      service_documentation: `${APP_BASE_URL}/docs/mcp`,
    }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  // RFC 7591 — Dynamic Client Registration
  if (req.method === "POST" && subpath === "/register") {
    try {
      const body = await parseBody(req);
      const redirect_uris = Array.isArray((body as any).redirect_uris) ? (body as any).redirect_uris : [];
      if (!redirect_uris.length) {
        return new Response(JSON.stringify({ error: "invalid_redirect_uri", error_description: "redirect_uris required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      const client_id = randomToken("mcp_client_", 16);
      const client_name = String((body as any).client_name || "Unnamed Client");
      const scope = String((body as any).scope || ALL_SCOPES.join(" "));
      const token_endpoint_auth_method = String((body as any).token_endpoint_auth_method || "none");
      const issued_at = Math.floor(Date.now() / 1000);

      const { error } = await supabase.from("mcp_oauth_clients").insert({
        client_id,
        client_secret: null,
        client_name,
        redirect_uris,
        scope,
        token_endpoint_auth_method,
      });
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({
        client_id,
        client_id_issued_at: issued_at,
        client_name,
        redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope,
        token_endpoint_auth_method,
      }), { status: 201, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "server_error", error_description: String((e as Error).message) }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
  }

  // GET /authorize — redireciona pra tela de consentimento no app
  if (req.method === "GET" && subpath === "/authorize") {
    const p = url.searchParams;
    const client_id = p.get("client_id") || "";
    const redirect_uri = p.get("redirect_uri") || "";
    const response_type = p.get("response_type") || "";
    const code_challenge = p.get("code_challenge") || "";
    const code_challenge_method = p.get("code_challenge_method") || "";
    const state = p.get("state") || "";
    const scope = p.get("scope") || "";

    if (response_type !== "code") {
      return new Response("invalid response_type (must be 'code')", { status: 400, headers: CORS_HEADERS });
    }
    if (!code_challenge || code_challenge_method !== "S256") {
      return new Response("PKCE S256 required", { status: 400, headers: CORS_HEADERS });
    }
    const { data: client, error } = await supabase
      .from("mcp_oauth_clients")
      .select("client_id, client_name, redirect_uris, scope")
      .eq("client_id", client_id)
      .maybeSingle();
    if (error || !client) {
      return new Response("invalid_client", { status: 400, headers: CORS_HEADERS });
    }
    const allowed = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
    if (!allowed.includes(redirect_uri)) {
      return new Response("invalid redirect_uri", { status: 400, headers: CORS_HEADERS });
    }

    // Redirect to in-app consent page (user authenticates via Supabase Auth there)
    const consentUrl = new URL(`${APP_BASE_URL}/mcp-consent`);
    consentUrl.searchParams.set("client_id", client_id);
    consentUrl.searchParams.set("client_name", client.client_name);
    consentUrl.searchParams.set("redirect_uri", redirect_uri);
    consentUrl.searchParams.set("scope", scope || (client.scope as string));
    consentUrl.searchParams.set("state", state);
    consentUrl.searchParams.set("code_challenge", code_challenge);
    consentUrl.searchParams.set("code_challenge_method", code_challenge_method);

    return new Response(null, { status: 302, headers: { ...CORS_HEADERS, Location: consentUrl.toString() } });
  }

  // POST /authorize/approve — chamado pela página de consentimento (requer JWT Supabase)
  if (req.method === "POST" && subpath === "/authorize/approve") {
    try {
      const auth = req.headers.get("Authorization") || "";
      const jwt = auth.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) {
        return new Response(JSON.stringify({ error: "unauthenticated" }),
          { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      const { data: userRes, error: uErr } = await supabase.auth.getUser(jwt);
      if (uErr || !userRes?.user) {
        return new Response(JSON.stringify({ error: "invalid_session" }),
          { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      const body = await parseBody(req);
      const action = String((body as any).action || "approve");
      const client_id = String((body as any).client_id || "");
      const redirect_uri = String((body as any).redirect_uri || "");
      const scope = String((body as any).scope || "");
      const state = String((body as any).state || "");
      const code_challenge = String((body as any).code_challenge || "");
      const code_challenge_method = String((body as any).code_challenge_method || "S256");

      const { data: client } = await supabase
        .from("mcp_oauth_clients")
        .select("client_id, redirect_uris")
        .eq("client_id", client_id)
        .maybeSingle();
      if (!client || !(client.redirect_uris as string[]).includes(redirect_uri)) {
        return new Response(JSON.stringify({ error: "invalid_client_or_redirect" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const redirectBack = new URL(redirect_uri);
      if (state) redirectBack.searchParams.set("state", state);

      if (action !== "approve") {
        redirectBack.searchParams.set("error", "access_denied");
        return new Response(JSON.stringify({ redirect: redirectBack.toString() }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const code = randomToken("", 24); // raw hex code
      const { error: insErr } = await supabase.from("mcp_oauth_codes").insert({
        code,
        client_id,
        user_id: userRes.user.id,
        redirect_uri,
        scope,
        code_challenge,
        code_challenge_method,
      });
      if (insErr) throw new Error(insErr.message);

      redirectBack.searchParams.set("code", code);
      return new Response(JSON.stringify({ redirect: redirectBack.toString() }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "server_error", error_description: String((e as Error).message) }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
  }

  // POST /token — Token endpoint
  if (req.method === "POST" && subpath === "/token") {
    try {
      const body = await parseBody(req);
      const grant_type = String((body as any).grant_type || "");

      if (grant_type === "authorization_code") {
        const code = String((body as any).code || "");
        const redirect_uri = String((body as any).redirect_uri || "");
        const client_id = String((body as any).client_id || "");
        const code_verifier = String((body as any).code_verifier || "");

        const { data: row, error } = await supabase
          .from("mcp_oauth_codes")
          .select("code, client_id, user_id, redirect_uri, scope, code_challenge, expires_at, used")
          .eq("code", code)
          .maybeSingle();
        if (error || !row || row.used || new Date(row.expires_at) < new Date()) {
          return new Response(JSON.stringify({ error: "invalid_grant" }),
            { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        if (row.client_id !== client_id || row.redirect_uri !== redirect_uri) {
          return new Response(JSON.stringify({ error: "invalid_grant", error_description: "mismatch" }),
            { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        const challengeCheck = await sha256b64url(code_verifier);
        if (challengeCheck !== row.code_challenge) {
          return new Response(JSON.stringify({ error: "invalid_grant", error_description: "PKCE failed" }),
            { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }

        await supabase.from("mcp_oauth_codes").update({ used: true }).eq("code", code);

        const access_token = randomToken("gtx_oauth_", 32);
        const refresh_token = randomToken("gtx_refresh_", 32);
        const access_hash = await sha256hex(access_token);
        const refresh_hash = await sha256hex(refresh_token);
        const expires_in = 3600;
        const scopes_arr = row.scope ? row.scope.split(/\s+/).filter(Boolean) : ALL_SCOPES;

        const { data: clientRow } = await supabase
          .from("mcp_oauth_clients")
          .select("client_name")
          .eq("client_id", client_id)
          .maybeSingle();

        const { error: tokErr } = await supabase.from("mcp_tokens").insert({
          token_hash: access_hash,
          prefix: access_token.slice(0, 12),
          name: `OAuth: ${clientRow?.client_name || client_id}`,
          scopes: scopes_arr,
          oauth_client_id: client_id,
          refresh_token_hash: refresh_hash,
          expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
          created_by: row.user_id,
        });
        if (tokErr) throw new Error(tokErr.message);

        return new Response(JSON.stringify({
          access_token,
          token_type: "Bearer",
          expires_in,
          refresh_token,
          scope: scopes_arr.join(" "),
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      if (grant_type === "refresh_token") {
        const refresh_token = String((body as any).refresh_token || "");
        const client_id = String((body as any).client_id || "");
        const refresh_hash = await sha256hex(refresh_token);
        const { data: tok } = await supabase
          .from("mcp_tokens")
          .select("id, scopes, oauth_client_id, created_by, name")
          .eq("refresh_token_hash", refresh_hash)
          .eq("oauth_client_id", client_id)
          .maybeSingle();
        if (!tok) {
          return new Response(JSON.stringify({ error: "invalid_grant" }),
            { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        const new_access = randomToken("gtx_oauth_", 32);
        const new_refresh = randomToken("gtx_refresh_", 32);
        const new_access_hash = await sha256hex(new_access);
        const new_refresh_hash = await sha256hex(new_refresh);
        const expires_in = 3600;
        const scopes_arr = Array.isArray(tok.scopes) ? tok.scopes : ALL_SCOPES;

        // Revogar antigo + criar novo
        await supabase.from("mcp_tokens").update({ expires_at: new Date(Date.now() - 1000).toISOString(), refresh_token_hash: null }).eq("id", tok.id);
        await supabase.from("mcp_tokens").insert({
          token_hash: new_access_hash,
          prefix: new_access.slice(0, 12),
          name: tok.name,
          scopes: scopes_arr,
          oauth_client_id: client_id,
          refresh_token_hash: new_refresh_hash,
          expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
          created_by: tok.created_by,
        });
        return new Response(JSON.stringify({
          access_token: new_access,
          token_type: "Bearer",
          expires_in,
          refresh_token: new_refresh,
          scope: (scopes_arr as string[]).join(" "),
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "unsupported_grant_type" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "server_error", error_description: String((e as Error).message) }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
  }

  // ══════════════════════════════════════════════════
  // MCP transport (existing)
  // ══════════════════════════════════════════════════

  // ── Auth: Bearer header | ?token= | ?key= | cookie mcp_token ──
  const authHeader = req.headers.get("Authorization") || "";
  const cookieHeader = req.headers.get("Cookie") || "";
  const cookieToken = (cookieHeader.match(/(?:^|;\s*)mcp_token=([^;]+)/) || [])[1] || "";
  const token =
    authHeader.replace(/^Bearer\s+/i, "").trim() ||
    url.searchParams.get("token") ||
    url.searchParams.get("key") ||
    cookieToken ||
    "";
  const apiKey = Deno.env.get("DASHBOARD_API_KEY") || "";

  let mcpToken: { id: string; name: string; scopes: string[]; operation_id?: string | null } | null = null;
  let authOk = false;

  if (apiKey && token === apiKey) {
    authOk = true;
  } else if (token.startsWith("gtx_")) {
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hashHex = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: tok } = await supabase
      .from("mcp_tokens")
      .select("id, name, scopes, expires_at, operation_id")
      .eq("token_hash", hashHex)
      .maybeSingle();
    if (tok && (!tok.expires_at || new Date(tok.expires_at) > new Date())) {
      authOk = true;
      mcpToken = { id: tok.id, name: tok.name, scopes: Array.isArray(tok.scopes) ? tok.scopes : [], operation_id: tok.operation_id };
      supabase.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id).then(() => {});
    }
  }

  if (apiKey && !authOk) {
    return new Response(
      JSON.stringify(jsonRpcError(null, -32000, "Unauthorized")),
      {
        status: 401,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer realm="${ISSUER}", resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"`,
        },
      }
    );
  }

  // ── GET: open SSE stream (Streamable HTTP) ──
  if (req.method === "GET") {
    const accept = req.headers.get("Accept") || "";
    if (!accept.includes("text/event-stream") && accept !== "" && accept !== "*/*") {
      return new Response(JSON.stringify({ error: "GET requires Accept: text/event-stream" }), {
        status: 406,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const sessionId = req.headers.get("Mcp-Session-Id") || crypto.randomUUID();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        SSE_SESSIONS.set(sessionId, { controller, createdAt: Date.now() });
        // Initial comment to open the stream
        controller.enqueue(SSE_ENCODER.encode(`: connected ${sessionId}\n\n`));
        // Keep-alive ping every 25s
        const ka = setInterval(() => {
          try {
            controller.enqueue(SSE_ENCODER.encode(`: ping\n\n`));
          } catch {
            clearInterval(ka);
          }
        }, 25_000);
        (controller as any)._ka = ka;
      },
      cancel() {
        const s = SSE_SESSIONS.get(sessionId);
        const ka = s && (s.controller as any)._ka;
        if (ka) clearInterval(ka);
        SSE_SESSIONS.delete(sessionId);
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Mcp-Session-Id": sessionId,
        "X-Accel-Buffering": "no",
      },
    });
  }

  if (req.method === "DELETE") {
    const sessionId = req.headers.get("Mcp-Session-Id") || "";
    if (sessionId) {
      const s = SSE_SESSIONS.get(sessionId);
      const ka = s && (s.controller as any)._ka;
      if (ka) clearInterval(ka);
      try { s?.controller.close(); } catch { /* noop */ }
      SSE_SESSIONS.delete(sessionId);
    }
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Validate Accept header per MCP spec (POST must accept JSON and/or SSE)
  const accept = req.headers.get("Accept") || "";
  if (accept && !accept.includes("application/json") && !accept.includes("text/event-stream") && !accept.includes("*/*")) {
    return new Response(
      JSON.stringify(jsonRpcError(null, -32000, "Not Acceptable: Client must accept application/json or text/event-stream")),
      { status: 406, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }


  // Scope map para tools GTX
  const GTX_SCOPES: Record<string, string> = {
    gtx_list_pacing_rules: "rules:read",
    gtx_get_pacing_rule: "rules:read",
    gtx_create_pacing_rule: "rules:write",
    gtx_update_pacing_rule: "rules:write",
    gtx_delete_pacing_rule: "rules:write",
    gtx_toggle_pacing_rule: "rules:write",
    gtx_list_budget_groups: "groups:read",
    gtx_create_budget_group: "groups:write",
    gtx_update_budget_group: "groups:write",
    gtx_delete_budget_group: "groups:write",
    gtx_get_action_log: "log:read",
    gtx_get_action_log_stats: "log:read",
    gtx_force_pause_campaign: "campaigns:write",
    gtx_force_resume_campaign: "campaigns:write",
    gtx_update_campaign_budget: "campaigns:write",
    gtx_update_campaign_name: "campaigns:write",
    gtx_get_settings: "settings:read",
  };

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify(jsonRpcError(null, -32700, "Parse error")),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // Handle batch requests (array of JSON-RPC messages)
  const isBatch = Array.isArray(body);
  const messages = isBatch ? body : [body];
  const responses: any[] = [];

  for (const msg of messages) {
    const { id, method, params } = msg;

    try {
      if (method === "initialize") {
        responses.push(jsonRpcResponse(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
        }));
      } else if (method === "notifications/initialized") {
        // Client notification — no response needed
        continue;
      } else if (method === "tools/list") {
        responses.push(jsonRpcResponse(id, { tools: TOOLS }));
      } else if (method === "tools/call") {
        const toolName = String(params?.name || "");
        const toolArgs = (params?.arguments || {}) as Record<string, unknown>;
        const requiredScope = GTX_SCOPES[toolName];
        if (requiredScope && mcpToken && !mcpToken.scopes.includes(requiredScope)) {
          responses.push(jsonRpcError(id, -32000, `Token sem scope "${requiredScope}" para ${toolName}`));
          continue;
        }
        const t0 = Date.now();
        let output: string;
        let ok = true;
        let badRequest = false;
        let errMsg: string | null = null;
        try {
          output = await executeTool(toolName, toolArgs, mcpToken || undefined);
        } catch (e) {
          ok = false;
          badRequest = e instanceof BadRequest;
          errMsg = String((e as Error).message);
          output = JSON.stringify({ error: errMsg });
        }
        // Log de tools GTX para auditoria
        if (toolName.startsWith("gtx_")) {
          supabase.from("pacing_action_log").insert({
            action_type: "mcp_call",
            reason: `mcp:${toolName}${mcpToken ? `:${mcpToken.name}` : ""}`,
            dry_run: false,
            success: ok,
            meta_response: { tool: toolName, args: toolArgs, result_preview: output.slice(0, 2000), duration_ms: Date.now() - t0 },
            error_message: errMsg,
          }).then(() => {});
        }
        if (!ok) {
          // BadRequest (parâmetro inválido) => -32602 (equivalente a 400 Bad Request)
          responses.push(jsonRpcError(id, badRequest ? -32602 : -32000, errMsg || "tool error"));
        } else {
          responses.push(jsonRpcResponse(id, {
            content: [{ type: "text", text: output }],
          }));
        }
      } else if (method === "ping") {
        responses.push(jsonRpcResponse(id, {}));
      } else {
        responses.push(jsonRpcError(id, -32601, `Method not found: ${method}`));
      }
    } catch (e) {
      responses.push(jsonRpcError(id, -32000, String((e as Error).message)));
    }
  }

  // If no responses (all notifications), return 202
  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const result = isBatch ? responses : responses[0];
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
