import { TrendingUp } from "lucide-react";
import { type CreativeRow } from "@/lib/creativeUtils";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

interface Props {
  creatives: CreativeRow[];
  isAdmin: boolean;
}

export function CreativeKpiCards({ creatives, isAdmin }: Props) {
  const profitable = creatives.filter((c) => c.roi >= 1).length;
  const scalable = creatives.filter((c) => c.tier.tier === "ESCALAVEL").length;
  const critical = creatives.filter((c) => c.tier.tier === "CRITICO").length;
  const budgetAlerts = creatives.filter((c) => c.budgetAlert).length;

  const kpis = [
    {
      label: "Criativos",
      value: String(creatives.length),
      sub: `${creatives.filter(c => c.tier.tier === "TESTE").length} em teste`,
    },
    {
      label: "Lucrativos",
      value: String(profitable),
      sub: "ROI ≥ 1.0",
      accent: "text-wr-positive",
    },
    {
      label: "Escaláveis",
      value: String(scalable),
      sub: "ROI 3D ≥ 1.3 + Hook ≥ 55%",
      accent: "text-wr-positive",
    },
    {
      label: "Críticos",
      value: String(critical),
      sub: budgetAlerts > 0 ? `${budgetAlerts} para desligar` : "ROI < 1.0",
      accent: "text-destructive",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Status dos Criativos</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="mobile-kpi-card wr-card px-3 py-2.5 md:p-4 flex flex-col gap-0.5 md:gap-2">
            <p className="text-[10px] md:text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">{k.label}</p>
            <p className={`text-lg md:text-xl font-bold font-data leading-tight ${k.accent || "text-foreground"}`}>{k.value}</p>
            {k.sub && <p className="text-[10px] md:text-[11px] text-muted-foreground truncate">{k.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
