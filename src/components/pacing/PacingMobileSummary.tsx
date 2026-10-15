import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaskConical, Settings2, ScrollText, Target, ChevronRight, Play, Pause, AlertTriangle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLivePacingCampaigns } from "@/hooks/useLivePacingCampaigns";
import { useLivePacingEvents } from "@/hooks/useLivePacingEvents";
import { usePacingRules } from "@/hooks/usePacingRules";
import { usePacingSettings } from "@/hooks/usePacingSettings";
import { useOfferTags, detectOfferTag } from "@/hooks/useOfferTags";
import { useLastPacingActions } from "@/hooks/useLastPacingActions";
import { useCurrency, CURRENCY_META } from "@/contexts/CurrencyContext";
import { usePacingDateRange } from "@/contexts/PacingDateRangeContext";
import { PacingDateRangeSelector } from "./PacingDateRangeSelector";
import { TestAllRulesDialog } from "./TestAllRulesDialog";
import { EventTimeline } from "./EventTimeline";

export function PacingMobileSummary() {
  const navigate = useNavigate();
  const [testOpen, setTestOpen] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());

  const { settings } = usePacingSettings();
  const dryRun = !!settings?.dry_run_global;
  const { isToday, label: rangeLabel } = usePacingDateRange();
  const { convertFromBRL, currency } = useCurrency();
  const sym = CURRENCY_META[currency].symbol;

  const { data: campaigns, isLoading } = useLivePacingCampaigns();
  const { rules } = usePacingRules();
  const ruleNameById = useMemo(() => new Map(rules.map((r) => [r.id, r.name])), [rules]);
  const { events } = useLivePacingEvents({ limit: 300, ruleNameById });
  const { data: lastActions } = useLastPacingActions();
  const { data: offerTags = [] } = useOfferTags();

  const list = campaigns ?? [];

  const projectCounts = useMemo(() => {
    const map: Record<string, { total: number; active: number; paused: number; spend: number }> = {};
    for (const t of offerTags) map[t] = { total: 0, active: 0, paused: 0, spend: 0 };
    for (const c of list) {
      const t = detectOfferTag(c.name, offerTags);
      if (!t) continue;
      map[t].total += 1;
      map[t].spend += c.spend;
      if (c.status === "paused") map[t].paused += 1;
      else map[t].active += 1;
    }
    return map;
  }, [list, offerTags]);

  const visibleTags = offerTags.filter((t) => (projectCounts[t]?.total ?? 0) > 0);

  const scopedList = useMemo(() => {
    if (selectedProjects.size === 0) return list;
    return list.filter((c) => {
      const t = detectOfferTag(c.name, offerTags);
      return t ? selectedProjects.has(t) : false;
    });
  }, [list, selectedProjects, offerTags]);

  const kpis = useMemo(() => {
    const spend = scopedList.reduce((s, c) => s + c.spend, 0);
    const active = scopedList.filter((c) => c.status !== "paused").length;
    const paused = scopedList.filter((c) => c.status === "paused").length;
    const critical = scopedList.filter((c) => c.status === "critical").length;
    return { spend, active, paused, total: scopedList.length, critical };
  }, [scopedList]);

  const actionsToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let pauses = 0, resumes = 0, alerts = 0, fails = 0;
    for (const e of events) {
      if (!e.ts.startsWith(today)) continue;
      if (e.type === "pause") pauses += 1;
      else if (e.type === "resume") resumes += 1;
      else if (e.type === "alert") alerts += 1;
      if (e.message.startsWith("[FALHOU]")) fails += 1;
    }
    return { pauses, resumes, alerts, fails };
  }, [events]);

  const dailyReport = useMemo(() => {
    type Day = {
      date: string;
      pauses: number;
      resumes: number;
      alerts: number;
      fails: Array<{ campaign: string; reason: string }>;
      rules: Map<string, number>;
    };
    const byDay = new Map<string, Day>();
    for (const e of events) {
      if (selectedProjects.size > 0) {
        const tag = detectOfferTag(e.campaign ?? "", offerTags);
        if (!tag || !selectedProjects.has(tag)) continue;
      }
      // Convert UTC ts -> BRT date key (UTC-3)
      const d = new Date(e.ts);
      const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      const key = brt.toISOString().slice(0, 10);
      let day = byDay.get(key);
      if (!day) {
        day = { date: key, pauses: 0, resumes: 0, alerts: 0, fails: [], rules: new Map() };
        byDay.set(key, day);
      }
      if (e.type === "pause") day.pauses += 1;
      else if (e.type === "resume") day.resumes += 1;
      else if (e.type === "alert") day.alerts += 1;
      if (e.message.startsWith("[FALHOU]")) {
        day.fails.push({ campaign: e.campaign, reason: e.message.replace("[FALHOU] ", "") });
      }
      if (e.rule) day.rules.set(e.rule, (day.rules.get(e.rule) ?? 0) + 1);
    }
    return Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  }, [events, selectedProjects, offerTags]);

  const toggleProject = (t: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const enabledRules = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-3 px-3 pb-24 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold leading-tight">Pacing</h1>
          <p className="text-[11px] text-muted-foreground">{rangeLabel} · resumo mobile</p>
        </div>
        <PacingDateRangeSelector />
      </div>

      {/* Status do daemon */}
      <div
        className={cn(
          "rounded-lg border px-3 py-2 text-[11px] flex items-center justify-between",
          dryRun
            ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
        )}
      >
        <span>
          {dryRun ? "⚠️ Dry-run" : "✅ LIVE"} · {enabledRules} regra(s) armada(s)
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => navigate("/pacing/regras")}
        >
          Regras →
        </Button>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 gap-2">
        <KpiTile
          label={isToday ? "Spend hoje" : "Spend"}
          value={`${sym} ${convertFromBRL(kpis.spend).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon={<Activity className="h-4 w-4" />}
          tone="primary"
          loading={isLoading}
        />
        <KpiTile
          label="Ativas"
          value={kpis.active.toString()}
          sub={`${kpis.total} total`}
          icon={<Play className="h-4 w-4" />}
          tone="emerald"
          loading={isLoading}
        />
        <KpiTile
          label="Pausadas"
          value={kpis.paused.toString()}
          sub={kpis.critical > 0 ? `${kpis.critical} críticas` : "—"}
          icon={<Pause className="h-4 w-4" />}
          tone="muted"
          loading={isLoading}
        />
        <KpiTile
          label="Ações hoje"
          value={(actionsToday.pauses + actionsToday.resumes).toString()}
          sub={`${actionsToday.pauses}⏸ · ${actionsToday.resumes}▶${actionsToday.fails ? ` · ${actionsToday.fails}⚠` : ""}`}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={actionsToday.fails > 0 ? "destructive" : "amber"}
          loading={isLoading}
        />
      </div>

      {/* Filtro por projeto/oferta */}
      <Card className="p-3 bg-card border-border/60">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Filtrar por oferta
          </span>
          {selectedProjects.size > 0 && (
            <button
              onClick={() => setSelectedProjects(new Set())}
              className="text-[11px] text-primary"
            >
              Limpar
            </button>
          )}
        </div>
        {visibleTags.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">Nenhuma tag detectada.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {visibleTags.map((t) => {
              const sel = selectedProjects.has(t);
              const c = projectCounts[t];
              return (
                <button
                  key={t}
                  onClick={() => toggleProject(t)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition min-h-[32px]",
                    sel
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-background text-foreground hover:bg-muted",
                  )}
                >
                  <span>{t}</span>
                  <span className={cn("tabular-nums opacity-80", sel ? "" : "text-muted-foreground")}>
                    {c.active}/{c.total}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Breakdown por projeto */}
      {selectedProjects.size === 0 && visibleTags.length > 0 && (
        <Card className="p-3 bg-card border-border/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Por oferta
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {visibleTags
              .slice()
              .sort((a, b) => projectCounts[b].spend - projectCounts[a].spend)
              .slice(0, 8)
              .map((t) => {
                const c = projectCounts[t];
                return (
                  <div key={t} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold">{t}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {c.active} ativas · {c.paused} pausadas
                      </span>
                    </div>
                    <span className="text-[12px] tabular-nums font-medium">
                      {sym} {convertFromBRL(c.spend).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Regras */}
      <Card className="p-3 bg-card border-border/60">
        <button
          onClick={() => navigate("/pacing/regras")}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <div className="text-left">
              <p className="text-[12px] font-semibold">Regras automáticas</p>
              <p className="text-[10px] text-muted-foreground">
                {enabledRules} armada(s) · {rules.length - enabledRules} desligada(s)
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </Card>

      {/* Testar regras */}
      <Button
        variant="default"
        className="w-full gap-2 min-h-[44px]"
        onClick={() => setTestOpen(true)}
      >
        <FlaskConical className="h-4 w-4" />
        Testar regras agora
      </Button>

      {/* Relatório por dia */}
      <Card className="p-3 bg-card border-border/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Relatório por dia (BRT)
            </span>
            {selectedProjects.size > 0 && (
              <span className="text-[10px] rounded-full bg-primary/15 text-primary px-2 py-0.5 font-semibold">
                {Array.from(selectedProjects).join(" · ")}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate("/pacing/historico")}
            className="text-[11px] text-primary"
          >
            Histórico →
          </button>
        </div>
        {dailyReport.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">Sem eventos recentes.</p>
        ) : (
          <div className="space-y-2">
            {dailyReport.map((d) => <DailyReportRow key={d.date} day={d} />)}
          </div>
        )}
      </Card>

      {/* Eventos */}
      <Card className="p-3 bg-card border-border/60">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Eventos recentes
          </span>
          <button
            onClick={() => navigate("/pacing/historico")}
            className="text-[11px] text-primary"
          >
            Ver tudo →
          </button>
        </div>
        <EventTimeline events={events} max={8} />
      </Card>

      {/* Atalhos */}
      <Card className="p-3 bg-card border-border/60">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">
          Atalhos
        </span>
        <div className="space-y-1.5">
          <ShortcutRow icon={<Target className="h-4 w-4" />} label="Gerenciar regras" onClick={() => navigate("/pacing/regras")} />
          <ShortcutRow icon={<Activity className="h-4 w-4" />} label="Score & Decisão" onClick={() => navigate("/pacing/score-rules")} />
          <ShortcutRow icon={<ScrollText className="h-4 w-4" />} label="Histórico de ações" onClick={() => navigate("/pacing/historico")} />
          <ShortcutRow icon={<Settings2 className="h-4 w-4" />} label="Configurações globais" onClick={() => navigate("/pacing/settings")} />
        </div>
      </Card>

      <TestAllRulesDialog
        open={testOpen}
        onClose={() => setTestOpen(false)}
        rules={rules}
        campaigns={list}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "primary" | "emerald" | "muted" | "amber" | "destructive";
  loading?: boolean;
}) {
  const toneCls = {
    primary: "text-primary",
    emerald: "text-emerald-500",
    muted: "text-muted-foreground",
    amber: "text-amber-500",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card className="p-3 bg-card border-border/60">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </span>
        <span className={toneCls}>{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-20" />
      ) : (
        <>
          <p className={cn("text-xl font-bold tabular-nums leading-tight", toneCls)}>{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </>
      )}
    </Card>
  );
}

function DailyReportRow({
  day,
}: {
  day: {
    date: string;
    pauses: number;
    resumes: number;
    alerts: number;
    fails: Array<{ campaign: string; reason: string }>;
    rules: Map<string, number>;
  };
}) {
  const [open, setOpen] = useState(false);
  const total = day.pauses + day.resumes + day.alerts;
  const isToday = day.date === new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const label = (() => {
    const [y, m, d] = day.date.split("-");
    return isToday ? "Hoje" : `${d}/${m}`;
  })();
  const topRules = Array.from(day.rules.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="rounded-md border border-border/40 bg-background/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 min-h-[44px]"
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold tabular-nums">{label}</span>
          <span className="text-[10px] text-muted-foreground">{total} ações</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] tabular-nums">
          <span className="text-emerald-500" title="Resumes">▶ {day.resumes}</span>
          <span className="text-amber-500" title="Pauses">⏸ {day.pauses}</span>
          {day.fails.length > 0 && (
            <span className="text-destructive" title="Falhas">⚠ {day.fails.length}</span>
          )}
          <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition", open && "rotate-90")} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border/40 px-3 py-2 space-y-2">
          {topRules.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Regras que dispararam
              </p>
              <div className="space-y-1">
                {topRules.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate flex-1">{name}</span>
                    <span className="tabular-nums text-muted-foreground">{count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {day.fails.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-destructive mb-1">
                Falhas de pausar/resume
              </p>
              <div className="space-y-1">
                {day.fails.slice(0, 6).map((f, i) => (
                  <div key={i} className="text-[11px] leading-snug">
                    <div className="font-medium truncate">{f.campaign}</div>
                    <div className="text-muted-foreground text-[10px] line-clamp-2">{f.reason}</div>
                  </div>
                ))}
                {day.fails.length > 6 && (
                  <p className="text-[10px] text-muted-foreground italic">
                    + {day.fails.length - 6} outras falhas
                  </p>
                )}
              </div>
            </div>
          )}
          {topRules.length === 0 && day.fails.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">Sem detalhes registrados.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ShortcutRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2.5 min-h-[44px] hover:bg-muted/50 transition"
    >
      <div className="flex items-center gap-2.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[13px] font-medium">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
