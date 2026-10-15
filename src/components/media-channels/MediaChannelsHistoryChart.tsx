import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from "recharts";
import { useMediaChannelsHistory, type AccountDailySeries } from "@/hooks/useMediaChannelsHistory";
import { Users } from "lucide-react";

type ScaleMode = "normalized" | "auto";
type GroupMode = "channel" | "account";
/**
 * Modos de visualização:
 *  - combined: barras Inv (empilhadas) + linhas Fat (atual)
 *  - stacked:  barras empilhadas para Inv E Fat (lado a lado por dia)
 *  - lines:    apenas linhas para Inv e Fat (sem barras)
 */
type ChartMode = "combined" | "stacked" | "lines";

function fmt(value: number, type: "currency" | "number" | "roas") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(value));
  if (type === "roas") return `${value.toFixed(2)}x`;
  return String(value);
}
const fmtBRL0 = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

type Range = 30 | 60;

interface Props {
  /** slug do canal selecionado, ou "all" para mostrar todos */
  selectedChannel: string;
}

function HistoryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-[11px] space-y-1 max-w-xs">
      <p className="font-medium text-foreground mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={`${p.dataKey}`} style={{ color: p.color }} className="flex items-center justify-between gap-3">
          <span className="truncate">{p.name}</span>
          <span className="font-bold font-data tabular-nums">{fmt(Number(p.value), "currency")}</span>
        </p>
      ))}
    </div>
  );
}

// Paleta determinística para contas (HSL semânticos)
const ACCOUNT_PALETTE = [
  "hsl(var(--wr-info))",
  "hsl(var(--wr-positive))",
  "hsl(var(--wr-warning))",
  "hsl(var(--destructive))",
  "hsl(var(--primary))",
  "hsl(217, 91%, 60%)",
  "hsl(160, 84%, 39%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 87%, 65%)",
  "hsl(190, 95%, 50%)",
];

function colorForIndex(i: number) {
  return ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length];
}

export function MediaChannelsHistoryChart({ selectedChannel }: Props) {
  const [days, setDays] = useState<Range>(30);
  const [scaleMode, setScaleMode] = useState<ScaleMode>("normalized");
  const [groupMode, setGroupMode] = useState<GroupMode>("channel");
  const [chartMode, setChartMode] = useState<ChartMode>("combined");
  const [accountFilter, setAccountFilter] = useState<string>("all"); // account_id ou "all"
  const { data, isLoading } = useMediaChannelsHistory({ days });

  const channelSeries = useMemo(() => {
    const all = data ?? [];
    return selectedChannel === "all"
      ? all
      : all.filter((s) => s.channel.slug === selectedChannel);
  }, [data, selectedChannel]);

  // Apenas canais com quebra por conta (Meta) podem entrar em modo "account"
  const accountCapableChannel = useMemo(() => {
    if (selectedChannel === "all") {
      return channelSeries.find((s) => s.accounts && s.accounts.length > 0) ?? null;
    }
    const c = channelSeries[0];
    return c?.accounts && c.accounts.length > 0 ? c : null;
  }, [channelSeries, selectedChannel]);

  const accountsAvailable = accountCapableChannel?.accounts ?? [];

  // Reset filtro de conta quando muda canal/grupo/dados
  useEffect(() => {
    setAccountFilter("all");
  }, [selectedChannel, groupMode, accountsAvailable.length]);

  // Se canal não suporta contas, força modo "channel"
  useEffect(() => {
    if (groupMode === "account" && !accountCapableChannel) {
      setGroupMode("channel");
    }
  }, [accountCapableChannel, groupMode]);

  // Lista de contas filtrada (Top 8 + filtro pontual)
  const visibleAccounts: AccountDailySeries[] = useMemo(() => {
    if (!accountCapableChannel) return [];
    if (accountFilter !== "all") {
      return accountsAvailable.filter((a) => a.account_id === accountFilter);
    }
    // Top 8 por gasto para evitar poluição visual
    return accountsAvailable.slice(0, 8);
  }, [accountCapableChannel, accountsAvailable, accountFilter]);

  const chartData = useMemo(() => {
    if (groupMode === "account" && accountCapableChannel) {
      const datesSet = new Set<string>();
      visibleAccounts.forEach((a) => a.daily.forEach((d) => datesSet.add(d.date)));
      const dates = Array.from(datesSet).sort();
      return dates.map((date) => {
        const row: any = { date: date.slice(5).replace("-", "/"), fullDate: date };
        let totalSpend = 0;
        let totalRevenue = 0;
        for (const a of visibleAccounts) {
          const day = a.daily.find((d) => d.date === date);
          const sp = day?.spend ?? 0;
          const rv = day?.revenue ?? 0;
          row[`acc_${a.account_id}_spend`] = sp;
          row[`acc_${a.account_id}_revenue`] = rv;
          totalSpend += sp;
          totalRevenue += rv;
        }
        row.total_spend = totalSpend;
        row.total_revenue = totalRevenue;
        return row;
      });
    }

    // Modo padrão: por canal
    const datesSet = new Set<string>();
    channelSeries.forEach((s) => s.daily.forEach((d) => datesSet.add(d.date)));
    const dates = Array.from(datesSet).sort();
    return dates.map((date) => {
      const row: any = { date: date.slice(5).replace("-", "/"), fullDate: date };
      let totalSpend = 0;
      let totalRevenue = 0;
      for (const s of channelSeries) {
        const day = s.daily.find((d) => d.date === date);
        const sp = day?.spend ?? 0;
        const rv = day?.revenue ?? 0;
        row[`${s.channel.slug}_spend`] = sp;
        row[`${s.channel.slug}_revenue`] = rv;
        totalSpend += sp;
        totalRevenue += rv;
      }
      row.total_spend = totalSpend;
      row.total_revenue = totalRevenue;
      return row;
    });
  }, [groupMode, accountCapableChannel, visibleAccounts, channelSeries]);

  const totals = useMemo(() => {
    let spend = 0;
    let revenue = 0;
    for (const row of chartData) {
      spend += row.total_spend;
      revenue += row.total_revenue;
    }
    return { spend, revenue, profit: revenue - spend, roas: spend > 0 ? revenue / spend : 0 };
  }, [chartData]);

  const subtitle = groupMode === "account"
    ? `Quebra por conta Meta · ${accountCapableChannel?.channel.name ?? ""}${
        accountFilter === "all" && accountsAvailable.length > 8
          ? ` (Top 8 de ${accountsAvailable.length})`
          : ""
      }`
    : "Barras = investimento empilhado por canal · Linhas = faturamento por canal";

  return (
    <Card className="bg-card border border-border/50">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-foreground">
              Investimento × Faturamento — janela móvel
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] gap-1.5 font-medium">
              <span className="text-muted-foreground">Fat</span>
              <span className="font-data tabular-nums">{fmtBRL0(totals.revenue)}</span>
              <span className="text-border">·</span>
              <span className="text-muted-foreground">Inv</span>
              <span className="font-data tabular-nums">{fmtBRL0(totals.spend)}</span>
              <span className="text-border">·</span>
              <span className="text-muted-foreground">ROAS</span>
              <span className="font-data tabular-nums">{fmt(totals.roas, "roas")}</span>
            </Badge>

            {/* Agrupamento */}
            <Tabs value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
              <TabsList className="h-8 bg-secondary/40 p-0.5">
                <TabsTrigger value="channel" className="text-[11px] h-7 px-3" title="Agrupado por canal de mídia">
                  Canal
                </TabsTrigger>
                <TabsTrigger
                  value="account"
                  className="text-[11px] h-7 px-3"
                  disabled={!accountCapableChannel}
                  title={accountCapableChannel ? "Agrupado por conta Meta" : "Selecione um canal Meta para habilitar"}
                >
                  <Users className="h-3 w-3 mr-1" />
                  Conta Meta
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Filtro de conta — só em modo account */}
            {groupMode === "account" && accountsAvailable.length > 0 && (
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="h-8 text-[11px] w-[180px]">
                  <SelectValue placeholder="Conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[11px]">
                    Top 8 contas {accountsAvailable.length > 8 ? `(de ${accountsAvailable.length})` : ""}
                  </SelectItem>
                  {accountsAvailable.map((a) => (
                    <SelectItem key={a.account_id} value={a.account_id} className="text-[11px]">
                      {a.account_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Tabs value={chartMode} onValueChange={(v) => setChartMode(v as ChartMode)}>
              <TabsList className="h-8 bg-secondary/40 p-0.5">
                <TabsTrigger value="combined" className="text-[11px] h-7 px-3" title="Barras de investimento + linhas de faturamento">
                  Combinado
                </TabsTrigger>
                <TabsTrigger value="stacked" className="text-[11px] h-7 px-3" title="Barras empilhadas lado a lado: Inv e Fat">
                  Empilhado
                </TabsTrigger>
                <TabsTrigger value="lines" className="text-[11px] h-7 px-3" title="Somente linhas (Inv e Fat)">
                  Linhas
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Tabs value={scaleMode} onValueChange={(v) => setScaleMode(v as ScaleMode)}>
              <TabsList className="h-8 bg-secondary/40 p-0.5">
                <TabsTrigger value="normalized" className="text-[11px] h-7 px-3" title="Mesma escala para Inv e Fat">
                  Escala única
                </TabsTrigger>
                <TabsTrigger value="auto" className="text-[11px] h-7 px-3" title="Eixos independentes para Inv e Fat">
                  Auto (2 eixos)
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as Range)}>
              <TabsList className="h-8 bg-secondary/40 p-0.5">
                <TabsTrigger value="30" className="text-[11px] h-7 px-3">30 dias</TabsTrigger>
                <TabsTrigger value="60" className="text-[11px] h-7 px-3">60 dias</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Chart */}
        {isLoading ? (
          <div className="h-[320px] flex items-center justify-center text-xs text-muted-foreground">
            Carregando histórico…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-xs text-muted-foreground">
            Sem dados no período.
          </div>
        ) : (
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
                />
                <YAxis
                  yAxisId="spend"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => fmtBRL0(Number(v))}
                  label={scaleMode === "auto" ? { value: "Inv", angle: -90, position: "insideLeft", style: { fontSize: 9, fill: "hsl(var(--muted-foreground))" } } : undefined}
                />
                {scaleMode === "auto" && (
                  <YAxis
                    yAxisId="revenue"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => fmtBRL0(Number(v))}
                    label={{ value: "Fat", angle: 90, position: "insideRight", style: { fontSize: 9, fill: "hsl(var(--muted-foreground))" } }}
                  />
                )}
                <Tooltip
                  content={<HistoryTooltip />}
                  labelFormatter={(_l, payload: any) => payload?.[0]?.payload?.fullDate ?? _l}
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />

                {/* ===== INVESTIMENTO (Inv) ===== */}
                {chartMode !== "lines" && (
                  groupMode === "account" && accountCapableChannel
                    ? visibleAccounts.map((a, i) => (
                        <Bar
                          key={`acc-${a.account_id}-spend`}
                          yAxisId="spend"
                          dataKey={`acc_${a.account_id}_spend`}
                          name={`${a.account_label} · Inv`}
                          stackId="spend"
                          fill={colorForIndex(i)}
                          fillOpacity={0.55}
                          radius={[2, 2, 0, 0]}
                        />
                      ))
                    : channelSeries.map((s) => (
                        <Bar
                          key={`${s.channel.id}-spend`}
                          yAxisId="spend"
                          dataKey={`${s.channel.slug}_spend`}
                          name={`${s.channel.name} · Inv`}
                          stackId="spend"
                          fill={s.channel.color}
                          fillOpacity={0.55}
                          radius={[2, 2, 0, 0]}
                        />
                      ))
                )}

                {/* ===== FATURAMENTO (Fat) ===== */}
                {/* Modo "stacked": Fat também como barras empilhadas (lado a lado com Inv) */}
                {chartMode === "stacked" && (
                  groupMode === "account" && accountCapableChannel
                    ? visibleAccounts.map((a, i) => (
                        <Bar
                          key={`acc-${a.account_id}-revenue-bar`}
                          yAxisId={scaleMode === "auto" ? "revenue" : "spend"}
                          dataKey={`acc_${a.account_id}_revenue`}
                          name={`${a.account_label} · Fat`}
                          stackId="revenue"
                          fill={colorForIndex(i)}
                          fillOpacity={0.85}
                          radius={[2, 2, 0, 0]}
                        />
                      ))
                    : channelSeries.map((s) => (
                        <Bar
                          key={`${s.channel.id}-revenue-bar`}
                          yAxisId={scaleMode === "auto" ? "revenue" : "spend"}
                          dataKey={`${s.channel.slug}_revenue`}
                          name={`${s.channel.name} · Fat`}
                          stackId="revenue"
                          fill={s.channel.color}
                          fillOpacity={0.85}
                          radius={[2, 2, 0, 0]}
                        />
                      ))
                )}

                {/* Modos "combined" e "lines": Fat como linha sólida */}
                {chartMode !== "stacked" && (
                  groupMode === "account" && accountCapableChannel
                    ? visibleAccounts.map((a, i) => (
                        <Line
                          key={`acc-${a.account_id}-revenue`}
                          yAxisId={scaleMode === "auto" ? "revenue" : "spend"}
                          type="monotone"
                          dataKey={`acc_${a.account_id}_revenue`}
                          name={`${a.account_label} · Fat`}
                          stroke={colorForIndex(i)}
                          strokeWidth={2.2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))
                    : channelSeries.map((s) => (
                        <Line
                          key={`${s.channel.id}-revenue`}
                          yAxisId={scaleMode === "auto" ? "revenue" : "spend"}
                          type="monotone"
                          dataKey={`${s.channel.slug}_revenue`}
                          name={`${s.channel.name} · Fat`}
                          stroke={s.channel.color}
                          strokeWidth={2.2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))
                )}

                {/* Modo "lines": Inv como linha tracejada (substitui as Bars) */}
                {chartMode === "lines" && (
                  groupMode === "account" && accountCapableChannel
                    ? visibleAccounts.map((a, i) => (
                        <Line
                          key={`acc-${a.account_id}-spend-line`}
                          yAxisId="spend"
                          type="monotone"
                          dataKey={`acc_${a.account_id}_spend`}
                          name={`${a.account_label} · Inv`}
                          stroke={colorForIndex(i)}
                          strokeDasharray="4 3"
                          strokeWidth={1.8}
                          dot={false}
                          activeDot={{ r: 3 }}
                        />
                      ))
                    : channelSeries.map((s) => (
                        <Line
                          key={`${s.channel.id}-spend-line`}
                          yAxisId="spend"
                          type="monotone"
                          dataKey={`${s.channel.slug}_spend`}
                          name={`${s.channel.name} · Inv`}
                          stroke={s.channel.color}
                          strokeDasharray="4 3"
                          strokeWidth={1.8}
                          dot={false}
                          activeDot={{ r: 3 }}
                        />
                      ))
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
