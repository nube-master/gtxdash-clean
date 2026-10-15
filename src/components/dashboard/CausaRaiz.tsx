import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Search, TrendingDown, Gauge, Target, Layers } from "lucide-react";

interface CausaRaizProps {
  financial: {
    totalSpend: number;
    totalRevenue: number;
    roas: number;
    cac: number;
    lucro: number;
  };
  prevFinancial: {
    totalSpend: number;
    totalRevenue: number;
    roas: number;
    cac: number;
    lucro: number;
  };
  funnel: {
    totalImpressions: number;
    totalClicks: number;
    totalCtr: number;
    totalPlays: number;
    totalViews: number;
    avgRetention: number;
    totalConversions: number;
    conversionRate: number;
  };
  prevFunnel: {
    totalImpressions: number;
    totalClicks: number;
    totalCtr: number;
    totalPlays: number;
    totalViews: number;
    avgRetention: number;
    totalConversions: number;
    conversionRate: number;
  };
  trafficData: any[];
}

interface Insight {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  level: "critical" | "warning" | "info";
  metric?: string;
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function CausaRaiz({ financial, prevFinancial, funnel, prevFunnel, trafficData }: CausaRaizProps) {
  const insights = useMemo<Insight[]>(() => {
    const result: Insight[] = [];

    // 1) ROAS drop analysis
    const roasChange = pctChange(financial.roas, prevFinancial.roas);
    if (roasChange < -10 && prevFinancial.roas > 0) {
      const spendChange = pctChange(financial.totalSpend, prevFinancial.totalSpend);
      const revenueChange = pctChange(financial.totalRevenue, prevFinancial.totalRevenue);
      let cause = "";
      if (spendChange > 15 && revenueChange < spendChange) {
        cause = `Investimento subiu ${spendChange.toFixed(0)}% mas receita subiu apenas ${revenueChange.toFixed(0)}%. Escala sem eficiência.`;
      } else if (revenueChange < -10) {
        cause = `Receita caiu ${Math.abs(revenueChange).toFixed(0)}%. Possível fadiga de criativos ou queda na taxa de conversão.`;
      } else {
        cause = `CPM ou CPC mais alto está comprimindo a margem. Revisar posicionamentos.`;
      }
      result.push({
        id: "roas-drop",
        icon: <TrendingDown className="h-4 w-4" />,
        title: `ROAS caiu ${Math.abs(roasChange).toFixed(0)}%`,
        description: cause,
        level: roasChange < -25 ? "critical" : "warning",
        metric: `${prevFinancial.roas.toFixed(2)}x → ${financial.roas.toFixed(2)}x`,
      });
    }

    // 2) CPA increase
    const cpaChange = pctChange(financial.cac, prevFinancial.cac);
    if (cpaChange > 15 && prevFinancial.cac > 0) {
      const convChange = pctChange(funnel.totalConversions, prevFunnel.totalConversions);
      let cause = "";
      if (convChange < -15) {
        cause = `Volume de conversões caiu ${Math.abs(convChange).toFixed(0)}% com gasto semelhante. Funil de vendas perdendo eficiência.`;
      } else {
        cause = `Gasto aumentou mais que proporcional às conversões. Possível saturação de audiência.`;
      }
      result.push({
        id: "cpa-rise",
        icon: <Target className="h-4 w-4" />,
        title: `CPA subiu ${cpaChange.toFixed(0)}%`,
        description: cause,
        level: cpaChange > 30 ? "critical" : "warning",
        metric: `R$ ${prevFinancial.cac.toFixed(0)} → R$ ${financial.cac.toFixed(0)}`,
      });
    }

    // 3) Funnel bottleneck detection
    const funnelStages = [
      { name: "CTR (Anúncio → Clique)", curr: funnel.totalCtr, prev: prevFunnel.totalCtr },
      { name: "Retenção Pitch", curr: funnel.avgRetention, prev: prevFunnel.avgRetention },
      { name: "Taxa de Conversão", curr: funnel.conversionRate, prev: prevFunnel.conversionRate },
    ];
    let worstDrop = { name: "", change: 0 };
    for (const stage of funnelStages) {
      const change = pctChange(stage.curr, stage.prev);
      if (change < worstDrop.change) {
        worstDrop = { name: stage.name, change };
      }
    }
    if (worstDrop.change < -10) {
      result.push({
        id: "funnel-bottleneck",
        icon: <Gauge className="h-4 w-4" />,
        title: `Gargalo: ${worstDrop.name}`,
        description: `Maior queda relativa no funil (${worstDrop.change.toFixed(0)}%). Este estágio é o principal limitador de performance.`,
        level: worstDrop.change < -25 ? "critical" : "warning",
      });
    }

    // 4) Campaign concentration — investment pressure
    const spendByCampaign = new Map<string, number>();
    for (const t of trafficData) {
      const name = t.campaign_name || "—";
      spendByCampaign.set(name, (spendByCampaign.get(name) || 0) + Number(t.spend));
    }
    const totalSpend = financial.totalSpend;
    if (totalSpend > 0 && spendByCampaign.size > 0) {
      const sorted = [...spendByCampaign.entries()].sort((a, b) => b[1] - a[1]);
      const topSpend = sorted[0][1];
      const topPct = (topSpend / totalSpend) * 100;
      if (topPct > 60) {
        result.push({
          id: "concentration",
          icon: <Layers className="h-4 w-4" />,
          title: `Concentração de investimento: ${topPct.toFixed(0)}%`,
          description: `Uma única campanha concentra ${topPct.toFixed(0)}% do investimento. Risco alto em caso de bloqueio ou queda.`,
          level: topPct > 80 ? "critical" : "warning",
        });
      }
    }

    // 5) Negative campaigns dominance
    const campaignROAS = new Map<string, { revenue: number; spend: number }>();
    // Build spend map
    for (const t of trafficData) {
      const name = t.campaign_name || "—";
      if (!campaignROAS.has(name)) campaignROAS.set(name, { revenue: 0, spend: 0 });
      campaignROAS.get(name)!.spend += Number(t.spend);
    }
    const negativeCampaigns = [...campaignROAS.entries()].filter(
      ([, d]) => d.spend > 50 && d.revenue / (d.spend || 1) < 0.5
    );
    if (negativeCampaigns.length >= 3 && totalSpend > 0) {
      const negSpend = negativeCampaigns.reduce((s, [, d]) => s + d.spend, 0);
      const negPct = (negSpend / totalSpend) * 100;
      if (negPct > 20) {
        result.push({
          id: "negative-campaigns",
          icon: <AlertTriangle className="h-4 w-4" />,
          title: `${negativeCampaigns.length} campanhas negativas (${negPct.toFixed(0)}% do gasto)`,
          description: `Campanhas com ROAS < 0.5x consumindo R$ ${negSpend.toFixed(0)}. Considere pausar ou otimizar.`,
          level: negPct > 35 ? "critical" : "warning",
        });
      }
    }

    // If nothing wrong, show a positive insight
    if (result.length === 0) {
      result.push({
        id: "all-good",
        icon: <Search className="h-4 w-4" />,
        title: "Sem anomalias detectadas",
        description: "Todos os indicadores estão dentro dos padrões esperados em relação ao período anterior.",
        level: "info",
      });
    }

    return result;
  }, [financial, prevFinancial, funnel, prevFunnel, trafficData]);

  const levelColors = {
    critical: "border-destructive/30 bg-destructive/5",
    warning: "border-amber-400/30 bg-amber-400/5",
    info: "border-wr-positive/30 bg-wr-positive/5",
  };
  const levelTextColors = {
    critical: "text-destructive",
    warning: "text-amber-400",
    info: "text-wr-positive",
  };
  const levelLabels = {
    critical: "Crítico",
    warning: "Atenção",
    info: "OK",
  };

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-7 w-7 rounded-lg bg-destructive/10 flex items-center justify-center">
            <Search className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground">Causa Raiz & Pressão do Sistema</h3>
            <p className="text-[9px] text-muted-foreground">Análise automática de anomalias vs período anterior</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className={`rounded-lg border px-4 py-3 ${levelColors[insight.level]}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${levelTextColors[insight.level]}`}>
                  {insight.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-foreground">{insight.title}</span>
                    <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${levelTextColors[insight.level]} border-current`}>
                      {levelLabels[insight.level]}
                    </Badge>
                    {insight.metric && (
                      <span className="text-[10px] font-data text-muted-foreground ml-auto">{insight.metric}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{insight.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
