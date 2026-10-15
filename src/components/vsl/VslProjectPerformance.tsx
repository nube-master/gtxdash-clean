import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Eye, ShoppingCart, DollarSign, BarChart2 } from "lucide-react";
import { mapVslToProject } from "@/lib/vslProjectMapping";
import type { ProjectConversions } from "@/hooks/useVslProjectConversions";

interface AggregatedVsl {
  id: string;
  name: string;
  views: number;
  unique: number;
  retention: number;
  weightedRetention: number;
  btnClicks: number;
  checkout: number;
  revenue: number;
  count: number;
}

interface VslProjectPerformanceProps {
  aggregatedVsls: AggregatedVsl[];
  projectConversions: Map<string, ProjectConversions> | undefined;
  isLoading: boolean;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

function fmtPct(v: number) {
  return `${v.toFixed(2)}%`;
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

interface EnrichedVsl {
  id: string;
  name: string;
  project: string | null;
  plays: number;
  uniqueViews: number;
  retention: number;
  conversions: number;
  convRate: number;
  revenue: number;
  spend: number;
  revenuePerView: number;
  costPerView: number;
}

export function VslProjectPerformance({ aggregatedVsls, projectConversions, isLoading }: VslProjectPerformanceProps) {
  const enrichedData = useMemo(() => {
    if (!aggregatedVsls.length || !projectConversions) return [];

    // Group VSLs by project
    const vslsByProject = new Map<string, AggregatedVsl[]>();
    const unmapped: AggregatedVsl[] = [];

    for (const vsl of aggregatedVsls) {
      const project = mapVslToProject(vsl.name);
      if (project) {
        if (!vslsByProject.has(project)) vslsByProject.set(project, []);
        vslsByProject.get(project)!.push(vsl);
      } else {
        unmapped.push(vsl);
      }
    }

    const result: EnrichedVsl[] = [];

    for (const [project, vsls] of vslsByProject) {
      const projData = projectConversions.get(project);
      const totalProjectConversions = projData?.sales || 0;
      const totalProjectRevenue = projData?.revenue || 0;
      const totalProjectSpend = projData?.spend || 0;
      const totalPlaysInProject = vsls.reduce((sum, v) => sum + v.unique, 0);

      for (const vsl of vsls) {
        const playShare = totalPlaysInProject > 0 ? vsl.unique / totalPlaysInProject : 0;
        const conversions = Math.round(totalProjectConversions * playShare);
        const revenue = totalProjectRevenue * playShare;
        const spend = totalProjectSpend * playShare;
        const convRate = vsl.unique > 0 ? (conversions / vsl.unique) * 100 : 0;
        const revenuePerView = vsl.unique > 0 ? revenue / vsl.unique : 0;
        const costPerView = vsl.unique > 0 ? spend / vsl.unique : 0;

        result.push({
          id: vsl.id,
          name: vsl.name,
          project,
          plays: vsl.views,
          uniqueViews: vsl.unique,
          retention: vsl.retention,
          conversions,
          convRate,
          revenue,
          spend,
          revenuePerView,
          costPerView,
        });
      }
    }

    // Sort by conversions desc
    result.sort((a, b) => b.conversions - a.conversions);
    return result;
  }, [aggregatedVsls, projectConversions]);

  if (isLoading || !enrichedData.length) return null;

  const totalConversions = enrichedData.reduce((s, v) => s + v.conversions, 0);
  const totalRevenue = enrichedData.reduce((s, v) => s + v.revenue, 0);
  const totalSpend = enrichedData.reduce((s, v) => s + v.spend, 0);
  const totalViews = enrichedData.reduce((s, v) => s + v.uniqueViews, 0);
  const overallConvRate = totalViews > 0 ? (totalConversions / totalViews) * 100 : 0;
  const overallCostPerView = totalViews > 0 ? totalSpend / totalViews : 0;

  return (
    <Card className="wr-card">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Performance Geral por VSL</h3>
          <Badge variant="outline" className="text-[10px] ml-auto">Estimativa por projeto</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Conversões estimadas cruzando views da VSL × vendas do projeto correspondente
        </p>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Views Únicas</span>
            </div>
            <span className="text-lg font-bold font-data">{fmt(totalViews)}</span>
          </div>
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Conversões</span>
            </div>
            <span className="text-lg font-bold font-data">{fmt(totalConversions)}</span>
          </div>
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Conv. Rate</span>
            </div>
            <span className="text-lg font-bold font-data">{fmtPct(overallConvRate)}</span>
          </div>
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Receita</span>
            </div>
            <span className="text-lg font-bold font-data text-[hsl(var(--wr-positive))]">{fmtCurrency(totalRevenue)}</span>
          </div>
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Custo/View</span>
            </div>
            <span className="text-lg font-bold font-data">{fmtCurrency(overallCostPerView)}</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="min-w-[200px] text-[11px]">VSL</TableHead>
              <TableHead className="text-center text-[11px] w-20">Projeto</TableHead>
              <TableHead className="text-right text-[11px]">Views Únicas</TableHead>
              <TableHead className="text-right text-[11px]">Plays</TableHead>
              <TableHead className="text-right text-[11px]">Retenção</TableHead>
              <TableHead className="text-right text-[11px]">Valor Gasto</TableHead>
              <TableHead className="text-right text-[11px]">Conversões</TableHead>
              <TableHead className="text-right text-[11px]">Conversão da VSL</TableHead>
              <TableHead className="text-right text-[11px]">Receita</TableHead>
              <TableHead className="text-right text-[11px]">Rev/View</TableHead>
              <TableHead className="text-right text-[11px]">Custo/View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrichedData.map((v) => (
              <TableRow key={v.id} className="text-xs font-data">
                <TableCell className="font-medium whitespace-normal break-all text-xs">
                  {v.name}
                </TableCell>
                <TableCell className="text-center">
                  {v.project && (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {v.project}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{fmt(v.uniqueViews)}</TableCell>
                <TableCell className="text-right">{fmt(v.plays)}</TableCell>
                <TableCell className="text-right">{fmtPct(v.retention)}</TableCell>
                <TableCell className="text-right">{fmtCurrency(v.spend)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(v.conversions)}</TableCell>
                <TableCell className={`text-right ${v.convRate >= 1 ? "text-[hsl(var(--wr-positive))]" : ""}`}>
                  {fmtPct(v.convRate)}
                </TableCell>
                <TableCell className="text-right text-[hsl(var(--wr-positive))] font-semibold">
                  {fmtCurrency(v.revenue)}
                </TableCell>
                <TableCell className="text-right">
                  {fmtCurrency(v.revenuePerView)}
                </TableCell>
                <TableCell className="text-right">
                  {fmtCurrency(v.costPerView)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
