import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  compareMetric,
  aggregateStatus,
  NICHO_LABELS,
  type OfferBenchmark,
  type OfferKpiMetrics,
  type MetricStatus,
} from "@/hooks/useOfferBenchmarks";
import type { OfferNicho } from "@/types/offers";

const STATUS_CFG: Record<MetricStatus, { cls: string; icon: any; label: string }> = {
  good:    { cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",   icon: CheckCircle2, label: "Dentro do alvo" },
  warn:    { cls: "bg-amber-500/15 text-amber-500 border-amber-500/30",         icon: AlertCircle,  label: "Atenção" },
  bad:     { cls: "bg-red-500/15 text-red-500 border-red-500/30",               icon: XCircle,      label: "Fora do alvo" },
  neutral: { cls: "bg-muted text-muted-foreground border-border",               icon: Target,       label: "Sem dados" },
};

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${Number(v).toFixed(2)}%`;

interface BadgeProps {
  nicho: OfferNicho;
  actual: OfferKpiMetrics | undefined;
  target: OfferBenchmark | undefined;
  compact?: boolean;
}

/** Badge agregado para a lista (verde/amarelo/vermelho). */
export function BenchmarkBadge({ nicho, actual, target, compact = true }: BadgeProps) {
  if (!target) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground border-dashed">
              <Target className="h-2.5 w-2.5" />
              {compact ? "—" : "Sem benchmark"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Defina o benchmark de <b>{NICHO_LABELS[nicho]}</b> para comparar.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const status = aggregateStatus(actual, target);
  const cfg = STATUS_CFG[status];
  const Icon = cfg.icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("text-[10px] gap-1", cfg.cls)}>
            <Icon className="h-2.5 w-2.5" />
            {compact ? "" : cfg.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[260px]">
          <div className="font-semibold mb-1">vs benchmark {NICHO_LABELS[nicho]}</div>
          <MiniRow label="CPC" actual={actual?.cpc_brl} target={target.cpc_brl} fmt={fmtBRL} status={compareMetric("cpc_brl", actual?.cpc_brl, target.cpc_brl)} />
          <MiniRow label="CPM" actual={actual?.cpm_brl} target={target.cpm_brl} fmt={fmtBRL} status={compareMetric("cpm_brl", actual?.cpm_brl, target.cpm_brl)} />
          <MiniRow label="CTR" actual={actual?.ctr_pct} target={target.ctr_pct} fmt={fmtPct} status={compareMetric("ctr_pct", actual?.ctr_pct, target.ctr_pct)} />
          <MiniRow label="CPI" actual={actual?.cpi_brl} target={target.cpi_brl} fmt={fmtBRL} status={compareMetric("cpi_brl", actual?.cpi_brl, target.cpi_brl)} />
          <MiniRow label="Conv." actual={actual?.conversion_pct} target={target.conversion_pct} fmt={fmtPct} status={compareMetric("conversion_pct", actual?.conversion_pct, target.conversion_pct)} />
          <MiniRow label="Pitch" actual={actual?.pitch_retention_pct} target={target.pitch_retention_pct} fmt={fmtPct} status={compareMetric("pitch_retention_pct", actual?.pitch_retention_pct, target.pitch_retention_pct)} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MiniRow({ label, actual, target, fmt, status }: { label: string; actual: number | null | undefined; target: number | null | undefined; fmt: (v: number | null | undefined) => string; status: MetricStatus }) {
  const colorCls = status === "good" ? "text-emerald-500" : status === "warn" ? "text-amber-500" : status === "bad" ? "text-red-500" : "text-muted-foreground";
  return (
    <div className="grid grid-cols-[44px_1fr_auto] gap-2 items-center text-[11px] py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", colorCls)}>{fmt(actual)}</span>
      <span className="text-muted-foreground/60 tabular-nums">/ {fmt(target)}</span>
    </div>
  );
}

/** Painel detalhado (drawer): cada métrica com valor real, alvo, status. */
export function BenchmarkPanel({ nicho, actual, target, periodLabel }: BadgeProps & { periodLabel?: string }) {
  if (!target) {
    return (
      <div className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        Nenhum benchmark configurado para <b>{NICHO_LABELS[nicho]}</b>. Defina em <span className="font-mono">Benchmarks</span> no topo da página.
      </div>
    );
  }

  const items: Array<{ key: any; label: string; suffix: "brl" | "pct" }> = [
    { key: "cpc_brl", label: "CPC", suffix: "brl" },
    { key: "cpm_brl", label: "CPM", suffix: "brl" },
    { key: "ctr_pct", label: "CTR", suffix: "pct" },
    { key: "cpi_brl", label: "CPI", suffix: "brl" },
    { key: "conversion_pct", label: "Tx. Conversão", suffix: "pct" },
    { key: "pitch_retention_pct", label: "Retenção Pitch", suffix: "pct" },
  ];

  // Aggregate score
  const statuses = items.map((it) =>
    compareMetric(it.key, actual?.[it.key as keyof OfferKpiMetrics] as any, target[it.key as keyof OfferBenchmark] as any)
  );
  const goodCount = statuses.filter((s) => s === "good").length;
  const warnCount = statuses.filter((s) => s === "warn").length;
  const badCount = statuses.filter((s) => s === "bad").length;
  const evaluated = goodCount + warnCount + badCount;
  const aggCfg = badCount > 0 ? STATUS_CFG.bad : warnCount > 0 ? STATUS_CFG.warn : evaluated > 0 ? STATUS_CFG.good : STATUS_CFG.neutral;
  const AggIcon = aggCfg.icon;

  return (
    <div className="space-y-3">
      {/* Header com badge agregado */}
      <div className={cn("rounded-lg border p-3 flex items-center justify-between gap-3", aggCfg.cls)}>
        <div className="flex items-center gap-2">
          <AggIcon className="h-5 w-5" />
          <div>
            <div className="text-sm font-bold leading-tight">
              {evaluated === 0 ? "Sem dados no período" : `${goodCount}/${evaluated} KPIs no alvo`}
            </div>
            <div className="text-[10px] opacity-80 uppercase tracking-wider">
              {NICHO_LABELS[nicho]} · {periodLabel ?? "7 dias"}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 text-[11px] font-mono">
          {goodCount > 0 && <span className="text-emerald-500">✓ {goodCount}</span>}
          {warnCount > 0 && <span className="text-amber-500">⚠ {warnCount}</span>}
          {badCount > 0  && <span className="text-red-500">✗ {badCount}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {items.map((it) => {
          const a = actual?.[it.key as keyof OfferKpiMetrics] as number | null | undefined;
          const t = target[it.key as keyof OfferBenchmark] as number | null | undefined;
          const status = compareMetric(it.key, a, t);
          const fmt = it.suffix === "brl" ? fmtBRL : fmtPct;
          const cfg = STATUS_CFG[status];
          const Icon = cfg.icon;
          // delta vs target
          let delta: string | null = null;
          if (a != null && t != null && t !== 0) {
            const pct = ((a - t) / t) * 100;
            const sign = pct >= 0 ? "+" : "";
            delta = `${sign}${pct.toFixed(0)}%`;
          }
          return (
            <div key={it.key} className={cn("rounded-md border p-2.5 space-y-1", cfg.cls)}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{it.label}</span>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="text-lg font-bold tabular-nums leading-tight">{fmt(a)}</div>
              <div className="flex items-center justify-between text-[10px] opacity-70 tabular-nums">
                <span>alvo: {fmt(t)}</span>
                {delta && <span className="font-semibold">{delta}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {target.notes && (
        <p className="text-[10px] text-muted-foreground italic pt-1">"{target.notes}"</p>
      )}
    </div>
  );
}
