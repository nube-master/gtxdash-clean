import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { buildSeries, type HistoryPoint } from "@/lib/spyHistory";

interface Props {
  history: HistoryPoint[];
  currentActive: number;
}

export function SpyEvolutionTab({ history, currentActive }: Props) {
  const series = useMemo(() => buildSeries(history), [history]);
  const isDaily = series[0]?.daily ?? true;

  const today = series[series.length - 1]?.active ?? currentActive ?? 0;
  const yesterday = series[series.length - 2]?.active ?? null;
  // "vs 7 dias": primeiro ponto disponível dentro dos últimos 7 da série
  const sevenAgo = series.length > 7 ? series[series.length - 8]?.active : series[0]?.active ?? null;

  const deltaDay = yesterday != null ? today - yesterday : null;
  const pctDay = yesterday && yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : null;
  const delta7d = sevenAgo != null ? today - sevenAgo : null;
  const pct7d = sevenAgo && sevenAgo > 0 ? ((today - sevenAgo) / sevenAgo) * 100 : null;

  const chartData = series.map((p, i) => {
    const prev = series[i - 1];
    const delta = prev ? p.active - prev.active : 0;
    return {
      date: p.label,
      Ativos: p.active,
      Total: p.total,
      Novos: delta > 0 ? delta : 0,
      Pausados: delta < 0 ? -delta : 0,
    };
  });

  const hasChart = chartData.length >= 2;
  const rangeLabel = isDaily
    ? `Últimos ${series.length} dia(s)`
    : `${series.length} snapshot(s) no mesmo dia`;
  const dayDeltaLabel = isDaily ? "vs ontem" : "vs 1º snapshot";

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiBlock label="Ads hoje" value={today.toLocaleString("pt-BR")} />
        <KpiBlock
          label={dayDeltaLabel}
          value={yesterday == null ? "—" : `${deltaDay! >= 0 ? "+" : ""}${deltaDay}`}
          delta={deltaDay}
          subtitle={pctDay != null ? `${pctDay >= 0 ? "+" : ""}${pctDay.toFixed(1)}%` : undefined}
        />
        <KpiBlock
          label="vs 7 dias"
          value={sevenAgo == null ? "—" : `${delta7d! >= 0 ? "+" : ""}${delta7d}`}
          delta={delta7d}
          subtitle={pct7d != null ? `${pct7d >= 0 ? "+" : ""}${pct7d.toFixed(1)}%` : undefined}
        />
        <KpiBlock label="Pico (período)" value={Math.max(...series.map((s) => s.active), today).toLocaleString("pt-BR")} />
      </div>

      {/* Chart */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Evolução de Anúncios</h3>
          <p className="text-[11px] text-muted-foreground">{rangeLabel}</p>
        </div>
        {!hasChart ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-sm">Ainda não há histórico suficiente.</p>
            <p className="text-xs">Os snapshots são coletados a cada sincronização (cron 09:00 e 21:00 BRT).</p>
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="spyEvoActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                    borderRadius: 8,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="right" dataKey="Novos" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar yAxisId="right" dataKey="Pausados" fill="hsl(0 72% 55%)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Area yAxisId="left" type="monotone" dataKey="Ativos" stroke="hsl(var(--primary))" fill="url(#spyEvoActive)" strokeWidth={2} />
                <Area yAxisId="left" type="monotone" dataKey="Total" stroke="hsl(var(--muted-foreground))" fill="transparent" strokeWidth={1} strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Tabela diária recente */}
      {series.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Comparativo Dia a Dia</h3>
            <p className="text-[11px] text-muted-foreground">últimos 14 dias</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-right px-4 py-2">Ativos</th>
                  <th className="text-right px-4 py-2">Δ Ativos</th>
                  <th className="text-right px-4 py-2">% Ativos</th>
                  <th className="text-right px-4 py-2">Total</th>
                  <th className="text-right px-4 py-2">Δ Total</th>
                  <th className="text-right px-4 py-2">% Total</th>
                </tr>
              </thead>
              <tbody>
                {series.slice(-14).reverse().map((p, idx, arr) => {
                  const prev = arr[idx + 1];
                  const dActive = prev ? p.active - prev.active : null;
                  const pctActive = prev && prev.active > 0 ? ((p.active - prev.active) / prev.active) * 100 : null;
                  const dTotal = prev ? p.total - prev.total : null;
                  const pctTotal = prev && prev.total > 0 ? ((p.total - prev.total) / prev.total) * 100 : null;
                  return (
                    <tr key={p.key} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2 tabular-nums whitespace-nowrap">{p.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{p.active.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2 text-right tabular-nums"><DeltaCell value={dActive} /></td>
                      <td className="px-4 py-2 text-right tabular-nums"><PctCell value={pctActive} /></td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{p.total.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2 text-right tabular-nums"><DeltaCell value={dTotal} /></td>
                      <td className="px-4 py-2 text-right tabular-nums"><PctCell value={pctTotal} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function colorOf(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-rose-400";
  return "text-muted-foreground";
}

function DeltaCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={colorOf(value)}>
      {value > 0 ? "+" : ""}{value.toLocaleString("pt-BR")}
    </span>
  );
}

function PctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={colorOf(value)}>
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}


function KpiBlock({ label, value, delta, subtitle }: { label: string; value: string; delta?: number | null; subtitle?: string }) {
  const Icon = delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color = delta == null ? "text-muted-foreground" : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-muted-foreground";
  return (
    <Card className="p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${delta != null ? color : ""}`}>{value}</span>
        {delta != null && <Icon className={`h-3.5 w-3.5 ${color}`} />}
      </div>
      {subtitle && <p className={`text-[11px] tabular-nums ${color}`}>{subtitle}</p>}
    </Card>
  );
}
