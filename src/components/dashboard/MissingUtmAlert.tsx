import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Unlink, ChevronDown, ChevronUp } from "lucide-react";
import { resolveProductName } from "@/lib/productNames";

function getBrDateStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface MissingSale {
  id: string;
  amount: number;
  offer_name: string | null;
  product_name: string | null;
  utm_content: string | null;
  occurred_at: string;
}

export function MissingUtmAlert() {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ["missing-utm-alert"],
    queryFn: async () => {
      const today = getBrDateStr();
      const startUtc = `${today}T03:00:00Z`;

      const [missingRes, totalRes] = await Promise.all([
        supabase
          .from("redtrack_events")
          .select("id, amount, offer_name, product_name, utm_content, occurred_at")
          .in("event_type", ["purchase", "upsell"])
          .gt("amount", 0)
          .is("utm_campaign", null)
          .gte("occurred_at", startUtc)
          .order("occurred_at", { ascending: false })
          .limit(100),
        supabase
          .from("redtrack_events")
          .select("id", { count: "exact", head: true })
          .in("event_type", ["purchase", "upsell"])
          .gt("amount", 0)
          .gte("occurred_at", startUtc),
      ]);

      if (missingRes.error || !missingRes.data) return null;

      const missing = missingRes.data.length;
      const totalSales = totalRes.count ?? missing;
      if (missing === 0 || totalSales === 0) return null;

      const pct = (missing / totalSales) * 100;
      if (pct <= 10) return null;

      const byProject = new Map<string, number>();
      for (const r of missingRes.data as MissingSale[]) {
        const proj = resolveProductName(r.offer_name, r.product_name, "Desconhecido");
        byProject.set(proj, (byProject.get(proj) || 0) + 1);
      }

      const hasUtmContent = missingRes.data.filter((r: any) => r.utm_content).length;

      return {
        missing,
        totalSales,
        pct,
        byProject,
        hasUtmContent,
        rows: missingRes.data as MissingSale[],
      };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (!data) return null;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <Unlink className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-amber-400 font-medium">
            {data.missing} de {data.totalSales} venda{data.totalSales > 1 ? "s" : ""} hoje sem utm_campaign ({data.pct.toFixed(0)}%)
          </p>
          <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {Array.from(data.byProject.entries()).map(([proj, count]) => (
              <span key={proj}>
                <span className="font-semibold text-foreground">{proj}</span>: {count}
              </span>
            ))}
          </div>
          {data.hasUtmContent > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {data.hasUtmContent} com utm_content (fallback ativo) · Tracking parcial via sub10
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Vendas sem UTM não aparecem nos filtros por campanha/criativo.
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 mt-0.5 p-1 rounded hover:bg-amber-400/20 transition-colors"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-amber-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-amber-400" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 border-t border-amber-400/20 pt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium pb-1">Hora</th>
                <th className="text-left font-medium pb-1">Produto</th>
                <th className="text-right font-medium pb-1">Valor</th>
                <th className="text-left font-medium pb-1 pl-2">Offer</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t border-border/30">
                  <td className="py-0.5 text-foreground">{formatTime(r.occurred_at)}</td>
                  <td className="py-0.5 text-foreground">
                    {resolveProductName(r.offer_name, r.product_name, "—")}
                  </td>
                  <td className="py-0.5 text-right text-foreground font-medium">
                    ${r.amount.toFixed(2)}
                  </td>
                  <td className="py-0.5 pl-2 text-muted-foreground truncate max-w-[120px]">
                    {r.offer_name || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
