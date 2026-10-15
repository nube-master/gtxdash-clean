import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";

interface RiskRadarProps {
  sales: any[];
  trafficData: any[];
  cpaGoal: number;
  roasMin: number;
  /** Authoritative spend from skyTotals */
  authoritativeTotalSpend?: number;
}

interface RiskAlert {
  id: string;
  label: string;
  description: string;
  level: "ok" | "warning" | "critical";
}

export function RiskRadar({ sales, trafficData, cpaGoal, roasMin, authoritativeTotalSpend }: RiskRadarProps) {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;

  // Fetch breakdowns for placement analysis
  const { data: breakdowns } = useQuery({
    queryKey: ["risk-radar-breakdowns", start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("traffic_breakdowns")
        .select("publisher_platform, platform_position, spend, spend_brl, impressions, clicks, conversions, revenue")
        .gte("date", start)
        .lte("date", end)
        .eq("breakdown_type", "placement");
      if (error) throw error;
      return data || [];
    },
  });

  const alerts = useMemo<RiskAlert[]>(() => {
    const approved = (sales || []).filter((s) => s.status === "approved" && (s as any).event_type !== "upsell");
    const totalRevenue = approved.reduce((s, sale) => s + Number(sale.revenue), 0);
    const totalConversions = approved.length;
    const rawSpend = (trafficData || []).reduce((s, t) => s + Number(t.spend), 0);
    const totalSpend = authoritativeTotalSpend ?? rawSpend;

    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    const result: RiskAlert[] = [];

    // 1. CPA acima da meta
    if (cpaGoal > 0) {
      const cpaRatio = cpa / cpaGoal;
      result.push({
        id: "cpa",
        label: "CPA",
        description: cpaRatio > 1.15
          ? `CPA de R$${cpa.toFixed(0)} está ${((cpaRatio - 1) * 100).toFixed(0)}% acima da meta de R$${cpaGoal.toFixed(0)}`
          : `CPA de R$${cpa.toFixed(0)} dentro da meta de R$${cpaGoal.toFixed(0)}`,
        level: cpaRatio > 1.3 ? "critical" : cpaRatio > 1.15 ? "warning" : "ok",
      });
    }

    // 2. ROAS abaixo do mínimo
    result.push({
      id: "roas",
      label: "ROAS",
      description: roas < roasMin
        ? `ROAS de ${roas.toFixed(2)}x está abaixo do mínimo de ${roasMin.toFixed(2)}x`
        : `ROAS de ${roas.toFixed(2)}x acima do mínimo de ${roasMin.toFixed(2)}x`,
      level: roas < roasMin * 0.7 ? "critical" : roas < roasMin ? "warning" : "ok",
    });

    // 3. Concentração em loja
    const storeMap = new Map<string, number>();
    for (const sale of approved) {
      const store = sale.store || "Sem loja";
      storeMap.set(store, (storeMap.get(store) || 0) + Number(sale.revenue));
    }
    if (storeMap.size > 0 && totalRevenue > 0) {
      const topStore = [...storeMap.entries()].sort((a, b) => b[1] - a[1])[0];
      const concentration = (topStore[1] / totalRevenue) * 100;
      result.push({
        id: "concentration",
        label: "Concentração",
        description: concentration > 70
          ? `"${topStore[0]}" concentra ${concentration.toFixed(0)}% da receita — risco de dependência`
          : `Receita distribuída (maior: ${concentration.toFixed(0)}%)`,
        level: concentration > 85 ? "critical" : concentration > 70 ? "warning" : "ok",
      });
    }

    // 4. Posicionamento colapsando
    if (breakdowns && breakdowns.length > 0) {
      const posMap = new Map<string, { spend: number; conversions: number; roas: number }>();
      for (const b of breakdowns) {
        const key = `${b.publisher_platform || "?"} / ${b.platform_position || "?"}`;
        const existing = posMap.get(key) || { spend: 0, conversions: 0, roas: 0 };
        existing.spend += Number((b as any).spend_brl ?? b.spend ?? 0);
        existing.conversions += Number(b.conversions);
        posMap.set(key, existing);
      }
      // Check if any position with >20% spend has ROAS < 0.5
      const totalPlacementSpend = [...posMap.values()].reduce((s, p) => s + p.spend, 0);
      let collapsingPlacements: string[] = [];
      for (const [key, val] of posMap) {
        if (totalPlacementSpend > 0 && val.spend / totalPlacementSpend > 0.15) {
          const posRoas = val.spend > 0 && val.conversions > 0 ? 0 : 0; // no revenue in breakdowns directly
          // Use conversions as proxy
          if (val.conversions === 0 && val.spend > totalPlacementSpend * 0.2) {
            collapsingPlacements.push(key);
          }
        }
      }

      result.push({
        id: "placement",
        label: "Posicionamento",
        description: collapsingPlacements.length > 0
          ? `${collapsingPlacements.length} posicionamento(s) sem conversão com gasto significativo: ${collapsingPlacements.slice(0, 2).join(", ")}`
          : "Posicionamentos com distribuição saudável",
        level: collapsingPlacements.length > 1 ? "critical" : collapsingPlacements.length > 0 ? "warning" : "ok",
      });
    }

    return result;
  }, [sales, trafficData, cpaGoal, roasMin, breakdowns, authoritativeTotalSpend]);

  const criticalCount = alerts.filter(a => a.level === "critical").length;
  const warningCount = alerts.filter(a => a.level === "warning").length;

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            🎯 Radar de Risco
          </h3>
          {(criticalCount > 0 || warningCount > 0) && (
            <div className="flex items-center gap-2">
              {criticalCount > 0 && (
                <span className="text-[10px] font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                  {criticalCount} crítico{criticalCount > 1 ? "s" : ""}
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                  {warningCount} atenção
                </span>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                alert.level === "critical"
                  ? "bg-destructive/5 border-destructive/20"
                  : alert.level === "warning"
                  ? "bg-amber-400/5 border-amber-400/20"
                  : "bg-wr-positive/5 border-wr-positive/20"
              }`}
            >
              {alert.level === "ok" ? (
                <CheckCircle2 className="h-4 w-4 text-wr-positive shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${alert.level === "critical" ? "text-destructive" : "text-amber-400"}`} />
              )}
              <div>
                <p className="text-[11px] font-semibold text-foreground">{alert.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{alert.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
