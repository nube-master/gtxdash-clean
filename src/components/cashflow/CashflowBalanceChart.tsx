import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import type { CashflowRow } from "@/lib/cashflowEngine";

interface Props {
  rows: CashflowRow[];
}

function fmt(v: number) {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
}

function fmtFull(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export function CashflowBalanceChart({ rows }: Props) {
  const data = rows.map((r) => ({
    day: r.date.slice(8),
    weekday: r.weekday,
    saldo: r.closingBalance,
    recebimento: r.expectedReceipt + r.manualAdjustment,
    investimento: r.adInvestment,
  }));

  const minBalance = Math.min(...rows.map((r) => r.closingBalance));
  const hasNegative = minBalance < 0;

  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-sm col-span-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Fluxo de Caixa — Saldo × Invest. × Recebimentos
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="balance"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmt}
              width={60}
            />
            <YAxis
              yAxisId="bars"
              orientation="right"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmt}
              width={55}
            />
            {hasNegative && (
              <ReferenceLine yAxisId="balance" y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" opacity={0.6} />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  saldo: "Saldo",
                  recebimento: "Recebimento",
                  investimento: "Investimento",
                };
                return [fmtFull(value), labels[name] ?? name];
              }}
              labelFormatter={(label, payload) => {
                const item = payload?.[0]?.payload;
                return item ? `Dia ${label} (${item.weekday})` : `Dia ${label}`;
              }}
            />
            <Legend
              iconType="circle"
              iconSize={6}
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              formatter={(value: string) => {
                const map: Record<string, string> = {
                  saldo: "Saldo",
                  recebimento: "Recebimentos",
                  investimento: "Investimentos",
                };
                return map[value] ?? value;
              }}
            />
            {/* Bars first (behind) */}
            <Bar
              yAxisId="bars"
              dataKey="recebimento"
              fill="hsl(152 60% 48%)"
              radius={[2, 2, 0, 0]}
              opacity={0.7}
              barSize={7}
            />
            <Bar
              yAxisId="bars"
              dataKey="investimento"
              fill="hsl(0 84% 60%)"
              radius={[2, 2, 0, 0]}
              opacity={0.7}
              barSize={7}
            />
            {/* Balance line on top */}
            <Area
              yAxisId="balance"
              type="monotone"
              dataKey="saldo"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#saldoGrad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "hsl(var(--primary))" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
