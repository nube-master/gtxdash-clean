import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
  ReferenceArea,
} from "recharts";
import { Loader2, TrendingDown, TrendingUp, Activity, AlertTriangle, ShieldCheck, ShieldAlert, Target } from "lucide-react";
import { useCreativeLifecycle, type LifecycleDayPoint } from "@/hooks/useCreativeLifecycle";
import {
  buildCreativeBaseline,
  classifyAgainstBaseline,
  validateLifecycleConsistency,
  type ReferenceTotals,
  type BaselineMetric,
  type BaselineVerdict,
} from "@/lib/creativeBaseline";

interface Props {
  creativeId: string | null;
  enabled: boolean;
  adNames?: string[];
  campaignNames?: string[];
  projectCode?: string | null;
  /** Source-of-truth aggregates from the parent table — used to validate the curve. */
  reference?: ReferenceTotals | null;
}

type MetricKey = "roas" | "sales" | "spend" | "ctr" | "cpc" | "profit" | "cpa";

const METRICS: { key: MetricKey; label: string; color: string; format: (v: number) => string; isCurrency?: boolean }[] = [
  { key: "roas", label: "ROAS", color: "hsl(160 70% 45%)", format: (v) => `${v.toFixed(2)}x` },
  { key: "sales", label: "Vendas", color: "hsl(217 91% 60%)", format: (v) => Math.round(v).toString() },
  { key: "spend", label: "Gasto", color: "hsl(0 75% 60%)", format: (v) => fmtBRL(v), isCurrency: true },
  { key: "profit", label: "Lucro", color: "hsl(142 71% 45%)", format: (v) => fmtBRL(v), isCurrency: true },
  { key: "ctr", label: "CTR", color: "hsl(280 70% 60%)", format: (v) => `${v.toFixed(2)}%` },
  { key: "cpc", label: "CPC", color: "hsl(35 90% 55%)", format: (v) => fmtBRL(v), isCurrency: true },
  { key: "cpa", label: "CPA", color: "hsl(340 75% 55%)", format: (v) => fmtBRL(v), isCurrency: true },
];

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function formatShortDate(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export function CreativeLifecycleCurve({ creativeId, enabled, adNames, campaignNames, projectCode, reference }: Props) {
  const [metric, setMetric] = useState<MetricKey>("roas");
  const { series, peakIdx, declineStartIdx, isLoading, hasEnoughData, weekly, declineInsight, scaleRoasThreshold } = useCreativeLifecycle({
    creativeId,
    enabled,
    adNames,
    campaignNames,
    projectCode,
  });

  const activeMetric = METRICS.find((item) => item.key === metric)!;

  const stats = useMemo(() => {
    if (!series.length) return null;

    const totalSpend = series.reduce((sum, point) => sum + point.spend, 0);
    const totalRevenue = series.reduce((sum, point) => sum + point.revenue, 0);
    const totalSales = series.reduce((sum, point) => sum + point.sales, 0);
    const totalProfit = totalRevenue - totalSpend;
    const totalImpressions = series.reduce((sum, point) => sum + point.impressions, 0);
    const totalLinkClicks = series.reduce((sum, point) => sum + (point.inlineLinkClicks > 0 ? point.inlineLinkClicks : point.clicks), 0);
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const avgCtr = totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0;
    const avgCpc = totalLinkClicks > 0 ? totalSpend / totalLinkClicks : 0;
    const avgCpa = totalSales > 0 ? totalSpend / totalSales : 0;
    const peak = peakIdx !== null ? series[peakIdx] : null;
    const recentWindow = series.slice(-Math.min(7, series.length));
    const recentRoas = recentWindow.length
      ? recentWindow.reduce((sum, point) => sum + point.roas, 0) / recentWindow.length
      : 0;
    const peakRoas = peak?.roas ?? 0;
    const dropPct = peakRoas > 0 ? ((recentRoas - peakRoas) / peakRoas) * 100 : 0;

    return {
      totalSpend,
      totalRevenue,
      totalSales,
      totalProfit,
      avgRoas,
      avgCtr,
      avgCpc,
      avgCpa,
      recentRoas,
      peak,
      dropPct,
    };
  }, [series, peakIdx]);

  const baseline = useMemo(() => buildCreativeBaseline(series), [series]);
  const consistency = useMemo(
    () => validateLifecycleConsistency(series, reference ?? null),
    [series, reference],
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Carregando curva de vida...
      </div>
    );
  }

  if (!hasEnoughData) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-center text-[11px] text-muted-foreground">
        <Activity className="h-4 w-4 mx-auto mb-1 opacity-50" />
        Dados insuficientes no período filtrado ({series.length} dia{series.length === 1 ? "" : "s"}).
      </div>
    );
  }

  const chartData = series.map((point) => ({
    ...point,
    label: formatShortDate(point.date),
    value: point[metric],
  }));

  const peakPoint = peakIdx !== null ? chartData[peakIdx] : null;
  const declinePoint = declineStartIdx !== null ? chartData[declineStartIdx] : null;

  const status = (() => {
    if (declineStartIdx !== null) {
      return { label: "Em queda", icon: TrendingDown, cls: "text-destructive bg-destructive/10 border-destructive/30" };
    }
    if (peakIdx !== null && peakIdx >= series.length - 3) {
      return { label: "Saudável", icon: TrendingUp, cls: "text-wr-positive bg-wr-positive/10 border-wr-positive/30" };
    }
    return { label: "Estável", icon: Activity, cls: "text-muted-foreground bg-muted/40 border-border" };
  })();

  const StatusIcon = status.icon;

  const periodMetrics = stats
    ? [
        { label: "Vendas", value: String(stats.totalSales) },
        { label: "ROAS", value: `${stats.avgRoas.toFixed(2)}x` },
        { label: "Gasto", value: fmtBRL(stats.totalSpend) },
        {
          label: "Lucro",
          value: fmtBRL(stats.totalProfit),
          tone: stats.totalProfit >= 0 ? "text-wr-positive" : "text-destructive",
        },
        { label: "CPA", value: stats.avgCpa > 0 ? fmtBRL(stats.avgCpa) : "—" },
        { label: "CTR", value: `${stats.avgCtr.toFixed(2)}%` },
        { label: "CPC", value: stats.avgCpc > 0 ? fmtBRL(stats.avgCpc) : "—" },
      ]
    : [];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Curva de Vida</p>
          <p className="text-[11px] text-muted-foreground">Resumo do período filtrado • {series.length} dias com dados</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${status.cls}`}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
        {periodMetrics.map((item) => (
          <div key={item.label} className="rounded-md border border-border bg-background px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1">{item.label}</p>
            <p className={`text-[11px] font-bold leading-none ${item.tone || "text-foreground"}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {consistency.hasReference && (
        <ConsistencyPanel report={consistency} />
      )}


      {peakIdx !== null && stats?.peak && (
        <div className="rounded-md border border-border bg-background/40 p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
            Pico vs Atual (últimos {Math.min(7, series.length)}d) • Limite saudável em escala: {scaleRoasThreshold.toFixed(2)}x
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { label: "ROAS", peak: stats.peak.roas, current: stats.recentRoas, fmt: (v: number) => `${v.toFixed(2)}x`, betterHigher: true },
              { label: "CPA", peak: stats.peak.cpa, current: stats.avgCpa, fmt: (v: number) => v > 0 ? fmtBRL(v) : "—", betterHigher: false },
              { label: "CTR", peak: stats.peak.ctr, current: stats.avgCtr, fmt: (v: number) => `${v.toFixed(2)}%`, betterHigher: true },
              { label: "CPC", peak: stats.peak.cpc, current: stats.avgCpc, fmt: (v: number) => v > 0 ? fmtBRL(v) : "—", betterHigher: false },
            ]).map((row) => {
              const delta = row.peak > 0 ? ((row.current - row.peak) / row.peak) * 100 : 0;
              const isBetter = row.betterHigher ? delta >= 0 : delta <= 0;
              const tone = Math.abs(delta) < 3 ? "text-muted-foreground" : isBetter ? "text-wr-positive" : "text-destructive";
              return (
                <div key={row.label} className="rounded-md border border-border bg-background px-2.5 py-2">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1">{row.label}</p>
                  <p className="text-[11px] font-semibold leading-none text-foreground">
                    {row.fmt(row.current)} <span className="text-[9px] text-muted-foreground">vs {row.fmt(row.peak)}</span>
                  </p>
                  <p className={`text-[10px] font-bold mt-1 ${tone}`}>
                    {delta >= 0 ? "+" : ""}{delta.toFixed(0)}%
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <BaselinePanel baseline={baseline} />

      {declineInsight && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-[1px]" />
          <div>
            <p className="font-semibold text-destructive mb-0.5">Sinal de queda em escala detectado</p>
            <p className="text-muted-foreground leading-snug">{declineInsight.reason}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {METRICS.map((item) => (
          <button
            key={item.key}
            onClick={() => setMetric(item.key)}
            className={`rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition ${
              metric === item.key
                ? "bg-foreground text-background"
                : "bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="h-[220px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`lc-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={activeMetric.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={activeMetric.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={46}
              tickFormatter={(value: number) =>
                activeMetric.isCurrency
                  ? value >= 1000
                    ? `${(value / 1000).toFixed(0)}k`
                    : value.toFixed(0)
                  : metric === "roas"
                    ? `${value.toFixed(1)}x`
                    : metric === "ctr"
                      ? `${value.toFixed(1)}%`
                      : value.toFixed(0)
              }
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as LifecycleDayPoint & { label: string };
                return (
                  <div className="rounded-md border border-border bg-card px-2 py-1.5 text-[10px] shadow-xl">
                    <p className="font-semibold text-foreground mb-1">{point.label}</p>
                    <p style={{ color: activeMetric.color }}>
                      {activeMetric.label}: {activeMetric.format(point[metric])}
                    </p>
                    <p className="text-muted-foreground">Vendas: {point.sales} • Gasto: {fmtBRL(point.spend)}</p>
                  </div>
                );
              }}
            />
            {declinePoint && (
              <ReferenceArea
                x1={declinePoint.label}
                x2={chartData[chartData.length - 1].label}
                fill="hsl(var(--destructive))"
                fillOpacity={0.06}
              />
            )}
            <Area type="monotone" dataKey="value" stroke="none" fill={`url(#lc-${metric})`} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={activeMetric.color}
              strokeWidth={2}
              dot={{ r: 2, fill: activeMetric.color, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
            {peakPoint && (
              <ReferenceDot
                x={peakPoint.label}
                y={peakPoint[metric]}
                r={5}
                fill="hsl(var(--wr-positive))"
                stroke="hsl(var(--background))"
                strokeWidth={2}
              />
            )}
            {declinePoint && (
              <ReferenceDot
                x={declinePoint.label}
                y={declinePoint[metric]}
                r={5}
                fill="hsl(var(--destructive))"
                stroke="hsl(var(--background))"
                strokeWidth={2}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>


      {weekly.length > 1 && (
        <div className="rounded-md border border-border bg-background/40 p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
            Tendência semana a semana
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left font-semibold py-1.5 pr-2">Semana</th>
                  <th className="text-right font-semibold py-1.5 px-2">Vendas</th>
                  <th className="text-right font-semibold py-1.5 px-2">Gasto</th>
                  <th className="text-right font-semibold py-1.5 px-2">ROAS</th>
                  <th className="text-right font-semibold py-1.5 px-2">Lucro</th>
                  <th className="text-right font-semibold py-1.5 px-2">CPA</th>
                  <th className="text-right font-semibold py-1.5 px-2">CTR</th>
                  <th className="text-right font-semibold py-1.5 pl-2">CPC</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((w, i) => {
                  const prev = i > 0 ? weekly[i - 1] : null;
                  const roasDelta = prev && prev.roas > 0 ? ((w.roas - prev.roas) / prev.roas) * 100 : null;
                  const roasUnsafe = w.roas > 0 && w.roas < scaleRoasThreshold;
                  return (
                    <tr key={w.weekIndex} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 pr-2 font-semibold text-foreground">
                        S{w.weekIndex} <span className="text-muted-foreground font-normal">({w.days}d)</span>
                      </td>
                      <td className="text-right py-1.5 px-2 text-foreground">{w.sales}</td>
                      <td className="text-right py-1.5 px-2 text-foreground">{fmtBRL(w.spend)}</td>
                      <td className={`text-right py-1.5 px-2 font-semibold ${roasUnsafe ? "text-destructive" : "text-foreground"}`}>
                        {w.roas.toFixed(2)}x
                        {roasDelta !== null && Math.abs(roasDelta) >= 3 && (
                          <span className={`ml-1 text-[9px] ${roasDelta >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                            {roasDelta >= 0 ? "▲" : "▼"}{Math.abs(roasDelta).toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className={`text-right py-1.5 px-2 font-semibold ${w.profit >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                        {fmtBRL(w.profit)}
                      </td>
                      <td className="text-right py-1.5 px-2 text-foreground">{w.cpa > 0 ? fmtBRL(w.cpa) : "—"}</td>
                      <td className="text-right py-1.5 px-2 text-foreground">{w.ctr.toFixed(2)}%</td>
                      <td className="text-right py-1.5 pl-2 text-foreground">{w.cpc > 0 ? fmtBRL(w.cpc) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        {peakPoint && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-wr-positive" />
            Pico {formatShortDate(peakPoint.date)}
          </span>
        )}
        {declinePoint && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            Início da queda {formatShortDate(declinePoint.date)}
          </span>
        )}
        {stats && (
          <span>
            ROAS recente: {stats.recentRoas.toFixed(2)}x • vs pico {stats.dropPct >= 0 ? "+" : ""}
            {stats.dropPct.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Validation panel — checks lifecycle totals against the
// authoritative aggregates from the parent table.
// ============================================================
function ConsistencyPanel({
  report,
}: {
  report: ReturnType<typeof validateLifecycleConsistency>;
}) {
  const tone =
    report.level === "ok"
      ? { Icon: ShieldCheck, cls: "border-wr-positive/30 bg-wr-positive/5", iconCls: "text-wr-positive", label: "Dados consistentes" }
      : report.level === "warning"
      ? { Icon: ShieldAlert, cls: "border-amber-500/30 bg-amber-500/5", iconCls: "text-amber-400", label: "Pequena divergência" }
      : { Icon: ShieldAlert, cls: "border-destructive/40 bg-destructive/5", iconCls: "text-destructive", label: "Divergência relevante" };
  const { Icon } = tone;
  return (
    <div className={`rounded-md border p-3 ${tone.cls}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-3.5 w-3.5 ${tone.iconCls}`} />
        <p className="text-[10px] uppercase tracking-wider font-semibold text-foreground">
          Validação de Consistência
        </p>
        <span className={`ml-auto text-[10px] font-semibold ${tone.iconCls}`}>{tone.label}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {report.checks.map((check) => {
          const checkTone =
            check.level === "ok"
              ? "text-muted-foreground"
              : check.level === "warning"
              ? "text-amber-400"
              : "text-destructive";
          const fmt =
            check.formatter === "currency"
              ? fmtBRL
              : check.formatter === "roas"
              ? (v: number) => `${v.toFixed(2)}x`
              : (v: number) => Math.round(v).toString();
          return (
            <div key={check.field} className="rounded-md border border-border bg-background px-2.5 py-2">
              <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1">{check.field}</p>
              <p className="text-[11px] font-semibold leading-none text-foreground">
                {fmt(check.curve)} <span className="text-[9px] text-muted-foreground">vs {fmt(check.reference)}</span>
              </p>
              <p className={`text-[10px] font-bold mt-1 ${checkTone}`}>
                {check.diffPct >= 0 ? "+" : ""}
                {check.diffPct.toFixed(1)}%
              </p>
            </div>
          );
        })}
      </div>
      {report.level !== "ok" && (
        <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
          A curva foi montada por dia (tráfego + ClickBank/RedTrack). Pequenas diferenças podem
          ocorrer por arredondamento ou janela de atribuição. Acima de ±10% indica divergência
          relevante de fonte de dados.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Baseline panel — "platô" de performance do criativo
// (mediana + faixa p25-p75 dos dias estáveis), com classificação
// do dia mais recente vs esse padrão.
// ============================================================
function BaselinePanel({ baseline }: { baseline: ReturnType<typeof buildCreativeBaseline> }) {
  if (!baseline.hasEnoughData) {
    return (
      <div className="rounded-md border border-dashed border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 opacity-60" />
          <span>
            Padrão médio (baseline) ainda em construção — precisa de pelo menos 3 dias com gasto
            consistente. ({baseline.sampleSize} dia{baseline.sampleSize === 1 ? "" : "s"}{" "}
            estável{baseline.sampleSize === 1 ? "" : "is"} até agora)
          </span>
        </div>
      </div>
    );
  }

  const today = baseline.today;
  const rows: {
    label: string;
    metric: BaselineMetric;
    current: number;
    fmt: (v: number) => string;
  }[] = [
    {
      label: "ROAS",
      metric: baseline.metrics.roas,
      current: today?.roas ?? 0,
      fmt: (v) => `${v.toFixed(2)}x`,
    },
    {
      label: "CPA",
      metric: baseline.metrics.cpa,
      current: today?.cpa ?? 0,
      fmt: (v) => (v > 0 ? fmtBRL(v) : "—"),
    },
    {
      label: "CPC",
      metric: baseline.metrics.cpc,
      current: today?.cpc ?? 0,
      fmt: (v) => (v > 0 ? fmtBRL(v) : "—"),
    },
    {
      label: "CTR",
      metric: baseline.metrics.ctr,
      current: today?.ctr ?? 0,
      fmt: (v) => `${v.toFixed(2)}%`,
    },
  ];

  const verdictTone = (v: BaselineVerdict) =>
    v === "above"
      ? { cls: "text-wr-positive bg-wr-positive/10 border-wr-positive/30", label: "Acima do padrão" }
      : v === "in_range"
      ? { cls: "text-amber-400 bg-amber-500/10 border-amber-500/30", label: "Na média" }
      : v === "below"
      ? { cls: "text-destructive bg-destructive/10 border-destructive/30", label: "Abaixo do padrão" }
      : { cls: "text-muted-foreground bg-muted/40 border-border", label: "Sem dado" };

  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Target className="h-3.5 w-3.5 text-foreground" />
        <p className="text-[10px] uppercase tracking-wider font-semibold text-foreground">
          Padrão Médio do Criativo (Baseline)
        </p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {baseline.sampleSize} dias estáveis • dia ref: {today ? formatShortDate(today.date) : "—"}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 leading-snug">
        Faixa esperada (p25–p75) calculada com dias de gasto significativo. Use a coluna "Hoje" para
        bater o olho e classificar a performance do dia.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {rows.map((row) => {
          const verdict = classifyAgainstBaseline(row.current, row.metric);
          const tone = verdictTone(verdict);
          return (
            <div key={row.label} className="rounded-md border border-border bg-background px-2.5 py-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[8px] uppercase tracking-wider text-muted-foreground">{row.label}</p>
                <span className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[8px] font-semibold ${tone.cls}`}>
                  {tone.label}
                </span>
              </div>
              <p className="text-[11px] font-bold leading-none text-foreground">
                Hoje: {row.fmt(row.current)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Médio: {row.fmt(row.metric.median)}
              </p>
              <p className="text-[9px] text-muted-foreground/80 mt-0.5">
                Faixa: {row.fmt(row.metric.p25)} – {row.fmt(row.metric.p75)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

