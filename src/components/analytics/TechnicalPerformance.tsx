import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";

type Dimension = "os" | "device" | "browser" | "country" | "city";

const DIMENSION_LABELS: Record<Dimension, string> = {
  os: "Por OS",
  device: "Por Device",
  browser: "Por Browser",
  country: "Por País",
  city: "Por Cidade",
};

const DIMENSION_COLUMN: Record<Dimension, string> = {
  os: "OS",
  device: "Device",
  browser: "Browser",
  country: "País",
  city: "Cidade",
};

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function getSaoPauloDayBoundsUTC(day: string) {
  const startUtc = `${day}T03:00:00Z`;
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDay = next.toISOString().slice(0, 10);
  return { startUtc, endExclusiveUtc: `${nextDay}T03:00:00Z` };
}

export function TechnicalPerformance() {
  const [dim, setDim] = useState<Dimension>("os");
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;

  const { data: events } = useQuery({
    queryKey: ["redtrack-technical", start, end],
    queryFn: async () => {
      const { startUtc } = getSaoPauloDayBoundsUTC(start);
      const { endExclusiveUtc } = getSaoPauloDayBoundsUTC(end);
      const PAGE_SIZE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("redtrack_events")
          .select("amount, os, device, browser, country, city, status, event_type")
          .in("event_type", ["purchase", "upsell"])
          .gte("occurred_at", startUtc)
          .lt("occurred_at", endExclusiveUtc)
          .range(from, from + PAGE_SIZE - 1);

        if (error) break;
        all = all.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      return all;
    },
    refetchInterval: 300_000,
  });

  // Include all purchase/upsell events (status may be 'approved', 'other', or null)
  const approvedEvents = useMemo(
    () => (events || []),
    [events],
  );

  const rows = useMemo(() => {
    const totalRevenue = approvedEvents.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const grouped = new Map<string, { count: number; revenue: number }>();
    for (const sale of approvedEvents) {
      const key = sale[dim] || "(desconhecido)";
      if (!grouped.has(key)) grouped.set(key, { count: 0, revenue: 0 });
      const g = grouped.get(key)!;
      g.count++;
      g.revenue += Number(sale.amount || 0);
    }

    return Array.from(grouped.entries())
      .map(([label, { count, revenue }]) => ({
        label,
        sales: count,
        revenue,
        ticket: count > 0 ? revenue / count : 0,
        share: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [approvedEvents, dim]);

  if (approvedEvents.length === 0) return null;

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <h3 className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest mb-4">
          Performance Técnica
        </h3>

        <Tabs
          value={dim}
          onValueChange={(v) => setDim(v as Dimension)}
          className="space-y-4"
        >
          <TabsList className="bg-secondary/50">
            {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((d) => (
              <TabsTrigger key={d} value={d} className="text-xs">
                {DIMENSION_LABELS[d]}
              </TabsTrigger>
            ))}
          </TabsList>

          {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((d) => (
            <TabsContent key={d} value={d}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                        {DIMENSION_COLUMN[d]}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">
                        Vendas
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">
                        Receita
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">
                        AOV
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">
                        % Faturamento
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.label} className="border-border">
                        <TableCell className="text-xs font-medium">{r.label}</TableCell>
                        <TableCell className="text-xs font-data text-right">{r.sales}</TableCell>
                        <TableCell className="text-xs font-data text-right text-emerald-400">
                          {fmtCurrency(r.revenue)}
                        </TableCell>
                        <TableCell className="text-xs font-data text-right">
                          {fmtCurrency(r.ticket)}
                        </TableCell>
                        <TableCell className="text-xs font-data text-right">
                          <div className="flex items-center justify-end gap-2">
                            <svg width="24" height="24" viewBox="0 0 36 36" className="shrink-0">
                              <circle
                                cx="18" cy="18" r="14"
                                fill="none"
                                stroke="hsl(var(--muted))"
                                strokeWidth="4"
                              />
                              <circle
                                cx="18" cy="18" r="14"
                                fill="none"
                                stroke="hsl(var(--primary))"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeDasharray={`${(r.share / 100) * 87.96} 87.96`}
                                strokeDashoffset="0"
                                transform="rotate(-90 18 18)"
                              />
                            </svg>
                            <span>{r.share.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                          Sem dados para esta dimensão
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
