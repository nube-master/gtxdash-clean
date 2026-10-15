import { useMemo, useState } from "react";
import { useCODDaily, type CODDailyRow } from "@/hooks/useCODDaily";
import { useOperation } from "@/contexts/OperationContext";
import { useCurrency, CURRENCY_META } from "@/contexts/CurrencyContext";
import { Card } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Package, TrendingUp, TrendingDown, Download, CalendarIcon, Search, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell } from "recharts";
import { CODOrderDetailSheet } from "@/components/cod/CODOrderDetailSheet";
import { CODDayOrdersSheet } from "@/components/cod/CODDayOrdersSheet";
import { CODDeliveriesSheet } from "@/components/cod/CODDeliveriesSheet";

import { CODOrdersFilteredList } from "@/components/cod/CODOrdersFilteredList";
import { CODLastReceivedIndicator } from "@/components/cod/CODLastReceivedIndicator";
import { CODTodayCashBlock } from "@/components/cod/CODTodayCashBlock";
import { CODPipelineBlock } from "@/components/cod/CODPipelineBlock";
import { CODPendingBreakdown } from "@/components/cod/CODPendingBreakdown";
import { CODProductRankingWidget } from "@/components/cod/CODProductRankingWidget";
import { CODTimelineBreakdown } from "@/components/cod/CODTimelineBreakdown";

import { CODOrphanResolverModal } from "@/components/cod/CODOrphanResolverModal";
import { useCODPipeline } from "@/hooks/useCODPipeline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMetaSync } from "@/hooks/useMetaSync";
import { RefreshCw, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { CODSourceFilter } from "@/components/cod/CODSourceFilter";
import { useCODSource } from "@/hooks/useCODSourceFilter";

const STATUS_FILTERS: { key: string; label: string; className: string }[] = [
  { key: "pending",             label: "Pendente",          className: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  { key: "delivered",           label: "Entregue",          className: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  { key: "commission_approved", label: "Entregue (CPA)",    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  { key: "paid",                label: "Pago",              className: "bg-emerald-600/10 text-emerald-600 border-emerald-600/30" },
  { key: "expired",             label: "Expirado (>10d)",   className: "bg-destructive/10 text-destructive border-destructive/30" },
  { key: "cancelled",           label: "Cancelado",         className: "bg-gray-500/10 text-gray-500 border-gray-500/30" },
];





function fmtCur(v: number, currency: string, convertFromBRL?: (v: number) => number) {
  const finalValue = convertFromBRL ? convertFromBRL(v) : v;
  return new Intl.NumberFormat("pt-BR", { 
    style: "currency", 
    currency, 
    maximumFractionDigits: 0 
  }).format(finalValue || 0);
}

function fmtCur2(v: number, currency: string, convertFromBRL?: (v: number) => number) {
  const finalValue = convertFromBRL ? convertFromBRL(v) : v;
  return new Intl.NumberFormat("pt-BR", { 
    style: "currency", 
    currency, 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(finalValue || 0);
}


function fmtPct(v: number) {
  return `${((v || 0) * 100).toFixed(1)}%`;
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function isWeekend(dateStr: string) {
  if (!dateStr) return false;
  // d-m-y parsing from YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  return day === 0 || day === 6;
}


const STATUS_BADGE: Record<CODDailyRow["day_status"], { label: string; className: string; tooltip: string }> = {
  closed:  { 
    label: "🟢 Fechado", 
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    tooltip: "Prazo esgotado ou todos os pedidos processados."
  },
  partial: { 
    label: "🟡 Parcial", 
    className: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    tooltip: "Dentro do prazo de 10 dias. Pedidos pendentes ainda podem ser aprovados."
  },
  open: { 
    label: "🔴 Aberto",  
    className: "bg-destructive/10 text-destructive border-destructive/30",
    tooltip: "Aguardando sincronização inicial."
  },
};

type Preset = 7 | 15 | 30 | 90 | "month" | "custom";

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export default function DashboardCOD() {
  const { operation } = useOperation();
  const { currency, convertFromBRL } = useCurrency();
  const queryClient = useQueryClient();
  const { triggerSync, isSyncing } = useMetaSync();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: isSuperAdmin } = useSuperAdmin();
  const { source: codSource } = useCODSource();

  const [preset, setPreset] = useState<Preset>(7);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [searchId, setSearchId] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [deliveriesRange, setDeliveriesRange] = useState<{ from: string; to: string; title: string } | null>(null);
  const [showOrphanModal, setShowOrphanModal] = useState(false);
  const [orphanCount, setOrphanCount] = useState(0);

  // Busca contagem de órfãos
  useQuery({
    queryKey: ["cod-orphans-count", operation?.id],
    enabled: !!operation?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("cod_orders")
        .select("*", { count: "exact", head: true })
        .eq("operation_id", operation?.id)
        .is("raw_payload->afiliado->codigo", null);
      
      if (!error) setOrphanCount(count || 0);
      return count || 0;
    }
  });

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  type SortKey = "date" | "generated" | "cpa" | "invest" | "fat_gerados" | "delivered" | "rate" | "commission" | "profit" | "roas" | "cpa_app" | "expired" | "cancelled";
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "date" ? "desc" : "desc"); }
  };

  const toggleStatus = (key: string) =>
    setStatusFilters((prev) => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);




  const { from, to } = useMemo(() => {
    if (preset === "custom" && customRange?.from && customRange?.to) {
      return {
        from: customRange.from.toISOString().slice(0, 10),
        to: customRange.to.toISOString().slice(0, 10),
      };
    }
    if (preset === "month") return monthRange();
    const n = typeof preset === "number" ? preset : 15;
    // Bug A Fix: Usando range absoluto de 7 dias se selecionado
    const days = typeof preset === "number" ? preset : 15;
    return { from: daysAgo(days - 1), to: daysAgo(0) };
  }, [preset, customRange]);

  const { data, isLoading } = useCODDaily(from, to);
  const { data: pipeline } = useCODPipeline();
  const pendingByDate = pipeline?.pendingByDate ?? {};

  // Regras de isolamento de investimento: quando a op tem regras cadastradas,
  // o card INVESTIMENTO soma apenas campanhas geradoras de venda COD.
  const { data: codCampaignRules } = useQuery({
    queryKey: ["cod-campaign-rules", operation?.id],
    enabled: !!operation?.id,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cod_campaign_rules" as any)
        .select("label, mode")
        .eq("operation_id", operation!.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const investFiltered = (codCampaignRules ?? []).some((r) => r.mode === "include");


  const { data: historicalRateData } = useQuery({
    queryKey: ["cod-historical-rate", operation?.id],
    enabled: !!operation?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cod_historical_approval_rate_v2" as any, {
        _operation_id: operation?.id
      });
      if (error) throw error;
      return data as number;
    }
  });

  const historicalRate = historicalRateData ?? 52.38;


  const rows = data ?? [];


  const avgComm7d = rows.length > 0 ? rows[0].avg_comm_7d_brl : 501.33;

  const totals = useMemo(() => {
    const res = rows.reduce(
      (acc, r) => {
        acc.generated += r.orders_generated;
        acc.delivered += r.orders_approved;
        acc.commission += Number(r.commission_total) || 0;
        acc.projCommission += Number(r.proj_commission_approved) || 0;
        acc.invest += Number(r.invest_total) || 0;
        acc.profit += Number(r.profit_of_day) || 0;
        acc.revGenerated += Number(r.fat_gerados) || 0;
        acc.revDelivered += Number(r.fat_aprovado) || 0;
        acc.projRevDelivered += Number(r.proj_revenue_approved) || 0;
        acc.pendingTotal += Number(r.orders_pending) || 0;
        acc.expiredTotal += Number(r.orders_expired) || 0;
        return acc;
      },
      { 
        generated: 0, 
        delivered: 0, 
        commission: 0, 
        projCommission: 0, 
        invest: 0, 
        profit: 0, 
        revGenerated: 0, 
        revDelivered: 0, 
        projRevDelivered: 0, 
        pendingTotal: 0,
        expiredTotal: 0
      }
    );
    return res;
  }, [rows]);

  const avgDelivery = totals.generated > 0 ? totals.delivered / totals.generated : 0;

  // Taxa e ticket médio do período filtrado (dinâmicos) — base das colunas de PROJEÇÃO
  const periodRate = avgDelivery;
  const periodTicket = totals.delivered > 0 ? totals.commission / totals.delivered : (avgComm7d || 501.33);


  const sortedRows = useMemo(() => {
    const getVal = (r: CODDailyRow): number | string => {
      switch (sortKey) {
        case "date":       return r.order_date;
        case "generated":  return r.orders_generated;
        case "cpa":        return r.cpa_generated;
        case "invest":     return r.invest_total;
        case "fat_gerados": return r.fat_gerados;
        case "delivered":  return r.orders_approved;
        case "rate":       return r.delivery_rate;
        case "commission": return r.commission_total;
        case "profit":     return r.profit_of_day;
        case "roas":       return r.roas_real;
        case "cpa_app":    return r.cpa_approved;
        case "expired":    return r.orders_expired;
        case "cancelled":  return r.orders_cancelled;
      }
    };
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = getVal(a); const vb = getVal(b);
      const cmp = typeof va === "string" ? (va as string).localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const exportCsv = () => {
    const header = ["Data","Invest","Gerados","Entregues","Taxa","Comissão","Lucro","Status"].join(",");
    const lines = rows.map(r => [
      r.order_date,
      (r.invest_total ?? 0).toFixed(2),
      r.orders_generated,
      r.orders_approved,
      (r.delivery_rate ?? 0).toFixed(4),
      (r.commission_total ?? 0).toFixed(2),
      (r.profit_of_day ?? 0).toFixed(2),
      r.day_status,
    ].join(","));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cod-${operation?.slug ?? "op"}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-2 md:p-6 space-y-3 md:space-y-4 w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
        <div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <Package className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            <h1 className="text-base md:text-2xl font-semibold">Dashboard COD</h1>
            <Badge variant="outline" className="text-[9px] md:text-[10px] font-mono px-1.5 py-0">Sphere</Badge>
            {operation?.id === "0b758a2b-1b92-4769-b47b-416c567e320d" && (
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] md:text-[10px] font-mono px-1.5 py-0 border-primary/40 text-primary">
                      📊 100% Meta
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] text-xs">
                    Dados de funil (investido, cliques, impressões) 100% Meta Ads.
                    RedTrack está em <strong>standby</strong> desde 29/08 — não contribui com nenhum número.
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="hidden md:block text-xs text-muted-foreground mt-1">
            Reconciliação por <strong>data de origem</strong> do pedido — comissão atribuída ao dia da campanha,
            não ao dia do recebimento.
          </p>
          {orphanCount > 0 && (
            <Badge 
              variant="outline" 
              className="mt-1 cursor-pointer bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20 gap-1.5"
              onClick={() => setShowOrphanModal(true)}
            >
              <AlertCircle className="h-3 w-3" />
              {orphanCount} pedidos sem mapeamento
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <CODSourceFilter />
          {(isAdmin || isSuperAdmin) && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/dashboard-cod/import")}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Importar
            </Button>
          )}
          <div className="flex rounded-md border border-border/60 overflow-hidden text-xs">
            {([7, 15, 30, 90] as const).map((n) => (
              <button
                key={n}
                onClick={() => { setPreset(n); setCustomRange(undefined); }}
                className={`px-3 py-1.5 transition-colors ${
                  preset === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {n}d
              </button>
            ))}
            <button
              onClick={() => { setPreset("month"); setCustomRange(undefined); }}
              className={`px-3 py-1.5 transition-colors border-l border-border/60 ${
                preset === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              Mês
            </button>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={preset === "custom" ? "default" : "outline"}
                className={cn("text-xs h-8 gap-1.5", preset !== "custom" && "text-muted-foreground")}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {preset === "custom" && customRange?.from && customRange?.to
                  ? `${format(customRange.from, "dd/MM")} → ${format(customRange.to, "dd/MM")}`
                  : "Período"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={(r) => {
                  setCustomRange(r);
                  if (r?.from && r?.to) setPreset("custom");
                }}
                numberOfMonths={2}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <form
            onSubmit={(e) => { e.preventDefault(); if (searchId.trim()) setOpenOrderId(searchId.trim()); }}
            className="relative"
          >
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Buscar pedido (ID)"
              className="h-8 text-xs pl-7 w-40"
            />
          </form>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
          </Button>
          


        </div>
      </div>


      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-1.5 md:gap-3 w-full">

        <KpiCard 
          label="PEDIDOS GERADOS" 
          value={String(operation?.slug === 'FAHTO' || operation?.slug === 'EDD' ? totals.delivered : totals.generated)} 
          sub={`${totals.generated} total`}
          tooltip="Vendas aprovadas no período. O sub-valor reflete o total de pedidos criados (leads)."
        />
        <KpiCard 
          label="Entregues" 
          value={String(totals.delivered)} 
          sub={fmtPct(avgDelivery)} 
          onClick={() => setDeliveriesRange({ from, to, title: "Entregas do período" })} 
          tooltip="Pedidos confirmados no call center."
        />
        <KpiCard
          label="INVESTIMENTO"
          value={fmtCur(totals.invest, currency, convertFromBRL)}
          sub={investFiltered ? "só campanhas COD" : `gasto em ${currency}`}
          tooltip={
            investFiltered ? (
              <div className="space-y-1 text-[11px]">
                <p className="font-bold uppercase tracking-tight">Investido somente em campanhas geradoras COD</p>
                <p className="text-[10px] text-muted-foreground italic">
                  Campanhas sem relação com o canal COD (ex.: ClickBank/EUA) ficam fora deste card, do ROAS e do Lucro Real.
                  O Painel Executivo continua mostrando o investimento da operação inteira.
                </p>
              </div>
            ) : (
              `Investimento total da operação em ${currency}`
            )
          }
        />

        <KpiCard 
          label="Comissão Aprovada" 
          value={fmtCur(totals.commission, currency, convertFromBRL)} 
          tooltip="Receita real confirmada (comissão aprovada)."
          highlight="positive"
        />

        <KpiCard
          label="Lucro Real"
          value={fmtCur(totals.profit, currency, convertFromBRL)}
          highlight={totals.profit >= 0 ? "positive" : "negative"}
          tooltip={
            <div className="space-y-1 text-[11px]">
              <p className="font-bold border-b border-white/10 pb-1 mb-1 uppercase tracking-tight">Lucro Real:</p>
              <p>LUCRO = comissão_aprovada - invest_total</p>
              <p className="text-[10px] text-muted-foreground mt-1 italic">
                * Não utiliza projeções. Reflete o resultado líquido atual do período.
              </p>
            </div>
          }
        />

        <KpiCard 
          label="ROAS" 
          value={(totals.invest > 0 ? totals.commission / totals.invest : 0).toFixed(2) + 'x'} 
          highlight={(totals.invest > 0 ? totals.commission / totals.invest : 0) >= 1 ? "positive" : "negative"}
          tooltip="ROAS real (Comissão / Investimento)"
        />

        <KpiCard 
          label="Taxa Entrega" 
          value={fmtPct(avgDelivery)} 
          sub="Aprovados / Total Gerados"
          tooltip="Taxa de aprovação real do período (pedidos entregues / total de pedidos criados no período)."
        />
      </div>


      {/* Bloco Hoje — Cash-basis (independente da data de origem) */}
      <div className="w-full">
        <CODTodayCashBlock onOpenDeliveries={(d) => setDeliveriesRange({ from: d, to: d, title: "Entregas de hoje" })} />
      </div>
      <div className="grid grid-cols-1 gap-4">
        {/* Pending Breakdown moved below rankings */}
      </div>





      {/* Status filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Filtrar por status:</span>
        {STATUS_FILTERS.map((s) => {
          const active = statusFilters.includes(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggleStatus(s.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${
                active ? s.className + " ring-1 ring-current" : "border-border/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          );
        })}
        {statusFilters.length > 0 && (
          <button
            onClick={() => setStatusFilters([])}
            className="px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Chart: profit + delivery rate */}
      <Card className="p-2 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-medium">Evolução diária</div>
            <div className="text-[11px] text-muted-foreground">Lucro (barras) × Taxa de aprovação (linha) — verde = lucro, vermelho = prejuízo</div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500"/>Lucro</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-destructive"/>Prejuízo</span>
          </div>
        </div>
        <div className="h-[180px] md:h-[280px]">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados no período</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={[...rows].sort((a,b) => a.order_date.localeCompare(b.order_date)).map(r => ({
                  date: fmtDate(r.order_date),
                  profit: Number(r.profit_of_day) || 0,
                  delivery: Number(r.delivery_rate) * 100 || 0,
                  status: r.day_status,
                }))}
                margin={{ top: 8, right: 8, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="profit" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  formatter={(value: number, name: string) => {
                    if (name === "Lucro") return [fmtCur(value, currency), name];

                    if (name === "Taxa entrega") return [`${value.toFixed(1)}%`, name];
                    return [value, name];
                  }}
                />
                <ReferenceLine yAxisId="profit" y={0} stroke="hsl(var(--border))" />
                <Bar yAxisId="profit" dataKey="profit" name="Lucro" radius={[3, 3, 0, 0]}>
                  {[...rows].sort((a,b) => a.order_date.localeCompare(b.order_date)).map((r, i) => (
                    <Cell key={i} fill={
                      (Number(r.profit_of_day) || 0) >= 0
                        ? "hsl(142 76% 45%)"
                        : "hsl(var(--destructive))"
                    } opacity={r.day_status === "open" ? 0.7 : 0.95} />
                  ))}
                </Bar>
                <Line yAxisId="rate" type="monotone" dataKey="delivery" name="Taxa aprovação" stroke="hsl(142 76% 45%)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>


      {/* Table: daily aggregate OR filtered order list */}
      {statusFilters.length > 0 ? (
        <CODOrdersFilteredList
          operationId={operation?.id}
          from={from}
          to={to}
          statuses={statusFilters}
          onOpenOrder={(id) => setOpenOrderId(id)}
        />
      ) : (
      <>
      {/* Mobile: card list */}
      <div className="md:hidden space-y-2">
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
        {!isLoading && rows.length === 0 && (
          <Card className="p-6 text-center text-xs text-muted-foreground">
            Nenhum pedido COD no período.
          </Card>
        )}
        {!isLoading && sortedRows.map((r) => {
          const badge = STATUS_BADGE[r.day_status];
          const cpd = r.orders_approved > 0 ? r.invest_total / r.orders_approved : 0;
          const roas = r.invest_total > 0 ? r.commission_total / r.invest_total : 0;
          const pendCount = r.orders_pending;
          const projComm = r.commission_projected;
          const projDeliv = r.proj_orders_approved;
          const profitPos = r.profit_projected >= 0;
          const weekend = isWeekend(r.order_date);

          return (
            <Card
              key={r.order_date}
              onClick={() => setOpenDay(r.order_date)}
              className={cn(
                "p-2.5 cursor-pointer active:scale-[0.99] transition-transform",
                weekend 
                  ? "bg-muted/40 border-muted-foreground/20" 
                  : r.day_status === "open" || r.profit_of_day < 0
                    ? "border-destructive/30 bg-destructive/[0.03]"
                    : r.day_status === "partial"
                      ? "border-amber-500/30 bg-amber-500/[0.03]"
                      : ""
              )}
            >

              {/* Header linha */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-primary font-semibold">{fmtDate(r.order_date)}</span>
                  </div>
                  <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 font-mono", badge.className)}>{badge.label}</Badge>
                </div>

                <div className={cn("text-sm font-bold tabular-nums", r.profit_of_day >= 0 ? "text-emerald-500" : "text-destructive")}>
                  {fmtCur(r.profit_of_day, currency)}
                </div>


              </div>

              {/* Grid 5 mini-métricas */}
              <div className="grid grid-cols-5 gap-1 text-center">
                <div className="rounded bg-sky-500/[0.06] py-1.5 px-0.5">
                  <div className="text-[8px] uppercase text-sky-500/70 font-semibold truncate">Gerados</div>
                  <div className="text-[12px] font-semibold tabular-nums">{r.orders_generated}</div>
                </div>
                <div className="rounded bg-emerald-500/[0.06] py-1.5 px-0.5">
                  <div className="text-[8px] uppercase text-emerald-500/70 font-semibold truncate">Aprov.</div>
                  <div className="text-[12px] font-semibold tabular-nums">{r.orders_approved}</div>
                </div>
                <div className="rounded bg-amber-500/[0.06] py-1.5 px-0.5">
                  <div className="text-[8px] uppercase text-amber-500/70 font-semibold truncate">Pend.</div>
                  <div className="text-[12px] font-semibold tabular-nums">{pendCount}</div>
                </div>
                <div className="rounded bg-destructive/[0.06] py-1.5 px-0.5">
                  <div className="text-[8px] uppercase text-destructive/70 font-semibold truncate">Exp.</div>
                  <div className="text-[12px] font-semibold tabular-nums">{r.orders_expired}</div>
                </div>
                <div className="rounded bg-gray-500/[0.06] py-1.5 px-0.5">
                  <div className="text-[8px] uppercase text-gray-500/70 font-semibold truncate">Canc.</div>
                  <div className="text-[12px] font-semibold tabular-nums">{r.orders_cancelled}</div>
                </div>
              </div>

              {/* Footer: valores financeiros compactos */}
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <div className="text-muted-foreground uppercase text-[9px]">Invest</div>
                  <div className="tabular-nums font-medium">{fmtCur(r.invest_total, currency, convertFromBRL)}</div>

                </div>
                <div>
                  <div className="text-muted-foreground uppercase text-[9px]">Minha Comissão</div>
                  <div className="tabular-nums font-medium text-emerald-500">{fmtCur(r.commission_total, currency)}</div>

                </div>
                <div className="text-right">
                  <div className="text-muted-foreground uppercase text-[9px]">ROAS · CPD</div>
                  <div className="tabular-nums font-medium">
                    <span className={roas >= 1 ? "text-emerald-500" : "text-destructive"}>{roas > 0 ? `${roas.toFixed(2)}x` : "—"}</span>
                    <span className="text-muted-foreground"> · {cpd > 0 ? fmtCur(cpd, currency, convertFromBRL) : "—"}</span>

                  </div>
                </div>
              </div>

              {projComm > 0 && (
                <div className="mt-1.5 text-[10px] text-amber-500/80 border-t border-border/40 pt-1.5 flex justify-between">
                  <span>🔮 Proj. entrar</span>
                  <span className="tabular-nums font-medium">+{fmtCur(projComm, currency)} ({projDeliv.toFixed(0)} entregas)</span>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Desktop: full table */}
      <Card className="overflow-hidden hidden md:block">

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              {/* Linha 1: fases */}
              <tr className="border-b border-border/60">
                <th colSpan={5} className="px-3 py-1.5 text-center text-[10px] font-semibold text-sky-500/80 bg-sky-500/[0.04] border-l border-border/60">🎯 Gerados</th>
                <th colSpan={3} className="px-3 py-1.5 text-center text-[10px] font-semibold text-emerald-500/80 bg-emerald-500/[0.04] border-l border-border/60">✅ Entregues</th>
                <th colSpan={6} className="px-3 py-1.5 text-center text-[10px] font-semibold text-amber-500/80 bg-amber-500/[0.04] border-l border-border/60">🔮 Projeção</th>
                <th colSpan={3} className="px-3 py-1.5 text-center text-[10px] font-semibold text-foreground/70 bg-muted/60 border-l border-border/60">📊 Resultado</th>
              </tr>
              {/* Linha 2: colunas */}
              <tr>
                <SortableTh label="Data" k="date" align="left" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Gerados" k="generated" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="border-l border-border/60" />
                <SortableTh label="CPA Gerado" k="cpa" title="Invest / Gerados" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Invest" k="invest" title="Investimento em mídia (BRL)" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="border-l border-border/60" />
                <SortableTh label="Fat. Gerado" k="fat_gerados" title="GMV total gerado no dia" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-white" />
                <SortableTh label="Entregues" k="delivered" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="border-l border-border/60" />
                <SortableTh label="Taxa Entregue" k="rate" title="Entregues / Gerados — % de todos os pedidos do dia já entregues. Dias recentes ainda vão evoluir (janela de 10d)." sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-right px-3 py-2 font-medium text-muted-foreground" title="Taxa efetiva: Entregues / (Entregues + Expirados) — só pedidos já resolvidos">Taxa Efetiva</th>
                <SortableTh label="CPA Entregue" k="cpa_app" title="Invest / Entregues" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Pendentes" k="pending" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="border-l border-border/60" />
                <SortableTh label="Expirados" k="expired" title="Expirados reais (>10 dias)" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                
                <th className="text-right px-3 py-2 font-medium italic text-muted-foreground" title="Pendentes × taxa do período">Proj. Entregas</th>
                <th className="text-right px-3 py-2 font-medium italic text-muted-foreground" title="Fat. entregue + (pendentes × taxa × ticket médio)">Fat. Final (est.)</th>
                <th className="text-right px-3 py-2 font-medium italic text-muted-foreground" title="Fat. Final (est.) − Invest">Lucro Proj.</th>
                <th className="text-right px-3 py-2 font-medium italic text-muted-foreground" title="Fat. Final (est.) / Invest">ROAS Proj.</th>


                <th className="text-right px-3 py-2 font-medium border-l border-border/60">Lucro</th>
                <SortableTh label="ROAS" k="roas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />

                <th className="text-center px-3 py-2 font-medium border-l border-border/60">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-border/40">
                  <td colSpan={15} className="p-2"><Skeleton className="h-6 w-full" /></td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={15} className="text-center py-12 text-muted-foreground text-sm">
                    Nenhum pedido COD no período. Aguardando webhook Shphere disparar em <code className="text-xs">cod-webhook-shphere</code>.
                  </td>
                </tr>
              )}
              {!isLoading && sortedRows.map((r) => {
                const badge = STATUS_BADGE[r.day_status];
                const cpaGerado = r.orders_generated > 0 ? r.invest_total / r.orders_generated : 0;
                const cpd = r.orders_approved > 0 ? r.invest_total / r.orders_approved : 0;
                const roas = r.invest_total > 0 ? r.profit_of_day / r.invest_total : 0;
                const weekend = isWeekend(r.order_date);
                const rowClass =
                  weekend
                    ? "bg-muted/30"
                    : r.day_status === "closed" && r.profit_of_day < 0
                      ? "bg-destructive/[0.03]"
                      : r.day_status === "partial"
                        ? "bg-amber-500/[0.03]"
                        : "hover:bg-muted/30";
                return (
                  <tr
                    key={r.order_date}
                    onClick={() => setOpenDay(r.order_date)}
                    className={`border-t border-border/40 cursor-pointer ${rowClass}`}
                    title={weekend ? "Call center Sphere opera 6ª-2ª. Sáb/Dom acumula pendentes." : "Ver pedidos deste dia"}
                  >

                    {(() => {
                      const comissaoPaga = r.commission_total;
                      const pendCount = r.orders_pending;
                      const projDelivRow = pendCount * periodRate;
                      const projComm = projDelivRow * periodTicket;
                      const fatFinalEst = comissaoPaga + projComm;
                      const profitProj = fatFinalEst - r.invest_total;
                      const roasProj = r.invest_total > 0 ? fatFinalEst / r.invest_total : 0;


                      return (
                        <>
                          <td className="px-3 py-2 font-mono text-xs text-primary">
                            <div className="flex items-center gap-1.5">
                              {fmtDate(r.order_date)}
                            </div>
                          </td>

                          <td className="px-3 py-2 text-right tabular-nums font-medium border-l border-border/60">{r.orders_generated}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtCur2(r.cpa_generated, currency, convertFromBRL)}</td>
                          <td className="px-3 py-2 text-right tabular-nums border-l border-border/60">{fmtCur(r.invest_total, currency, convertFromBRL)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-white">{fmtCur(r.fat_gerados, currency, convertFromBRL)}</td>

                          <td className="px-3 py-2 text-right tabular-nums border-l border-border/60 font-semibold text-white">{r.orders_approved}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-white">{fmtPct(r.delivery_rate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtPct(r.effective_rate ?? 0)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtCur2(r.cpa_approved, currency, convertFromBRL)}</td>

                          <td className="px-3 py-2 text-right tabular-nums text-amber-500 border-l border-border/60">{pendCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground border-l border-border/60">{r.orders_expired}</td>
                          
                          <td className="px-3 py-2 text-right tabular-nums italic text-muted-foreground">{Math.round(projDelivRow)}</td>
                          <td className="px-3 py-2 text-right tabular-nums italic text-muted-foreground">{fmtCur(fatFinalEst, currency, convertFromBRL)}</td>
                          <td className="px-3 py-2 text-right tabular-nums italic text-muted-foreground">{fmtCur(profitProj, currency, convertFromBRL)}</td>

                          <td className="px-3 py-2 text-right tabular-nums italic text-muted-foreground">{roasProj.toFixed(2)}x</td>


                          <td className={cn("px-3 py-2 text-right tabular-nums font-bold border-l border-border/60", r.profit_of_day >= 0 ? "text-emerald-500" : "text-destructive")}>
                            {fmtCur(r.profit_of_day, currency, convertFromBRL)}

                          </td>
                          <td className={cn("px-3 py-2 text-right tabular-nums font-medium", r.roas_real >= 1 ? "text-emerald-500" : "text-destructive")}>
                            {`${r.roas_real.toFixed(2)}x`}
                          </td>

                          <td className="px-3 py-2 text-center border-l border-border/60">
                            <TooltipProvider>
                              <UITooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={cn("text-[9px] py-0 px-1.5 h-4 cursor-help whitespace-nowrap", badge.className)}>
                                    {badge.label}
                                    {r.day_status === "partial" && ` (${r.deadline_remaining}d)`}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-[10px]">{badge.tooltip} Prazo restante: {r.deadline_remaining} dias.</p>
                                </TooltipContent>
                              </UITooltip>
                            </TooltipProvider>
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-muted/40 font-medium">
                <tr>
                  {(() => {
                    const avgEur = pipeline?.avgCommissionEur ?? 0;
                    const fx = pipeline?.fxEurBrl ?? 0;
                    
                    // Bug C Fix: Unifying Total Calculation with Row logic
                    const totalFatGerados = totals.revGenerated;
                    const totalComissaoGerada = totals.revGenerated; // Usando valor já normalizado na moeda em totals
                    const totalFatEntregue = totals.revDelivered;
                    const totalComissaoPaga = totals.commission;
                    const totalPending = rows.reduce((s, r) => s + (r.orders_pending || 0), 0);
                    const totalExpired = rows.reduce((s, r) => s + (r.orders_expired || 0), 0);
                    const totalCancelled = rows.reduce((s, r) => s + (r.orders_cancelled || 0), 0);
                    const totalProjDeliv = totalPending * periodRate;
                    const totalProjComm = totalProjDeliv * periodTicket;
                    const totalFatFinalEst = totals.commission + totalProjComm;
                    const totalProfitProj = totalFatFinalEst - totals.invest;
                    const totalRoasProj = totals.invest > 0 ? totalFatFinalEst / totals.invest : 0;

                    
                    return (
                      <>
                        <td className="px-3 py-2 text-xs uppercase font-bold text-foreground">Total</td>

                        <td className="px-3 py-2 text-right tabular-nums font-bold border-l border-border/60">{totals.generated}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">{totals.generated > 0 ? fmtCur2(totals.invest / totals.generated, currency, convertFromBRL) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums border-l border-border/60 text-primary font-bold">{fmtCur(totals.invest, currency, convertFromBRL)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-white">{fmtCur(totals.revGenerated, currency, convertFromBRL)}</td>

                        <td className="px-3 py-2 text-right tabular-nums border-l border-border/60 font-bold text-emerald-500">{totals.delivered}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-500/80">{fmtPct(avgDelivery)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-muted-foreground">
                          {(() => { const resolved = totals.delivered + totalExpired; return fmtPct(resolved > 0 ? totals.delivered / resolved : 0); })()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">{totals.delivered > 0 ? fmtCur2(totals.invest / totals.delivered, currency, convertFromBRL) : "—"}</td>

                        <td className="px-3 py-2 text-right tabular-nums font-bold text-amber-500 border-l border-border/60">{totalPending}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-muted-foreground border-l border-border/60">{totalExpired}</td>
                        
                        <td className="px-3 py-2 text-right tabular-nums italic text-muted-foreground">{Math.round(totalProjDeliv)}</td>
                        <td className="px-3 py-2 text-right tabular-nums italic text-muted-foreground">{fmtCur(totalFatFinalEst, currency, convertFromBRL)}</td>
                        <td className="px-3 py-2 text-right tabular-nums italic text-muted-foreground">{fmtCur(totalProfitProj, currency, convertFromBRL)}</td>

                        <td className="px-3 py-2 text-right tabular-nums italic text-muted-foreground">{totalRoasProj.toFixed(2)}x</td>


                        <td className={cn("px-3 py-2 text-right tabular-nums font-bold border-l border-border/60", totals.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                          {fmtCur(totals.profit, currency, convertFromBRL)}
                        </td>
                        <td className={cn("px-3 py-2 text-right tabular-nums font-bold", (totals.invest > 0 ? totals.commission / totals.invest : 0) >= 1 ? "text-emerald-500" : "text-destructive")}>
                          {totals.invest > 0 ? `${(totals.commission / totals.invest).toFixed(2)}x` : "—"}
                        </td>

                        <td className="border-l border-border/60" />
                      </>
                    );
                  })()}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
      </>
      )}

      {/* Ranking por produto — onde botar mais energia (último) */}

      <CODTimelineBreakdown from={from} to={to} />

      <CODProductRankingWidget from={from} to={to} />


      <div className="grid grid-cols-1 gap-4 mt-4">
        <CODPendingBreakdown />
      </div>


      <p className="text-[11px] text-muted-foreground">
        <strong>Isolamento:</strong> dados de <code>cod_orders</code> aparecem SÓ nesta aba. Dashboard geral não é afetado.
        {" • Dica: busque um pedido pelo ID no topo pra ver a timeline completa."}
      </p>

      <CODDayOrdersSheet
        date={openDay}
        operationId={operation?.id}
        onClose={() => setOpenDay(null)}
        onOpenOrder={(id) => setOpenOrderId(id)}
      />
      <CODDeliveriesSheet
        open={!!deliveriesRange}
        from={deliveriesRange?.from ?? from}
        to={deliveriesRange?.to ?? to}
        title={deliveriesRange?.title}
        operationId={operation?.id}
        onClose={() => setDeliveriesRange(null)}
        onOpenOrder={(id) => setOpenOrderId(id)}
      />
      <CODOrderDetailSheet orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
      <CODOrphanResolverModal 
        open={showOrphanModal} 
        onOpenChange={setShowOrphanModal} 
        operationId={operation?.id} 
      />


    </div>
  );
}


function KpiCard({ label, value, sub, highlight, onClick, tooltip, className }: { label: string; value: string; sub?: string; highlight?: "positive" | "negative"; onClick?: () => void; tooltip?: string | React.ReactNode; className?: string }) {
  const color =
    highlight === "positive" ? "text-emerald-500"
    : highlight === "negative" ? "text-destructive"
    : "";

  const content = (
    <Card
      onClick={onClick}
      className={cn("p-1.5 md:p-3 h-full", onClick && "cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors", className)}
    >
      <div className="text-[9px] md:text-[10px] uppercase tracking-wide text-muted-foreground font-medium truncate">{label}</div>
      <div className={`text-[13px] md:text-xl font-semibold tabular-nums mt-0.5 md:mt-1 truncate ${color}`}>{value}</div>
      {sub && (
        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
          {highlight === "positive" && <TrendingUp className="h-3 w-3" />}
          {highlight === "negative" && <TrendingDown className="h-3 w-3" />}
          {sub}
        </div>
      )}
    </Card>
  );

  if (tooltip) {
    return (
      <TooltipProvider delayDuration={0}>
        <UITooltip>
          <TooltipTrigger asChild>
            <div className="h-full">{content}</div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] p-3 text-xs leading-relaxed bg-popover border border-border shadow-xl">
            {tooltip}
          </TooltipContent>
        </UITooltip>
      </TooltipProvider>
    );
  }

  return content;
}



function SortableTh({ label, k, align = "right", title, sortKey, sortDir, onSort, className = "" }: {
  label: string;
  k: string;
  align?: "left" | "right" | "center";
  title?: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: any) => void;
  className?: string;
}) {
  const active = sortKey === k;
  const alignCls = align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";
  const justifyCls = align === "left" ? "justify-start" : align === "center" ? "justify-center" : "justify-end";
  return (
    <th className={`${alignCls} px-3 py-2 font-medium ${className}`} title={title}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 w-full uppercase tracking-wide ${justifyCls} hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
      >
        <span>{label}</span>
        {active ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}
