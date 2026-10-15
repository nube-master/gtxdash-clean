import { useMemo } from "react";
import { Flame, DollarSign } from "lucide-react";

interface Props {
  hourlySpend: Map<number, number>;
  hourlySales: Map<number, number>;
  color: string;
}

function fmtCur(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);
}

function HeatmapRow({ label, icon, data, accentColor }: {
  label: string;
  icon: React.ReactNode;
  data: Map<number, number>;
  accentColor: string;
}) {
  const { cells, maxVal, top3, totalVal } = useMemo(() => {
    let max = 0;
    const arr: { hour: number; value: number }[] = [];
    for (let h = 0; h < 24; h++) {
      const v = data.get(h) || 0;
      arr.push({ hour: h, value: v });
      if (v > max) max = v;
    }
    const sorted = [...arr].sort((a, b) => b.value - a.value);
    const top = sorted.filter(x => x.value > 0).slice(0, 3).map(x => x.hour);
    const total = arr.reduce((s, x) => s + x.value, 0);
    return { cells: arr, maxVal: max, top3: top, totalVal: total };
  }, [data]);

  if (totalVal === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-[9px] font-mono text-muted-foreground/60">({fmtCur(totalVal)} total)</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-muted-foreground">Picos:</span>
          {top3.map((h, i) => (
            <span
              key={h}
              className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
              style={{
                background: i === 0 ? `${accentColor}20` : "hsl(var(--secondary) / 0.4)",
                color: i === 0 ? accentColor : "hsl(var(--muted-foreground))",
                border: i === 0 ? `1px solid ${accentColor}35` : "none",
              }}
            >
              {String(h).padStart(2, "0")}h ({fmtCur(data.get(h) || 0)})
            </span>
          ))}
        </div>
      </div>

      {/* Bar chart style heatmap */}
      <div className="flex gap-[2px] items-end" style={{ height: "48px" }}>
        {cells.map(({ hour, value }) => {
          const intensity = maxVal > 0 ? value / maxVal : 0;
          const isPeak = top3.includes(hour);
          const pct = totalVal > 0 ? ((value / totalVal) * 100).toFixed(1) : "0";
          return (
            <div
              key={hour}
              className="flex-1 flex flex-col items-center justify-end h-full"
              title={`${String(hour).padStart(2, "0")}h: ${fmtCur(value)} (${pct}%)`}
            >
              <div
                className="w-full rounded-t-[2px] transition-all relative"
                style={{
                  height: `${Math.max(intensity * 100, value > 0 ? 8 : 2)}%`,
                  background: value > 0
                    ? isPeak
                      ? accentColor
                      : `${accentColor}${Math.round(intensity * 160 + 40).toString(16).padStart(2, "0")}`
                    : "hsl(var(--secondary) / 0.15)",
                  boxShadow: isPeak ? `0 0 6px ${accentColor}50` : "none",
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Hour labels */}
      <div className="flex gap-[2px] mt-0.5">
        {cells.map(({ hour }) => (
          <div key={hour} className="flex-1 text-center">
            {hour % 3 === 0 && (
              <span className={`text-[7px] font-mono ${top3.includes(hour) ? "font-bold text-foreground" : "text-muted-foreground/50"}`}>
                {String(hour).padStart(2, "0")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Correlation indicator: spend vs sales alignment */
function CorrelationBadge({ hourlySpend, hourlySales }: { hourlySpend: Map<number, number>; hourlySales: Map<number, number> }) {
  const correlation = useMemo(() => {
    // Simple rank correlation: do peak spend hours match peak sales hours?
    const spendArr = Array.from({ length: 24 }, (_, h) => hourlySpend.get(h) || 0);
    const salesArr = Array.from({ length: 24 }, (_, h) => hourlySales.get(h) || 0);
    const spendTotal = spendArr.reduce((s, v) => s + v, 0);
    const salesTotal = salesArr.reduce((s, v) => s + v, 0);
    if (spendTotal === 0 || salesTotal === 0) return null;

    // Top 5 spend hours
    const topSpend = spendArr.map((v, h) => ({ h, v })).sort((a, b) => b.v - a.v).slice(0, 5).map(x => x.h);
    const topSales = salesArr.map((v, h) => ({ h, v })).sort((a, b) => b.v - a.v).slice(0, 5).map(x => x.h);
    const overlap = topSpend.filter(h => topSales.includes(h)).length;
    return { overlap, total: 5 };
  }, [hourlySpend, hourlySales]);

  if (!correlation) return null;

  const pct = (correlation.overlap / correlation.total) * 100;
  const color = pct >= 60 ? "#00FF88" : pct >= 40 ? "#FFB800" : "#FF4444";
  const label = pct >= 60 ? "Alta" : pct >= 40 ? "Média" : "Baixa";

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
      <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[8px] font-mono text-muted-foreground">Correlação Gasto×Venda:</span>
      <span className="text-[9px] font-bold" style={{ color }}>{label} ({correlation.overlap}/{correlation.total})</span>
    </div>
  );
}

export default function TimezoneHeatmap({ hourlySpend, hourlySales, color }: Props) {
  const hasSpend = useMemo(() => Array.from(hourlySpend.values()).some(v => v > 0), [hourlySpend]);
  const hasSales = useMemo(() => Array.from(hourlySales.values()).some(v => v > 0), [hourlySales]);

  if (!hasSpend && !hasSales) {
    return (
      <div className="text-center py-4 text-muted-foreground text-[10px] font-mono">
        Sem dados horários disponíveis
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HeatmapRow
        label="Gasto por Hora"
        icon={<Flame className="h-3 w-3 text-amber-400" />}
        data={hourlySpend}
        accentColor={color}
      />
      <HeatmapRow
        label="Vendas por Hora"
        icon={<DollarSign className="h-3 w-3 text-emerald-400" />}
        data={hourlySales}
        accentColor="#00FF88"
      />
      <CorrelationBadge hourlySpend={hourlySpend} hourlySales={hourlySales} />
    </div>
  );
}
