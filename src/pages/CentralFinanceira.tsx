import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { useRealSalesByRange, useTrafficSpendByAccount } from "@/hooks/useDataByRange";
import { useVariableCosts, useTeamMembers, useFixedCosts, useManualAdjustments } from "@/hooks/useFinancialData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculatePnL } from "@/lib/financialEngine";
import { useRedTrackSales } from "@/hooks/useRedTrackSales";
import { mergeAllSales } from "@/lib/salesMerge";
import { useDashboardTotals } from "@/hooks/useDashboardTotals";

import { VariableCostsModule } from "@/components/financial/VariableCostsModule";
import { TeamMembersModule } from "@/components/financial/TeamMembersModule";
import { FixedCostsModule } from "@/components/financial/FixedCostsModule";
import { ManualAdjustmentsModule } from "@/components/financial/ManualAdjustmentsModule";
import { PnLSummary } from "@/components/financial/PnLSummary";
import { MetaFinancialModule } from "@/components/financial/MetaFinancialModule";
import { MonthlyGoalCard } from "@/components/financial/MonthlyGoalCard";
import { MonthlyGoalsHistory } from "@/components/financial/MonthlyGoalsHistory";
import {
  DollarSign, TrendingUp, Receipt, Users, Landmark, Calculator, Percent, PiggyBank,
  Gauge, MousePointerClick, Clock, Wallet,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function marginColor(pct: number) {
  if (pct >= 40) return "text-wr-positive";
  if (pct >= 30) return "text-yellow-500";
  return "text-destructive";
}

export default function CentralFinanceira() {
  const { dateRange, rangeKey } = useDateRange();
  const [start, end] = dateRange;

  const { data: salesRaw = [] } = useRealSalesByRange(start, end);
  const { data: redTrackSales = [] } = useRedTrackSales();
  const { data: traffic = [] } = useTrafficSpendByAccount(start, end);
  const { data: skyTotals } = useDashboardTotals();
  

  // Merge CartPanda + RedTrack using smart per-date dedup (same as Dashboard)
  const sales = useMemo(() => mergeAllSales(salesRaw, redTrackSales), [salesRaw, redTrackSales]);
  const { data: variableCosts = [] } = useVariableCosts();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: fixedCosts = [] } = useFixedCosts();
  const { data: manualAdjustments = [] } = useManualAdjustments();

  const opId = useOperationId();
  const { data: accounts = [] } = useQuery({
    queryKey: ["meta-accounts-financial", opId],
    queryFn: async () => {
      let q = supabase.from("meta_ad_accounts").select("account_id, currency").eq("is_active", true);
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const pnl = useMemo(() => {
    // Client-side values as fallback
    const clientRevenue = sales.reduce((sum: number, s: any) => sum + Number(s.revenue), 0);
    const clientSpend = traffic.reduce((sum: number, t: any) => sum + Number(t.spend), 0);

    // Use skyTotals as authoritative source (same as Dashboard) for consistency
    const revenue = skyTotals?.totalRevenue ?? clientRevenue;
    const trafficSpend = skyTotals?.totalSpend ?? clientSpend;

    // Calculate period days
    const startDate = new Date(start + "T00:00:00");
    const endDate = new Date(end + "T00:00:00");
    const periodDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);

    // Manual adjustments only apply when the selected period covers February 2025
    const startD = new Date(start + "T00:00:00");
    const endD = new Date(end + "T23:59:59");
    const feb2026Start = new Date("2026-02-01T00:00:00");
    const feb2026End = new Date("2026-02-28T23:59:59");
    const includeManual = startD <= feb2026End && endD >= feb2026Start;

    return calculatePnL(
      revenue,
      trafficSpend,
      traffic as any,
      accounts as any,
      variableCosts as any,
      teamMembers as any,
      fixedCosts as any,
      periodDays,
      manualAdjustments as any,
      includeManual,
    );
  }, [sales, traffic, variableCosts, teamMembers, fixedCosts, accounts, manualAdjustments, start, end, skyTotals]);

  // ── Derived new metrics (no existing calculations changed) ──
  const grossProfit = pnl.revenue - pnl.investment;
  const grossMarginPct = pnl.revenue > 0 ? (grossProfit / pnl.revenue) * 100 : 0;
  const netMarginPct = pnl.revenue > 0 ? (pnl.operatingProfit / pnl.revenue) * 100 : 0;

  const totalClicks = skyTotals?.totalClicks ?? 0;
  const rpc = totalClicks > 0 ? pnl.revenue / totalClicks : 0;

  // Break Even ROAS = total costs / revenue threshold where profit = 0
  // i.e., totalCosts / investment (how much ROAS you need to break even)
  const totalOperationalCosts = pnl.variableCostsTotal + pnl.commissionsTotal + pnl.fixedCostsTotal + pnl.manualAdjustmentsTotal;
  const breakEvenRoas = pnl.investment > 0 ? (pnl.investment + totalOperationalCosts) / pnl.investment : 0;

  // Velocity metrics (only for today)
  const nowBr = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const todayBr = `${nowBr.getFullYear()}-${String(nowBr.getMonth() + 1).padStart(2, "0")}-${String(nowBr.getDate()).padStart(2, "0")}`;
  const isToday = start === todayBr && end === todayBr;
  const hoursElapsed = isToday ? Math.max(1, nowBr.getHours() + nowBr.getMinutes() / 60) : 0;
  const revenuePerHour = isToday && hoursElapsed > 0 ? pnl.revenue / hoursElapsed : 0;
  const profitPerHour = isToday && hoursElapsed > 0 ? pnl.operatingProfit / hoursElapsed : 0;

  // Cost metrics
  const operationalCost = pnl.variableCostsTotal + pnl.commissionsTotal + pnl.fixedCostsTotal;
  const totalCost = pnl.investment + operationalCost;

  // ── Existing summary cards (unchanged) ──
  const summaryCards = [
    { label: "Receita Bruta", value: fmtCurrency(pnl.revenue), icon: DollarSign, positive: true },
    { label: "Investimento", value: fmtCurrency(pnl.investment), icon: TrendingUp, negative: true },
    { label: "Lucro Bruto", value: fmtCurrency(grossProfit), icon: Calculator, dynamic: true, amount: grossProfit },
    { label: "Impostos & Var.", value: fmtCurrency(pnl.variableCostsTotal), icon: Receipt, negative: true },
    { label: "Comissões", value: fmtCurrency(pnl.commissionsTotal), icon: Users, negative: true },
    { label: "Custos Fixos", value: fmtCurrency(pnl.fixedCostsTotal), icon: Landmark, negative: true },
    { label: "Lucro Operacional", value: fmtCurrency(pnl.operatingProfit), icon: PiggyBank, dynamic: true, amount: pnl.operatingProfit },
    { label: "Margem Real", value: `${pnl.operatingMargin.toFixed(1)}%`, icon: Percent, dynamic: true, amount: pnl.operatingMargin },
  ];

  // ── New metric rows ──
  const efficiencyCards = [
    {
      label: "Margem Bruta",
      value: `${grossMarginPct.toFixed(1)}%`,
      icon: Gauge,
      colorClass: marginColor(grossMarginPct),
    },
    {
      label: "Margem Líquida",
      value: `${netMarginPct.toFixed(1)}%`,
      icon: Gauge,
      colorClass: marginColor(netMarginPct),
    },
    {
      label: "RPC",
      value: fmtCurrency(rpc),
      icon: MousePointerClick,
      colorClass: "text-foreground",
    },
    {
      label: "Break Even ROAS",
      value: breakEvenRoas.toFixed(2) + "x",
      icon: TrendingUp,
      colorClass: "text-foreground",
    },
  ];

  const costCards = [
    { label: "Custo Operacional", value: fmtCurrency(operationalCost), icon: Wallet, colorClass: "text-destructive" },
    { label: "Custo Total", value: fmtCurrency(totalCost), icon: Wallet, colorClass: "text-destructive" },
  ];

  const velocityCards = isToday ? [
    { label: "Receita / Hora", value: fmtCurrency(revenuePerHour), icon: Clock, colorClass: "text-foreground" },
    { label: "Lucro / Hora", value: fmtCurrency(profitPerHour), icon: Clock, colorClass: profitPerHour >= 0 ? "text-wr-positive" : "text-destructive" },
  ] : [];

  // Daily chart data
  const chartData = useMemo(() => {
    const dateMap = new Map<string, { revenue: number; spend: number }>();
    for (const s of (sales as any[])) {
      const d = s.date;
      if (!dateMap.has(d)) dateMap.set(d, { revenue: 0, spend: 0 });
      dateMap.get(d)!.revenue += Number(s.revenue);
    }
    for (const t of (traffic as any[])) {
      const d = t.date;
      if (!dateMap.has(d)) dateMap.set(d, { revenue: 0, spend: 0 });
      dateMap.get(d)!.spend += Number(t.spend);
    }
    return Array.from(dateMap.entries())
      .map(([date, d]) => ({
        date: date.slice(5).replace("-", "/"),
        fullDate: date,
        receita: d.revenue,
        investimento: d.spend,
        lucro: d.revenue - d.spend,
      }))
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [sales, traffic]);

  return (
    <div className="full-width-page space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Central Financeira</h1>
        <p className="text-sm text-muted-foreground font-mono">Engine financeira da operação • P&L em tempo real</p>
      </div>

      {/* META DO MÊS */}
      <MonthlyGoalCard />

      {/* P&L Summary Cards (existing — unchanged) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 md:gap-3">
        {summaryCards.map(({ label, value, icon: Icon, positive, negative, dynamic, amount }) => {
          let colorClass = "text-foreground";
          if (positive) colorClass = "text-wr-positive";
          if (negative) colorClass = "text-destructive";
          if (dynamic) colorClass = (amount ?? 0) >= 0 ? "text-wr-positive" : "text-destructive";
          return (
            <Card key={label} className="mobile-kpi-card bg-card border border-border">
              <CardContent className="px-5 py-4 md:p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] md:text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
                  <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
                </div>
                <div className={`text-[28px] md:text-sm font-bold font-mono leading-tight ${colorClass}`}>{value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* NEW — Eficiência Financeira + Aquisição */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        {efficiencyCards.map(({ label, value, icon: Icon, colorClass }) => (
          <Card key={label} className="mobile-kpi-card bg-card border border-border">
            <CardContent className="px-5 py-4 md:p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] md:text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
                <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
              </div>
              <div className={`text-[28px] md:text-sm font-bold font-mono leading-tight ${colorClass}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* NEW — Custos Consolidados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        {costCards.map(({ label, value, icon: Icon, colorClass }) => (
          <Card key={label} className="mobile-kpi-card bg-card border border-border">
            <CardContent className="px-5 py-4 md:p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] md:text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
                <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
              </div>
              <div className={`text-[28px] md:text-sm font-bold font-mono leading-tight ${colorClass}`}>{value}</div>
            </CardContent>
          </Card>
        ))}

        {/* NEW — Velocidade (only when viewing today) */}
        {velocityCards.map(({ label, value, icon: Icon, colorClass }) => (
          <Card key={label} className="mobile-kpi-card bg-card border border-border">
            <CardContent className="px-5 py-4 md:p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] md:text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
                <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
              </div>
              <div className={`text-[28px] md:text-sm font-bold font-mono leading-tight ${colorClass}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* P&L Detailed Breakdown */}
      <PnLSummary pnl={pnl} />

      {/* Monthly Goals History */}
      <MonthlyGoalsHistory />

      {/* Evolution Chart */}
      {chartData.length > 1 && (
        <Card className="bg-card border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
              Evolução Diária — Receita × Investimento × Lucro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--wr-positive))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--wr-positive))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillInvest" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillLucro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => [fmtCurrency(value), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="receita" name="Receita" stroke="hsl(var(--wr-positive))" fill="url(#fillReceita)" strokeWidth={2} />
                  <Area type="monotone" dataKey="investimento" name="Investimento" stroke="hsl(var(--destructive))" fill="url(#fillInvest)" strokeWidth={2} />
                  <Area type="monotone" dataKey="lucro" name="Lucro Bruto" stroke="hsl(var(--primary))" fill="url(#fillLucro)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meta Ads Financial Control */}
      <MetaFinancialModule />

      {/* Configuration Modules */}
      <Tabs defaultValue="variable" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="variable" className="text-xs font-mono">Custos Variáveis</TabsTrigger>
          <TabsTrigger value="team" className="text-xs font-mono">Comissões</TabsTrigger>
          <TabsTrigger value="fixed" className="text-xs font-mono">Custos Fixos</TabsTrigger>
          <TabsTrigger value="adjustments" className="text-xs font-mono">Reajuste Manual</TabsTrigger>
        </TabsList>

        <TabsContent value="variable">
          <VariableCostsModule />
        </TabsContent>
        <TabsContent value="team">
          <TeamMembersModule />
        </TabsContent>
        <TabsContent value="fixed">
          <FixedCostsModule />
        </TabsContent>
        <TabsContent value="adjustments">
          <ManualAdjustmentsModule />
        </TabsContent>
      </Tabs>
    </div>
  );
}
