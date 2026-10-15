import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket, TrendingUp, DollarSign, ShoppingCart } from "lucide-react";

interface CampanhasHojeProps {
  trafficData: any[];
  sales: any[];
}

function fmt(v: number, type: "currency" | "number" | "roas") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
  if (type === "roas") return `${v.toFixed(2)}x`;
  return new Intl.NumberFormat("pt-BR").format(Math.round(v));
}

export function CampanhasHoje({ trafficData, sales }: CampanhasHojeProps) {
  const today = useMemo(() => {
    const d = new Date();
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  }, []);

  const stats = useMemo(() => {
    const todayTraffic = trafficData.filter((t) => t.date === today);
    const campaigns = new Set<string>();
    let spend = 0;
    for (const t of todayTraffic) {
      campaigns.add(t.campaign_name);
      spend += Number(t.spend);
    }

    const todaySales = (sales || []).filter(
      (s: any) => s.date === today && s.status === "approved"
    );
    const revenue = todaySales.reduce((s: number, sale: any) => s + Number(sale.revenue), 0);
    const roas = spend > 0 ? revenue / spend : 0;

    // Status geral
    let status: "scaling" | "stable" | "burning" = "stable";
    if (roas > 1.5 && todaySales.length > 5) status = "scaling";
    else if (roas < 0.8 && spend > 500) status = "burning";

    return {
      count: campaigns.size,
      spend,
      revenue,
      sales: todaySales.length,
      roas,
      status,
    };
  }, [trafficData, sales, today]);

  const statusConfig = {
    scaling: { label: "Escalando", color: "text-wr-positive border-wr-positive/30 bg-wr-positive/10" },
    stable: { label: "Estável", color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
    burning: { label: "Queimando", color: "text-destructive border-destructive/30 bg-destructive/10" },
  };

  if (stats.count === 0) return null;

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Rocket className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-semibold text-foreground">Campanhas Ativas Hoje</h3>
            <p className="text-[9px] text-muted-foreground">Performance consolidada do dia</p>
          </div>
          <Badge variant="outline" className={`text-[9px] px-2 ${statusConfig[stats.status].color}`}>
            {statusConfig[stats.status].label}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg bg-secondary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Rocket className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Campanhas</span>
            </div>
            <p className="text-lg font-bold font-data">{stats.count}</p>
          </div>
          <div className="rounded-lg bg-secondary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Receita</span>
            </div>
            <p className="text-lg font-bold font-data text-wr-positive">{fmt(stats.revenue, "currency")}</p>
          </div>
          <div className="rounded-lg bg-secondary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ShoppingCart className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Vendas</span>
            </div>
            <p className="text-lg font-bold font-data">{stats.sales}</p>
          </div>
          <div className="rounded-lg bg-secondary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">ROAS</span>
            </div>
            <p className={`text-lg font-bold font-data ${stats.roas >= 1 ? "text-wr-positive" : "text-destructive"}`}>
              {fmt(stats.roas, "roas")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
