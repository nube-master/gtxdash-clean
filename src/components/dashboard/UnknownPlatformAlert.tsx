import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface UnknownPlatformAlertProps {
  /** All sales merged (sales_data + RedTrack) for the period. */
  sales: any[];
}

/**
 * Avisa quando vendas chegam via RedTrack sem a tag de plataforma
 * correta no offer_name (segunda posição: "Source | Plataforma | Project | ...").
 *
 * Estas vendas aparecem com store="redtrack_unknown" depois do sync.
 * Mostrar aqui força o operador a corrigir o offer_name no RedTrack
 * pra que faturamento por projeto/produto fique 100% preciso.
 */
export function UnknownPlatformAlert({ sales }: UnknownPlatformAlertProps) {
  const [expanded, setExpanded] = useState(false);

  const unknown = useMemo(() => {
    const list = (sales || []).filter(
      (s: any) => s.status === "approved" && s.store === "redtrack_unknown"
    );
    // Group by utm_campaign + product_name to deduplicate
    const map = new Map<string, { utm: string; product: string; count: number; revenue: number }>();
    for (const s of list) {
      const utm = s.utm_campaign || "(sem utm)";
      const product = s.product_name || "(sem produto)";
      const key = `${utm}::${product}`;
      const e = map.get(key) || { utm, product, count: 0, revenue: 0 };
      e.count++;
      e.revenue += Number(s.revenue || 0);
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [sales]);

  if (unknown.length === 0) return null;

  const totalCount = unknown.reduce((s, u) => s + u.count, 0);
  const totalRevenue = unknown.reduce((s, u) => s + u.revenue, 0);

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="p-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              {totalCount} venda{totalCount > 1 ? "s" : ""} com plataforma indefinida
            </span>
            <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
              R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Badge>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              corrija o offer_name no RedTrack
            </span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </button>

        {expanded && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Estas vendas chegaram pelo RedTrack mas o <code className="text-[10px] bg-muted px-1 py-0.5 rounded">offer_name</code> não tem
              a tag de plataforma na 2ª posição (formato esperado:{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">Source | CartPanda | NDM | ...</code>).
              Sem essa tag, o sistema não consegue atribuir corretamente o canal de checkout.
            </p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {unknown.slice(0, 30).map((u, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px] p-2 rounded bg-card/50 border border-border/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono truncate text-foreground">{u.utm}</div>
                    <div className="text-muted-foreground text-[10px] mt-0.5">
                      Produto detectado: <span className="font-semibold">{u.product}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-data font-semibold text-foreground">{u.count}× </div>
                    <div className="text-[10px] font-data text-muted-foreground">
                      R$ {u.revenue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-[11px]"
              onClick={() => window.open("https://app.redtrack.io/offers", "_blank")}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Abrir RedTrack para corrigir
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
