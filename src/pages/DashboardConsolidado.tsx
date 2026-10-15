import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useConsolidatedCommission } from "@/hooks/useConsolidatedCommission";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useOperation } from "@/contexts/OperationContext";
import {
  useDashboardConsolidated,
  type ConsolidatedRange,
  type ConsolidatedCurrency,
} from "@/hooks/useDashboardConsolidated";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, RefreshCw, ArrowLeft, TrendingUp, TrendingDown, Eye, EyeOff } from "lucide-react";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";

type RangeMode = ConsolidatedRange | "month" | "last_month" | "q_current" | "q_last";
const RANGES: { value: RangeMode; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "mtd", label: "Este mês (MTD)" },
  { value: "last_month", label: "Mês passado" },
  { value: "q_current", label: "Trimestre atual" },
  { value: "q_last", label: "Trimestre passado" },
  { value: "month", label: "Escolher mês" },
  { value: "custom", label: "Personalizado" },
];

function monthBounds(ym: string) {
  // ym = "YYYY-MM"
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);
  return { start, end };
}

function fmtBR(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Bounds (BRT) para os presets estendidos */
function presetBounds(mode: RangeMode): { start: string; end: string } | null {
  const todayStr = fmtBR(new Date());
  const t = new Date(`${todayStr}T00:00:00`);
  const y = t.getFullYear();
  const m = t.getMonth();
  if (mode === "last_month") {
    return { start: fmtBR(new Date(y, m - 1, 1)), end: fmtBR(new Date(y, m, 0)) };
  }
  if (mode === "q_current") {
    const qs = Math.floor(m / 3) * 3;
    return { start: fmtBR(new Date(y, qs, 1)), end: todayStr };
  }
  if (mode === "q_last") {
    const qs = Math.floor(m / 3) * 3 - 3;
    return { start: fmtBR(new Date(y, qs, 1)), end: fmtBR(new Date(y, qs + 3, 0)) };
  }
  return null;
}


function getOpInitials(name: string) {
  return name
    .split(/[\s|]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

export default function DashboardConsolidado() {
  const navigate = useNavigate();
  const { data: isSA, isLoading: saLoading } = useSuperAdmin();
  const { switchOperation } = useOperation();

  const [rangeMode, setRangeMode] = useState<RangeMode>("today");
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentYm = todayIso.slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYm);
  const [customStart, setCustomStart] = useState<string>(todayIso);
  const [customEnd, setCustomEnd] = useState<string>(todayIso);
  const [currency, setCurrency] = useState<ConsolidatedCurrency>("BRL");
  const [includeSuspended, setIncludeSuspended] = useState(false);
  const privacy = usePrivacyMode();
  const [animateHero, setAnimateHero] = useState(false);

  // Resolve effective range + custom bounds for the hook
  const { effectiveRange, effectiveStart, effectiveEnd } = useMemo(() => {
    if (rangeMode === "month") {
      const { start, end } = monthBounds(selectedMonth);
      return { effectiveRange: "custom" as ConsolidatedRange, effectiveStart: start, effectiveEnd: end };
    }
    if (rangeMode === "custom") {
      return { effectiveRange: "custom" as ConsolidatedRange, effectiveStart: customStart, effectiveEnd: customEnd };
    }
    const preset = presetBounds(rangeMode);
    if (preset) {
      return { effectiveRange: "custom" as ConsolidatedRange, effectiveStart: preset.start, effectiveEnd: preset.end };
    }
    return { effectiveRange: rangeMode as ConsolidatedRange, effectiveStart: undefined, effectiveEnd: undefined };

  }, [rangeMode, selectedMonth, customStart, customEnd]);

  useEffect(() => {
    if (!saLoading && isSA === false) {
      toast.error("Acesso restrito — super admin apenas");
      navigate("/", { replace: true });
    }
  }, [isSA, saLoading, navigate]);

  useEffect(() => {
    setAnimateHero(false);
    const t = setTimeout(() => setAnimateHero(true), 40);
    return () => clearTimeout(t);
  }, [effectiveRange, effectiveStart, effectiveEnd, currency]);

  const { data, isLoading, isFetching, error, refetch } = useDashboardConsolidated(
    effectiveRange, currency, effectiveStart, effectiveEnd, isSA === true, includeSuspended,
  );

  const {
    data: commission,
    isLoading: commissionLoading,
    error: commissionError,
  } = useConsolidatedCommission(
    data?.operations,
    data?.start_date,
    data?.end_date,
    currency,
    data?.fx_used,
    isSA === true,
  );

  const { data: opLogos } = useQuery({
    queryKey: ["operation-logos-consolidado"],
    enabled: isSA === true,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("id, logo_url");
      if (error) throw error;
      const map: Record<string, string | null> = {};
      (data ?? []).forEach((o: any) => { map[o.id] = o.logo_url ?? null; });
      return map;
    },
  });

  // Faturamento e investimento anual (YTD) do ecossistema
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().slice(0, 10);
  const { data: yearData, isLoading: yearLoading, isFetching: yearFetching } = useQuery({
    queryKey: ["dashboard-consolidated-ytd", currency, yearStart, today],
    enabled: isSA === true,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_consolidated", {
        p_range: "custom",
        p_start: yearStart,
        p_end: today,
        p_currency: currency,
      });
      if (error) throw new Error(error.message);
      return data as any;
    },
  });

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(currency === "USD" ? "en-US" : "pt-BR", {
      style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n);

  const fmtCompact = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${currency === "USD" ? "$" : "R$"} ${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${currency === "USD" ? "$" : "R$"} ${(n / 1_000).toFixed(0)}k`;
    return fmtMoney(n);
  };

  /** Apelido estável por ordem alfabética (Operação A, B, C…) quando modo privado ligado */
  const opAlias = useMemo(() => {
    const map: Record<string, string> = {};
    [...(data?.operations ?? [])]
      .sort((a, b) => a.operation_name.localeCompare(b.operation_name, "pt-BR"))
      .forEach((o, i) => { map[o.operation_id] = privacy.maskName(i); });
    return map;
  }, [data, privacy]);

  const opName = (id: string, name: string) => (privacy.enabled ? (opAlias[id] ?? "Operação") : name);
  const fmtCount = (n: number) => String(n);

  const rankedOps = useMemo(() => {
    if (!data?.operations) return [];
    return [...data.operations].sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  const activeRankedOps = useMemo(
    () => rankedOps.filter((r) => r.revenue > 0 || r.spend > 0),
    [rankedOps],
  );

  const maxRevenue = useMemo(() => {
    if (!activeRankedOps.length) return 0;
    return Math.max(...activeRankedOps.map((r) => r.revenue));
  }, [activeRankedOps]);

  const chartData = useMemo(() => {
    return activeRankedOps.map((r) => ({
      name: (() => {
        const n = opName(r.operation_id, r.operation_name);
        return n.length > 16 ? `${n.slice(0, 16)}…` : n;
      })(),
      revenue: r.revenue,
      spend: r.spend,
      lucro: r.lucro_bruto,
    }));
  }, [activeRankedOps, privacy.enabled, opAlias]);

  const handleDrillDown = (opId: string) => {
    navigate(`/dashboard/consolidado/operacao/${opId}`);
  };

  if (saLoading || isSA === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (isSA === false) return null;

  const KpiCard = ({
    label, value, accent, hint, valueClassName, prefixIndicator, loading,
  }: {
    label: string;
    value: string;
    accent?: "positive" | "negative" | "primary" | "destructive" | "muted";
    hint?: string;
    valueClassName?: string;
    prefixIndicator?: boolean;
    loading?: boolean;
  }) => {
    const accentClass =
      accent === "positive" ? "text-wr-positive" :
      accent === "negative" ? "text-wr-negative" :
      accent === "primary" ? "text-primary" :
      accent === "destructive" ? "text-destructive" :
      "text-foreground";

    const renderValue = () => {
      if (!prefixIndicator) {
        return <div className={`text-2xl sm:text-[26px] font-bold tracking-tight ${valueClassName ?? accentClass}`}>{value}</div>;
      }
      const match = value.match(/^(\$|R\$)\s?(.*)$/);
      const prefix = match?.[1] ?? "";
      const rest = match?.[2] ?? value;
      return (
        <div className="text-2xl sm:text-[26px] font-bold tracking-tight text-foreground inline-flex items-baseline gap-2">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground/80">
            <span className="w-1.5 h-1.5 rounded-full bg-wr-negative shadow-[0_0_8px_hsl(var(--wr-negative)/0.45)]" />
            {prefix}
          </span>
          <span className="tabular-nums">{rest}</span>
        </div>
      );
    };

    return (
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">{label}</p>
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Skeleton className="h-7 sm:h-[26px] w-24 sm:w-32 rounded" />
                {hint !== undefined && <Skeleton className="h-3 w-16 mt-2 rounded" />}
              </motion.div>
            ) : (
              <motion.div
                key={`value-${value}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {renderValue()}
                {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    );
  };


  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button size="sm" variant="ghost" onClick={() => navigate(-1)} className="h-7 px-2">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
            </Button>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            📊 Consolidado Multi-Op
            <Badge variant="outline" className="text-[10px] font-mono">SUPER ADMIN</Badge>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Visão executiva do ecossistema · lucro bruto (revenue − spend)
            {data && ` · ${data.start_date} → ${data.end_date}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={rangeMode} onValueChange={(v) => setRangeMode(v as RangeMode)}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rangeMode === "month" && (
            <input
              type="month"
              value={selectedMonth}
              max={currentYm}
              onChange={(e) => setSelectedMonth(e.target.value || currentYm)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
          )}
          {rangeMode === "custom" && (
            <>
              <input
                type="date"
                value={customStart}
                max={customEnd || todayIso}
                onChange={(e) => setCustomStart(e.target.value || todayIso)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={todayIso}
                onChange={(e) => setCustomEnd(e.target.value || todayIso)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              />
            </>
          )}
          <Select value={currency} onValueChange={(v) => setCurrency(v as ConsolidatedCurrency)}>
            <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL" className="text-xs">BRL</SelectItem>
              <SelectItem value="USD" className="text-xs">USD</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeSuspended}
              onChange={(e) => setIncludeSuspended(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Incluir suspensas
          </label>
          <Button
            size="sm"
            variant={privacy.enabled ? "default" : "outline"}
            onClick={privacy.toggle}
            className="h-8 gap-1.5"
            title="Modo Privado — anonimiza nomes e valores pra print/gravação"
            aria-pressed={privacy.enabled}
          >
            {privacy.enabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{privacy.enabled ? "Privado" : "Modo Privado"}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>

        </div>
      </div>

      {/* Hero anual — Faturamento do ecossistema (YTD) · golden-ratio focal point */}
      <Card className="relative overflow-hidden border-border/60 bg-card/95 backdrop-blur-sm rounded-3xl">
        {/* Ambient glows */}
        <div className="absolute -right-32 -top-32 w-96 h-96 rounded-full bg-wr-positive/[0.06] blur-[120px] pointer-events-none" />
        <div className="absolute -left-32 -bottom-32 w-96 h-96 rounded-full bg-foreground/[0.04] blur-[100px] pointer-events-none" />
        <CardContent className="relative z-10 p-8 sm:p-10 lg:p-12">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,0.55fr)_1fr] gap-8 md:gap-6 lg:gap-10 items-center">
            {/* Left · metadata */}
            <div className="flex flex-col gap-5 md:gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-wr-positive shadow-[0_0_10px_hsl(var(--wr-positive)/0.5)] animate-pulse" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                    Faturamento do ecossistema · {new Date().getFullYear()}
                  </span>
                </div>
                <motion.div
                  className="h-px bg-border"
                  initial={false}
                  animate={{ width: animateHero ? "3rem" : "0rem" }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />

              </div>
              <div>
                <p className="text-[12px] leading-relaxed text-muted-foreground font-medium">
                  Revenue acumulado YTD
                  <br />
                  <span className="text-muted-foreground/70 font-normal">
                    {yearStart} → {today}
                    {yearData?.totals?.operations_count ? ` · ${fmtCount(yearData.totals.operations_count)} operações` : ""}
                  </span>
                </p>
              </div>
            </div>

            {/* Right · value · centered in the larger column for ideal focal point */}
            <div className="flex items-center justify-center md:justify-center lg:justify-end lg:pr-6 min-h-[7rem] sm:min-h-[9rem]">
              <AnimatePresence mode="wait" initial={false}>
                {yearLoading || yearFetching ? (
                  <motion.div
                    key="hero-skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="inline-flex flex-col items-center md:items-center lg:items-end gap-3 w-full max-w-[520px]"
                  >
                    <Skeleton className="h-14 sm:h-20 lg:h-24 w-full rounded-xl" />
                    <Skeleton className="h-4 w-32 rounded-md" />
                  </motion.div>
                ) : (() => {
                  const revenueValue = yearData?.totals?.revenue ?? 0;
                  const raw = new Intl.NumberFormat(currency === "USD" ? "en-US" : "pt-BR", {
                    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
                  }).format(revenueValue);
                  const match = raw.match(/^(\D+)\s?([\d.,]+?)(?:[.,](\d{2}))?$/);
                  const prefix = match?.[1]?.trim() ?? (currency === "USD" ? "$" : "R$");
                  const intPart = match?.[2] ?? raw;
                  const decPart = match?.[3];
                  const valueKey = `${currency}-${revenueValue}`;
                  return (
                    <motion.div
                      key={valueKey}
                      initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="inline-flex flex-col items-center md:items-center lg:items-end"
                    >
                      <div className="flex items-baseline gap-2 md:gap-3">
                        <span className="text-xl sm:text-2xl md:text-3xl font-semibold text-muted-foreground/70 tracking-tight">
                          {prefix}
                        </span>
                        <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-[5.5rem] font-black tracking-tighter text-foreground tabular-nums leading-none">
                          {intPart}
                          {decPart && <span className="opacity-40">,{decPart}</span>}
                        </h1>
                      </div>
                      <div className="mt-3 md:mt-4">
                        <span
                          className={`px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-bold tracking-wide uppercase text-wr-positive/90 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${animateHero ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-1 scale-95"}`}
                        >
                          Consolidado Multi-Op
                        </span>
                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>


            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI row (6 cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <KpiCard label="Spend" value={data ? fmtMoney(data.totals.spend) : "—"} accent="muted" valueClassName="text-foreground" prefixIndicator loading={isLoading || isFetching} />
        <KpiCard label="Revenue" value={data ? fmtMoney(data.totals.revenue) : "—"} accent="positive" loading={isLoading || isFetching} />
        <KpiCard label="Vendas" value={data ? fmtCount(data.totals.sales) : "—"} loading={isLoading || isFetching} />
        <KpiCard label="ROAS" value={data ? `${data.totals.roas.toFixed(2)}x` : "—"} accent={data && data.totals.roas >= 1.2 ? "positive" : "negative"} loading={isLoading || isFetching} />
        <KpiCard
          label="Lucro Bruto"
          value={data ? fmtMoney(data.totals.lucro_bruto) : "—"}
          accent={data && data.totals.lucro_bruto >= 0 ? "positive" : "negative"}
          hint={data ? `${fmtCount(data.totals.operations_count)} operações` : undefined}
          loading={isLoading || isFetching}
        />
        <div
          title={
            commissionError
              ? "Falha ao ler a comissão de todas as operações"
              : commission?.failed?.length
                ? `Falha ao ler comissão de: ${commission.failed
                    .map((name) => {
                      const op = data?.operations?.find((o) => o.operation_name === name);
                      return op ? opName(op.operation_id, name) : name;
                    })
                    .join(", ")}`
                : commission?.configured?.length
                  ? commission.configured
                      .map((c) => `${opName(c.operationId, c.name)}: ${fmtMoney(c.valor)}`)
                      .join(" · ")
                  : "Nenhuma operação com comissão configurada"
          }
        >
          <KpiCard
            label="Comissão SPACE"
            value={
              commissionError || commission?.failed?.length
                ? "—"
                : commission
                  ? fmtMoney(commission.total)
                  : "—"
            }
            accent={!commissionError && commission && commission.total > 0 ? "positive" : "muted"}
            valueClassName={
              !commissionError && commission && commission.total > 0 ? undefined : "text-muted-foreground"
            }
            hint={
              commission?.configured?.length
                ? `${fmtCount(commission.configured.length)} ops configuradas`
                : undefined
            }
            loading={isLoading || isFetching || commissionLoading}
          />
        </div>
      </div>



      {/* Executive command grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Faturamento do ecossistema + ranking */}
        <Card className="xl:col-span-7 relative overflow-hidden border-border/40 bg-card/80 backdrop-blur-sm">
          <div className="absolute -right-24 -top-24 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
          <CardContent className="p-6 sm:p-8 relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Faturamento do Ecossistema
            </p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                {data ? fmtMoney(data.totals.revenue) : "—"}
              </span>
              {data && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  data.totals.roas >= 1.2
                    ? "text-wr-positive bg-wr-positive/10"
                    : "text-wr-negative bg-wr-negative/10"
                }`}>
                  {data.totals.roas >= 1.2 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  ROAS {data.totals.roas.toFixed(2)}x
                </span>
              )}
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <span>Ranking por Operação</span>
                <span>% do topo</span>
              </div>
              {isLoading ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-8" />
                      </div>
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ))}
                </>
              ) : activeRankedOps.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma operação com faturamento no período.</p>
              ) : (
                activeRankedOps.map((r) => {
                  const pct = maxRevenue > 0 ? (r.revenue / maxRevenue) * 100 : 0;
                  const positive = r.lucro_bruto >= 0;
                  return (
                    <button
                      key={r.operation_id}
                      onClick={() => handleDrillDown(r.operation_id)}
                      className="w-full text-left group space-y-1.5 focus:outline-none"
                    >
                      <div className="flex justify-between items-center gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="w-8 h-8 shrink-0 border border-border/60">
                            {!privacy.enabled && (
                              <AvatarImage src={opLogos?.[r.operation_id] ?? undefined} alt={r.operation_name} />
                            )}
                            <AvatarFallback className={privacy.enabled ? "bg-muted text-muted-foreground text-[10px] font-bold" : "bg-primary/15 text-primary text-[10px] font-bold"}>
                              {privacy.enabled
                                ? opName(r.operation_id, r.operation_name).slice(-1)
                                : getOpInitials(r.operation_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
                            {opName(r.operation_id, r.operation_name)}
                          </span>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-3">
                          <span className={`text-[11px] font-mono ${positive ? "text-wr-positive" : "text-wr-negative"}`}>
                            {positive ? "+" : ""}{fmtCompact(r.lucro_bruto)}
                          </span>
                          <span className="text-xs font-semibold w-14 text-right">{fmtCompact(r.revenue)}</span>
                          <span className="text-[10px] text-muted-foreground w-9 text-right font-mono">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-wr-negative rounded-full transition-all duration-700 ease-out group-hover:bg-wr-negative/90"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right column — Revenue vs Spend chart */}
        <Card className="xl:col-span-5 border-border/40 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm">Revenue vs Spend por Operação</CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Comparativo de faturamento e investimento
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-wr-positive" />
                  <span className="text-muted-foreground">Revenue</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/60" />
                  <span className="text-muted-foreground">Spend</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Nenhuma operação com dados no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 88 + 40)}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 64, left: 8, bottom: 8 }}
                  barGap={6}
                  barCategoryGap="24%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtCompact}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={140}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.25)" }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(value: number, name: string) => [fmtMoney(value), name === "revenue" ? "Revenue" : "Spend"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--wr-positive))" radius={[0, 6, 6, 0]} barSize={22}>
                    <LabelList
                      dataKey="revenue"
                      position="right"
                      formatter={(v: number) => fmtCompact(v)}
                      style={{ fill: "hsl(var(--wr-positive))", fontSize: 11, fontWeight: 600 }}
                    />
                  </Bar>
                  <Bar dataKey="spend" fill="hsl(var(--muted-foreground))" fillOpacity={0.5} radius={[0, 6, 6, 0]} barSize={22}>
                    <LabelList
                      dataKey="spend"
                      position="right"
                      formatter={(v: number) => fmtCompact(v)}
                      style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 500 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela detalhada por operação */}
      <Card className="border-border/40 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Por operação · click na linha para drill-down</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : rankedOps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem operações no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground border-b border-border/40">
                    <th className="text-left py-2 px-3 font-bold">Operação</th>
                    <th className="text-right py-2 px-3 font-bold">Spend</th>
                    <th className="text-right py-2 px-3 font-bold">Revenue</th>
                    <th className="text-right py-2 px-3 font-bold">Vendas</th>
                    <th className="text-right py-2 px-3 font-bold">ROAS</th>
                    <th className="text-right py-2 px-3 font-bold">Lucro Bruto</th>
                    <th className="text-right py-2 px-3 font-bold">Margem %</th>
                    <th className="text-right py-2 px-3 font-bold">Camp Ativas</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedOps.map((r) => {
                    const margem = r.revenue > 0 ? (r.lucro_bruto / r.revenue) * 100 : 0;
                    const positive = r.lucro_bruto >= 0;
                    return (
                      <tr
                        key={r.operation_id}
                        onClick={() => handleDrillDown(r.operation_id)}
                        className="border-b border-border/20 hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="w-7 h-7 shrink-0 border border-border/60">
                              {!privacy.enabled && (
                                <AvatarImage src={opLogos?.[r.operation_id] ?? undefined} alt={r.operation_name} />
                              )}
                              <AvatarFallback className={privacy.enabled ? "bg-muted text-muted-foreground text-[9px] font-bold" : "bg-primary/15 text-primary text-[9px] font-bold"}>
                                {privacy.enabled
                                  ? opName(r.operation_id, r.operation_name).slice(-1)
                                  : getOpInitials(r.operation_name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{opName(r.operation_id, r.operation_name)}</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-3 font-mono">{fmtMoney(r.spend)}</td>
                        <td className="text-right py-3 px-3 font-mono">{fmtMoney(r.revenue)}</td>
                        <td className="text-right py-3 px-3 font-mono">{fmtCount(r.sales)}</td>
                        <td className={`text-right py-3 px-3 font-mono font-semibold ${r.roas >= 1.2 ? "text-wr-positive" : "text-wr-negative"}`}>
                          {r.roas.toFixed(2)}x
                        </td>
                        <td className={`text-right py-3 px-3 font-mono font-semibold ${positive ? "text-wr-positive" : "text-wr-negative"}`}>
                          {fmtMoney(r.lucro_bruto)}
                        </td>
                        <td className={`text-right py-3 px-3 font-mono ${positive ? "text-wr-positive" : "text-wr-negative"}`}>
                          {margem.toFixed(1)}%
                        </td>
                        <td className="text-right py-3 px-3 font-mono text-muted-foreground">{fmtCount(r.active_campaigns_count ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && (
        <p className="text-[10px] text-muted-foreground font-mono">
          Fontes · histórico: {data.source_notes.historical_days} · today spend: {data.source_notes.today_spend} · today revenue: {data.source_notes.today_revenue}
          {" · "}gerado {new Date(data.generated_at).toLocaleTimeString("pt-BR")}
          {currency === "USD" && ` · FX ${data.fx_used}`}
        </p>
      )}
    </div>
  );
}
