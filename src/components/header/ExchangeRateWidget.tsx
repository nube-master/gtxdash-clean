import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useExchangeRateHistory } from "@/hooks/useExchangeRateHistory";
import { useFxHealth } from "@/hooks/useFxHealth";

export function ExchangeRateWidget() {
  const exchangeRate = useExchangeRate();
  const { data: history } = useExchangeRateHistory();
  const { rows: fxHealth, isStale, staleCurrencies } = useFxHealth();

  // Compare current rate vs first point in history (oldest day's close = yesterday's reference)
  const prev = history && history.length >= 2 ? history[0].rate : null;
  const diff = prev ? exchangeRate - prev : 0;
  const diffPct = prev ? ((diff / prev) * 100) : 0;
  const isUp = diff > 0.005;
  const isDown = diff < -0.005;


  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer shrink-0"
        >
          {isUp ? (
            <TrendingUp className="h-3 w-3 text-emerald-500" />
          ) : isDown ? (
            <TrendingDown className="h-3 w-3 text-destructive" />
          ) : (
            <Minus className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="text-[9px] font-mono text-muted-foreground">USD</span>
          <span className="text-[10px] font-mono font-bold tabular-nums text-foreground">
            R$ {exchangeRate.toFixed(2)}
          </span>
          {isStale && (
            <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="Câmbio desatualizado" />
          )}
        </button>

      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[280px] p-0">
        {/* Header */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Dólar Comercial</span>
            <span className={`text-[10px] font-mono font-bold ${isUp ? "text-emerald-500" : isDown ? "text-destructive" : "text-muted-foreground"}`}>
              {isUp ? "+" : ""}{diffPct.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold tabular-nums text-foreground">
              R$ {exchangeRate.toFixed(4)}
            </span>
            {prev && (
              <span className={`text-[10px] font-mono ${isUp ? "text-emerald-500" : isDown ? "text-destructive" : "text-muted-foreground"}`}>
                {isUp ? "▲" : isDown ? "▼" : "–"} {Math.abs(diff).toFixed(4)}
              </span>
            )}
          </div>
        </div>

        {/* FX health */}
        {fxHealth.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-1.5">
              {fxHealth.map((fx) => (
                <span
                  key={fx.currency_from}
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                    fx.is_stale
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                      : "border-border/50 bg-muted/30 text-muted-foreground"
                  }`}
                  title={`${fx.currency_from}: ${fx.last_rate_date} (${Math.round(fx.hours_stale)}h)`}
                >
                  {fx.currency_from} {Number(fx.rate_avg).toFixed(2)}
                  {fx.is_stale ? " ⚠" : ""}
                </span>
              ))}
            </div>
            {isStale && (
              <p className="mt-1.5 text-[9px] text-amber-500">
                Cotação desatualizada ({staleCurrencies.join(", ")}) — conversão de investimento pode estar defasada.
              </p>
            )}
          </div>
        )}

        {/* Mini chart */}
        {history && history.length > 1 && (
          <div className="px-4 py-2">
            <MiniChart data={history} />
          </div>
        )}

        {/* Daily list */}
        {history && history.length > 0 && (
          <div className="border-t border-border">
            <div className="px-4 py-2">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                Últimos {history.length} dias
              </span>
            </div>
            <div className="px-2 pb-2 space-y-0.5 max-h-[180px] overflow-y-auto">
              {[...history].reverse().map((day, i, arr) => {
                const prevDay = arr[i + 1];
                const dayDiff = prevDay ? day.rate - prevDay.rate : 0;
                const dayUp = dayDiff > 0.005;
                const dayDown = dayDiff < -0.005;

                return (
                  <div
                    key={day.date}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-[11px] font-mono text-muted-foreground">{day.date}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold tabular-nums text-foreground">
                        R$ {day.rate.toFixed(4)}
                      </span>
                      {prevDay && (
                        <span className={`text-[9px] font-mono font-bold ${dayUp ? "text-destructive" : dayDown ? "text-emerald-500" : "text-muted-foreground"}`}>
                          {dayUp ? "▲" : dayDown ? "▼" : "–"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MiniChart({ data }: { data: { date: string; rate: number }[] }) {
  const rates = data.map((d) => d.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min || 0.01;

  const width = 240;
  const height = 48;
  const padding = 4;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((d.rate - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const isUp = rates[rates.length - 1] > rates[0];
  const color = isUp
    ? "hsl(var(--wr-positive, 142 71% 45%))"
    : "hsl(var(--destructive))";

  const gradientId = "exchange-gradient";
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 48 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}
