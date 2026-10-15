import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VslAdvancedMetricsProps {
  revenue: number;
  spend: number;
  uniqueViews: number;
  totalPlays: number;
  audienceAtPitch: number;
}

function fmtCurrency(v: number) {
  if (!isFinite(v) || isNaN(v)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

function fmtRoas(v: number) {
  if (!isFinite(v) || isNaN(v)) return "0.00";
  return v.toFixed(2);
}

export function VslAdvancedMetrics({ revenue, spend, uniqueViews, totalPlays, audienceAtPitch }: VslAdvancedMetricsProps) {
  const revenuePerView = uniqueViews > 0 ? revenue / uniqueViews : 0;
  const revenuePerPlay = totalPlays > 0 ? revenue / totalPlays : 0;
  const revenuePerPitch = audienceAtPitch > 0 ? revenue / audienceAtPitch : 0;
  const costPerView = uniqueViews > 0 ? spend / uniqueViews : 0;
  const costPerPlay = totalPlays > 0 ? spend / totalPlays : 0;
  const roas = spend > 0 ? revenue / spend : 0;

  const metrics = [
    { label: "Receita / View", value: fmtCurrency(revenuePerView) },
    { label: "Receita / Play", value: fmtCurrency(revenuePerPlay) },
    { label: "Receita / Pitch", value: fmtCurrency(revenuePerPitch) },
    { label: "Custo / View", value: fmtCurrency(costPerView) },
    { label: "Custo / Play", value: fmtCurrency(costPerPlay) },
    {
      label: "ROAS da VSL",
      value: fmtRoas(roas),
      accent: roas >= 1 ? "positive" as const : "negative" as const,
    },
  ];

  return (
    <Card className="wr-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Métricas Avançadas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{m.label}</p>
              <p className={`text-base font-bold font-data ${
                "accent" in m
                  ? m.accent === "positive"
                    ? "text-[hsl(var(--wr-positive))]"
                    : "text-[hsl(var(--wr-negative))]"
                  : "text-foreground"
              }`}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
