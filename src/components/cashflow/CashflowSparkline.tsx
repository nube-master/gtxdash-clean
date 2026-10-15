import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
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
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function CashflowSparkline({ rows }: Props) {
  const data = rows.map((r) => ({
    day: r.date.slice(8),
    weekday: r.weekday,
    recebimento: r.expectedReceipt,
    investimento: r.adInvestment,
  }));

  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Recebimentos vs Investimentos
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={1} barSize={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmt}
              width={55}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
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
              formatter={(value: string) =>
                value === "recebimento" ? "Recebimentos" : "Investimentos"
              }
            />
            <Bar
              dataKey="recebimento"
              fill="hsl(152 60% 48%)"
              radius={[2, 2, 0, 0]}
              opacity={0.85}
            />
            <Bar
              dataKey="investimento"
              fill="hsl(0 84% 60%)"
              radius={[2, 2, 0, 0]}
              opacity={0.85}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
