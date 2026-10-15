import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PacingCampaign, PacingStatus } from "@/components/pacing/mockData";
import { usePacingDateRange } from "@/contexts/PacingDateRangeContext";
import { usePacingLiveMode } from "@/contexts/PacingLiveModeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { isMetaCampaignPaused } from "@/lib/metaCampaignStatus";
import { shouldSkipRtPayload } from "@/lib/realtimeTenantGuard";


export interface LivePacingRow {
  id: string;
  name: string;
  account: string;
  status: string;
  effective_status: string | null;
  spend: number;
  revenue: number;
  sales: number;
  cpa: number;
  roas: number;
  impressions: number;
  clicks: number;
  yesterday_spend: number;
  daily_budget?: number | null;
  /** Conta de anúncios REAL (act_...) — necessária para pausar/ativar/ajustar budget. */
  account_id?: string | null;
}


const flatSpark = (v: number) => Array.from({ length: 14 }, (_, i) => Math.max(1, v * (0.6 + ((i * 7) % 50) / 100)));

export interface CampaignOverrideRow {
  dailyTargetBrl: number;
  rulesExempt: boolean;
  hourlyCapBrlOverride: number;
  exemptUntil: string | null;
}

interface ResolveCtx {
  overridesByCampaign: Map<string, CampaignOverrideRow>;
  ruleDefaults: Array<{ minBudget: number; defaultTarget: number; projects: string[] }>;
}

function detectProjectFromName(name: string): string | null {
  const m = name?.match(/^([A-Z]{2,6})[-_\s]/);
  return m ? m[1].toUpperCase() : null;
}

function resolveDailyTarget(
  campaignId: string,
  campaignName: string,
  dailyBudget: number | null,
  spendToday: number,
  ctx: ResolveCtx,
): { target: number | null; source: "override" | "cbo" | "rule" | null } {
  const ov = ctx.overridesByCampaign.get(campaignId);
  if (ov && ov.dailyTargetBrl > 0) return { target: ov.dailyTargetBrl, source: "override" };
  if (dailyBudget && dailyBudget > 0) return { target: dailyBudget, source: "cbo" };
  // Fallback regra: pega o menor defaultTarget compatível (projeto bate ou regra sem projeto)
  const proj = detectProjectFromName(campaignName);
  const candidates = ctx.ruleDefaults.filter(
    (r) => r.projects.length === 0 || (proj && r.projects.includes(proj)),
  );
  if (candidates.length === 0) return { target: null, source: null };
  // pega o menor (mais restritivo) ou o que cobre o spend atual
  candidates.sort((a, b) => a.defaultTarget - b.defaultTarget);
  return { target: candidates[0].defaultTarget, source: "rule" };
}


// Guarda anti-dupla-divisão: meta_campaign_status.daily_budget JÁ vem em BRL
// (unidade maior). Se algum dia o sync voltar a gravar em centavos, esse helper detecta e loga,
// mas NUNCA divide silenciosamente — o operador precisa ver o alerta.
function sanitizeDailyBudget(raw: unknown, campaignId: string, campaignName: string, spendToday: number): number | null {
  const v = Number(raw ?? 0);
  if (!(v > 0)) return null;
  // Heurística: se o gasto do dia for ≥ 50× o "budget", quase certamente o budget está
  // numa escala errada (R$ 0,31 com R$ 72 gastos = 234×). Alerta no console mas devolve o
  // valor original para não mascarar o bug — assim o card vermelho na UI também denuncia.
  if (spendToday > 0 && spendToday / v >= 50) {
    console.warn(
      `[pacing] SCALE ALERT: campanha ${campaignId} (${campaignName}) com daily_budget=${v.toFixed(2)} e spend=${spendToday.toFixed(2)} (razão ${(spendToday / v).toFixed(0)}×). Possível dupla divisão por 100 — verifique sync-campaign-status.`,
    );
  }
  return v;
}

function rowToCampaign(r: LivePacingRow, ctx: ResolveCtx, isToday: boolean): PacingCampaign {
  const spend = Number(r.spend || 0);
  const dailyBudget = sanitizeDailyBudget(r.daily_budget, r.id, r.name, spend);
  const impressions = Number(r.impressions || 0);
  const clicks = Number(r.clicks || 0);
  const sales = Number(r.sales || 0);
  const revenue = Number(r.revenue || 0);
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpa = sales > 0 ? spend / sales : null;
  const roas = spend > 0 ? revenue / spend : 0;


  const { target, source } = resolveDailyTarget(r.id, r.name, dailyBudget, spend, ctx);


  // Pace só faz sentido para "hoje" (gasto vs ritmo esperado até o horário atual).
  const now = new Date();
  const brt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
  const h = Number(brt.find(p => p.type === 'hour')?.value);
  const m = Number(brt.find(p => p.type === 'minute')?.value);
  const brtHour = h + m / 60;
  const expected = isToday && target ? (target * brtHour) / 24 : 0;
  const pacePct = expected > 0 ? (spend / expected) * 100 : 0;

  // Fonte única em @/lib/metaCampaignStatus — trata IN_PROCESS/WITH_ISSUES/etc como ativas.
  let status: PacingStatus = "ok";
  if (isMetaCampaignPaused(r.status, r.effective_status)) status = "paused";


  else if (spend === 0) status = "warming";
  else if (pacePct > 130) status = "critical";
  else if (pacePct > 110) status = "warning";

  return {
    id: r.id,
    name: r.name,
    account: r.account,
    pacePct: Math.round(pacePct),
    spend,
    cpa,
    roas,
    rulesApplied: 0,
    status,
    sparkline: spend > 0 ? flatSpark(spend / 10) : Array(14).fill(0),
    accountId: r.account_id || r.id,
    dailyBudget,
    spendYesterday: Number(r.yesterday_spend || 0),
    salesYesterday: 0,
    revenueYesterday: 0,
    impressions,
    clicks,
    cpm,
    ctr,
    cpc,
    sales,
    revenue,

    dailyTargetBrl: target,
    dailyTargetSource: source,
    rulesExempt: ctx.overridesByCampaign.get(r.id)?.rulesExempt ?? false,
    hourlyCapBrlOverride: ctx.overridesByCampaign.get(r.id)?.hourlyCapBrlOverride ?? null,
    exemptUntil: ctx.overridesByCampaign.get(r.id)?.exemptUntil ?? null,

  };
}

async function fetchResolveCtx(operationId: string | null): Promise<ResolveCtx> {
  let ruleQuery = supabase
    .from("pacing_rules")
    .select("enabled, filter_config, trigger_config, operation_id")
    .eq("enabled", true);
  if (operationId) ruleQuery = ruleQuery.or(`operation_id.is.null,operation_id.eq.${operationId}`);

  const [ovRes, ruleRes] = await Promise.all([
    supabase
      .from("campaign_pacing_overrides")
      .select("campaign_id, daily_target_brl, rules_exempt, hourly_cap_brl_override, exempt_until"),
    ruleQuery,
  ]);

  const overridesByCampaign = new Map<string, CampaignOverrideRow>();
  for (const r of (ovRes.data as Array<{
    campaign_id: string;
    daily_target_brl: number | null;
    rules_exempt: boolean | null;
    hourly_cap_brl_override: number | null;
    exempt_until: string | null;
  }> | null) ?? []) {
    overridesByCampaign.set(r.campaign_id, {
      dailyTargetBrl: Number(r.daily_target_brl ?? 0),
      rulesExempt: Boolean(r.rules_exempt),
      hourlyCapBrlOverride: Number(r.hourly_cap_brl_override ?? 0),
      exemptUntil: r.exempt_until ?? null,
    });
  }


  const ruleDefaults: ResolveCtx["ruleDefaults"] = [];
  for (const r of (ruleRes.data as Array<{ filter_config: any; trigger_config: any }> | null) ?? []) {
    const t = Number(r.trigger_config?.defaultDailyTargetBrl ?? 0);
    if (t > 0) {
      ruleDefaults.push({
        minBudget: Number(r.filter_config?.minBudget ?? 0),
        defaultTarget: t,
        projects: (r.filter_config?.projects ?? []) as string[],
      });
    }
  }
  return { overridesByCampaign, ruleDefaults };
}

// Throttle Meta sync trigger so we never hammer the edge function.
let lastMetaSyncAt = 0;
function triggerMetaSync(operationId: string | null, minIntervalMs = 25_000) {
  const now = Date.now();
  if (now - lastMetaSyncAt < minIntervalMs) return;
  lastMetaSyncAt = now;
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
  if (!projectId) return;
  fetch(`https://${projectId}.supabase.co/functions/v1/sync-meta-today`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      operation_id: operationId,
      force_full_sync: operationId === '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' // Bug B: FAHTO force full
    }),
    keepalive: true,
  }).catch(() => {});
}

export function useLivePacingCampaigns() {
  const { startDate, endDate, isToday } = usePacingDateRange();
  const { liveMode } = usePacingLiveMode();
  const operationId = useOperationId();
  const liveActive = liveMode && isToday;
  const queryClient = useQueryClient();

  // Realtime: assim que o daemon (ou pause manual) grava um pacing_action_log
  // do tipo pause/resume, invalidamos os caches de campanhas e statuses para a
  // UI refletir o novo estado IMEDIATAMENTE — sem esperar o próximo poll (10-30s).
  useEffect(() => {
    if (!operationId) return;

    const actionChannel = supabase
      .channel(`pacing-status-instant-refresh-${operationId}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "pacing_action_log",
          filter: `operation_id=eq.${operationId}`
        },
        (payload: any) => {
          if (shouldSkipRtPayload(payload, operationId, "livePacingCampaigns:action_log")) return;
          const action = payload?.new?.action_type;
          const success = payload?.new?.success;
          const dryRun = payload?.new?.dry_run;
          if (!success || dryRun) return;
          if (action !== "pause" && action !== "resume" && action !== "reduce_budget") return;
          queryClient.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
          queryClient.invalidateQueries({ queryKey: ["campaign-statuses"] });
        },
      )
      .subscribe();

    const statusChannel = supabase
      .channel(`pacing-meta-status-realtime-${operationId}`)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "meta_campaign_status",
          filter: `operation_id=eq.${operationId}`
        },
        (payload: any) => {
          if (shouldSkipRtPayload(payload, operationId, "livePacingCampaigns:meta_status")) return;
          const row = payload?.new ?? payload?.old;
          if (!row?.campaign_id) return;
          const newEffective = payload?.new?.effective_status ?? null;
          const newStatus = payload?.new?.status ?? null;

          queryClient.setQueriesData<PacingCampaign[] | undefined>(
            { queryKey: ["live-pacing-campaigns"] },
            (old) => {
              if (!old) return old;
              let touched = false;
              const next = old.map((c) => {
                if (c.id !== row.campaign_id) return c;
                const isActive = !isMetaCampaignPaused(newStatus, newEffective);
                const nextStatus: PacingStatus = !isActive
                  ? "paused"
                  : c.status === "paused"
                    ? c.spend === 0
                      ? "warming"
                      : "ok"
                    : c.status;
                if (nextStatus === c.status) return c;
                touched = true;
                return { ...c, status: nextStatus };
              });
              return touched ? next : old;
            },
          );

          queryClient.setQueriesData<any[] | undefined>(
            { queryKey: ["campaign-statuses"] },
            (old) => {
              if (!old) return old;
              const idx = old.findIndex((c) => c.campaign_id === row.campaign_id);
              if (idx === -1) return old;
              const next = old.slice();
              next[idx] = { ...next[idx], ...payload.new };
              return next;
            },
          );

          queryClient.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
          queryClient.invalidateQueries({ queryKey: ["campaign-statuses"] });
        },
      )
      .subscribe();

    const trafficChannel = supabase
      .channel(`pacing-traffic-realtime-${operationId}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "traffic_data",
          filter: `operation_id=eq.${operationId}`
        },
        (payload: any) => {
          if (shouldSkipRtPayload(payload, operationId, "livePacingCampaigns:traffic_data")) return;
          queryClient.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(actionChannel);
      supabase.removeChannel(statusChannel);
      supabase.removeChannel(trafficChannel);
    };
  }, [queryClient, operationId]);


  return useQuery({
    queryKey: ["live-pacing-campaigns", startDate, endDate, operationId],
    queryFn: async () => {
      // Em Live, dispara sync agressivo (8s); senão padrão (25s).
      if (isToday) triggerMetaSync(operationId, liveActive ? 8_000 : 25_000);
      const [result, ctx] = await Promise.all([
        isToday
          ? (supabase as any).rpc("get_live_pacing_campaigns", operationId ? { p_operation_id: operationId } : {})
          : (supabase as any).rpc("get_pacing_campaigns_for_range", {
              d_start: startDate,
              d_end: endDate,
              ...(operationId ? { p_operation_id: operationId } : {}),
            }),
        fetchResolveCtx(operationId),
      ]);

      if (result.error) {
        console.error("[useLivePacingCampaigns] RPC Error:", result.error);
        throw result.error;
      }


      const rows = (result.data || []) as any[];
      return rows.map((r) => {
        const campaignId = r.id || r.campaign_id;
        const campaignName = r.name || r.campaign_name;
        const accountName = r.account || r.account_name || r.account_id;
        const spend = Number(r.spend || r.spend_today || 0);
        const yesterdaySpend = Number(r.yesterday_spend || r.spend_yesterday || 0);
        const impressions = Number(r.impressions || r.impressions_today || 0);
        const clicks = Number(r.clicks || r.clicks_today || 0);
        const sales = Number(r.sales || r.sales_today || 0);
        const revenue = Number(r.revenue || r.revenue_today || 0);
        const dailyBudget = r.daily_budget !== undefined ? r.daily_budget : null;

        const row: LivePacingRow = {
          id: campaignId,
          name: campaignName,
          account: accountName,
          status: r.status,
          effective_status: r.effective_status,
          spend,
          revenue,
          sales,
          cpa: r.cpa || (sales > 0 ? spend / sales : 0),
          roas: r.roas || (spend > 0 ? revenue / spend : 0),
          impressions,
          clicks,
          yesterday_spend: yesterdaySpend,
          daily_budget: dailyBudget,
          account_id: r.account_id ?? null,
        };

        const campaign = rowToCampaign(row, ctx, isToday);
        return { ...campaign, operation_id: r.operation_id };
      });

    },
    // Live: 8s. Hoje normal: 20s. Histórico: 5min.
    refetchInterval: liveActive ? 8_000 : isToday ? 20_000 : 300_000,
    refetchOnWindowFocus: isToday,
    staleTime: liveActive ? 2_000 : isToday ? 10_000 : 60_000,
    // Blindagem contra "TypeError: Failed to fetch" transiente (wifi oscilando,
    // preflight CORS cancelado, aba em background). Retry exponencial 3x só
    // p/ falha de rede — erros de RPC (401/500) sobem imediatamente.
    retry: (failureCount, err) => {
      const msg = String((err as Error)?.message ?? "");
      const isNetwork = msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch failed");
      return isNetwork && failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    // Se já tenho dados em cache, mantenho eles na tela em vez de mostrar erro vermelho.
    placeholderData: (prev) => prev,
  });
}


export interface SalesMatchStats {
  total_sales: number;
  matched_sales: number;
  unmatched_sales: number;
  unmatched_revenue: number;
  matched_by_name: number;
  matched_by_rt: number;
}

export function usePacingSalesMatchStats() {
  const operationId = useOperationId();
  return useQuery({
    queryKey: ["pacing-sales-match-stats", operationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_pacing_sales_match_stats",
        operationId ? { p_operation_id: operationId } : {},
      );
      if (error) throw error;
      const row = (data as SalesMatchStats[])?.[0];
      return row ?? { total_sales: 0, matched_sales: 0, unmatched_sales: 0, unmatched_revenue: 0, matched_by_name: 0, matched_by_rt: 0 };
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}
