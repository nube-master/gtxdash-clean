import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Globe, Smartphone, Monitor, MapPin, Chrome, Building2, LayoutGrid } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";

function fmt(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

function MiniBar({ pct, color = "hsl(0, 100%, 56%)" }: { pct: number; color?: string }) {
  return (
    <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

function getSaoPauloDayBoundsUTC(day: string) {
  const startUtc = `${day}T03:00:00Z`;
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDay = next.toISOString().slice(0, 10);
  return { startUtc, endExclusiveUtc: `${nextDay}T03:00:00Z` };
}

function BreakdownTable({ data, labelHeader, columns }: { 
  data: { label: string; sales: number; revenue: number; pct: number }[]; 
  labelHeader: string;
  columns?: { salesLabel?: string; revenueLabel?: string; ticketLabel?: string };
}) {
  const sl = columns?.salesLabel ?? "Vendas";
  const rl = columns?.revenueLabel ?? "Receita";
  const tl = columns?.ticketLabel ?? "Ticket";
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{labelHeader}</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">{sl}</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">{rl}</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">{tl}</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.slice(0, 15).map((r) => (
            <TableRow key={r.label} className="border-border">
              <TableCell className="text-xs font-medium">{r.label}</TableCell>
              <TableCell className="text-xs font-data text-right">{fmtNum(r.sales)}</TableCell>
              <TableCell className="text-xs font-data text-right text-emerald-400">{fmt(r.revenue)}</TableCell>
              <TableCell className="text-xs font-data text-right">{r.sales > 0 ? fmt(r.revenue / r.sales) : "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <MiniBar pct={r.pct} />
                  <span className="text-[10px] font-data text-muted-foreground w-[36px] text-right">{r.pct.toFixed(1)}%</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                Sem dados para esta dimensão
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const POSITION_LABELS: Record<string, string> = {
  feed: "Feed",
  facebook_reels: "Facebook Reels",
  facebook_reels_overlay: "Facebook Reels Overlay",
  instagram_reels: "Instagram Reels",
  instagram_stories: "Instagram Stories",
  instagram_explore: "Instagram Explore",
  instagram_explore_grid_home: "Instagram Explore Home",
  instagram_search: "Instagram Search",
  facebook_stories: "Facebook Stories",
  facebook_profile_feed: "Facebook Profile Feed",
  facebook_notification: "Facebook Notification",
  marketplace: "Facebook Marketplace",
  search: "Facebook Search",
  instream_video: "Facebook In-Stream Video",
  right_hand_column: "Facebook Coluna Direita",
  biz_disco_feed: "Facebook Business Feed",
  threads_feed: "Threads Feed",
  rewarded_video: "Audience Network Rewarded",
  an_classic: "Audience Network Classic",
  unknown: "Desconhecido",
};
function cleanDevice(raw: string): string {
  return raw.replace(/^Device/i, "").trim() || "Desconhecido";
}

export function RedTrackBreakdowns() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const operationId = useOperationId();

  const { data: events } = useQuery({
    queryKey: ["redtrack-intelligence", start, end, operationId],
    queryFn: async () => {
      if (!operationId) return [];
      const { startUtc } = getSaoPauloDayBoundsUTC(start);
      const { endExclusiveUtc } = getSaoPauloDayBoundsUTC(end);
      const PAGE_SIZE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("redtrack_events")
          .select("amount, os, device, browser, country, city, status, event_type, operation_id")
          .eq("operation_id", operationId)
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
    enabled: Boolean(operationId),
    refetchInterval: 300_000,
  });

  // Query traffic_breakdowns for placement data (from Meta Ads)
  const { data: placementData } = useQuery({
    queryKey: ["placement-breakdowns", start, end, operationId],
    queryFn: async () => {
      if (!operationId) return [];
      const PAGE_SIZE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("traffic_breakdowns")
          .select("publisher_platform, platform_position, spend, spend_brl, impressions, clicks, operation_id")
          .eq("operation_id", operationId)
          .gte("date", start)
          .lte("date", end)
          .not("platform_position", "is", null)
          .range(from, from + PAGE_SIZE - 1);
        if (error) break;
        all = all.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      return all;
    },
    enabled: Boolean(operationId),
    refetchInterval: 300_000,
  });

  const breakdowns = useMemo(() => {
    const items = (events || []).filter((e: any) => e.event_type !== "upsell");
    if (items.length === 0) return null;

    const totalRevenue = items.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    function aggregate(keyFn: (s: any) => string) {
      const map = new Map<string, { sales: number; revenue: number }>();
      for (const s of items) {
        const key = keyFn(s) || "Desconhecido";
        const existing = map.get(key) || { sales: 0, revenue: 0 };
        map.set(key, { sales: existing.sales + 1, revenue: existing.revenue + Number(s.amount || 0) });
      }
      return Array.from(map.entries())
        .map(([label, d]) => ({ label, ...d, pct: totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0 }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    // Browser: filter out social platform names
    const PLACEMENTS = new Set(["Facebook", "Instagram", "TikTok", "Messenger", "Audience Network", "WhatsApp"]);
    const byBrowserRaw = aggregate((s) => s.browser);
    const byBrowserClean = byBrowserRaw.filter((r) => !PLACEMENTS.has(r.label));

    // Placement from traffic_breakdowns (Meta Ads data with detailed positions)
    const placementItems = placementData || [];
    const placementMap = new Map<string, { spend: number; impressions: number; clicks: number }>();
    for (const p of placementItems) {
      const pos = p.platform_position || "unknown";
      const platform = (p.publisher_platform || "").toLowerCase();
      // Build label: "Instagram Feed", "Facebook Reels", etc.
      let label = POSITION_LABELS[pos];
      if (!label) {
        // For "feed" position, prefix with platform
        const cleanPos = pos.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        const cleanPlatform = platform.replace(/\b\w/g, (c: string) => c.toUpperCase());
        label = pos === "feed" ? `${cleanPlatform} Feed` : cleanPos;
      }
      const existing = placementMap.get(label) || { spend: 0, impressions: 0, clicks: 0 };
      placementMap.set(label, {
        spend: existing.spend + Number((p as any).spend_brl ?? p.spend ?? 0),
        impressions: existing.impressions + Number(p.impressions || 0),
        clicks: existing.clicks + Number(p.clicks || 0),
      });
    }
    const totalSpend = Array.from(placementMap.values()).reduce((s, d) => s + d.spend, 0);
    const byPlacement = Array.from(placementMap.entries())
      .map(([label, d]) => ({
        label,
        sales: d.impressions,
        revenue: d.spend,
        pct: totalSpend > 0 ? (d.spend / totalSpend) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      byCountry: aggregate((s) => s.country),
      byDevice: aggregate((s) => cleanDevice(s.device || "")),
      byOS: aggregate((s) => s.os),
      byBrowser: byBrowserClean,
      byPlacement,
      byCity: aggregate((s) => s.city),
      totalSales: items.length,
      totalRevenue,
    };
  }, [events, placementData]);

  if (!breakdowns || breakdowns.totalSales === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Inteligência de Performance Técnica</h2>
        <div className="flex-1 h-[1px]" style={{ background: "rgba(255,30,30,0.15)" }} />
        <span className="text-[10px] text-muted-foreground">{fmtNum(breakdowns.totalSales)} vendas • {fmt(breakdowns.totalRevenue)}</span>
      </div>

      <Card className="bg-card border border-border">
        <CardContent className="p-5">
          <Tabs defaultValue="country" className="space-y-4">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="country" className="text-xs gap-1"><Globe className="h-3 w-3" />País</TabsTrigger>
              <TabsTrigger value="device" className="text-xs gap-1"><Smartphone className="h-3 w-3" />Dispositivo</TabsTrigger>
              <TabsTrigger value="os" className="text-xs gap-1"><Monitor className="h-3 w-3" />OS</TabsTrigger>
              <TabsTrigger value="browser" className="text-xs gap-1"><Chrome className="h-3 w-3" />Navegador</TabsTrigger>
              <TabsTrigger value="placement" className="text-xs gap-1"><LayoutGrid className="h-3 w-3" />Posicionamento</TabsTrigger>
              <TabsTrigger value="city" className="text-xs gap-1"><Building2 className="h-3 w-3" />Cidade</TabsTrigger>
            </TabsList>

            <TabsContent value="country">
              <BreakdownTable data={breakdowns.byCountry} labelHeader="País" />
            </TabsContent>
            <TabsContent value="device">
              <BreakdownTable data={breakdowns.byDevice} labelHeader="Dispositivo" />
            </TabsContent>
            <TabsContent value="os">
              <BreakdownTable data={breakdowns.byOS} labelHeader="Sistema Operacional" />
            </TabsContent>
            <TabsContent value="browser">
              <BreakdownTable data={breakdowns.byBrowser} labelHeader="Navegador" />
            </TabsContent>
            <TabsContent value="placement">
              <BreakdownTable 
                data={breakdowns.byPlacement} 
                labelHeader="Posicionamento" 
                columns={{ salesLabel: "Impressões", revenueLabel: "Gasto", ticketLabel: "CPM" }}
              />
            </TabsContent>
            <TabsContent value="city">
              <BreakdownTable data={breakdowns.byCity} labelHeader="Cidade" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
