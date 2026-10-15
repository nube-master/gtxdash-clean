import { DollarSign, ShoppingCart, MousePointerClick, Clock, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useRedTrackMetrics } from "@/hooks/useRedTrackData";
import { Skeleton } from "@/components/ui/skeleton";

function fmt(value: number, type: "currency" | "number") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

export function RedTrackCards() {
  const {
    isLoading,
    totalRevenue,
    totalSales,
    totalICs,
    ticketMedio,
    icToSaleRate,
    lastSaleMinutes,
    salesLast10,
    salesLast30,
    salesLast60,
  } = useRedTrackMetrics();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-card border border-border">
            <CardContent className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-6 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (totalSales === 0 && totalICs === 0) return null;

  const lastSaleStatus = lastSaleMinutes === null
    ? "—"
    : lastSaleMinutes < 30
    ? "Normal"
    : "Risco";
  const lastSaleColor = lastSaleMinutes !== null && lastSaleMinutes >= 30
    ? "text-destructive"
    : "text-wr-positive";

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5" />
        RedTrack
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Receita</span>
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground/60" />
            </div>
            <p className="text-xl font-semibold font-data text-foreground">{fmt(totalRevenue, "currency")}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Vendas</span>
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground/60" />
            </div>
            <p className="text-xl font-semibold font-data text-foreground">{totalSales}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Ticket: {fmt(ticketMedio, "currency")}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">ICs</span>
              <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground/60" />
            </div>
            <p className="text-xl font-semibold font-data text-foreground">{totalICs}</p>
            <p className="text-[10px] text-muted-foreground mt-1">IC→Venda: {icToSaleRate.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Última Venda</span>
              <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
            </div>
            <p className={`text-xl font-semibold font-data ${lastSaleColor}`}>
              {lastSaleMinutes !== null ? `${lastSaleMinutes}min` : "—"}
            </p>
            <p className={`text-[10px] mt-1 ${lastSaleColor}`}>{lastSaleStatus}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Vendas Recentes</span>
              <Activity className="h-3.5 w-3.5 text-muted-foreground/60" />
            </div>
            <div className="text-xs font-data space-y-0.5">
              <p><span className="text-muted-foreground">10min:</span> <span className="font-semibold">{salesLast10}</span></p>
              <p><span className="text-muted-foreground">30min:</span> <span className="font-semibold">{salesLast30}</span></p>
              <p><span className="text-muted-foreground">60min:</span> <span className="font-semibold">{salesLast60}</span></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
