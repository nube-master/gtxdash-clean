import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { useCODSource, applySourceFilter } from "@/hooks/useCODSourceFilter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface Props {
  from: string; // YYYY-MM-DD (BRT)
  to: string;
}

type Row = {
  project_slug: string | null;
  country_code: string | null;
  created_at: string | null;
  paid_at: string | null;
  delivery_date: string | null;
  refused_at: string | null;
  order_value_brl: number | null;
  commission_value_brl: number | null;
};

type Group = { key: string; orders: number; revenue: number; commission: number };

const fmtBrl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

export function CODTimelineBreakdown({ from, to }: Props) {
  const { operationId } = useOperation();
  const { source } = useCODSource();

  const startIso = `${from}T00:00:00-03:00`;
  const endIso = `${to}T23:59:59-03:00`;

  const { data, isLoading } = useQuery({
    queryKey: ["cod-timeline-breakdown", operationId, from, to, source],
    enabled: !!operationId,
    staleTime: 60_000,
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("cod_orders")
        .select(
          "project_slug, country_code, created_at, paid_at, delivery_date, refused_at, order_value_brl, commission_value_brl",
        )
        .eq("operation_id", operationId!)
        .or(
          [
            `and(created_at.gte.${startIso},created_at.lte.${endIso})`,
            `and(paid_at.gte.${startIso},paid_at.lte.${endIso})`,
            `and(delivery_date.gte.${from},delivery_date.lte.${to})`,
            `and(refused_at.gte.${startIso},refused_at.lte.${endIso})`,
          ].join(","),
        );
      q = applySourceFilter(q, source);

      const PAGE = 1000;
      let all: Row[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await q.range(offset, offset + PAGE - 1);
        if (error) throw error;
        all = all.concat((data as Row[]) ?? []);
        if ((data?.length ?? 0) < PAGE) break;
        offset += PAGE;
      }
      return all;
    },
  });

  const view = useMemo(() => {
    const rows = data ?? [];
    const inRange = (v: string | null) => !!v && v >= startIso && v <= endIso;

    const generated = rows.filter((r) => inRange(r.created_at));
    const paid = rows.filter((r) => inRange(r.paid_at)).length;
    const delivered = rows.filter((r) => !!r.delivery_date && r.delivery_date >= from && r.delivery_date <= to).length;
    const refused = rows.filter((r) => inRange(r.refused_at)).length;

    const group = (pick: (r: Row) => string | null): Group[] => {
      const map = new Map<string, Group>();
      for (const r of generated) {
        const key = (pick(r) || "—").toUpperCase();
        const g = map.get(key) ?? { key, orders: 0, revenue: 0, commission: 0 };
        g.orders++;
        g.revenue += Number(r.order_value_brl) || 0;
        g.commission += Number(r.commission_value_brl) || 0;
        map.set(key, g);
      }
      return Array.from(map.values()).sort((a, b) => b.commission - a.commission || b.orders - a.orders);
    };

    return {
      generated: generated.length,
      paid,
      delivered,
      refused,
      byProject: group((r) => r.project_slug),
      byCountry: group((r) => r.country_code),
      legacy: generated.filter((r) => !r.project_slug || !r.country_code).length,
    };
  }, [data, startIso, endIso, from, to]);

  if (isLoading) return <Skeleton className="h-56 w-full" />;

  const kpis = [
    { label: "Pedidos gerados", value: view.generated, hint: "created_at no período" },
    { label: "Pedidos pagos", value: view.paid, hint: `taxa pagamento ${pct(view.paid, view.generated)}` },
    { label: "Pedidos entregues", value: view.delivered, hint: `taxa entrega ${pct(view.delivered, view.paid)}` },
    { label: "Recusados/expirados", value: view.refused, hint: `taxa recusa ${pct(view.refused, view.generated)}` },
  ];

  const table = (title: string, rows: Group[], emptyHint: string) => (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium">{title}</span>
        <span className="text-[10px] text-muted-foreground">{rows.length} grupo(s)</span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Chave</th>
              <th className="px-3 py-2 text-right font-medium">Pedidos</th>
              <th className="px-3 py-2 text-right font-medium">Faturamento</th>
              <th className="px-3 py-2 text-right font-medium">Comissão</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyHint}
                </td>
              </tr>
            )}
            {rows.map((g) => (
              <tr key={g.key} className="border-t border-border/40">
                <td className="px-3 py-1.5 font-mono">{g.key}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{g.orders}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtBrl(g.revenue)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500">{fmtBrl(g.commission)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
            <p className="text-[10px] text-muted-foreground">{k.hint}</p>
          </Card>
        ))}
      </div>

      {view.legacy > 0 && (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-500">
          {view.legacy} pedido(s) legado(s) sem projeto/país — aparecem como “—”
        </Badge>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {table("Por projeto", view.byProject, "Sem pedidos com project_slug no período")}
        {table("Por país", view.byCountry, "Sem pedidos com country_code no período")}
      </div>
    </div>
  );
}
