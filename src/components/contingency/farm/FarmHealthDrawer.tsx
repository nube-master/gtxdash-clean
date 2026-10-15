import { useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, Flame, Skull, TrendingUp, TrendingDown, AlertCircle, ArrowDown, ArrowUp, Minus,
  History, Download, Gauge,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { INACTIVE_REASON_META, getInactiveReason, type InactiveReason } from "./farmHelpers";

type LogEntry = {
  account_id: string;
  account_name: string;
  old_status: number | null;
  new_status: number;
  changed_at: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: any[]; // rows enriquecidos do AccountFarmPipeline
  weekLog: LogEntry[] | undefined;
}

const PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
];

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const isFall = (e: LogEntry) => e.old_status === 1 && e.new_status !== 1;

/**
 * Painel "Saúde do Farm": fluxo da esteira, motivos de queda, heatmap,
 * velocidade da esteira e projeção de queima — com filtro de período e projeto.
 */
export function FarmHealthDrawer({ open, onOpenChange, rows, weekLog }: Props) {
  const [period, setPeriod] = useState("7");
  const [projectFilter, setProjectFilter] = useState("all");
  const [eventDetail, setEventDetail] = useState<LogEntry | null>(null);

  const days = Number(period);
  const windowMs = days * 86400_000;

  /* ── Projetos disponíveis (derivados das campanhas ACTIVE das contas) ── */
  const projectOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => (r.projects || []).forEach((p: string) => s.add(p)));
    return Array.from(s).sort();
  }, [rows]);

  /* ── Escopo: contas visíveis conforme filtro de projeto ── */
  const scopedRows = useMemo(() => {
    if (projectFilter === "all") return rows;
    if (projectFilter === "__none__") return rows.filter((r) => (r.projects || []).length === 0);
    return rows.filter((r) => (r.projects || []).includes(projectFilter));
  }, [rows, projectFilter]);

  const scopeIds = useMemo(() => new Set(scopedRows.map((r) => r.account_id)), [scopedRows]);

  /* ── Log filtrado por período + escopo ── */
  const log = useMemo(() => {
    const cutoff = Date.now() - windowMs;
    return (weekLog || [])
      .filter((e) => new Date(e.changed_at).getTime() >= cutoff)
      .filter((e) => projectFilter === "all" || scopeIds.has(e.account_id));
  }, [weekLog, windowMs, scopeIds, projectFilter]);

  const falls = useMemo(() => log.filter(isFall), [log]);

  const total = scopedRows.length;

  const flow = useMemo(() => {
    const stages: Array<{ key: string; label: string; tone: string }> = [
      { key: "no_ads",      label: "Sem anúncios", tone: "from-slate-500/60 to-slate-400/30" },
      { key: "warming",     label: "Aquecendo", tone: "from-orange-500/60 to-orange-400/30" },
      { key: "almost",      label: "Quase Pronta", tone: "from-amber-500/60 to-amber-400/30" },
      { key: "ready",       label: "Pronta", tone: "from-emerald-500/60 to-emerald-400/30" },
      { key: "advertising", label: "Anunciando (ACTIVE)", tone: "from-cyan-500/60 to-cyan-400/30" },
      { key: "inactive",    label: "Caída (total)", tone: "from-rose-500/60 to-rose-400/30" },
    ];
    return stages.map((s) => {
      const stageRows = scopedRows.filter((r) => r.stage === s.key);
      const ids = new Set(stageRows.map((r) => r.account_id));
      // micro-sparkline: quedas por dia (7d) das contas hoje neste estágio
      const spark: number[] = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const k = dayKey(d);
        spark.push(
          (weekLog || []).filter((e) => isFall(e) && ids.has(e.account_id) && e.changed_at.slice(0, 10) === k).length,
        );
      }
      return { ...s, count: stageRows.length, spark };
    });
  }, [scopedRows, weekLog]);

  /* ── Motivos de queda no período (por evento; fallback = estado atual) ── */
  const topReasons = useMemo(() => {
    const counts: Record<Exclude<InactiveReason, "all">, number> = {
      bm_down: 0, limit: 0, policy: 0, no_ads: 0, other: 0,
    };
    if (falls.length > 0) {
      const seen = new Set<string>();
      falls.forEach((e) => {
        if (seen.has(e.account_id)) return;
        seen.add(e.account_id);
        const k = getInactiveReason(e.new_status, 1) as Exclude<InactiveReason, "all">;
        if (k in counts) counts[k]++;
      });
    } else {
      scopedRows.filter((r) => r.stage === "inactive").forEach((r) => {
        const k = r.inactiveReason as Exclude<InactiveReason, "all">;
        if (k in counts) counts[k]++;
      });
    }
    const entries = (Object.entries(counts) as [Exclude<InactiveReason, "all">, number][])
      .filter(([, n]) => n > 0)
      .sort(([, a], [, b]) => b - a);
    const sum = entries.reduce((s, [, n]) => s + n, 0);
    return { entries, sum, fromEvents: falls.length > 0 };
  }, [falls, scopedRows]);

  /* ── Heatmap no período selecionado ── */
  const heatmap = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      buckets.set(dayKey(d), 0);
    }
    falls.forEach((e) => {
      const k = e.changed_at.slice(0, 10);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + 1);
    });
    return Array.from(buckets.entries()).map(([date, n]) => ({ date, n }));
  }, [falls, days]);

  const maxHeat = Math.max(1, ...heatmap.map((d) => d.n));

  /* ── Queimadas no período + delta vs período anterior ── */
  const burned = useMemo(() => new Set(falls.map((e) => e.account_id)).size, [falls]);

  const burnedPrev = useMemo(() => {
    const end = Date.now() - windowMs;
    const start = end - windowMs;
    const s = new Set<string>();
    (weekLog || []).forEach((e) => {
      const t = new Date(e.changed_at).getTime();
      if (t < start || t >= end) return;
      if (projectFilter !== "all" && !scopeIds.has(e.account_id)) return;
      if (isFall(e)) s.add(e.account_id);
    });
    return s.size;
  }, [weekLog, windowMs, scopeIds, projectFilter]);

  const deltaPct = burnedPrev > 0 ? ((burned - burnedPrev) / burnedPrev) * 100 : (burned > 0 ? 100 : 0);

  /* ── Preditivo: ritmo médio de quedas/dia → projeção 7d ── */
  const perDay = burned / Math.max(1, days);
  const projected7d = Math.round(perDay * 7);

  /* ── Tempo médio na esteira (Aquecendo → Pronta) ── */
  const avgToReady = useMemo(() => {
    const vals = scopedRows
      .filter((r) => r.stage === "ready" || r.stage === "advertising")
      .map((r) => r.days)
      .filter((d: any): d is number => typeof d === "number" && d >= 0);
    if (!vals.length) return null;
    return vals.reduce((s, d) => s + d, 0) / vals.length;
  }, [scopedRows]);

  /* ── Tempo médio ativa antes de cair ── */
  const avgLifeBeforeFall = useMemo(() => {
    const byAccount = new Map<string, any>();
    scopedRows.forEach((r) => byAccount.set(r.account_id, r));
    const vals: number[] = [];
    falls.forEach((e) => {
      const row = byAccount.get(e.account_id);
      const base = row?.first_ad_date || row?.created_at;
      if (!base) return;
      const d = (new Date(e.changed_at).getTime() - new Date(base).getTime()) / 86400_000;
      if (d >= 0 && d < 3650) vals.push(d);
    });
    if (!vals.length) return null;
    return vals.reduce((s, d) => s + d, 0) / vals.length;
  }, [falls, scopedRows]);

  /* ── Health score por projeto (0-100): menos queima + mais tempo ativa = melhor ── */
  const projectHealth = useMemo(() => {
    const groups = new Map<string, { total: number; burned: number; life: number[] }>();
    const ensure = (k: string) => {
      if (!groups.has(k)) groups.set(k, { total: 0, burned: 0, life: [] });
      return groups.get(k)!;
    };
    scopedRows.forEach((r) => {
      const keys: string[] = (r.projects || []).length ? r.projects : ["Sem projeto"];
      keys.forEach((k: string) => { ensure(k).total++; });
    });
    const fallIds = new Set(falls.map((e) => e.account_id));
    scopedRows.forEach((r) => {
      if (!fallIds.has(r.account_id)) return;
      const keys: string[] = (r.projects || []).length ? r.projects : ["Sem projeto"];
      keys.forEach((k: string) => { ensure(k).burned++; });
    });
    return Array.from(groups.entries())
      .filter(([, v]) => v.total > 0)
      .map(([name, v]) => {
        const burnPct = (v.burned / v.total) * 100;
        const score = Math.max(0, Math.min(100, Math.round(100 - burnPct)));
        return { name, total: v.total, burned: v.burned, burnPct, score };
      })
      .sort((a, b) => a.score - b.score);
  }, [scopedRows, falls]);

  /* ── Export CSV (eventos + esteira) ── */
  const exportCsv = () => {
    const lines: string[] = [];
    lines.push("SECAO,account_id,account_name,stage,dias,status,motivo,projetos,evento_de,evento_para,evento_em");
    scopedRows.forEach((r) => {
      lines.push([
        "ESTEIRA", r.account_id, `"${(r.account_name || "").replace(/"/g, '""')}"`,
        r.stage, r.days ?? "", r.account_status ?? "", r.inactiveReason || "",
        `"${(r.projects || []).join("|")}"`, "", "", "",
      ].join(","));
    });
    log.forEach((e) => {
      lines.push([
        "EVENTO", e.account_id, `"${(e.account_name || "").replace(/"/g, '""')}"`,
        "", "", e.new_status, isFall(e) ? "queda" : "mudanca", "",
        e.old_status ?? "", e.new_status, e.changed_at,
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `saude-farm-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Concentração de risco por gestor ── */
  const ownerConcentration = useMemo(() => {
    const ready = scopedRows.filter((r) => r.stage === "ready");
    if (ready.length < 4) return null;
    const byOwner = new Map<string, number>();
    ready.forEach((r) => {
      const key = r.ownerProfile?.display_name || r.ownerProfile?.email || "Sem gestor";
      byOwner.set(key, (byOwner.get(key) || 0) + 1);
    });
    const sorted = Array.from(byOwner.entries()).sort((a, b) => b[1] - a[1]);
    const [name, count] = sorted[0];
    const pct = (count / ready.length) * 100;
    if (pct < 40) return null;
    return { name, count, pct, total: ready.length };
  }, [scopedRows]);

  const detailRow = eventDetail ? rows.find((r) => r.account_id === eventDetail.account_id) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-orange-400" />
            Saúde do Farm
          </SheetTitle>
          <SheetDescription>
            Visão consolidada da esteira: fluxo, queima e concentração de risco.
          </SheetDescription>
        </SheetHeader>

        <TooltipProvider delayDuration={150}>
          <div className="mt-4 space-y-6">
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Projeto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os projetos</SelectItem>
                  <SelectItem value="__none__">Sem projeto ativo</SelectItem>
                  {projectOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs ml-auto" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>

            {/* KPIs topo */}
            <div className="grid grid-cols-3 gap-2">
              <HealthMetric icon={<Flame className="h-3.5 w-3.5" />} label="Contas" value={String(total)} tone="text-foreground" />
              <HealthMetric icon={<TrendingUp className="h-3.5 w-3.5" />} label="Prontas" value={String(scopedRows.filter((r) => r.stage === "ready").length)} tone="text-emerald-400" />
              <HealthMetric
                icon={<Skull className="h-3.5 w-3.5" />}
                label={`Queimadas ${days}d`}
                value={String(burned)}
                tone="text-rose-400"
                footer={
                  <span className={`flex items-center gap-0.5 ${deltaPct > 0 ? "text-rose-400" : deltaPct < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {deltaPct > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : deltaPct < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : null}
                    {deltaPct === 0 ? "estável" : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(0)}% vs ant. (${burnedPrev})`}
                  </span>
                }
              />
            </div>

            {/* Velocidade + preditivo */}
            <div className="grid grid-cols-3 gap-2">
              <HealthMetric
                icon={<Gauge className="h-3.5 w-3.5" />}
                label="Até ficar pronta"
                value={avgToReady === null ? "—" : `${avgToReady.toFixed(1)}d`}
                tone="text-amber-400"
              />
              <HealthMetric
                icon={<Activity className="h-3.5 w-3.5" />}
                label="Ativa antes de cair"
                value={avgLifeBeforeFall === null ? "—" : `${avgLifeBeforeFall.toFixed(1)}d`}
                tone="text-cyan-400"
              />
              <HealthMetric
                icon={<TrendingDown className="h-3.5 w-3.5" />}
                label="Projeção 7d"
                value={String(projected7d)}
                tone="text-rose-400"
                footer={<span className="text-muted-foreground">{perDay.toFixed(1)} quedas/dia</span>}
              />
            </div>

            {/* Fluxo da esteira */}
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Fluxo da esteira
              </h3>
              <div className="space-y-1.5">
                {flow.map((s) => {
                  const pct = total > 0 ? (s.count / total) * 100 : 0;
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-28 shrink-0">{s.label}</span>
                      <div className="flex-1 h-5 rounded-md bg-secondary/40 border border-border/30 overflow-hidden relative">
                        <div
                          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${s.tone}`}
                          style={{ width: `${pct}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-mono font-semibold text-foreground/90">
                          {s.count} <span className="opacity-50 ml-1">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="shrink-0"><MicroSparkline values={s.spark} /></div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-[10px]">
                          Quedas por dia (7d) das contas neste estágio
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-muted-foreground/60 mt-1">
                "Anunciando" = conta com ao menos 1 campanha ACTIVE no Meta. "Caída (total)" = todas as contas com status ≠ 1 (não é janela de 7d).
              </p>
            </section>

            {/* Top motivos de queda */}
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Motivos de queda · {topReasons.fromEvents ? `últimos ${days}d` : "estado atual"}
              </h3>
              {topReasons.entries.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/40 p-3 text-[11px] text-muted-foreground text-center">
                  Nenhuma queda no período. 🎉
                </div>
              ) : (
                <div className="space-y-1.5">
                  {topReasons.entries.map(([key, count]) => {
                    const meta = INACTIVE_REASON_META[key];
                    const pct = topReasons.sum > 0 ? (count / topReasons.sum) * 100 : 0;
                    return (
                      <div key={key} className={`rounded-md border px-2.5 py-1.5 ${meta.tone}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold">{meta.label}</span>
                          <span className="text-[11px] font-mono tabular-nums">
                            {count} <span className="opacity-60">({pct.toFixed(0)}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-background/40 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.hex }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Heatmap */}
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Heatmap de quedas · últimos {days} dias
              </h3>
              <div
                className="grid gap-1 rounded-md border border-border/40 bg-muted/10 p-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(days, 15)}, minmax(0, 1fr))` }}
              >
                {heatmap.map((d) => {
                  const intensity = d.n / maxHeat;
                  return (
                    <Tooltip key={d.date}>
                      <TooltipTrigger asChild>
                        <div
                          className="aspect-square rounded-sm border border-border/20 cursor-help"
                          style={{
                            background: d.n > 0
                              ? `hsla(353, 88%, 60%, ${0.18 + intensity * 0.72})`
                              : "hsla(240, 4%, 30%, 0.18)",
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">
                        {new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · {d.n} queda(s)
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <p className="text-[9px] text-muted-foreground/60 mt-1">
                Intensidade proporcional ao maior dia da janela ({maxHeat}).
              </p>
            </section>

            {/* Health score por projeto */}
            {projectHealth.length > 0 && (
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Health score por projeto · risco crescente
                </h3>
                <div className="space-y-1.5">
                  {projectHealth.slice(0, 8).map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono w-24 shrink-0 truncate">{p.name}</span>
                      <div className="flex-1 h-4 rounded-md bg-secondary/40 border border-border/30 overflow-hidden relative">
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{
                            width: `${p.score}%`,
                            background: p.score >= 80 ? "#34d399" : p.score >= 50 ? "#fbbf24" : "#fb7185",
                            opacity: 0.55,
                          }}
                        />
                        <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-mono">
                          {p.score} <span className="opacity-50 ml-1">({p.burned}/{p.total} queimadas)</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Concentração de risco */}
            {ownerConcentration && (
              <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 text-[11px]">
                    <p className="font-semibold text-amber-400">Concentração de risco</p>
                    <p className="text-amber-300/80 mt-0.5">
                      <strong>{ownerConcentration.name}</strong> responde por <strong>{ownerConcentration.pct.toFixed(0)}%</strong>{" "}
                      ({ownerConcentration.count}/{ownerConcentration.total}) das contas Prontas. Considere redistribuir.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Eventos recentes */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <History className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Eventos · últimos {days} dias ({log.length})
                </h3>
              </div>
              <RecentEventsList items={log} onSelect={setEventDetail} />
            </section>
          </div>
        </TooltipProvider>

        {/* Modal de detalhe do evento */}
        <Dialog open={!!eventDetail} onOpenChange={(o) => !o && setEventDetail(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">
                {eventDetail?.account_name || eventDetail?.account_id}
              </DialogTitle>
            </DialogHeader>
            {eventDetail && (
              <div className="space-y-2 text-[11px]">
                <DetailLine label="Conta" value={eventDetail.account_id} />
                <DetailLine label="Transição" value={`${statusLabel(eventDetail.old_status)} → ${statusLabel(eventDetail.new_status)}`} />
                <DetailLine label="Quando" value={new Date(eventDetail.changed_at).toLocaleString("pt-BR")} />
                <DetailLine
                  label="Motivo"
                  value={INACTIVE_REASON_META[getInactiveReason(eventDetail.new_status, 1) as Exclude<InactiveReason, "all">]?.label || "—"}
                />
                <DetailLine label="Estágio atual" value={detailRow?.stage || "—"} />
                <DetailLine label="Dias na esteira" value={detailRow?.days != null ? `${detailRow.days}d` : "—"} />
                <DetailLine label="Projetos ativos" value={(detailRow?.projects || []).join(", ") || "Nenhum"} />
                <DetailLine label="Gestor" value={detailRow?.ownerProfile?.display_name || detailRow?.ownerProfile?.email || "Sem gestor"} />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-right break-all">{value}</span>
    </div>
  );
}

function MicroSparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[2px] h-5 w-14">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px]"
          style={{
            height: `${Math.max(8, (v / max) * 100)}%`,
            background: v > 0 ? "hsla(353, 88%, 62%, 0.85)" : "hsla(240, 4%, 45%, 0.35)",
          }}
        />
      ))}
    </div>
  );
}

function HealthMetric({ icon, label, value, tone, footer }: {
  icon: React.ReactNode; label: string; value: string; tone: string; footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-2.5">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 font-data text-lg font-bold tabular-nums ${tone}`}>{value}</div>
      {footer && <div className="text-[9px] mt-0.5">{footer}</div>}
    </div>
  );
}

function RecentEventsList({ items, onSelect }: { items: LogEntry[]; onSelect: (e: LogEntry) => void }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/40 p-3 text-[11px] text-muted-foreground text-center">
        Sem eventos no período selecionado.
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[260px]">
      <ul className="space-y-0">
        {items.map((e, i) => {
          const fall = isFall(e);
          const isReactivation = e.old_status !== 1 && e.old_status !== null && e.new_status === 1;
          return (
            <li key={`${e.account_id}-${i}`}>
              <button
                onClick={() => onSelect(e)}
                className="w-full flex items-start gap-3 py-2 border-b border-border/40 text-left hover:bg-muted/30 transition-colors px-1 rounded-sm"
              >
                <div
                  className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                    fall ? "bg-destructive/10" : isReactivation ? "bg-wr-positive/10" : "bg-muted/50"
                  }`}
                >
                  {fall ? (
                    <ArrowDown className="h-2.5 w-2.5 text-destructive" />
                  ) : isReactivation ? (
                    <ArrowUp className="h-2.5 w-2.5 text-wr-positive" />
                  ) : (
                    <Minus className="h-2.5 w-2.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-foreground">{e.account_name || e.account_id}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {statusLabel(e.old_status)} → {statusLabel(e.new_status)}
                  </p>
                </div>
                <span className="text-[9px] text-muted-foreground font-mono shrink-0 tabular-nums">
                  {new Date(e.changed_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}

const STATUS_LABELS: Record<number, string> = {
  1: "Ativa", 2: "Desabilitada", 3: "Pendente", 7: "Em Revisão",
  9: "Período de Graça", 100: "Fechamento Pendente", 101: "Fechada",
};
function statusLabel(s: number | null): string {
  if (s === null || s === undefined) return "Novo";
  return STATUS_LABELS[s] || `Status ${s}`;
}
