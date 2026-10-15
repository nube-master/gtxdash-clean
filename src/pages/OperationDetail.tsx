import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useOperation } from "@/contexts/OperationContext";
import {
  useDashboardConsolidated,
  type ConsolidatedRange,
  type ConsolidatedCurrency,
} from "@/hooks/useDashboardConsolidated";
import { useOperationDashboardTotals, rangeToDates, type OpRange } from "@/hooks/useOperationDashboardTotals";
import { useOperationDailyBreakdown } from "@/hooks/useOperationDailyBreakdown";
import { SpaceCommissionCard } from "@/components/operations/SpaceCommissionCard";
import { useCommissionConfig } from "@/hooks/useCommissionCalc";
import { useTrafficInfraCost } from "@/hooks/useTrafficInfraCost";
import { calcCommission } from "@/lib/spaceCommission";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";


import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, ArrowLeft, RefreshCw, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const RANGES: { value: OpRange; label: string; days: number }[] = [
  { value: "today", label: "Hoje", days: 1 },
  { value: "yesterday", label: "Ontem", days: 1 },
  { value: "7d", label: "7 dias", days: 7 },
  { value: "30d", label: "30 dias", days: 30 },
  { value: "mtd", label: "Este mês (MTD)", days: 31 },
  { value: "last_month", label: "Mês passado", days: 31 },
  { value: "q_current", label: "Trimestre atual", days: 92 },
  { value: "q_last", label: "Trimestre passado", days: 92 },
  { value: "custom", label: "Personalizado", days: 30 },
];

function initials(name: string) {
  return name.split(/[\s|]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2);
}

function isoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToIso(d: Date) {
  return new Intl.DateTimeFormat("en-CA").format(d);
}

export default function OperationDetail() {
  const navigate = useNavigate();
  const { opId = "" } = useParams<{ opId: string }>();
  const { data: isSA, isLoading: saLoading } = useSuperAdmin();
  const { switchOperation } = useOperation();

  const [range, setRange] = useState<OpRange>("30d");
  const [currency, setCurrency] = useState<ConsolidatedCurrency>("BRL");
  const [showCommissionCol, setShowCommissionCol] = useState(false);
  const [customStart, setCustomStart] = useState<string>(() => rangeToDates("30d").start);
  const [customEnd, setCustomEnd] = useState<string>(() => rangeToDates("30d").end);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const { start: cStart, end: cEnd } = rangeToDates(range, customStart, customEnd);
  const { data: commissionConfig } = useCommissionConfig(opId, isSA === true);



  useEffect(() => {
    if (!saLoading && isSA === false) {
      toast.error("Acesso restrito — super admin apenas");
      navigate("/", { replace: true });
    }
  }, [isSA, saLoading, navigate]);

  const { data: opInfo } = useQuery({
    queryKey: ["operation-detail-info", opId],
    enabled: !!opId && isSA === true,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("id, name, logo_url, created_at")
        .eq("id", opId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isPresetConsolidated = ["today", "yesterday", "7d", "30d", "mtd"].includes(range);
  const { data, isFetching, refetch } = useDashboardConsolidated(
    (isPresetConsolidated ? range : "custom") as ConsolidatedRange,
    currency,
    isPresetConsolidated ? undefined : cStart,
    isPresetConsolidated ? undefined : cEnd,
    isSA === true,
  );

  // Scoped totals: same source as the operation's own Dashboard (Overview) —
  // Midnight Guard, Dual-Source MAX, frontend-only, deductions-free bruto.
  const { data: scoped, isLoading: scopedLoading, isFetching: scopedFetching, refetch: refetchScoped } =
    useOperationDashboardTotals(opId, range, currency, isSA === true, customStart, customEnd);

  // Custo de estrutura de tráfego = mesma fonte do card "Aluguel de Contas"
  const { data: infra } = useTrafficInfraCost(
    opId, cStart, cEnd, isSA === true, scoped?.totalRevenue ?? 0,
  );
  const infraCost = infra?.cost ?? 0;
  const infraDays = Math.max(1, infra?.days ?? 1);
  const infraCostPerDay = infraCost / infraDays;

  const row = useMemo(
    () => data?.operations.find((o) => o.operation_id === opId),
    [data, opId],
  );

  // Historical daily series aligned to the selected period.
  // Spend from immutable snapshots + revenue/sales via MAX(snapshot, live sales_data)
  // so COD operations (FAHTO) stop showing revenue R$0 per day.
  const { data: daily, isLoading: dailyLoading } = useOperationDailyBreakdown(
    opId,
    cStart,
    cEnd,
    isSA === true,
  );

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(currency === "USD" ? "en-US" : "pt-BR", {
      style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n);

  const chartData = useMemo(
    () => (daily ?? []).map((d) => ({ ...d, date: d.date.slice(5) })),
    [daily],
  );



  const handleOpenOperation = async () => {
    try {
      await switchOperation(opId);
      navigate("/");
    } catch {
      toast.error("Falha ao abrir operação");
    }
  };

  if (saLoading || isSA === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (isSA === false) return null;

  const Kpi = ({ label, value, accent, hint }: { label: string; value: string; accent?: "positive" | "negative" | "muted"; hint?: string }) => {
    const cls = accent === "positive" ? "text-wr-positive" : accent === "negative" ? "text-wr-negative" : "text-foreground";
    return (
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">{label}</p>
          <div className={`text-2xl sm:text-[26px] font-bold tracking-tight ${cls}`}>{value}</div>
          {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
        </CardContent>
      </Card>
    );
  };

  const opName = opInfo?.name ?? row?.operation_name ?? "Operação";

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <Button size="sm" variant="ghost" onClick={() => navigate("/dashboard/consolidado")} className="h-7 px-2 mb-2">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar ao consolidado
          </Button>
          <div className="flex items-center gap-3">
            <Avatar className="w-11 h-11 border border-border/60">
              <AvatarImage src={opInfo?.logo_url ?? undefined} alt={opName} />
              <AvatarFallback className="bg-primary/15 text-primary text-sm font-bold">{initials(opName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold flex items-center gap-2 truncate">
                {opName}
                <Badge variant="outline" className="text-[10px] font-mono">DETALHE OP</Badge>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cStart} → {cEnd} · Fonte KPIs: dashboard-totals (espelho do Dashboard da operação)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={range}
            onValueChange={(v) => {
              const next = v as OpRange;
              setRange(next);
              if (next === "custom") {
                setDraft({ from: isoToDate(customStart), to: isoToDate(customEnd) });
                setPickerOpen(true);
              }
            }}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {range === "custom" && (
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs font-mono">
                  {customStart} → {customEnd}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
                <CalendarUI
                  mode="range"
                  numberOfMonths={2}
                  selected={draft}
                  onSelect={setDraft}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
                <div className="flex items-center justify-between gap-2 border-t border-border p-2">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {draft?.from ? dateToIso(draft.from) : "—"} → {draft?.to ? dateToIso(draft.to) : "—"}
                  </span>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!draft?.from}
                    onClick={() => {
                      if (!draft?.from) return;
                      setCustomStart(dateToIso(draft.from));
                      setCustomEnd(dateToIso(draft.to ?? draft.from));
                      setPickerOpen(false);
                    }}
                  >
                    Aplicar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Select value={currency} onValueChange={(v) => setCurrency(v as ConsolidatedCurrency)}>
            <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL" className="text-xs">BRL</SelectItem>
              <SelectItem value="USD" className="text-xs">USD</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { refetch(); refetchScoped(); }} disabled={isFetching || scopedFetching} className="h-8 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${(isFetching || scopedFetching) ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={handleOpenOperation} className="h-8 gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" /> Abrir operação
          </Button>
        </div>
      </div>

      {/* KPIs — escopados pelo mesmo motor do Dashboard da operação */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3 sm:gap-4">
        {scopedLoading || !scoped ? (
          <>
            {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </>
        ) : (() => {
          const spend = scoped.totalSpend;
          const revenue = scoped.totalRevenue;
          const sales = scoped.totalConversions;
          const roas = scoped.roas;
          const lucro = scoped.lucroBruto;
          const lucroLiquido = lucro - infraCost;
          const margem = revenue > 0 ? (lucro / revenue) * 100 : 0;
          const activeCamps = row?.active_campaigns_count ?? 0;
          return (
            <>
              <Kpi label="Spend" value={fmtMoney(spend)} accent="negative" />
              <Kpi label="Revenue" value={fmtMoney(revenue)} accent="positive" />
              <Kpi label="Vendas" value={String(sales)} />
              <Kpi label="ROAS" value={`${roas.toFixed(2)}x`} accent={roas >= 1.2 ? "positive" : "negative"} />
              <Kpi label="Lucro Bruto" value={fmtMoney(lucro)} accent={lucro >= 0 ? "positive" : "negative"} hint="mesma base do Dashboard da operação" />
              <Kpi
                label="Custo Estrutura Tráfego"
                value={fmtMoney(infraCost)}
                accent="negative"
                hint={`${infra?.accounts ?? 0} contas alugadas · mesma fonte do card "Aluguel de Contas"`}
              />
              <Kpi
                label="Lucro Líquido"
                value={fmtMoney(lucroLiquido)}
                accent={lucroLiquido >= 0 ? "positive" : "negative"}
                hint="revenue − spend − estrutura"
              />
              <Kpi label="Margem" value={`${margem.toFixed(1)}%`} accent={margem >= 0 ? "positive" : "negative"} hint={`${activeCamps} camp ativas`} />
              <SpaceCommissionCard
                opId={opId}
                start={cStart}
                end={cEnd}
                currency={currency}
                revenue={revenue}
                spend={spend}
                trafficInfraCost={infraCost}
                enabled={isSA === true}
              />

            </>
          );
        })()}

      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Revenue vs Spend diário */}
        <Card className="xl:col-span-7 border-border/40 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Revenue vs Spend · diário</CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">Últimos {Math.max(RANGES.find((r) => r.value === range)?.days ?? 30, 14)} dias · snapshot financeiro</p>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-wr-positive" /><span className="text-muted-foreground">Revenue</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-muted-foreground/60" /><span className="text-muted-foreground">Spend</span></div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dailyLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Sem histórico diário para esta operação.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barGap={4} barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(value: number, name: string) => [fmtMoney(value), name === "revenue" ? "Revenue" : "Spend"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--wr-positive))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="spend" fill="hsl(var(--muted-foreground))" fillOpacity={0.5} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Lucro bruto + ROAS line */}
        <Card className="xl:col-span-5 border-border/40 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lucro bruto · diário</CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">Revenue − Spend por dia</p>
          </CardHeader>
          <CardContent>
            {dailyLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(value: number) => [fmtMoney(value), "Lucro"]}
                  />
                  <Line type="monotone" dataKey="lucro" stroke="hsl(var(--wr-positive))" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily table */}
      <Card className="border-border/40 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">Breakdown diário</CardTitle>
            {!!commissionConfig && (
              <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Comissão
                <Switch checked={showCommissionCol} onCheckedChange={setShowCommissionCol} />
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          {dailyLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem histórico.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground border-b border-border/40">
                    <th className="text-left py-2 px-3">Data</th>
                    <th className="text-right py-2 px-3">Spend</th>
                    <th className="text-right py-2 px-3">Revenue</th>
                    <th className="text-right py-2 px-3">Vendas</th>
                    <th className="text-right py-2 px-3">ROAS</th>
                    <th className="text-right py-2 px-3">Lucro</th>
                    {showCommissionCol && !!commissionConfig && (
                      <th className="text-right py-2 px-3">Comissão</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {[...chartData].reverse().map((d) => {
                    const positive = d.lucro >= 0;
                    const comissaoDia = calcCommission(commissionConfig, d.revenue, d.spend, infraCostPerDay).valor;
                    return (
                      <tr key={d.date} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-xs">{d.date}</td>
                        <td className="text-right py-2.5 px-3 font-mono">{fmtMoney(d.spend)}</td>
                        <td className="text-right py-2.5 px-3 font-mono">{fmtMoney(d.revenue)}</td>
                        <td className="text-right py-2.5 px-3 font-mono">{d.sales}</td>
                        <td className={`text-right py-2.5 px-3 font-mono font-semibold ${d.roas >= 1.2 ? "text-wr-positive" : "text-wr-negative"}`}>{d.roas.toFixed(2)}x</td>
                        <td className={`text-right py-2.5 px-3 font-mono font-semibold ${positive ? "text-wr-positive" : "text-wr-negative"}`}>{fmtMoney(d.lucro)}</td>
                        {showCommissionCol && !!commissionConfig && (
                          <td className="text-right py-2.5 px-3 font-mono text-muted-foreground">{fmtMoney(comissaoDia)}</td>
                        )}
                      </tr>
                    );

                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
