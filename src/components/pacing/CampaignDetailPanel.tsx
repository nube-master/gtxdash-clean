import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LiveBadge } from "./LiveBadge";
import { X, Pause, Play, Clock, ExternalLink, AlertCircle, Info } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";
import { type PacingCampaign, type PacingRuleV2, getProjectSlug } from "./mockData";
import { getMatchingRules } from "@/lib/pacingScope";
import { useCampaignDrawerData, formatHHMM } from "@/hooks/useCampaignDrawerData";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CampaignAdsetsPanel } from "./CampaignAdsetsPanel";

const fmtBR = (v: number, d = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

interface Props {
  campaign: PacingCampaign | null;
  allRules: PacingRuleV2[];
  onClose: () => void;
}

export function CampaignDetailPanel({ campaign, allRules, onClose }: Props) {
  useEffect(() => {
    if (!campaign) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [campaign, onClose]);

  const { data, isLoading } = useCampaignDrawerData(campaign);

  const matchingRules = useMemo(
    () => (campaign ? getMatchingRules(allRules, campaign) : []),
    [allRules, campaign]
  );

  const chartData = useMemo(
    () =>
      (data?.hourly ?? []).map((p) => ({
        hour: `${String(p.hour).padStart(2, "0")}h`,
        actual: Math.round(p.spend * 100) / 100,
        expected: Math.round(p.expected * 100) / 100,
      })),
    [data?.hourly]
  );

  if (!campaign) return null;
  const slug = getProjectSlug(campaign.name);
  const isPaused = campaign.status === "paused";

  // Deltas reais
  const spendYday = data?.spendYesterdayBrl ?? null;
  const spendDelta =
    spendYday && spendYday > 0
      ? ((campaign.spend - spendYday) / spendYday) * 100
      : null;

  return createPortal(
    <TooltipProvider delayDuration={150}>
      <div className="fixed inset-0 z-50 flex">
        <button
          aria-label="fechar"
          className="flex-1 bg-background/50 backdrop-blur-[2px] cursor-default"
          onClick={onClose}
        />
        <aside
          className="w-[480px] max-w-[100vw] h-full bg-card border-l border-border/60 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-card border-b border-border/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm">{campaign.name}</span>
                  {slug && (
                    <Badge variant="outline" className="text-[10px] uppercase border-primary/60 text-primary">
                      {slug}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{campaign.account}</div>
                <div className="mt-2"><LiveBadge status={campaign.status} /></div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full grid grid-cols-2 rounded-none border-b border-border/60 bg-muted/20 h-9">
              <TabsTrigger value="overview" className="text-xs">Visão geral</TabsTrigger>
              <TabsTrigger value="adsets" className="text-xs">Conjuntos</TabsTrigger>
            </TabsList>
            <TabsContent value="adsets" className="p-4 mt-0">
              <CampaignAdsetsPanel
                campaignId={campaign.id}
                campaignName={campaign.name}
                accountId={campaign.accountId ?? null}
              />
            </TabsContent>
            <TabsContent value="overview" className="p-4 space-y-5 mt-0">
            {/* Quick actions */}
            <div className="space-y-2">
              {isPaused ? (
                <Button className="w-full bg-[hsl(var(--wr-positive))] hover:bg-[hsl(var(--wr-positive))]/90 text-background">
                  <Play className="h-4 w-4 mr-2" /> Religar campanha
                </Button>
              ) : (
                <Button variant="destructive" className="w-full">
                  <Pause className="h-4 w-4 mr-2" /> Pausar campanha
                </Button>
              )}
              <div className="flex gap-2">
                <Select defaultValue="1h">
                  <SelectTrigger className="flex-1 h-9 text-xs">
                    <Clock className="h-3.5 w-3.5 mr-1.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30min">Snooze 30 min</SelectItem>
                    <SelectItem value="1h">Snooze 1 hora</SelectItem>
                    <SelectItem value="4h">Snooze 4 horas</SelectItem>
                    <SelectItem value="tomorrow">Até amanhã</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-9" asChild>
                  <a href="https://business.facebook.com/adsmanager/" target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Meta Ads
                  </a>
                </Button>
              </div>
            </div>

            {/* Metrics grid 2x2 */}
            <div className="grid grid-cols-2 gap-2">
              <MetricTile
                label="Spend hoje"
                value={`R$ ${fmtBR(campaign.spend)}`}
                delta={
                  spendDelta != null
                    ? `${spendDelta >= 0 ? "+" : ""}${spendDelta.toFixed(0)}% vs ontem`
                    : spendYday === null
                      ? "sem dado ontem"
                      : "—"
                }
                positive={spendDelta != null ? spendDelta <= 0 : true}
              />
              <MetricTile
                label="Spend últimos 60m"
                value={
                  data?.spendLastHourBrl != null
                    ? `R$ ${fmtBR(data.spendLastHourBrl)}`
                    : isLoading ? "…" : "—"
                }
                delta={
                  data?.spendLastHourSource === "campaign-hourly"
                    ? "real da campanha (Meta 60m)"
                    : data?.spendLastHourSource === "campaign-share"
                      ? "fallback temporário"
                      : "sem snapshot 60m"
                }
                positive
                muted
              />
              <MetricTile
                label="CPA"
                value={campaign.cpa ? `R$ ${fmtBR(campaign.cpa)}` : "—"}
                delta="hoje"
                positive
                muted
              />
              <MetricTile
                label="ROAS"
                value={campaign.roas.toFixed(2)}
                delta="hoje"
                positive={campaign.roas >= 2}
                muted
              />
            </div>

            {/* Pace bar — real */}
            <div className="rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>Pace acumulado</span>
                <span className="tabular-nums">
                  <span className={cn("font-semibold", campaign.pacePct > 110 ? "text-red" : "text-foreground")}>
                    {campaign.pacePct}%
                  </span>{" "}
                  · esperado {data ? data.expectedPctNow.toFixed(0) : "—"}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    campaign.pacePct > 110 ? "bg-destructive" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(campaign.pacePct, 200) / 2}%` }}
                />
              </div>
            </div>

            {/* Rules REAIS */}
            <Section
              title={`Regras que monitoram (${matchingRules.length})`}
              hint="Regras cujo escopo (projeto / nome / fase / status) casa com esta campanha agora."
            >
              {matchingRules.length === 0 ? (
                <div className="py-3 text-center text-[11px] text-muted-foreground">
                  Nenhuma regra ativa cobre esta campanha.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {matchingRules.map((r) => {
                    const fired = data?.firesByRule.get(r.id) ?? 0;
                    const inCooldown = false; // TODO: pacing_cooldowns lookup
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded border border-border/60 bg-muted/10 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{r.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {fired > 0 ? `avaliada ${fired}× hoje` : "ainda não avaliada hoje"}
                            
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "h-2 w-2 rounded-full",
                                fired > 0
                                  ? "bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
                                  : "bg-[hsl(var(--wr-positive))]"
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            {r.enabled ? (inCooldown ? "Em cooldown" : "Armada") : "Desativada"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Timeline REAL */}
            <Section title="Timeline (24h)">
              {isLoading ? (
                <div className="py-3 text-center text-[11px] text-muted-foreground">carregando…</div>
              ) : (data?.timeline.length ?? 0) === 0 ? (
                <div className="py-4 text-center text-[11px] text-muted-foreground">
                  Nenhuma ação automatizada nas últimas 24h.
                </div>
              ) : (
                <div className="space-y-2">
                  {data!.timeline.map((e) => {
                    const icon =
                      e.action_type === "pause"
                        ? "⏸"
                        : e.action_type === "resume"
                          ? "▶"
                          : e.action_type === "alert"
                            ? "⚠"
                            : e.action_type === "reduce_budget"
                              ? "↓"
                              : "•";
                    return (
                      <div key={e.id} className="flex gap-2 text-xs">
                        <span className="tabular-nums text-muted-foreground shrink-0 w-12">
                          {formatHHMM(e.triggered_at)}
                        </span>
                        <span className="shrink-0">{icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-foreground/90">
                            {e.action_type.toUpperCase()}
                            {e.rule_name && (
                              <span className="text-muted-foreground"> · {e.rule_name}</span>
                            )}
                            {e.dry_run && (
                              <span className="ml-1 text-amber-500">[dry-run]</span>
                            )}
                            {e.success === false && (
                              <span className="ml-1 text-red">[falhou]</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {e.reason}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Chart acumulado diário */}
            <Section
              title="Spend por hora (24h)"
              hint="A regra de teto usa o snapshot real dos últimos 60 minutos por campanha. Este gráfico diário ainda usa a curva horária da conta como apoio visual."
            >
              <div className="h-[140px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="spendArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      interval={3}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <RTooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 11,
                        borderRadius: 6,
                      }}
                      formatter={(v: number) => `R$ ${fmtBR(v)}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="actual"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#spendArea)"
                    />
                    <Line
                      type="monotone"
                      dataKey="expected"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Section>

            {/* Análise (resumo factual) */}
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <AlertCircle className="h-3.5 w-3.5" /> Análise
              </div>
              <p className="text-xs text-muted-foreground">
                {matchingRules.length === 0
                  ? "Nenhuma regra cobre esta campanha — ela não será pausada/religada automaticamente."
                  : (data?.timeline.length ?? 0) > 0
                    ? `Última ação automática há ${formatHHMM(data!.timeline[0].triggered_at)} (BRT) por "${data!.timeline[0].rule_name ?? "regra"}".`
                    : `${matchingRules.length} regra(s) armada(s), nenhuma disparou nas últimas 24h.`}
              </p>
            </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </TooltipProvider>,
    document.body
  );
}

function MetricTile({
  label,
  value,
  delta,
  positive,
  muted,
}: {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
      <div
        className={cn(
          "text-[10px] tabular-nums mt-0.5",
          muted
            ? "text-muted-foreground"
            : positive
              ? "text-[hsl(var(--wr-positive))]"
              : "text-red"
        )}
      >
        {delta}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        <span>{title}</span>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 opacity-60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] text-xs">
              {hint}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}
