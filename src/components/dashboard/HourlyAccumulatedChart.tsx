import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HourlyInsightsBar } from "./HourlyInsightsBar";

interface HourlyAccumulatedChartProps {
  sales: any[];
  hourlySpend: any[];
  totalSpend: number;
  totalRevenue: number;
  pnlDeductionRate: number;
  isToday?: boolean;
}

type LucroMode = "liquido" | "bruto";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

function getHourFromTimestamp(ts: string): number {
  const d = new Date(ts);
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(d)
  );
}

function getCurrentHourBR(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date())
  );
}

/* ── Custom Tooltip ── */
function ChartTooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const profitColor = d.profitAcc >= 0 ? "hsl(145, 70%, 50%)" : "hsl(0, 75%, 55%)";
  return (
    <div className="rounded-lg border border-border/50 bg-[hsl(220,12%,11%)] px-3 py-2.5 text-[11px] shadow-xl space-y-1.5">
      <p className="font-semibold text-foreground">{d.label}</p>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(25, 95%, 55%)" }} />
        <span className="text-muted-foreground">Investimento:</span>
        <span className="font-data font-medium text-foreground ml-auto">{fmtCurrency(d.spendAcc)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(210, 100%, 65%)" }} />
        <span className="text-muted-foreground">Faturamento:</span>
        <span className="font-data font-medium text-foreground ml-auto">{fmtCurrency(d.revenueAcc)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: profitColor }} />
        <span className="text-muted-foreground">Lucro:</span>
        <span className={`font-data font-medium ml-auto ${d.profitAcc >= 0 ? "text-wr-positive" : "text-destructive"}`}>{fmtCurrency(d.profitAcc)}</span>
      </div>
    </div>
  );
}

export function HourlyAccumulatedChart({
  sales, hourlySpend, totalSpend, totalRevenue, pnlDeductionRate, isToday: isTodayProp,
}: HourlyAccumulatedChartProps) {
  const [mode, setMode] = useState<LucroMode>("liquido");

  const isTodayResolved = isTodayProp ?? true;
  const currentHourResolved = isTodayResolved ? getCurrentHourBR() : 23;

  const { chartData, gradientOffset, hourlyProfit } = useMemo(() => {
    const isToday = isTodayResolved;
    const lastVisibleHour = isToday ? currentHourResolved : 23;

    const spendByHour = new Map<number, number>();
    for (const row of hourlySpend ?? []) {
      const h = Number(row.hour);
      if (h < 0 || h > 23) continue;
      spendByHour.set(h, (spendByHour.get(h) || 0) + Number(row.spend));
    }

    const revByHour = new Map<number, number>();
    for (const sale of sales ?? []) {
      if (sale.status !== "approved") continue;
      const ts = sale.created_at || sale.occurred_at;
      if (!ts) continue;
      const h = getHourFromTimestamp(ts);
      if (h < 0 || h > 23) continue;
      const rev = Number(sale.revenue) || Number(sale.amount) || 0;
      revByHour.set(h, (revByHour.get(h) || 0) + rev);
    }

    const rawRevenueSum = Array.from(revByHour.values()).reduce((a, b) => a + b, 0);
    const revenueCorrectionFactor = rawRevenueSum > 0 && totalRevenue > 0
      ? totalRevenue / rawRevenueSum
      : 1;

    const rawSpendSum = Array.from(spendByHour.values()).reduce((a, b) => a + b, 0);
    const spendCorrectionFactor = rawSpendSum > 0 && totalSpend > 0
      ? totalSpend / rawSpendSum
      : 1;

    // Fallback: if we have authoritative daily totalSpend but NO hourly breakdown
    // (e.g. some Meta accounts don't return hourly insights), distribute evenly
    // across elapsed hours so the chart never reads "R$ 0" when we actually spent.
    const useEvenSpendFallback = rawSpendSum === 0 && totalSpend > 0;
    const evenSpendPerHour = useEvenSpendFallback ? totalSpend / (lastVisibleHour + 1) : 0;

    // Fallback: when local sales feed is empty (e.g. month filter excludes ClickBank rows),
    // distribute authoritative totalRevenue proportionally to hourly spend.
    const useSpendProxyForRevenue = rawRevenueSum === 0 && totalRevenue > 0 && rawSpendSum > 0;
    const useEvenRevenueFallback = rawRevenueSum === 0 && totalRevenue > 0 && rawSpendSum === 0;
    const evenRevenuePerHour = useEvenRevenueFallback ? totalRevenue / (lastVisibleHour + 1) : 0;

    let accSpend = 0;
    let accRevenue = 0;
    let accProfit = 0;
    const hourlyProfit: { hour: number; value: number; revenue: number; spend: number }[] = [];

    const data = Array.from({ length: 24 }, (_, h) => {
      let hourProfit = 0;
      let hourSpend = 0;
      let hourRevenue = 0;
      if (h <= lastVisibleHour) {
        hourSpend = useEvenSpendFallback
          ? evenSpendPerHour
          : (spendByHour.get(h) || 0) * spendCorrectionFactor;
        hourRevenue = useEvenRevenueFallback
          ? evenRevenuePerHour
          : useSpendProxyForRevenue
            ? ((spendByHour.get(h) || 0) / rawSpendSum) * totalRevenue
            : (revByHour.get(h) || 0) * revenueCorrectionFactor;

        const lucroBruto = hourRevenue - hourSpend;
        const deductions = hourRevenue > 0 ? hourRevenue * pnlDeductionRate : 0;
        const lucroLiquido = lucroBruto - deductions;
        hourProfit = mode === "liquido" ? lucroLiquido : lucroBruto;

        accSpend += hourSpend;
        accRevenue += hourRevenue;
        accProfit += hourProfit;
      }
      hourlyProfit.push({ hour: h, value: hourProfit, revenue: hourRevenue, spend: hourSpend });


      return {
        label: `${String(h).padStart(2, "0")}:00`,
        hour: h,
        spendAcc: h <= lastVisibleHour ? accSpend : null,
        revenueAcc: h <= lastVisibleHour ? accRevenue : null,
        profitAcc: h <= lastVisibleHour ? accProfit : null,
      };
    });

    const profitValues = data.map(d => d.profitAcc).filter((v): v is number => v !== null);
    const maxProfit = Math.max(...profitValues, 0);
    const minProfit = Math.min(...profitValues, 0);
    const range = maxProfit - minProfit;
    const offset = range === 0 ? 0.5 : maxProfit / range;

    return { chartData: data, gradientOffset: Math.max(0, Math.min(1, offset)), hourlyProfit };
  }, [sales, hourlySpend, totalSpend, totalRevenue, pnlDeductionRate, mode, isTodayResolved, currentHourResolved]);

  if (!sales?.length && !hourlySpend?.length && !(totalSpend > 0)) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Card className="bg-card border border-border">
        <CardContent className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              Faturamento x Investimento x Lucro por Hora (acumulado).
            </h3>
            <div className="flex items-center gap-2">
              <Select value={mode} onValueChange={(v) => setMode(v as LucroMode)}>
                <SelectTrigger className="h-7 w-[100px] text-[11px] bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="liquido">Líquido</SelectItem>
                  <SelectItem value="bruto">Bruto</SelectItem>
                </SelectContent>
              </Select>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[240px] text-[10px]">
                    Acumulado hora a hora: Faturamento (receita), Investimento (gasto Meta) e Lucro ({mode === "liquido" ? "líquido com deduções" : "bruto"})
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Insights bar (based on hourly delta of profit) */}
          <HourlyInsightsBar
            data={hourlyProfit}
            metricLabel={mode === "liquido" ? "Lucro Líquido/h" : "Lucro Bruto/h"}
            formatter={fmtCurrency}
            pivotZero
            currentHour={currentHourResolved}
            detailTitle={`Insights — Lucro ${mode === "liquido" ? "Líquido" : "Bruto"} por Hora`}
          />

          {/* Chart */}
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="accInvest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(25, 95%, 55%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(25, 95%, 55%)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="accFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(210, 100%, 65%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(210, 100%, 65%)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="accLucroStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(145, 70%, 50%)" />
                    <stop offset={`${gradientOffset * 100}%`} stopColor="hsl(145, 70%, 50%)" />
                    <stop offset={`${gradientOffset * 100}%`} stopColor="hsl(0, 75%, 55%)" />
                    <stop offset="100%" stopColor="hsl(0, 75%, 55%)" />
                  </linearGradient>
                  <linearGradient id="accLucroFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(145, 70%, 50%)" stopOpacity={0.35} />
                    <stop offset={`${gradientOffset * 100}%`} stopColor="hsl(145, 70%, 50%)" stopOpacity={0.05} />
                    <stop offset={`${gradientOffset * 100}%`} stopColor="hsl(0, 75%, 55%)" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="hsl(0, 75%, 55%)" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  height={30}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => fmtCurrency(v)}
                  width={90}
                />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value: string) => <span className="text-[11px] text-muted-foreground">{value}</span>}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.3} strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="spendAcc"
                  name="Investimento"
                  stroke="hsl(25, 95%, 55%)"
                  fill="url(#accInvest)"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "hsl(25, 95%, 55%)", strokeWidth: 0 }}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="revenueAcc"
                  name="Faturamento"
                  stroke="hsl(210, 100%, 65%)"
                  fill="url(#accFat)"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "hsl(210, 100%, 65%)", strokeWidth: 0 }}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="profitAcc"
                  name="Lucro"
                  stroke="url(#accLucroStroke)"
                  fill="url(#accLucroFill)"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
