import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Target, Settings2,
  Megaphone, Newspaper, Facebook, RefreshCw, Activity, Gauge, Layers, Globe,
  Trello,
} from "lucide-react";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMediaChannelsData, type ChannelMetrics } from "@/hooks/useMediaChannelsData";
import { MediaChannelsHistoryChart } from "@/components/media-channels/MediaChannelsHistoryChart";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationId } from "@/contexts/OperationContext";
import { supabase } from "@/integrations/supabase/client";
import { useCountUp } from "@/hooks/useCountUp";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/* ─── Formatters (idênticos ao Overview/Analytics) ─── */
function fmt(value: number, type: "currency" | "number" | "percent" | "roas") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(value));
  if (type === "percent") return `${value.toFixed(1)}%`;
  if (type === "roas") return `${value.toFixed(2)}x`;
  return String(value);
}
const fmtBRL0 = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

function AnimatedValue({ target, type }: { target: number; type: "currency" | "number" | "percent" | "roas" }) {
  const animated = useCountUp(target);
  return <>{fmt(animated, type)}</>;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Facebook, Newspaper, Megaphone, Globe, Trello,
};

import metaLogo from "@/assets/facebook-logo.webp.asset.json";
import newsbreakLogo from "@/assets/channels/newsbreak.asset.json";
import mgidLogo from "@/assets/channels/mgid.asset.json";
import taboolaLogo from "@/assets/taboola-logo.jpeg.asset.json";

const CHANNEL_LOGOS: Record<string, string> = {
  meta: metaLogo.url,
  newsbreak: newsbreakLogo.url,
  mgid: mgidLogo.url,
  taboola: taboolaLogo.url,
};

function ChannelLogo({
  slug,
  name,
  className = "h-4 w-4",
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  const src = CHANNEL_LOGOS[slug];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={name}
      className={`${className} object-contain`}
      loading="lazy"
    />
  );
}

/* ─── KPI Card padrão (idêntico ao Overview/Analytics) ─── */
function KpiCard({
  label, value, type, icon: Icon, colorBySign, glow, hint,
}: {
  label: string;
  value: number;
  type: "currency" | "number" | "percent" | "roas";
  icon: React.ElementType;
  colorBySign?: boolean;
  glow?: boolean;
  hint?: string;
}) {
  const valueColor = colorBySign
    ? value >= 0 ? "text-wr-positive" : "text-destructive"
    : "text-foreground";
  return (
    <Card className="mobile-kpi-card bg-card border border-border/50">
      <CardContent className="px-5 py-4 md:p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] md:text-[10px] font-medium text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground/40" />
        </div>
        <p className={`text-[28px] md:text-xl font-bold font-data leading-tight ${valueColor} ${glow ? "drop-shadow-[0_0_8px_hsl(145,80%,42%,0.4)]" : ""}`}>
          <AnimatedValue target={value} type={type} />
        </p>
        {hint && (
          <p className="text-[10px] md:text-[9px] text-muted-foreground mt-1.5 md:mt-1">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Card de canal individual (alinhado ao dash) ─── */
function ChannelCard({ m, onEditGoal }: { m: ChannelMetrics; onEditGoal: () => void }) {
  const Icon = ICONS[m.channel.icon] ?? Megaphone;
  const profitPositive = m.profit >= 0;
  const roasGoalMet = m.goal && m.roas >= m.goal.roas_target;
  const cpaGoalMet = m.goal && m.cpa > 0 && m.cpa <= m.goal.cpa_target;

  return (
    <Card className="bg-card border border-border/50 hover:border-primary/20 transition-colors duration-200">
      {/* faixa colorida superior */}
      <div className="h-0.5 w-full rounded-t-[var(--radius)]" style={{ backgroundColor: m.channel.color }} />

      <CardContent className="p-4 space-y-3">
        {/* Header do canal */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="h-9 w-9 rounded-md flex items-center justify-center overflow-hidden bg-white ring-1 ring-border/40 p-0.5"
            >
              {CHANNEL_LOGOS[m.channel.slug] ? (
                <ChannelLogo slug={m.channel.slug} name={m.channel.name} className="h-8 w-8" />
              ) : (
                <Icon className="h-4 w-4" style={{ color: m.channel.color }} />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">{m.channel.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {fmt(m.sales, "number")} vendas no período
              </p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground/60 hover:text-foreground" onClick={onEditGoal} title="Editar metas">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Lucro destaque */}
        <div className={`rounded-md p-3 border ${
          profitPositive
            ? "bg-wr-positive/5 border-wr-positive/20"
            : "bg-destructive/5 border-destructive/20"
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-muted-foreground">Lucro</span>
            {profitPositive ? (
              <TrendingUp className="h-3.5 w-3.5 text-wr-positive" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
          <p className={`text-xl font-bold font-data leading-tight ${profitPositive ? "text-wr-positive" : "text-destructive"}`}>
            {fmt(m.profit, "currency")}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Margem {fmt(m.margin, "percent")}</p>
        </div>

        {/* Grid 2x2 de KPIs */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-secondary/40 px-3 py-2.5">
            <p className="text-[10px] font-medium text-muted-foreground">Faturamento</p>
            <p className="text-base font-bold font-data text-foreground mt-0.5">{fmt(m.revenue, "currency")}</p>
          </div>
          <div className="rounded-md bg-secondary/40 px-3 py-2.5">
            <p className="text-[10px] font-medium text-muted-foreground">Investimento</p>
            <p className="text-base font-bold font-data text-foreground mt-0.5">{fmt(m.spend, "currency")}</p>
            {m.channel.spend_source === "redtrack_cost" && m.spend === 0 && (
              <p className="text-[9px] text-wr-warning mt-0.5">Sem cost no RedTrack</p>
            )}
            {m.channel.spend_source === "taboola_api" && m.spend === 0 && (
              <p className="text-[9px] text-wr-warning mt-0.5">Sem dados na API Taboola</p>
            )}
          </div>
          <div className="rounded-md bg-secondary/40 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-muted-foreground">ROAS</p>
              {m.goal && (
                <span className={`text-[9px] font-medium tabular-nums ${roasGoalMet ? "text-wr-positive" : "text-muted-foreground"}`}>
                  meta {m.goal.roas_target.toFixed(1)}x
                </span>
              )}
            </div>
            <p className={`text-base font-bold font-data mt-0.5 ${roasGoalMet ? "text-wr-positive" : "text-foreground"}`}>
              {fmt(m.roas, "roas")}
            </p>
          </div>
          <div className="rounded-md bg-secondary/40 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-muted-foreground">CPA</p>
              {m.goal && m.cpa > 0 && (
                <span className={`text-[9px] font-medium tabular-nums ${cpaGoalMet ? "text-wr-positive" : "text-muted-foreground"}`}>
                  meta {fmtBRL0(m.goal.cpa_target)}
                </span>
              )}
            </div>
            <p className={`text-base font-bold font-data mt-0.5 ${cpaGoalMet ? "text-wr-positive" : "text-foreground"}`}>
              {m.cpa > 0 ? fmt(m.cpa, "currency") : "—"}
            </p>
          </div>
        </div>

        {/* Atingimento de meta */}
        {m.goal && m.goal.roas_target > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-medium text-muted-foreground">Atingimento ROAS</span>
              <span className={`text-[10px] tabular-nums font-semibold ${roasGoalMet ? "text-wr-positive" : "text-muted-foreground"}`}>
                {fmt(m.roas_attainment, "percent")}
              </span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.min(m.roas_attainment, 100)}%`,
                  backgroundColor: roasGoalMet ? "hsl(var(--wr-positive))" : m.channel.color,
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Editor de Metas ─── */
function GoalEditor({
  metrics, open, onClose, onSaved,
}: { metrics: ChannelMetrics | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { isAdmin } = useAuth();
  const opId = useOperationId();
  const [roas, setRoas] = useState("");
  const [cpa, setCpa] = useState("");
  const [revenue, setRevenue] = useState("");
  const [minSales, setMinSales] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (metrics?.goal) {
      setRoas(String(metrics.goal.roas_target));
      setCpa(String(metrics.goal.cpa_target));
      setRevenue(String(metrics.goal.daily_revenue_target));
      setMinSales(String(metrics.goal.min_sales_per_day));
    } else {
      setRoas("1.8"); setCpa("80"); setRevenue("0"); setMinSales("0");
    }
  }, [metrics?.channel.id, metrics?.goal]);

  const save = async () => {
    if (!metrics) return;
    setSaving(true);
    try {
      const payload = {
        channel_id: metrics.channel.id,
        roas_target: Number(roas) || 0,
        cpa_target: Number(cpa) || 0,
        daily_revenue_target: Number(revenue) || 0,
        min_sales_per_day: Number(minSales) || 0,
      };
      if (metrics.goal) {
        const { error } = await supabase
          .from("channel_performance_goals")
          .update(payload)
          .eq("id", metrics.goal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("channel_performance_goals")
          .insert({ ...payload, operation_id: opId! });
        if (error) throw error;
      }
      toast.success("Metas atualizadas");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar metas");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Metas — {metrics?.channel.name}</DialogTitle>
        </DialogHeader>
        {!isAdmin && (
          <div className="rounded-md bg-wr-warning/10 border border-wr-warning/30 p-3 text-xs text-wr-warning">
            Apenas administradores podem editar metas.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground">ROAS alvo</Label>
            <Input type="number" step="0.1" value={roas} onChange={(e) => setRoas(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground">CPA alvo (R$)</Label>
            <Input type="number" step="1" value={cpa} onChange={(e) => setCpa(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground">Faturamento diário alvo (R$)</Label>
            <Input type="number" step="100" value={revenue} onChange={(e) => setRevenue(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground">Vendas mín./dia</Label>
            <Input type="number" step="1" value={minSales} onChange={(e) => setMinSales(e.target.value)} disabled={!isAdmin} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !isAdmin}>
            {saving ? "Salvando..." : "Salvar metas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Tooltip dos gráficos (idêntico ao Analytics) ─── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-[11px] space-y-1">
      <p className="font-medium text-foreground mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-bold font-data">{fmt(Number(p.value), "currency")}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Página principal ─── */
export default function MediaChannels() {
  const { dateRange } = useDateRange();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useMediaChannelsData({
    startDate: dateRange[0],
    endDate: dateRange[1],
  });
  const [editing, setEditing] = useState<ChannelMetrics | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>("all");

  const allChannels = data ?? [];
  const channels = selectedChannel === "all"
    ? allChannels
    : allChannels.filter((c) => c.channel.slug === selectedChannel);
  
  // Se Taboola foi selecionado mas não retornou dados ainda, garantir que apareça se existir na lista de canais configurados
  const taboolaAvailable = allChannels.some(c => c.channel.slug === "taboola");
  const showTaboolaEmpty = selectedChannel === "taboola" && !taboolaAvailable;

  // Totais consolidados (do filtro ativo)
  const totalSpend = channels.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);
  const totalProfit = channels.reduce((s, c) => s + c.profit, 0);
  const totalSales = channels.reduce((s, c) => s + c.sales, 0);
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const blendedMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // CPA blended deve refletir só canais com investimento real (mídia paga).
  // Canais sem spend (ex: NewsBreak sem cost no RT) não diluem o CPA.
  const paidChannels = channels.filter((c) => c.spend > 0);
  const paidSpend = paidChannels.reduce((s, c) => s + c.spend, 0);
  const paidSales = paidChannels.reduce((s, c) => s + c.sales, 0);
  const blendedCpa = paidSales > 0 ? paidSpend / paidSales : 0;

  // Série diária do período
  const chartData = useMemo(() => {
    const datesSet = new Set<string>();
    channels.forEach((c) => c.daily.forEach((d) => datesSet.add(d.date)));
    const dates = Array.from(datesSet).sort();
    return dates.map((date) => {
      const row: any = { date: date.slice(5).replace("-", "/") };
      channels.forEach((c) => {
        const day = c.daily.find((d) => d.date === date);
        const dRev = day?.revenue ?? 0;
        const dSpend = day?.spend ?? 0;
        row[`${c.channel.slug}_revenue`] = dRev;
        row[`${c.channel.slug}_spend`] = dSpend;
        row[`${c.channel.slug}_profit`] = dRev - dSpend;
        row[`${c.channel.slug}_roas`] = dSpend > 0 ? Number((dRev / dSpend).toFixed(2)) : 0;
      });
      return row;
    });
  }, [channels]);

  const channelComparison = useMemo(
    () =>
      channels.map((c) => ({
        name: c.channel.name,
        slug: c.channel.slug,
        color: c.channel.color,
        Investimento: Math.round(c.spend),
        Faturamento: Math.round(c.revenue),
        Lucro: Math.round(c.profit),
      })),
    [channels],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="full-width-page space-y-6 w-full"
    >
      {/* Header padrão dash */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground">Canais de Mídia</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Performance comparativa entre fontes de tráfego
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider gap-1 py-1 font-medium">
            <Activity className="h-3 w-3" />
            {dateRange[0]} → {dateRange[1]}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtro de canais (chips) */}
      {allChannels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mr-1">
            Canal:
          </span>
          <button
            onClick={() => setSelectedChannel("all")}
            className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors duration-200 flex items-center gap-1.5 ${
              selectedChannel === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Layers className="h-3 w-3" />
            Todos
            <span className="text-[9px] opacity-70">({allChannels.length})</span>
          </button>
          {allChannels.map((c) => {
            const Icon = ICONS[c.channel.icon] ?? Megaphone;
            const active = selectedChannel === c.channel.slug;
            return (
              <button
                key={c.channel.id}
                onClick={() => setSelectedChannel(c.channel.slug)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors duration-200 flex items-center gap-1.5 ${
                  active
                    ? "text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
                style={
                  active
                    ? { backgroundColor: c.channel.color, borderColor: c.channel.color }
                    : { borderColor: `${c.channel.color}40` }
                }
              >
                {CHANNEL_LOGOS[c.channel.slug] ? (
                  <ChannelLogo slug={c.channel.slug} name={c.channel.name} className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                {c.channel.name}
              </button>
            );
          })}
        </div>
      )}

      {/* KPIs consolidados */}
      <div>
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
          Performance Consolidada
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Investimento" icon={DollarSign} value={totalSpend} type="currency" />
          <KpiCard label="Faturamento" icon={TrendingUp} value={totalRevenue} type="currency" />
          <KpiCard
            label="Lucro Líquido"
            icon={Target}
            value={totalProfit}
            type="currency"
            colorBySign
            glow={totalProfit > 0}
            hint={`Margem ${fmt(blendedMargin, "percent")}`}
          />
          <KpiCard label="ROAS" icon={Gauge} value={blendedRoas} type="roas" colorBySign={blendedRoas >= 1} />
          <KpiCard label="Vendas" icon={ShoppingCart} value={totalSales} type="number" />
          <KpiCard label="CPA Médio" icon={Activity} value={blendedCpa} type="currency" hint="Investimento / Vendas (mídia paga)" />
        </div>
      </div>

      {/* Cards por canal */}
      <div>
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
          Detalhe por Canal
        </h2>
        {isLoading ? (
          <Card className="bg-card border border-border/50">
            <CardContent className="p-8 text-center text-xs text-muted-foreground">
              Carregando canais...
            </CardContent>
          </Card>
        ) : channels.length === 0 ? (
          <Card className="bg-card border border-border/50">
            <CardContent className="p-8 text-center text-xs text-muted-foreground">
              Nenhum canal disponível para o filtro selecionado.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {channels.map((m) => (
              <ChannelCard key={m.channel.id} m={m} onEditGoal={() => setEditing(m)} />
            ))}
          </div>
        )}
      </div>

      {/* Comparativo Investimento × Faturamento */}
      {channels.length > 0 && channelComparison.some((c) => c.Investimento > 0 || c.Faturamento > 0) && (
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
            Investimento × Faturamento por Canal
          </h2>
          <Card className="bg-card border border-border/50">
            <CardContent className="p-5">
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelComparison} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtBRL0(Number(v))} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="Investimento" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Faturamento" fill="hsl(var(--wr-info))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Lucro" fill="hsl(var(--wr-positive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Evolução diária do período (Tabs) */}
      {channels.length > 0 && chartData.length > 0 && (
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
            Evolução de Performance
          </h2>
          <Card className="bg-card border border-border/50">
            <CardContent className="p-5">
              <Tabs defaultValue="revenue" className="space-y-4">
                <TabsList className="h-8 bg-secondary/40 p-0.5">
                  <TabsTrigger value="revenue" className="text-[11px] h-7 px-3">Faturamento</TabsTrigger>
                  <TabsTrigger value="spend" className="text-[11px] h-7 px-3">Investimento</TabsTrigger>
                  <TabsTrigger value="profit" className="text-[11px] h-7 px-3">Lucro</TabsTrigger>
                  <TabsTrigger value="roas" className="text-[11px] h-7 px-3">ROAS</TabsTrigger>
                </TabsList>

                {(["revenue", "spend", "profit"] as const).map((kind) => (
                  <TabsContent key={kind} value={kind} className="m-0">
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtBRL0(Number(v))} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                          {channels.map((c) => (
                            <Line
                              key={c.channel.id}
                              type="monotone"
                              dataKey={`${c.channel.slug}_${kind}`}
                              name={c.channel.name}
                              stroke={c.channel.color}
                              strokeWidth={2.2}
                              dot={chartData.length <= 14 ? { r: 2.5 } : false}
                              activeDot={{ r: 4 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </TabsContent>
                ))}

                <TabsContent value="roas" className="m-0">
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          {channels.map((c) => (
                            <linearGradient key={c.channel.id} id={`grad-${c.channel.slug}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={c.channel.color} stopOpacity={0.4} />
                              <stop offset="100%" stopColor={c.channel.color} stopOpacity={0.02} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(1)}x`} />
                        <Tooltip
                          formatter={(v: any) => `${Number(v).toFixed(2)}x`}
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.5rem",
                            fontSize: "11px",
                          }}
                          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        {channels.map((c) => (
                          <Area
                            key={c.channel.id}
                            type="monotone"
                            dataKey={`${c.channel.slug}_roas`}
                            name={c.channel.name}
                            stroke={c.channel.color}
                            strokeWidth={2}
                            fill={`url(#grad-${c.channel.slug})`}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Histórico diário 30/60 dias */}
      <div>
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
          Histórico Diário (30/60 dias)
        </h2>
        <MediaChannelsHistoryChart selectedChannel={selectedChannel} />
      </div>

      {/* Aviso NewsBreak sem dados */}
      {selectedChannel === "all" && allChannels.find((c) => c.channel.slug === "newsbreak" && c.sales === 0) && (
        <Card className="bg-card border border-wr-info/30">
          <CardContent className="p-4 text-xs text-muted-foreground flex items-start gap-3">
            <Newspaper className="h-4 w-4 text-wr-info shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground">NewsBreak ainda sem eventos.</strong> Assim que o
              RedTrack começar a receber conversões com{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">rt_source = newsbreak</code> ou{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">utm_source = newsbreak</code>,
              os KPIs serão preenchidos automaticamente. O gasto será extraído do campo{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">cost</code> dos eventos do RedTrack.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aviso Taboola sem dados */}
      {selectedChannel === "all" && allChannels.find((c) => c.channel.slug === "taboola" && c.spend === 0) && (
        <Card className="bg-card border border-wr-warning/30">
          <CardContent className="p-4 text-xs text-muted-foreground flex items-start gap-3">
            <Globe className="h-4 w-4 text-wr-warning shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground">Taboola sem investimento.</strong> Verifique se o
              Client ID e Secret estão configurados corretamente nas integrações e se a conta possui gasto no período selecionado.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aviso Taboola sem dados */}
      {selectedChannel === "all" && allChannels.find((c) => c.channel.slug === "taboola" && c.spend === 0) && (
        <Card className="bg-card border border-wr-warning/30">
          <CardContent className="p-4 text-xs text-muted-foreground flex items-start gap-3">
            <Globe className="h-4 w-4 text-wr-warning shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground">Taboola sem investimento.</strong> Verifique se o
              Client ID e Secret estão configurados corretamente nas integrações e se a conta possui gasto no período selecionado.
            </div>
          </CardContent>
        </Card>
      )}

      <GoalEditor
        metrics={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["media-channels-data"] })}
      />
    </motion.div>
  );
}
