import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface TimelineRow {
  date: string;
  revenue: number;
  spend: number;
  sales: number;
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const compact = (v: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v);

function fmtDate(d: string) {
  // d = YYYY-MM-DD → DD/MM
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export function RevenueTimeline({ data }: { data: TimelineRow[] }) {
  const [showRoas, setShowRoas] = useState(false);

  const chart = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((r) => {
      const profit = r.revenue - r.spend;
      const roas = r.spend > 0 ? r.revenue / r.spend : 0;
      return {
        date: r.date,
        label: fmtDate(r.date),
        Receita: Math.round(r.revenue),
        Gasto: Math.round(r.spend),
        Lucro: Math.round(profit),
        ROAS: Number(roas.toFixed(2)),
      };
    });
  }, [data]);

  const totals = useMemo(() => {
    const rev = chart.reduce((s, r) => s + r.Receita, 0);
    const spd = chart.reduce((s, r) => s + r.Gasto, 0);
    const prf = rev - spd;
    const roas = spd > 0 ? rev / spd : 0;
    const days = chart.length;
    const half = Math.floor(days / 2);
    const firstHalfProfit = chart.slice(0, half).reduce((s, r) => s + r.Lucro, 0);
    const secondHalfProfit = chart.slice(half).reduce((s, r) => s + r.Lucro, 0);
    const trending = secondHalfProfit >= firstHalfProfit;
    return { rev, spd, prf, roas, days, trending };
  }, [chart]);

  if (chart.length < 2) {
    return (
      <Card className="bg-card border border-border/50">
        <CardContent className="p-6 text-center text-xs text-muted-foreground">
          Linha do tempo aparece com 2+ dias no período selecionado.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border border-border/50">
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Linha do Tempo</h3>
              <Badge variant="outline" className="text-[10px] py-0 h-4">{totals.days} dias</Badge>
              <Badge
                variant="outline"
                className={`text-[10px] py-0 h-4 ${totals.trending ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"}`}
              >
                {totals.trending ? <TrendingUp className="h-2.5 w-2.5 mr-1" /> : <TrendingDown className="h-2.5 w-2.5 mr-1" />}
                {totals.trending ? "Em alta" : "Em queda"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Receita, Gasto e Lucro por dia no período filtrado.</p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowRoas(false)}
              className={`px-2.5 py-1 text-[10px] rounded-md border transition ${!showRoas ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}
            >
              Valores (R$)
            </button>
            <button
              onClick={() => setShowRoas(true)}
              className={`px-2.5 py-1 text-[10px] rounded-md border transition ${showRoas ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}
            >
              + ROAS
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="rounded-md border border-border/50 px-2.5 py-1.5">
            <p className="text-muted-foreground">Receita total</p>
            <p className="font-data font-semibold text-foreground">{brl(totals.rev)}</p>
          </div>
          <div className="rounded-md border border-border/50 px-2.5 py-1.5">
            <p className="text-muted-foreground">Gasto total</p>
            <p className="font-data font-semibold text-foreground">{brl(totals.spd)}</p>
          </div>
          <div className="rounded-md border border-border/50 px-2.5 py-1.5">
            <p className="text-muted-foreground">Lucro</p>
            <p className={`font-data font-semibold ${totals.prf >= 0 ? "text-emerald-400" : "text-red-400"}`}>{brl(totals.prf)}</p>
          </div>
          <div className="rounded-md border border-border/50 px-2.5 py-1.5">
            <p className="text-muted-foreground">ROAS médio</p>
            <p className="font-data font-semibold text-foreground">{totals.roas.toFixed(2)}x</p>
          </div>
        </div>

        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142 70% 45%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(142 70% 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gSpd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0 75% 60%)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="hsl(0 75% 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => compact(v)}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              {showRoas && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `${v}x`}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
              )}
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: any, name: any) => {
                  if (name === "ROAS") return [`${Number(value).toFixed(2)}x`, name];
                  return [brl(Number(value)), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="left" type="monotone" dataKey="Receita" stroke="hsl(142 70% 45%)" fill="url(#gRev)" strokeWidth={2} />
              <Area yAxisId="left" type="monotone" dataKey="Gasto" stroke="hsl(0 75% 60%)" fill="url(#gSpd)" strokeWidth={2} />
              <Line yAxisId="left" type="monotone" dataKey="Lucro" stroke="hsl(48 95% 55%)" strokeWidth={2.5} dot={false} />
              {showRoas && (
                <Line yAxisId="right" type="monotone" dataKey="ROAS" stroke="hsl(217 91% 60%)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
