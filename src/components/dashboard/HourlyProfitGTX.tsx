import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tooltip as RechartsTooltip } from "recharts";
import { HourlyInsightsBar } from "./HourlyInsightsBar";

interface HourlyProfitGTXProps {
  sales: any[];
  hourlySpend: any[];
  /** Hourly traffic metrics (clicks, link clicks, LP views, ICs) */
  trafficHourly?: any[];
  /** Daily totals from Sky Mode — used as source of truth for consistency */
  totalSpend: number;
  totalRevenue: number;
  /** P&L deduction ratios from financial engine */
  pnlDeductionRate: number; // (variableCosts + commissions + fixedCosts) / revenue — for líquido calc
  /** Whether the selected date range includes today */
  isToday?: boolean;
}

type MetricMode = "liquido" | "bruto" | "receita" | "investimento";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

function fmtCurrencyShort(v: number) {
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

function getTodayDateBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/* ── Bar Label (value on top of each bar) ── */
function BarLabel({ x, y, width, value }: any) {
  if (!value || value === 0) return null;
  return (
    <text
      x={x + width / 2}
      y={value >= 0 ? y - 4 : y + 14}
      textAnchor="middle"
      fontSize={10}
      fontWeight={400}
      fill="hsl(var(--muted-foreground))"
    >
      {fmtCurrencyShort(value)}
    </text>
  );
}

export function HourlyProfitGTX({
  sales, hourlySpend, trafficHourly, totalSpend, totalRevenue, pnlDeductionRate, isToday: isTodayProp,
}: HourlyProfitGTXProps) {
  const [mode, setMode] = useState<MetricMode>("liquido");

  const { chartData } = useMemo(() => {
    const isToday = isTodayProp ?? true;
    const currentHour = isToday ? getCurrentHourBR() : 23;

    // Build hourly spend map
    const spendMap = new Map<number, number>();
    const clicksMap = new Map<number, number>();
    const icMap = new Map<number, number>();
    const lpvMap = new Map<number, number>();

    let rawSpendTotal = 0;
    for (const row of hourlySpend ?? []) {
      const h = Number(row.hour);
      spendMap.set(h, (spendMap.get(h) || 0) + Number(row.spend));
      rawSpendTotal += Number(row.spend);
    }

    // Map other traffic metrics from trafficHourly if available
    for (const row of trafficHourly ?? []) {
      const h = Number(row.hour);
      clicksMap.set(h, (clicksMap.get(h) || 0) + Number(row.clicks || 0));
      icMap.set(h, (icMap.get(h) || 0) + Number(row.initiate_checkout || row.fb_pixel_initiate_checkout || 0));
      lpvMap.set(h, (lpvMap.get(h) || 0) + Number(row.lpv || 0));
    }

    // Scale factor to match authoritative totalSpend
    const spendScale = rawSpendTotal > 0 && totalSpend > 0 ? totalSpend / rawSpendTotal : 1;

    // Build hourly revenue/sales map from merged sales
    const revMap = new Map<number, { revenue: number; sales: number }>();
    let rawRevTotal = 0;
    let rawSalesCount = 0;
    for (const sale of sales ?? []) {
      if (sale.status !== "approved") continue;
      // Prioriza o horário do CLIQUE (track_time) para alinhar com o investimento por hora;
      // o horário da conversão chega ~11min depois e joga ~25% das vendas pra hora seguinte.
      const ts = sale.click_time || sale.created_at || sale.occurred_at;

      if (!ts) continue;
      const h = getHourFromTimestamp(ts);
      if (h < 0 || h > 23) continue;
      const rev = Number(sale.revenue) || Number(sale.amount) || 0;
      const isUpsell = sale.event_type === "upsell";
      const existing = revMap.get(h) || { revenue: 0, sales: 0 };
      existing.revenue += rev;
      if (!isUpsell) {
        existing.sales++;
        rawSalesCount++;
      }
      revMap.set(h, existing);
      rawRevTotal += rev;
    }

    // Fallback: if local sales feed is empty/light but authoritative totals exist,
    // distribute totalRevenue proportionally to hourly spend (revenue follows traffic).
    // This fixes the "month range shows R$0 revenue" bug where sales_data excludes ClickBank.
    const useSpendProxy = rawRevTotal === 0 && totalRevenue > 0 && rawSpendTotal > 0;
    const revScale = rawRevTotal > 0 && totalRevenue > 0 ? totalRevenue / rawRevTotal : 1;

    // Build 24h data
    const data = Array.from({ length: 24 }, (_, h) => {
      const spend = (spendMap.get(h) || 0) * spendScale;
      const revData = revMap.get(h) || { revenue: 0, sales: 0 };
      const revenue = useSpendProxy
        ? (rawSpendTotal > 0 ? ((spendMap.get(h) || 0) / rawSpendTotal) * totalRevenue : (totalRevenue / 24))
        : revData.revenue * revScale;
      const lucroBruto = revenue - spend;
      
      // Líquido: apply deduction rate proportionally
      const deductions = revenue > 0 ? revenue * pnlDeductionRate : spend * pnlDeductionRate;
      const lucroLiquido = lucroBruto - deductions;
      const roas = spend > 0 ? revenue / spend : 0;
      const margin = revenue > 0 ? (lucroLiquido / revenue) * 100 : 0;
      
      const salesCount = useSpendProxy 
        ? (totalRevenue > 0 && rawSalesCount > 0 ? (revenue / totalRevenue) * rawSalesCount : 0)
        : revData.sales;
        
      const clicks = clicksMap.get(h) || 0;
      const ic = icMap.get(h) || 0;
      const lpv = lpvMap.get(h) || 0;
      
      const finalIc = ic;
      const finalClicks = clicks;

      const cac = salesCount > 0 ? spend / salesCount : 0;
      const cpc = finalClicks > 0 ? spend / finalClicks : 0;
      const cpic = finalIc > 0 ? spend / finalIc : 0;

      let value = 0;
      switch (mode) {
        case "liquido": value = lucroLiquido; break;
        case "bruto": value = lucroBruto; break;
        case "receita": value = revenue; break;
        case "investimento": value = spend; break;
      }

      return {
        label: `${String(h).padStart(2, "0")}:00`,
        hour: h,
        value,
        revenue,
        spend,
        lucroBruto,
        lucroLiquido,
        roas,
        margin,
        sales: salesCount,
        clicks: finalClicks,
        ic: finalIc,
        lpv,
        cac,
        cpc,
        cpic,
      };
    });
    // Show all 24 hours; future hours stay at 0 (empty bars) — only for today
    const finalData = isToday ? data.map(d => d.hour > currentHour ? { ...d, value: 0 } : d) : data;

    return { chartData: finalData };
  }, [sales, hourlySpend, trafficHourly, totalSpend, totalRevenue, pnlDeductionRate, mode, isTodayProp]);

  if (!sales?.length && !hourlySpend?.length && !trafficHourly?.length) return null;

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
            Lucro por Horário
          </h3>
          <div className="flex items-center gap-2">
            <Select value={mode} onValueChange={(v) => setMode(v as MetricMode)}>
              <SelectTrigger className="h-7 w-[120px] text-[11px] bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="liquido">Líquido</SelectItem>
                <SelectItem value="bruto">Bruto</SelectItem>
                <SelectItem value="receita">Receita</SelectItem>
                <SelectItem value="investimento">Investimento</SelectItem>
              </SelectContent>
            </Select>
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-[10px]">
                  Lucro Líquido = Receita − Investimento − Impostos − Custos Variáveis − Comissões − Custos Fixos (proporcional por hora)
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Insights bar */}
        <HourlyInsightsBar
          data={chartData.map(d => ({
            hour: d.hour,
            value: d.value,
            revenue: d.revenue,
            spend: d.spend,
            sales: d.sales,
            roas: d.roas,
            clicks: d.clicks,
            ic: d.ic,
            lpv: d.lpv,
            cac: d.cac,
            cpic: d.cpic,
            lucroLiquido: d.lucroLiquido,
          }))}
          metricLabel={
            mode === "liquido" ? "Lucro Líquido" :
            mode === "bruto" ? "Lucro Bruto" :
            mode === "receita" ? "Receita" : "Investimento"
          }
          formatter={fmtCurrencyShort}
          pivotZero={mode === "liquido" || mode === "bruto"}
          currentHour={isTodayProp ?? true ? getCurrentHourBR() : 23}
          detailTitle={`Insights — ${
            mode === "liquido" ? "Lucro Líquido" :
            mode === "bruto" ? "Lucro Bruto" :
            mode === "receita" ? "Receita" : "Investimento"
          } por Hora`}
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
                tickFormatter={(v) => fmtCurrencyShort(v)}
                width={70}
              />
              {(mode === "liquido" || mode === "bruto") && (
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.3} />
              )}
              <RechartsTooltip
                cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d: any = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-[11px] space-y-1">
                      <p className="font-semibold text-foreground mb-1">Horário: {d.label}</p>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Receita:</span><span className="font-data text-foreground">{fmtCurrency(d.revenue)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Investimento:</span><span className="font-data text-foreground">{fmtCurrency(d.spend)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Lucro Bruto:</span><span className={`font-data ${d.lucroBruto > 0 ? "text-success" : d.lucroBruto < 0 ? "text-red" : "text-foreground"}`}>{fmtCurrency(d.lucroBruto)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Lucro Líquido:</span><span className={`font-data ${d.lucroLiquido > 0 ? "text-success" : d.lucroLiquido < 0 ? "text-red" : "text-foreground"}`}>{fmtCurrency(d.lucroLiquido)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Vendas:</span><span className="font-data text-foreground">{d.sales}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Cliques:</span><span className="font-data text-foreground">{d.clicks}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">IC:</span><span className="font-data text-foreground">{d.ic}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">CAC:</span><span className="font-data text-foreground">{fmtCurrency(d.cac)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Custo/IC:</span><span className="font-data text-foreground">{fmtCurrency(d.cpic)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">ROAS:</span><span className="font-data text-foreground">{d.roas.toFixed(2)}x</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Margem:</span><span className="font-data text-foreground">{d.margin.toFixed(1)}%</span></div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40} label={<BarLabel />}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={
                      mode === "investimento" || mode === "receita"
                        ? "hsl(var(--primary))"
                        : entry.value >= 0
                          ? "#24D67E"
                          : "#F2354A"
                    }
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        {(mode === "liquido" || mode === "bruto") && (
          <div className="flex items-center gap-4 mt-3 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#24D67E" }} /> Lucro +
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#F2354A" }} /> Prejuízo −
            </span>
          </div>
        )}
      </CardContent>
    </Card>
    </motion.div>
  );
}
