import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, BotMessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProjectMetrics {
  code: string;
  revenue: number;
  spend: number;
  sales: number;
  roas: number;
  cac: number;
}

interface DiagnosticProps {
  projects: ProjectMetrics[];
  overallRevenue: number;
  overallSpend: number;
  overallRoas: number;
  overallCac: number;
  prevRoas: number;
  prevRevenue: number;
  funnelBottleneck?: { from: string; to: string; drop: number } | null;
  cpaGoal: number;
}

function fmt(v: number, type: "currency" | "percent" | "roas") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  if (type === "percent") return `${v.toFixed(0)}%`;
  return `${v.toFixed(2)}x`;
}

export function AnalyticsDiagnostic({
  projects,
  overallRevenue,
  overallSpend,
  overallRoas,
  overallCac,
  prevRoas,
  prevRevenue,
  funnelBottleneck,
  cpaGoal,
}: DiagnosticProps) {
  const navigate = useNavigate();
  const bullets: string[] = [];

  // 1. Best performing project
  const sorted = [...projects].filter((p) => p.revenue > 0).sort((a, b) => b.roas - a.roas);
  if (sorted.length > 1) {
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    bullets.push(`${best.code} tem o melhor ROAS (${fmt(best.roas, "roas")}) com ${best.sales} vendas`);
    if (worst.roas < 1 && worst.spend > 100) {
      bullets.push(`${worst.code} está com ROAS negativo (${fmt(worst.roas, "roas")}) — considerar pausar ou otimizar`);
    }
  }

  // 2. CAC above goal
  if (cpaGoal > 0) {
    const aboveGoal = projects.filter((p) => p.cac > cpaGoal && p.sales > 0);
    for (const p of aboveGoal.slice(0, 2)) {
      bullets.push(`${p.code} tem CAC ${fmt(p.cac, "currency")} acima do aceitável (${fmt(cpaGoal, "currency")})`);
    }
  }

  // 3. Revenue concentration
  if (projects.length > 1 && overallRevenue > 0) {
    const topProject = sorted[0];
    if (topProject) {
      const concentration = (topProject.revenue / overallRevenue) * 100;
      if (concentration > 60) {
        bullets.push(`${topProject.code} concentra ${fmt(concentration, "percent")} da receita total — diversificação recomendada`);
      }
    }
  }

  // 4. ROAS trend
  if (prevRoas > 0 && overallRoas > 0) {
    const roasDiff = ((overallRoas - prevRoas) / prevRoas) * 100;
    if (roasDiff > 10) {
      bullets.push(`ROAS geral subiu ${fmt(roasDiff, "percent")} vs período anterior — operação acelerando`);
    } else if (roasDiff < -10) {
      bullets.push(`ROAS geral caiu ${fmt(Math.abs(roasDiff), "percent")} vs período anterior — atenção na otimização`);
    }
  }

  // 5. Funnel bottleneck
  if (funnelBottleneck) {
    bullets.push(`Funil perde ${funnelBottleneck.drop.toFixed(0)}% entre ${funnelBottleneck.from} e ${funnelBottleneck.to}`);
  }

  // 6. Revenue growth
  if (prevRevenue > 0) {
    const growth = ((overallRevenue - prevRevenue) / prevRevenue) * 100;
    if (growth > 15) {
      bullets.push(`Receita cresceu ${fmt(growth, "percent")} vs período anterior`);
    } else if (growth < -15) {
      bullets.push(`Receita caiu ${fmt(Math.abs(growth), "percent")} vs período anterior — investigar causas`);
    }
  }

  if (bullets.length === 0 && projects.length === 0) return null;

  const buildJarvisPrompt = () => {
    const projectSummary = projects
      .filter(p => p.revenue > 0 || p.spend > 0)
      .map(p => `• ${p.code}: Receita ${fmt(p.revenue, "currency")}, Gasto ${fmt(p.spend, "currency")}, ROAS ${fmt(p.roas, "roas")}, CAC ${fmt(p.cac, "currency")}, ${p.sales} vendas`)
      .join("\n");
    
    const prompt = `Faça um diagnóstico analítico completo da operação com base nesses dados do período:

📊 Visão Geral:
- Receita Total: ${fmt(overallRevenue, "currency")}
- Gasto Total: ${fmt(overallSpend, "currency")}
- ROAS Geral: ${fmt(overallRoas, "roas")}
- CAC Geral: ${fmt(overallCac, "currency")}
- ROAS Período Anterior: ${fmt(prevRoas, "roas")}
- Receita Período Anterior: ${fmt(prevRevenue, "currency")}
${cpaGoal > 0 ? `- Meta CPA: ${fmt(cpaGoal, "currency")}` : ""}
${funnelBottleneck ? `- Gargalo do Funil: ${funnelBottleneck.drop.toFixed(0)}% de queda entre ${funnelBottleneck.from} e ${funnelBottleneck.to}` : ""}

📁 Por Projeto:
${projectSummary || "Sem dados por projeto"}

Quero: 1) Diagnóstico de cada projeto 2) Pontos de atenção 3) Oportunidades de escala 4) 3 ações prioritárias AGORA`;

    return prompt;
  };

  const handleAskJarvis = () => {
    const prompt = buildJarvisPrompt();
    navigate(`/jarvis?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <Card className="border border-primary/20 bg-primary/5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-primary" />
            </div>
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">🧠 Diagnóstico Analítico</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAskJarvis}
            className="gap-1.5 text-[11px] h-7 border-primary/30 text-primary hover:bg-primary/10"
          >
            <BotMessageSquare className="h-3.5 w-3.5" />
            Pedir Diagnóstico ao JARVIS
          </Button>
        </div>
        {bullets.length > 0 && (
          <div className="space-y-2">
            {bullets.slice(0, 6).map((bullet, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-primary shrink-0 mt-0.5">•</span>
                <p className="text-foreground">{bullet}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
