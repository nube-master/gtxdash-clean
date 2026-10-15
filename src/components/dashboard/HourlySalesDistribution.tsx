import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HourlyInsightsBar } from "./HourlyInsightsBar";

interface HourlySalesDistributionProps {
  sales: any[];
  isToday?: boolean;
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

function BarLabel({ x, y, width, value }: any) {
  if (!value || value === 0) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 4}
      textAnchor="middle"
      fontSize={10}
      fontWeight={400}
      fill="hsl(var(--muted-foreground))"
    >
      {value.toFixed(1)}%
    </text>
  );
}

export function HourlySalesDistribution({ sales, isToday: isTodayProp }: HourlySalesDistributionProps) {
  const chartData = useMemo(() => {
    const isToday = isTodayProp ?? true;
    const currentHour = isToday ? getCurrentHourBR() : 23;

    // Count sales per hour
    const salesMap = new Map<number, number>();
    let totalSales = 0;
    for (const sale of sales ?? []) {
      if (sale.status !== "approved") continue;
      const ts = sale.created_at || sale.occurred_at;
      if (!ts) continue;
      const isUpsell = sale.event_type === "upsell";
      if (isUpsell) continue;
      const h = getHourFromTimestamp(ts);
      if (h < 0 || h > 23) continue;
      salesMap.set(h, (salesMap.get(h) || 0) + 1);
      totalSales++;
    }

    return Array.from({ length: 24 }, (_, h) => {
      const count = salesMap.get(h) || 0;
      const pct = totalSales > 0 ? (count / totalSales) * 100 : 0;
      return {
        label: `${String(h).padStart(2, "0")}:00`,
        hour: h,
        value: (isToday && h > currentHour) ? 0 : pct,
        sales: count,
      };
    });
  }, [sales, isTodayProp]);

  if (!sales?.length) return null;

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
              Vendas por Horário
            </h3>
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-[10px]">
                  Distribuição percentual de vendas aprovadas por hora do dia (horário de Brasília)
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </div>

          {/* Insights bar */}
          <HourlyInsightsBar
            data={chartData.map(d => ({ hour: d.hour, value: d.value, sales: d.sales }))}
            metricLabel="% Vendas"
            formatter={(v) => `${v.toFixed(1)}%`}
            pivotZero={false}
            currentHour={isTodayProp ?? true ? getCurrentHourBR() : 23}
            detailTitle="Insights — Distribuição de Vendas"
          />

          {/* Chart */}
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="8%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
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
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                  width={40}
                />
                <RechartsTooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-xs">
                        <p className="font-semibold text-foreground mb-1">Horário: {d.label}</p>
                        <p className="text-muted-foreground">Vendas: <span className="font-data font-medium text-foreground">{d.sales}</span></p>
                        <p className="text-muted-foreground">Participação: <span className="font-data font-medium text-foreground">{d.value.toFixed(1)}%</span></p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40} label={<BarLabel />}>
                  {chartData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill="hsl(var(--primary))"
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
