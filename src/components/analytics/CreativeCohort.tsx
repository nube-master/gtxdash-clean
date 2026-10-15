import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface CreativeCohortProps {
  traffic: any[];
  sales: any[];
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `S${weekNum}`;
}

function extractCreativeId(campaignOrAd: string): string | null {
  // Look for patterns like IMG01, IMG14-SP, VID03, etc.
  const match = campaignOrAd.match(/\b(IMG\d+[A-Z-]*|VID\d+[A-Z-]*|VSL\d+[A-Z-]*)/i);
  return match ? match[1].toUpperCase() : null;
}

function isFrontendSale(sale: any) {
  const store = String(sale?.store || "").toLowerCase();
  const eventType = String(sale?.event_type || "purchase").toLowerCase();
  if (store === "hotmart") {
    if (sale?.hotmart_categories_configured) {
      return Boolean(sale?.funnel_role_explicit) && eventType === "frontend";
    }
    return eventType === "frontend" || eventType === "purchase";
  }
  return eventType !== "upsell";
}

export function CreativeCohort({ traffic, sales }: CreativeCohortProps) {
  const cohortData = useMemo(() => {
    // Find the first week each creative appeared in traffic
    const creativeFirstWeek = new Map<string, { week: string; firstDate: string }>();
    const creativeMetrics = new Map<string, { spend: number; clicks: number; impressions: number; revenue: number; sales: number; weeks: Set<string> }>();

    // Sort traffic by date to find first appearance
    const sortedTraffic = [...traffic].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    for (const t of sortedTraffic) {
      const adName = t.ad_name || t.campaign_name || "";
      const cid = extractCreativeId(adName);
      if (!cid) continue;

      const week = getWeekKey(t.date);

      if (!creativeFirstWeek.has(cid)) {
        creativeFirstWeek.set(cid, { week, firstDate: t.date });
      }

      if (!creativeMetrics.has(cid)) {
        creativeMetrics.set(cid, { spend: 0, clicks: 0, impressions: 0, revenue: 0, sales: 0, weeks: new Set() });
      }
      const m = creativeMetrics.get(cid)!;
      m.spend += Number(t.spend);
      m.clicks += Number(t.clicks);
      m.impressions += Number(t.impressions);
      m.weeks.add(week);
    }

    // Attribute sales
    for (const s of sales) {
      if (s.status !== "approved") continue;
      const utmCampaign = s.utm_campaign || "";
      // Try to extract creative from campaign
      const cid = extractCreativeId(utmCampaign);
      if (!cid || !creativeMetrics.has(cid)) continue;
      const m = creativeMetrics.get(cid)!;
      m.revenue += Number(s.revenue);
      if (isFrontendSale(s)) m.sales++;
    }

    // Group by launch week
    const weekGroups = new Map<string, {
      week: string;
      creatives: { id: string; spend: number; revenue: number; sales: number; roas: number; longevity: number }[];
    }>();

    for (const [cid, firstInfo] of creativeFirstWeek) {
      const metrics = creativeMetrics.get(cid);
      if (!metrics || metrics.spend < 10) continue;

      if (!weekGroups.has(firstInfo.week)) {
        weekGroups.set(firstInfo.week, { week: firstInfo.week, creatives: [] });
      }

      weekGroups.get(firstInfo.week)!.creatives.push({
        id: cid,
        spend: metrics.spend,
        revenue: metrics.revenue,
        sales: metrics.sales,
        roas: metrics.spend > 0 ? metrics.revenue / metrics.spend : 0,
        longevity: metrics.weeks.size,
      });
    }

    return Array.from(weekGroups.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-8); // Last 8 weeks
  }, [traffic, sales]);

  if (cohortData.length < 2) return null;

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Cohort de Criativos por Semana de Lançamento</h3>
          <Badge variant="outline" className="text-[9px] text-muted-foreground">{cohortData.length} semanas</Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Semana</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Criativos</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Gasto Total</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Receita</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">ROAS Médio</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Vendas</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Longevidade</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Destaques</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cohortData.map((cohort) => {
                const totalSpend = cohort.creatives.reduce((s, c) => s + c.spend, 0);
                const totalRevenue = cohort.creatives.reduce((s, c) => s + c.revenue, 0);
                const totalSales = cohort.creatives.reduce((s, c) => s + c.sales, 0);
                const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
                const avgLongevity = cohort.creatives.length > 0
                  ? cohort.creatives.reduce((s, c) => s + c.longevity, 0) / cohort.creatives.length
                  : 0;
                const topCreatives = [...cohort.creatives].sort((a, b) => b.roas - a.roas).slice(0, 3);

                return (
                  <TableRow key={cohort.week} className="border-border">
                    <TableCell className="text-xs font-medium font-mono">{cohort.week}</TableCell>
                    <TableCell className="text-xs font-data text-center">{cohort.creatives.length}</TableCell>
                    <TableCell className="text-xs font-data text-right">{fmt(totalSpend)}</TableCell>
                    <TableCell className="text-xs font-data text-right text-wr-positive">{fmt(totalRevenue)}</TableCell>
                    <TableCell className="text-xs font-data text-right">
                      <span className={`inline-flex items-center gap-0.5 ${avgRoas >= 1.5 ? "text-wr-positive" : avgRoas >= 1 ? "text-amber-400" : "text-destructive"}`}>
                        {avgRoas >= 1.5 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {avgRoas.toFixed(2)}x
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-data text-right">{totalSales}</TableCell>
                    <TableCell className="text-xs font-data text-right">{avgLongevity.toFixed(1)} sem</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {topCreatives.map((c) => (
                          <Badge key={c.id} variant="outline" className="text-[9px] font-mono text-muted-foreground">
                            {c.id} ({c.roas.toFixed(1)}x)
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
