import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

interface IncongruenciesBlockProps {
  totalSales: number;
  totalICs: number;
  metaConversions: number; // from traffic_data (not used currently, placeholder)
  checkoutClicks: number;
  buttonClicks: number;
  avgTicket: number;
  historicalAvgTicket: number;
  salesWithoutUtm: number;
  totalSalesCount: number;
}

export function IncongruenciesBlock({
  totalSales,
  totalICs,
  checkoutClicks,
  buttonClicks,
  avgTicket,
  historicalAvgTicket,
  salesWithoutUtm,
  totalSalesCount,
}: IncongruenciesBlockProps) {
  const alerts: { message: string; severity: "high" | "medium" | "low" }[] = [];

  // IC >> vendas (desproporcional)
  if (totalICs > 0 && totalSales > 0) {
    const ratio = totalICs / totalSales;
    if (ratio > 5) {
      alerts.push({
        message: `ICs consolidados estão ${ratio.toFixed(1)}x acima das vendas reais — possível perda no checkout ou tracking incorreto`,
        severity: "high",
      });
    } else if (ratio > 3) {
      alerts.push({
        message: `ICs (${totalICs}) estão ${ratio.toFixed(1)}x acima das vendas (${totalSales}) — verificar funil de checkout`,
        severity: "medium",
      });
    }
  }

  // Checkout > Botão (ilógico)
  if (checkoutClicks > buttonClicks && buttonClicks > 0) {
    alerts.push({
      message: `Checkouts (${checkoutClicks}) maior que Cliques no Botão (${buttonClicks}) — erro lógico no funil`,
      severity: "high",
    });
  }

  // Ticket fora do padrão
  if (historicalAvgTicket > 0 && avgTicket > 0) {
    const ticketDiff = ((avgTicket - historicalAvgTicket) / historicalAvgTicket) * 100;
    if (Math.abs(ticketDiff) > 30) {
      const direction = ticketDiff > 0 ? "acima" : "abaixo";
      alerts.push({
        message: `Ticket médio R$${avgTicket.toFixed(0)} está ${Math.abs(ticketDiff).toFixed(0)}% ${direction} do padrão histórico (R$${historicalAvgTicket.toFixed(0)})`,
        severity: "medium",
      });
    }
  }

  // UTM vazia
  if (totalSalesCount > 0) {
    const utmEmptyPct = (salesWithoutUtm / totalSalesCount) * 100;
    if (utmEmptyPct > 10) {
      alerts.push({
        message: `${utmEmptyPct.toFixed(0)}% das vendas sem UTM de campanha (${salesWithoutUtm} de ${totalSalesCount})`,
        severity: utmEmptyPct > 30 ? "high" : "medium",
      });
    }
  }

  // ICs exist but 0 sales
  if (totalICs > 5 && totalSales === 0) {
    alerts.push({
      message: `${totalICs} ICs registrados mas nenhuma venda — verificar webhook de vendas ou gateway de pagamento`,
      severity: "high",
    });
  }

  if (alerts.length === 0) return null;

  const severityColor = {
    high: "text-destructive",
    medium: "text-amber-400",
    low: "text-muted-foreground",
  };

  return (
    <Card className="border border-amber-500/20 bg-amber-500/5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-6 w-6 rounded-full bg-amber-500/10 flex items-center justify-center">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">⚠ Incongruências Detectadas</h3>
        </div>
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={`shrink-0 mt-0.5 ${severityColor[alert.severity]}`}>•</span>
              <p className="text-foreground">{alert.message}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
