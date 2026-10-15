import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { usePlanningGoals } from "@/hooks/usePlanningGoals";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Trophy, AlertTriangle } from "lucide-react";

interface DailyRow {
  date: string;
  revenue: number;
  sales: number;
  spend: number;
  cpa: number;
  margin: number;
}

function fmt(value: number, type: "currency" | "number" | "percent" | "roas") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(value));
  if (type === "percent") return `${value.toFixed(1)}%`;
  if (type === "roas") return `${value.toFixed(2)}x`;
  return String(value);
}

type DayStatus = "strong" | "neutral" | "critical";

function getDayStatus(row: DailyRow, cpaGoal: number, minRoas: number): DayStatus {
  const roas = row.spend > 0 ? row.revenue / row.spend : 0;
  if (row.cpa > 0 && row.cpa <= cpaGoal && row.margin >= 30 && roas >= minRoas) return "strong";
  if (row.cpa > 0 && row.cpa > cpaGoal * 1.3) return "critical";
  if (row.margin < 10) return "critical";
  if (roas > 0 && roas < minRoas * 0.7) return "critical";
  return "neutral";
}

const STATUS_CONFIG: Record<DayStatus, { label: string; className: string }> = {
  strong: { label: "Dia Forte", className: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" },
  neutral: { label: "Neutro", className: "border-amber-500/30 text-amber-400 bg-amber-500/10" },
  critical: { label: "Crítico", className: "border-red-500/30 text-red-400 bg-red-500/10" },
};

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 1) return <Minus className="h-3 w-3 text-muted-foreground inline ml-1" />;
  if (diff > 0) return <TrendingUp className="h-3 w-3 text-emerald-400 inline ml-1" />;
  return <TrendingDown className="h-3 w-3 text-red-400 inline ml-1" />;
}

export default function DailyPerformanceModule({
  dailyData,
  pnlDeductionRate = 0,
  dailyNetProfitByDate,
  skyTotals,
  totalNetProfit,
}: {
  dailyData: DailyRow[];
  pnlDeductionRate?: number;
  dailyNetProfitByDate?: Record<string, number>;
  skyTotals?: { totalRevenue: number; totalSpend: number; totalConversions: number };
  totalNetProfit?: number;
}) {
  const { data: goals } = usePlanningGoals();

  const { enriched, chartData, bestDay, worstDay, projection7d, totals } = useMemo(() => {
    if (!dailyData.length) return { enriched: [], chartData: [], bestDay: null, worstDay: null, projection7d: 0, totals: { revenue: 0, spend: 0, sales: 0, profit: 0 } };

    const startDate = goals?.start_date ? new Date(goals.start_date) : null;
    const endDate = goals?.end_date ? new Date(goals.end_date) : null;
    const totalDaysInPeriod = startDate && endDate
      ? Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      : 30;

    const dailySalesGoal = goals ? Math.ceil(goals.sales_goal / totalDaysInPeriod) : 0;
    const dailyRevenueGoal = goals ? goals.revenue_goal / totalDaysInPeriod : 0;
    const cpaGoal = goals?.cpa_goal || 0;
    const minRoas = cpaGoal > 0 && goals ? goals.average_product_price / cpaGoal : 1.5;

    const enriched = dailyData.map((row, i) => {
      const roas = row.spend > 0 ? row.revenue / row.spend : 0;
      const status = getDayStatus(row, cpaGoal, minRoas);
      const diffVsMeta = row.sales - dailySalesGoal;
      const prev = i > 0 ? dailyData[i - 1] : null;

      return {
        ...row,
        roas,
        dailySalesGoal,
        diffVsMeta,
        cpaAllowed: cpaGoal,
        status,
        prevRevenue: prev?.revenue || 0,
        prevSales: prev?.sales || 0,
      };
    });

    const chartData = enriched.map((r) => ({
      date: r.date.slice(5).replace("-", "/"),
      revenue: r.revenue,
      spend: r.spend,
      margin: r.margin,
    }));

    let bestDay: typeof enriched[0] | null = null;
    let worstDay: typeof enriched[0] | null = null;
    for (const row of enriched) {
      if (!bestDay || row.margin > bestDay.margin) bestDay = row;
      if (!worstDay || (row.spend > 0 && row.margin < worstDay.margin)) worstDay = row;
    }

    // 7-day average projection
    const last7 = enriched.slice(-7);
    const avgRevenue = last7.length > 0 ? last7.reduce((s, r) => s + r.revenue, 0) / last7.length : 0;
    const remainingDays = startDate && endDate
      ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;
    const projection7d = avgRevenue * remainingDays;

    const totals = enriched.reduce((acc, r) => ({
      revenue: acc.revenue + r.revenue,
      spend: acc.spend + r.spend,
      sales: acc.sales + r.sales,
      profit: acc.profit + (r.revenue - r.spend),
    }), { revenue: 0, spend: 0, sales: 0, profit: 0 });

    return { enriched, chartData, bestDay, worstDay, projection7d, totals };
  }, [dailyData, goals]);

  const getNetProfit = (row: (typeof enriched)[number]) => {
    if (dailyNetProfitByDate && typeof dailyNetProfitByDate[row.date] === "number") {
      return dailyNetProfitByDate[row.date];
    }
    const grossProfit = row.revenue - row.spend;
    const deductions = row.revenue > 0 ? row.revenue * pnlDeductionRate : 0;
    return grossProfit - deductions;
  };

  if (!dailyData.length) return null;

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Performance Diária — Módulo Estratégico
          </h3>
          {goals && projection7d > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Projeção (média 7d): <span className="text-foreground font-medium">{fmt(projection7d, "currency")}</span>
            </span>
          )}
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-2 gap-3">
          {bestDay && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <Trophy className="h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <p className="text-[10px] uppercase text-emerald-400 font-medium">Melhor Dia</p>
                <p className="text-xs text-foreground font-data">
                  {bestDay.date.slice(5).replace("-", "/")} — {fmt(bestDay.revenue, "currency")} · {fmt(bestDay.margin, "percent")} margem
                </p>
              </div>
            </div>
          )}
          {worstDay && worstDay !== bestDay && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <div>
                <p className="text-[10px] uppercase text-red-400 font-medium">Pior Dia</p>
                <p className="text-xs text-foreground font-data">
                  {worstDay.date.slice(5).replace("-", "/")} — {fmt(worstDay.revenue, "currency")} · {fmt(worstDay.margin, "percent")} margem
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Chart: Revenue, Spend, Margin */}
        {chartData.length > 1 && (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="fillRevDaily" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(145, 80%, 42%)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(145, 80%, 42%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillSpendDaily" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(0, 75%, 55%)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(0, 75%, 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 8%, 16%)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(220, 6%, 50%)" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "hsl(220, 6%, 50%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "hsl(220, 6%, 50%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(220, 12%, 11%)", border: "1px solid hsl(220, 8%, 16%)", borderRadius: "8px", fontSize: "11px" }}
                  formatter={(v: number, name: string) => {
                    if (name === "Margem %") return [`${v.toFixed(1)}%`, name];
                    return [`R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Area yAxisId="left" type="monotone" dataKey="revenue" name="Receita" stroke="hsl(145, 80%, 42%)" fill="url(#fillRevDaily)" strokeWidth={2} />
                <Area yAxisId="left" type="monotone" dataKey="spend" name="Gasto" stroke="hsl(0, 75%, 55%)" fill="url(#fillSpendDaily)" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="margin" name="Margem %" stroke="hsl(45, 90%, 55%)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Data</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Gasto</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">CPA</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">CPA Meta</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Vendas</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Meta</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Δ Meta</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Faturamento</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Lucro Bruto</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Lucro Líquido</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">ROI</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">ROAS</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Margem</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enriched.map((row) => {
                const cfg = STATUS_CONFIG[row.status];
                const grossProfit = row.revenue - row.spend;
                const netProfit = getNetProfit(row);
                const roi = row.spend > 0 ? (netProfit / row.spend) * 100 : 0;
                const diffColor = row.diffVsMeta > 0
                  ? "text-emerald-400"
                  : row.diffVsMeta < 0
                    ? "text-red-400"
                    : "text-muted-foreground";
                const cpaColor = row.cpa > 0 && row.cpaAllowed > 0
                  ? row.cpa <= row.cpaAllowed ? "text-emerald-400" : "text-red-400"
                  : "";
                const roasColor = row.roas >= 2 ? "text-emerald-400" : row.roas >= 1 ? "text-amber-400" : row.roas > 0 ? "text-red-400" : "";
                const marginColor = row.margin >= 30 ? "text-emerald-400" : row.margin >= 10 ? "text-amber-400" : row.spend > 0 ? "text-red-400" : "";
                const netColor = netProfit >= 0 ? "text-emerald-400" : "text-red-400";
                const roiColor = roi >= 30 ? "text-emerald-400" : roi >= 10 ? "text-amber-400" : roi > 0 ? "text-red-400" : "text-red-400";

                return (
                  <TableRow key={row.date} className="border-border hover:bg-muted/30">
                    <TableCell className="text-xs font-data">
                      {row.date.slice(5).replace("-", "/")}
                      <TrendIndicator current={row.revenue} previous={row.prevRevenue} />
                    </TableCell>
                    <TableCell className="text-xs font-data text-right">{row.spend > 0 ? fmt(row.spend, "currency") : "—"}</TableCell>
                    <TableCell className={`text-xs font-data text-right ${cpaColor}`}>{row.cpa > 0 ? fmt(row.cpa, "currency") : "—"}</TableCell>
                    <TableCell className="text-xs font-data text-right text-muted-foreground">{row.cpaAllowed > 0 ? fmt(row.cpaAllowed, "currency") : "—"}</TableCell>
                    <TableCell className="text-xs font-data text-right">
                      {row.sales}
                      <TrendIndicator current={row.sales} previous={row.prevSales} />
                    </TableCell>
                    <TableCell className="text-xs font-data text-right text-muted-foreground">{row.dailySalesGoal > 0 ? row.dailySalesGoal : "—"}</TableCell>
                    <TableCell className={`text-xs font-data text-right ${diffColor}`}>
                      {row.dailySalesGoal > 0 ? (row.diffVsMeta > 0 ? `+${row.diffVsMeta}` : row.diffVsMeta) : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-data text-right">{fmt(row.revenue, "currency")}</TableCell>
                    <TableCell className={`text-xs font-data text-right ${grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {row.spend > 0 ? fmt(grossProfit, "currency") : "—"}
                    </TableCell>
                    <TableCell className={`text-xs font-data text-right font-medium ${row.spend > 0 ? netColor : ""}`}>
                      {row.spend > 0 ? fmt(netProfit, "currency") : "—"}
                    </TableCell>
                    <TableCell className={`text-xs font-data text-right ${row.spend > 0 ? roiColor : ""}`}>
                      {row.spend > 0 ? fmt(roi, "percent") : "—"}
                    </TableCell>
                    <TableCell className={`text-xs font-data text-right ${roasColor}`}>{row.roas > 0 ? fmt(row.roas, "roas") : "—"}</TableCell>
                    <TableCell className={`text-xs font-data text-right ${marginColor}`}>{row.spend > 0 ? fmt(row.margin, "percent") : "—"}</TableCell>
                    <TableCell className="text-center">
                      {row.spend > 0 ? (
                        <Badge variant="outline" className={`text-[9px] font-medium ${cfg.className}`}>
                          {cfg.label}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <tfoot>
              {(() => {
                // Use skyTotals as authoritative reference when available (ensures parity with KPI cards)
                const footRevenue = skyTotals?.totalRevenue ?? totals.revenue;
                const footSpend = skyTotals?.totalSpend ?? totals.spend;
                const footSales = skyTotals?.totalConversions ?? totals.sales;
                const footProfit = footRevenue - footSpend;
                const fallbackDeductions = footRevenue > 0 ? footRevenue * pnlDeductionRate : 0;
                const footNetProfit = totalNetProfit ?? (footProfit - fallbackDeductions);
                const footRoi = footSpend > 0 ? (footNetProfit / footSpend) * 100 : 0;
                return (
                  <TableRow className="border-t-2 border-border bg-muted/30">
                    <TableCell className="text-xs font-bold uppercase">Total</TableCell>
                    <TableCell className="text-xs font-bold text-right">{fmt(footSpend, "currency")}</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-xs font-bold text-right">{footSales}</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-xs font-bold text-right">{fmt(footRevenue, "currency")}</TableCell>
                    <TableCell className={`text-xs font-bold text-right ${footProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(footProfit, "currency")}
                    </TableCell>
                    <TableCell className={`text-xs font-bold text-right ${footNetProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(footNetProfit, "currency")}
                    </TableCell>
                    <TableCell className={`text-xs font-bold text-right ${footRoi >= 30 ? "text-emerald-400" : footRoi >= 10 ? "text-amber-400" : "text-red-400"}`}>
                      {footSpend > 0 ? fmt(footRoi, "percent") : "—"}
                    </TableCell>
                    <TableCell className={`text-xs font-bold text-right ${footSpend > 0 ? (footRevenue / footSpend >= 2 ? "text-emerald-400" : footRevenue / footSpend >= 1 ? "text-amber-400" : "text-red-400") : ""}`}>
                      {footSpend > 0 ? fmt(footRevenue / footSpend, "roas") : "—"}
                    </TableCell>
                    <TableCell className={`text-xs font-bold text-right ${footRevenue > 0 ? ((footProfit / footRevenue) * 100 >= 30 ? "text-emerald-400" : (footProfit / footRevenue) * 100 >= 10 ? "text-amber-400" : "text-red-400") : ""}`}>
                      {footRevenue > 0 ? fmt((footProfit / footRevenue) * 100, "percent") : "—"}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                );
              })()}
            </tfoot>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
