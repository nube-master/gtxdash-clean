import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Target, AlertTriangle, TrendingUp, ArrowUpDown, Brain, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { extractProjectCode } from "@/lib/projectUtils";

interface HourlyPerformanceProps {
  sales: any[];
  trafficData: any[];
  hourlySpendNormalized?: { hour: number; spend: number }[];
  totalSpend?: number;
  totalRevenue?: number;
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function getHourFromTimestamp(created_at: string): number {
  const d = new Date(created_at);
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

type SortKey = "hour" | "spend" | "sales" | "revenue" | "profit" | "cpa" | "roas" | "margin";

interface ProjectBreakdown {
  code: string;
  sales: number;
  revenue: number;
}

interface HourRow {
  hour: string;
  hourNum: number;
  spend: number;
  sales: number;
  revenue: number;
  profit: number;
  cpa: number;
  roas: number;
  margin: number;
  /** Hora corrente: a Meta ainda está consolidando o gasto — ROAS/CPA/Lucro não são confiáveis */
  partial: boolean;
  projects: ProjectBreakdown[];
}


const PROJECT_COLORS: Record<string, string> = {
  NDM: "bg-primary/20 text-primary border-primary/30",
  NDR: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  MO: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  LDG: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  LDR: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  NDB: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  
  CRT: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  OUTROS: "bg-muted text-muted-foreground border-border",
};

/* ── Tooltip ── */
function ChartTooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-[hsl(220,12%,11%)] px-3 py-2 text-[11px] shadow-xl space-y-1">
      <p className="font-semibold text-foreground">
        {d.hour}
        {d.partial && <span className="ml-1.5 text-[9px] font-medium text-amber-400 uppercase tracking-wider">parcial</span>}
      </p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Receita</span>
        <span className="font-data font-medium text-[#24D67E]">{fmtCurrency(d.revenue)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Investimento</span>
        <span className="font-data font-medium text-red">{fmtCurrency(d.spend)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Lucro</span>
        <span className={`font-data font-medium ${d.partial ? "text-muted-foreground" : d.profit > 0 ? "text-[#24D67E]" : d.profit < 0 ? "text-[#F2354A]" : "text-foreground"}`}>
          {d.partial ? "—" : fmtCurrency(d.profit)}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">ROAS</span>
        <span className={`font-data font-medium ${d.partial ? "text-muted-foreground" : "text-foreground"}`}>
          {d.partial ? "—" : `${d.roas.toFixed(2)}x`}
        </span>
      </div>
      {d.sales > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Vendas</span>
          <span className="font-data font-medium text-foreground">{d.sales}</span>
        </div>
      )}
      {d.partial && (
        <p className="pt-1 text-[9px] leading-tight text-amber-400/80 max-w-[180px]">
          Gasto da hora corrente ainda consolidando na Meta (~30-60min de atraso). ROAS e lucro só fecham na próxima hora.
        </p>
      )}
    </div>
  );
}


export function HourlyPerformance({ sales, trafficData, hourlySpendNormalized, totalSpend: dashTotalSpend, totalRevenue: dashTotalRevenue }: HourlyPerformanceProps) {
  const [sortBy, setSortBy] = useState<SortKey>("hour");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("asc");
  const [expandedHours, setExpandedHours] = useState<Set<number>>(new Set());

  const { dateRange } = useDateRange();
  const [startDate, endDate] = dateRange;
  const todayBR = getTodayDateBR();
  const currentHourBR = getCurrentHourBR();

  // Determine if the selected range includes today
  const isToday = endDate === todayBR;
  // For past days show all 24h; for today show up to current hour
  const maxHour = isToday ? currentHourBR : 23;

  const operationId = useOperationId();

  // Use normalized hourly spend if available (timezone-corrected), otherwise fetch raw
  const { data: hourlySpendRaw } = useQuery({
    queryKey: ["hourly-spend-perf", startDate, endDate, operationId],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        let query = supabase
          .from("traffic_data_hourly")
          .select("hour, spend:spend_brl, impressions, clicks")
          .gte("date", startDate)
          .lte("date", endDate);
        if (operationId) query = query.eq("operation_id", operationId);
        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        all = all.concat(data ?? []);
        hasMore = (data?.length ?? 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      return all;
    },
    staleTime: 60_000,
    enabled: !hourlySpendNormalized || hourlySpendNormalized.length === 0,
  });

  const hourlySpend = hourlySpendNormalized && hourlySpendNormalized.length > 0
    ? hourlySpendNormalized
    : hourlySpendRaw;

  const { rows, insights, bestProfit, bestRoas, worstHour, mostConsistent } = useMemo(() => {
    // Build hourly spend map from normalized data
    const hourlySpendMap = new Map<number, number>();
    for (const row of hourlySpend ?? []) {
      hourlySpendMap.set(Number(row.hour), (hourlySpendMap.get(Number(row.hour)) || 0) + Number(row.spend));
    }

    // Fallback: if no hourly data, distribute daily spend evenly
    const totalDailySpend = (trafficData || []).reduce((sum: number, t: any) => sum + Number(t.spend_brl ?? t.spend ?? 0), 0);
    const hasHourlyData = (hourlySpend ?? []).length > 0;

    const hours: Record<number, { revenue: number; sales: number; spend: number }> = {};
    const hourProjects: Record<number, Map<string, { sales: number; revenue: number }>> = {};
    for (let h = 0; h <= maxHour; h++) {
      const spend = hasHourlyData
        ? (hourlySpendMap.get(h) || 0)
        : (totalDailySpend > 0 ? totalDailySpend / (maxHour + 1) : 0);
      hours[h] = { revenue: 0, sales: 0, spend };
      hourProjects[h] = new Map();
    }

    // Populate from merged sales (already deduplicated — includes both CartPanda and RedTrack)
    for (const sale of (sales || [])) {
      const ts = sale.created_at || sale.occurred_at;
      if (!ts) continue;
      const h = getHourFromTimestamp(ts);
      if (h < 0 || h > maxHour) continue;
      if (!hours[h]) { hours[h] = { revenue: 0, sales: 0, spend: 0 }; hourProjects[h] = new Map(); }
      const isUpsell = (sale as any).event_type === "upsell";
      const rev = Number(sale.revenue) || Number(sale.amount) || 0;
      if (!isUpsell) hours[h].sales++;
      hours[h].revenue += rev;

      // Project attribution
      const projCode = extractProjectCode(sale.utm_campaign, sale.store, sale.offer_name, sale.product_name);
      const projMap = hourProjects[h];
      const existing = projMap.get(projCode) || { sales: 0, revenue: 0 };
      if (!isUpsell) existing.sales++;
      existing.revenue += rev;
      projMap.set(projCode, existing);
    }

    // A Meta consolida o bucket horário com ~30-60min de atraso, então a hora corrente
    // (e às vezes a hora que acabou de fechar) chega com gasto muito abaixo do real.
    // Como as vendas são realtime, derivar ROAS/CPA/lucro dessas horas gera número absurdo
    // (ex.: FAHTO 26/08 10h → receita R$4.528 / gasto R$3 = ROAS 1386x).
    // Marca como "parcial": mostra receita/vendas/gasto, mas suprime ROAS/CPA/lucro/margem.
    const partialHours = new Set<number>();
    if (isToday) {
      partialHours.add(currentHourBR);
      // hora que acabou de fechar: parcial se o gasto está < 40% da mediana das 3h anteriores
      const prev = currentHourBR - 1;
      if (prev >= 0) {
        const refs = [prev - 1, prev - 2, prev - 3]
          .filter((h) => h >= 0)
          .map((h) => hours[h]?.spend ?? 0)
          .filter((v) => v > 0)
          .sort((a, b) => a - b);
        const median = refs.length > 0 ? refs[Math.floor(refs.length / 2)] : 0;
        if (median > 0 && (hours[prev]?.spend ?? 0) < median * 0.4) partialHours.add(prev);
      }
    }
    const isPartial = (h: number) => partialHours.has(h);

    // Apply scaling factor so hourly totals match dashboard KPIs (Parity Guard)
    const partialRawSpend = Object.entries(hours).reduce((s, [h, v]) => (isPartial(Number(h)) ? s + v.spend : s), 0);
    const rawTotalSpend = Object.entries(hours).reduce((s, [h, v]) => (isPartial(Number(h)) ? s : s + v.spend), 0);

    const rawTotalRevenue = Object.values(hours).reduce((s, h) => s + h.revenue, 0);
    const dashSpendForScale = typeof dashTotalSpend === "number" ? Math.max(dashTotalSpend - partialRawSpend, 0) : 0;
    const spendScale = rawTotalSpend > 0 && dashSpendForScale > 0
      ? dashSpendForScale / rawTotalSpend : 1;
    const revenueScale = rawTotalRevenue > 0 && typeof dashTotalRevenue === "number" && dashTotalRevenue > 0
      ? dashTotalRevenue / rawTotalRevenue : 1;

    const rows: HourRow[] = Array.from({ length: maxHour + 1 }, (_, h) => {
      const d = hours[h];
      const partial = isPartial(h);
      const spend = partial ? d.spend : d.spend * spendScale;
      const revenue = d.revenue * revenueScale;
      const profit = partial ? 0 : revenue - spend;
      const cpa = !partial && d.sales > 0 ? spend / d.sales : 0;
      const roas = !partial && spend > 0 ? revenue / spend : 0;
      const margin = !partial && revenue > 0 ? (profit / revenue) * 100 : 0;
      const projects: ProjectBreakdown[] = Array.from(hourProjects[h]?.entries() || [])
        .map(([code, data]) => ({ code, sales: data.sales, revenue: data.revenue * revenueScale }))
        .sort((a, b) => b.revenue - a.revenue);
      return { hour: `${String(h).padStart(2, "0")}h`, hourNum: h, spend, sales: d.sales, revenue, profit, cpa, roas, margin, partial, projects };
    });

    // Insights e rankings ignoram a hora parcial
    const active = rows.filter((r) => !r.partial && (r.sales > 0 || r.revenue > 0));

    // Insights
    const bestProfit = active.length > 0 ? [...active].sort((a, b) => b.profit - a.profit)[0] : null;
    const bestRoas = active.filter((r) => r.spend > 0).length > 0 ? [...active].filter((r) => r.spend > 0).sort((a, b) => b.roas - a.roas)[0] : null;
    const worstHour = active.length > 0 ? [...active].sort((a, b) => a.profit - b.profit)[0] : null;


    const avgRevenue = active.length > 0 ? active.reduce((s, r) => s + r.revenue, 0) / active.length : 0;
    const mostConsistent = active.filter((r) => r.revenue >= avgRevenue).length > 0
      ? active.filter((r) => r.revenue >= avgRevenue).sort((a, b) => b.sales - a.sales)[0]
      : null;

    // Smart analysis bullets
    const insights: string[] = [];
    if (bestProfit && bestProfit.profit > 0) {
      insights.push(`${bestProfit.hour} é o horário mais lucrativo (${fmtCurrency(bestProfit.profit)})`);
    }
    if (bestRoas && bestRoas.roas > 1) {
      insights.push(`${bestRoas.hour} apresenta melhor ROAS do dia (${bestRoas.roas.toFixed(2)}x)`);
    }
    if (worstHour && worstHour.profit < 0) {
      insights.push(`${worstHour.hour} apresenta venda mas ROI negativo (${fmtCurrency(worstHour.profit)})`);
    }

    // Revenue concentration
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    if (totalRevenue > 0 && active.length > 3) {
      const sortedByRev = [...active].sort((a, b) => b.revenue - a.revenue);
      let cumRev = 0;
      let topHours = 0;
      for (const r of sortedByRev) {
        cumRev += r.revenue;
        topHours++;
        if (cumRev / totalRevenue >= 0.6) break;
      }
      if (topHours > 0 && topHours < active.length) {
        const pct = ((cumRev / totalRevenue) * 100).toFixed(0);
        const topRange = sortedByRev.slice(0, topHours);
        const minH = Math.min(...topRange.map((r) => r.hourNum));
        const maxH = Math.max(...topRange.map((r) => r.hourNum));
        insights.push(`Horários entre ${String(minH).padStart(2, "0")}h–${String(maxH).padStart(2, "0")}h concentram ${pct}% da receita`);
      }
    }

    // Break-even hour
    let cumProfit = 0;
    let breakEvenHour: number | null = null;
    for (let h = 0; h <= maxHour; h++) {
      cumProfit += rows[h].profit;
      if (breakEvenHour === null && cumProfit > 0 && h > 0) {
        breakEvenHour = h;
      }
    }
    if (breakEvenHour !== null) {
      insights.push(`Lucro acumulado ficou positivo a partir das ${String(breakEvenHour).padStart(2, "0")}h`);
    }

    // Loss streaks
    let lossStart = -1, longestStart = -1, longestEnd = -1, longestLen = 0;
    for (let i = 0; i <= maxHour; i++) {
      if (rows[i].profit < 0) {
        if (lossStart === -1) lossStart = i;
        const len = i - lossStart + 1;
        if (len > longestLen) { longestLen = len; longestStart = lossStart; longestEnd = i; }
      } else lossStart = -1;
    }
    if (longestLen >= 2) {
      insights.push(`Entre ${String(longestStart).padStart(2, "0")}h–${String(longestEnd).padStart(2, "0")}h houve prejuízo contínuo`);
    }

    return { rows, insights, bestProfit, bestRoas, worstHour, mostConsistent };
  }, [sales, trafficData, hourlySpend, maxHour, dashTotalSpend, dashTotalRevenue, isToday, currentHourBR]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(key); setSortDir(key === "hour" ? "asc" : "desc"); }
  };

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aVal = a[sortBy] as number;
      const bVal = b[sortBy] as number;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [rows, sortBy, sortDir]);

  if (!sales?.length) return null;

  const maxProfit = Math.max(...rows.map((r) => Math.abs(r.profit)), 1);

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "hour", label: "Hora" },
    { key: "profit", label: "Lucro" },
    { key: "roas", label: "ROAS" },
    { key: "sales", label: "Vendas" },
    { key: "revenue", label: "Receita" },
    { key: "margin", label: "Margem" },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        Performance por Horário
      </h2>

      {/* ── 1. INSIGHT CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {bestProfit && bestProfit.profit > 0 && (
          <Card className="bg-card border border-wr-positive/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Mais Lucrativo</span>
              </div>
              <p className="text-xl font-bold font-data text-[#24D67E]">{bestProfit.hour}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{fmtCurrency(bestProfit.profit)} lucro • {bestProfit.sales} vendas</p>
            </CardContent>
          </Card>
        )}
        {bestRoas && bestRoas.roas > 0 && (
          <Card className="bg-card border border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Melhor ROAS</span>
              </div>
              <p className="text-xl font-bold font-data text-primary">{bestRoas.hour}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{bestRoas.roas.toFixed(2)}x ROAS • {fmtCurrency(bestRoas.revenue)}</p>
            </CardContent>
          </Card>
        )}
        {worstHour && worstHour.profit < 0 && (
          <Card className="bg-card border border-destructive/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-red" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pior Horário</span>
              </div>
              <p className="text-xl font-bold font-data text-[#F2354A]">{worstHour.hour}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{fmtCurrency(worstHour.profit)} prejuízo</p>
            </CardContent>
          </Card>
        )}
        {mostConsistent && (
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Mais Consistente</span>
              </div>
              <p className="text-xl font-bold font-data text-foreground">{mostConsistent.hour}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{mostConsistent.sales} vendas • {fmtCurrency(mostConsistent.revenue)}</p>
            </CardContent>
          </Card>
        )}
      </div>


      {/* ── 3. ANALYTICAL TABLE ── */}
      <Card className="bg-card border border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Tabela Analítica por Hora
              </h3>
              <span
                title="Lucro exibido é BRUTO (receita − investimento). Não aplica Meta Tax 12,15% nem Rent 5-6%. Para o Lucro Líquido, consulte o KPI no topo do dashboard."
                className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 cursor-help"
              >
                Lucro bruto
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {SORT_OPTIONS.map((opt) => (
                <Button
                  key={opt.key}
                  variant={sortBy === opt.key ? "destructive" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1"
                  onClick={() => handleSort(opt.key)}
                >
                  <ArrowUpDown className="h-2.5 w-2.5" />
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium w-16">Hora</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Invest.</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Vendas</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Receita</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right min-w-[140px]">Lucro</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">CPA</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">ROAS</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => {
                  const barWidth = maxProfit > 0 ? (Math.abs(r.profit) / maxProfit) * 100 : 0;
                  const isPositive = r.profit >= 0;
                  const marginColor = r.margin >= 30 ? "text-success" : r.margin >= 10 ? "text-amber-400" : r.margin > 0 ? "text-foreground" : "text-red";
                  const hasProjects = r.projects.length > 0;
                  const isExpanded = expandedHours.has(r.hourNum);

                  const toggleExpand = () => {
                    setExpandedHours((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.hourNum)) next.delete(r.hourNum);
                      else next.add(r.hourNum);
                      return next;
                    });
                  };

                  return (
                    <>
                      <TableRow
                        key={r.hourNum}
                        className={`border-border ${hasProjects ? "cursor-pointer hover:bg-muted/30" : ""}`}
                        onClick={hasProjects ? toggleExpand : undefined}
                      >
                        <TableCell className="text-xs font-semibold font-data">
                          <div className="flex items-center gap-1">
                            {hasProjects ? (
                              isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            ) : <span className="w-3" />}
                            {r.hour}
                            {r.partial && (
                              <span className="ml-1 px-1 py-[1px] rounded border border-amber-500/30 bg-amber-500/10 text-[8px] font-semibold uppercase tracking-wider text-amber-400">
                                parcial
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={`text-xs font-data text-right ${r.spend > 0 ? (r.partial ? "text-amber-400" : "text-[#F2354A]") : ""}`}>{r.spend > 0 ? fmtCurrency(r.spend) : "—"}</TableCell>
                        <TableCell className={`text-xs font-data text-right font-semibold ${r.sales > 0 ? "text-[#24D67E]" : ""}`}>{r.sales > 0 ? r.sales : "—"}</TableCell>
                        <TableCell className={`text-xs font-data text-right font-semibold ${r.revenue > 0 ? "text-[#24D67E]" : "text-muted-foreground"}`}>{r.revenue > 0 ? fmtCurrency(r.revenue) : "—"}</TableCell>
                        <TableCell className="text-xs font-data text-right">
                          {r.partial ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${isPositive ? "bg-[#24D67E]" : "bg-[#F2354A]"}`}
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                              <span className={`min-w-[60px] text-right font-semibold ${r.profit > 0 ? "text-[#24D67E]" : r.profit < 0 ? "text-[#F2354A]" : "text-foreground"}`}>
                                {fmtCurrency(r.profit)}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={`text-xs font-data text-right font-semibold ${r.cpa > 0 ? (r.cpa <= 100 ? "text-[#24D67E]" : "text-amber-400") : ""}`}>{r.cpa > 0 ? fmtCurrency(r.cpa) : "—"}</TableCell>
                        <TableCell className={`text-xs font-data text-right font-semibold ${r.roas > 0 ? (r.roas >= 1.0 ? "text-[#24D67E]" : "text-[#F2354A]") : ""}`}>{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}</TableCell>
                        <TableCell className={`text-xs font-data text-right font-semibold ${r.margin >= 30 ? "text-[#24D67E]" : r.margin >= 10 ? "text-amber-400" : r.margin > 0 ? "text-foreground" : "text-[#F2354A]"}`}>
                          {!r.partial && r.revenue > 0 ? `${r.margin.toFixed(0)}%` : "—"}

                        </TableCell>
                      </TableRow>
                      {isExpanded && r.projects.map((p) => (
                        <TableRow key={`${r.hourNum}-${p.code}`} className="border-border bg-muted/10">
                          <TableCell className="text-[10px] font-data pl-8">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-semibold ${PROJECT_COLORS[p.code] || PROJECT_COLORS.OUTROS}`}>
                              {p.code}
                            </span>
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-right text-muted-foreground">—</TableCell>
                          <TableCell className="text-[10px] font-data text-right font-semibold">{p.sales > 0 ? p.sales : "—"}</TableCell>
                          <TableCell className="text-[10px] font-data text-right text-[#24D67E]">{p.revenue > 0 ? fmtCurrency(p.revenue) : "—"}</TableCell>
                          <TableCell className="text-[10px] font-data text-right text-muted-foreground" colSpan={4}>
                            {p.sales > 0 && r.spend > 0 ? `~ ${((p.revenue / r.revenue) * 100).toFixed(0)}% da receita` : ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-xs">
                      Nenhuma atividade registrada
                    </TableCell>
                  </TableRow>
                )}
                {sorted.length > 0 && (() => {
                  // Use authoritative totals from dashboard (scaling-aligned)
                  const totSpend = rows.reduce((s, r) => s + r.spend, 0);
                  const totSales = rows.reduce((s, r) => s + r.sales, 0);
                  const totRevenue = rows.reduce((s, r) => s + r.revenue, 0);
                  const totProfit = totRevenue - totSpend;
                  const totCpa = totSales > 0 ? totSpend / totSales : 0;
                  const totRoas = totSpend > 0 ? totRevenue / totSpend : 0;
                  const totMargin = totRevenue > 0 ? (totProfit / totRevenue) * 100 : 0;
                  const isPos = totProfit >= 0;
                  const mColor = totMargin >= 30 ? "text-[#24D67E]" : totMargin >= 10 ? "text-amber-400" : totMargin > 0 ? "text-foreground" : "text-[#F2354A]";
                  return (
                    <TableRow className="border-t-2 border-primary/30 bg-muted/30 font-semibold">
                      <TableCell className="text-xs font-bold font-data">TOTAL</TableCell>
                      <TableCell className="text-xs font-data text-right font-bold">{totSpend > 0 ? fmtCurrency(totSpend) : "—"}</TableCell>
                      <TableCell className="text-xs font-data text-right font-bold">{totSales > 0 ? totSales : "—"}</TableCell>
                      <TableCell className="text-xs font-data text-right font-bold text-[#24D67E]">{totRevenue > 0 ? fmtCurrency(totRevenue) : "—"}</TableCell>
                      <TableCell className="text-xs font-data text-right">
                        <span className={`font-bold ${totProfit > 0 ? "text-[#24D67E]" : totProfit < 0 ? "text-[#F2354A]" : "text-foreground"}`}>{fmtCurrency(totProfit)}</span>
                      </TableCell>
                      <TableCell className="text-xs font-data text-right font-bold">{totCpa > 0 ? fmtCurrency(totCpa) : "—"}</TableCell>
                      <TableCell className="text-xs font-data text-right font-bold">{totRoas > 0 ? `${totRoas.toFixed(2)}x` : "—"}</TableCell>
                      <TableCell className={`text-xs font-data text-right font-bold ${mColor}`}>{totRevenue > 0 ? `${totMargin.toFixed(0)}%` : "—"}</TableCell>
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. SMART ANALYSIS ── */}
      {insights.length > 0 && (
        <Card className="border border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Brain className="h-3.5 w-3.5 text-primary" />
              </div>
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">🧠 Análise Automática Horária</h3>
            </div>
            <div className="space-y-2">
              {insights.map((bullet, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-primary shrink-0 mt-0.5">•</span>
                  <p className="text-foreground">{bullet}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
