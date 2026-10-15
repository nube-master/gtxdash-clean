import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { Search, ArrowUpDown, BarChart2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VslUtmDrawer } from "@/components/vsl/VslUtmDrawer";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useVslSpendMap } from "@/hooks/useVslSpendMap";
import { useVslAdvancedMetrics, type VslAdvancedMetric } from "@/hooks/useVslAdvancedMetrics";
import { useVslRevenue7d } from "@/hooks/useVslRevenue7d";
import { Sparkline } from "@/components/ui/sparkline";

interface VslRow {
  id: string;
  name: string;
  views: number;
  unique: number;
  retention: number;
  btnClicks: number;
  checkout: number;
  revenue: number;
  count: number;
  weightedRetention?: number;
}

interface VslPerformanceTableProps {
  data: VslRow[];
  startDate?: string;
  endDate?: string;
}

const META_TAX = 0.1215;
const ACCOUNT_RENT = 0.055;

function netProfit(revenue: number, spend: number) {
  return revenue - spend - spend * META_TAX - spend * ACCOUNT_RENT;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) {
  return `${(Number.isFinite(v) ? v : 0).toFixed(1)}%`;
}
function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

function getPlayRate(v: VslRow, adv?: VslAdvancedMetric): number | null {
  if (adv?.play_rate_pct != null) return adv.play_rate_pct;
  return null;
}

type SortKey =
  | "views" | "unique" | "plays" | "playsUnique" | "playRate"
  | "pitch" | "pitchAud" | "engagement"
  | "btnClicks" | "checkout" | "convRate" | "revenue" | "revPerView";

function getSortValue(v: VslRow, key: SortKey, _spend: number, adv?: VslAdvancedMetric): number {
  const plays = adv?.plays_total ?? 0;
  const playsUnique = adv?.unique_views_total ?? 0;
  const playRate = getPlayRate(v, adv) ?? 0;
  const convRate = v.unique > 0 ? (v.checkout / v.unique) * 100 : 0;
  const pitch = adv?.pitch_pct_weighted ?? 0;
  const pitchAud = v.views > 0 && v.retention > 0 ? Math.round((v.retention / 100) * v.views) : 0;

  switch (key) {
    case "views": return v.views;
    case "unique": return v.unique;
    case "plays": return plays;
    case "playsUnique": return playsUnique;
    case "playRate": return playRate;
    case "pitch": return pitch;
    case "pitchAud": return pitchAud;
    case "engagement": return v.retention;
    case "btnClicks": return v.btnClicks;
    case "checkout": return v.checkout;
    case "convRate": return convRate;
    case "revenue": return v.revenue;
    case "revPerView": return v.unique > 0 ? v.revenue / v.unique : 0;
  }
}

/** Status: 🟢 Escalar (ROI ≥ 1.5 e profit > 0), 🟡 Otimizar (ROI 0.7-1.5), 🔴 Cortar (ROI < 0.7 com spend) */
function statusBadge(spend: number, revenue: number) {
  if (spend < 50) {
    return { label: "—", color: "bg-muted/40 text-muted-foreground border-muted" };
  }
  const roi = spend > 0 ? revenue / spend : 0;
  const profit = netProfit(revenue, spend);
  if (roi >= 1.5 && profit > 0) {
    return { label: "Escalar", color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" };
  }
  if (roi < 0.7) {
    return { label: "Cortar", color: "bg-rose-500/15 text-rose-500 border-rose-500/30" };
  }
  return { label: "Otimizar", color: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
}

function NoData() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground cursor-help">–</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Dado indisponível no Vturb</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function VslPerformanceTable({ data, startDate, endDate }: VslPerformanceTableProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hideNoSpend, setHideNoSpend] = useState(false);
  const [utmDrawer, setUtmDrawer] = useState<{ id: string; name: string } | null>(null);

  const { data: spendMap } = useVslSpendMap(startDate, endDate);
  const { data: advMap } = useVslAdvancedMetrics(startDate, endDate);
  const { data: revenueMap } = useVslRevenue7d();

  const getSpend = (id: string) => spendMap?.get(id) ?? 0;
  const getAdv = (id: string) => advMap?.get(id);
  const getRev7d = (id: string) => revenueMap?.get(id) ?? [];

  // Totals
  const totals = useMemo(() => {
    return data.reduce(
      (acc, v) => {
        const spend = getSpend(v.id);
        return {
          views: acc.views + v.views,
          unique: acc.unique + v.unique,
          weightedRetention: acc.weightedRetention + (v.unique > 0 ? v.retention : 0),
          btnClicks: acc.btnClicks + v.btnClicks,
          checkout: acc.checkout + v.checkout,
          revenue: acc.revenue + v.revenue,
          spend: acc.spend + spend,
        };
      },
      { views: 0, unique: 0, weightedRetention: 0, btnClicks: 0, checkout: 0, revenue: 0, spend: 0 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, spendMap]);

  const totalConvRate = totals.unique > 0 ? (totals.checkout / totals.unique) * 100 : 0;
  const totalRevPerView = totals.unique > 0 ? totals.revenue / totals.unique : 0;
  const totalCpa = totals.checkout > 0 ? totals.spend / totals.checkout : 0;
  const totalRoi = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const totalProfit = netProfit(totals.revenue, totals.spend);

  const filtered = useMemo(() => {
    let rows = data;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((v) => v.name.toLowerCase().includes(q));
    }
    if (hideNoSpend) {
      rows = rows.filter((v) => getSpend(v.id) > 0);
    }
    return [...rows].sort((a, b) => {
      const diff = getSortValue(b, sortBy, getSpend(b.id), getAdv(b.id)) - getSortValue(a, sortBy, getSpend(a.id), getAdv(a.id));
      return sortDir === "desc" ? diff : -diff;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, sortBy, sortDir, spendMap, advMap, hideNoSpend]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(key); setSortDir("desc"); }
  };

  const handleExport = () => {
    const headers = ["VSL","Visitantes","Plays","Retenção%","Cliques","CTR%","Conversões","Conv%","Rev/View","Receita","Spend","CPA","ROI","Lucro Líquido","Status"];
    const lines = [headers.join(",")];
    for (const v of filtered) {
      const spend = getSpend(v.id);
      const roi = spend > 0 ? v.revenue / spend : 0;
      const cpa = v.checkout > 0 ? spend / v.checkout : 0;
      const profit = netProfit(v.revenue, spend);
      const status = statusBadge(spend, v.revenue).label;
      const ctr = v.unique > 0 && v.btnClicks > 0 ? (v.btnClicks / v.unique) * 100 : 0;
      const convRate = v.unique > 0 ? (v.checkout / v.unique) * 100 : 0;
      const rpv = v.unique > 0 ? v.revenue / v.unique : 0;
      lines.push([
        `"${v.name.replace(/"/g, '""')}"`,
        v.unique, v.views, v.retention.toFixed(1),
        v.btnClicks, ctr.toFixed(2), v.checkout, convRate.toFixed(2),
        rpv.toFixed(2), v.revenue.toFixed(2),
        spend.toFixed(2), cpa.toFixed(2), roi.toFixed(2), profit.toFixed(2), status
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vsl-performance-${startDate || "periodo"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data.length) return null;

  return (
    <Card className="wr-card">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Performance por VSL</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{data.length} VSLs monitoradas</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={hideNoSpend ? "default" : "outline"}
              size="sm"
              className="h-8 text-[11px]"
              onClick={() => setHideNoSpend((s) => !s)}
            >
              {hideNoSpend ? "Mostrar todas" : "Só com spend"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[11px] gap-1.5" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Visitantes Únicos" value={fmt(totals.unique)} />
          <Kpi label="Conversões" value={fmt(totals.checkout)} />
          <Kpi label="Taxa Conv. Global" value={fmtPct(totalConvRate)} />
          <Kpi label="Receita Total" value={fmtCurrency(totals.revenue)} valueClass="text-[hsl(var(--wr-positive))]" />
        </div>

        <div className="relative max-w-[400px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrar por nome da VSL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs bg-secondary/50 border-border"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="min-w-[200px] text-[11px]">VSL</TableHead>
              {([
                { key: "views" as SortKey, label: "Visualizações" },
                { key: "unique" as SortKey, label: "Visualizações Únicas" },
                { key: "plays" as SortKey, label: "Plays" },
                { key: "playsUnique" as SortKey, label: "Plays Únicos" },
                { key: "playRate" as SortKey, label: "Play Rate" },
                { key: "pitch" as SortKey, label: "Retenção ao Pitch" },
                { key: "pitchAud" as SortKey, label: "Audiência do Pitch" },
                { key: "engagement" as SortKey, label: "Engajamento" },
                { key: "btnClicks" as SortKey, label: "Cliques no Botão" },
                { key: "checkout" as SortKey, label: "Conversões" },
                { key: "convRate" as SortKey, label: "Taxa de Conversão" },
                { key: "revenue" as SortKey, label: "Receita" },
                { key: "revPerView" as SortKey, label: "Rev/View" },
              ]).map((col) => (
                <TableHead
                  key={col.key}
                  className="text-right text-[11px] cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1 justify-end">
                    {col.label}
                    <ArrowUpDown className={`h-3 w-3 ${sortBy === col.key ? "text-primary" : "text-muted-foreground/40"}`} />
                  </span>
                </TableHead>
              ))}
              <TableHead className="text-center text-[11px] whitespace-nowrap">Tend. 7d</TableHead>
              <TableHead className="text-[11px] w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((v) => {
              const adv = getAdv(v.id);
              const hasBtnData = v.btnClicks > 0 || v.unique === 0;
              const plays = adv?.plays_total ?? null;
              const playsUnique = adv?.unique_views_total ?? null;
              const playRate = getPlayRate(v, adv);
              const convRate = v.unique > 0 ? (v.checkout / v.unique) * 100 : 0;
              const pitchPct = adv?.pitch_pct_weighted ?? null;
              const benchPitch = adv?.bench_pitch_pct ?? null;
              const benchConv = adv?.bench_conversion_pct ?? null;

              const pitchClass = benchPitch && pitchPct != null
                ? (pitchPct >= benchPitch ? "text-emerald-500" : pitchPct >= benchPitch * 0.8 ? "text-amber-500" : "text-rose-500")
                : "";
              const convClass = benchConv && convRate > 0
                ? (convRate >= benchConv ? "text-emerald-500" : convRate >= benchConv * 0.8 ? "text-amber-500" : "text-rose-500")
                : (convRate >= 0.5 ? "text-[hsl(var(--wr-positive))]" : "");

              return (
                <TableRow
                  key={v.id}
                  className="text-xs font-data cursor-pointer hover:bg-secondary/40 transition-colors group"
                  onClick={() => setUtmDrawer({ id: v.id, name: v.name })}
                >
                  <TableCell className="font-medium whitespace-normal break-all text-xs">
                    <span className="group-hover:text-primary transition-colors">{v.name}</span>
                    {adv?.offer_apelido && (
                      <span className="ml-2 text-[10px] text-muted-foreground">[{adv.offer_apelido}]</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{fmt(v.views)}</TableCell>
                  <TableCell className="text-right">{fmt(v.unique)}</TableCell>
                  <TableCell className="text-right">{plays != null ? fmt(plays) : <NoData />}</TableCell>
                  <TableCell className="text-right">{playsUnique != null ? fmt(playsUnique) : <NoData />}</TableCell>
                  <TableCell className="text-right">
                    {playRate != null ? fmtPct(playRate) : <NoData />}
                  </TableCell>
                  <TableCell className={`text-right ${pitchClass}`}>
                    {pitchPct != null ? fmtPct(pitchPct) : <NoData />}
                    {benchPitch && pitchPct != null && (
                      <span className="ml-1 text-[9px] text-muted-foreground">/{benchPitch.toFixed(1)}%</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {v.views > 0 && v.retention > 0
                      ? fmt(Math.round((v.retention / 100) * v.views))
                      : <NoData />}
                  </TableCell>
                  <TableCell className="text-right">{fmtPct(v.retention)}</TableCell>
                  <TableCell className="text-right">{hasBtnData ? fmt(v.btnClicks) : <NoData />}</TableCell>
                  <TableCell className="text-right">{fmt(v.checkout)}</TableCell>
                  <TableCell className={`text-right ${convClass}`}>
                    {fmtPct(convRate)}
                    {benchConv && convRate > 0 && (
                      <span className="ml-1 text-[9px] text-muted-foreground">/{benchConv.toFixed(2)}%</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-[hsl(var(--wr-positive))] font-semibold">
                    {fmtCurrency(v.revenue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {v.unique > 0 ? fmtCurrency(v.revenue / v.unique) : <NoData />}
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const series = getRev7d(v.id).map((p) => p.revenue);
                      return series.length >= 2
                        ? <Sparkline data={series} width={56} height={18} className="mx-auto" />
                        : <span className="text-muted-foreground/40 text-[10px]">—</span>;
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    <BarChart2 className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mx-auto" />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={16} className="text-center text-muted-foreground py-8 text-xs">
                  Nenhuma VSL encontrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {utmDrawer && (
        <VslUtmDrawer
          open={!!utmDrawer}
          onClose={() => setUtmDrawer(null)}
          playerId={utmDrawer.id}
          playerName={utmDrawer.name}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </Card>
  );
}

function Kpi({ label, value, sub, valueClass = "" }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-secondary/40 rounded-lg p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold font-data mt-0.5 ${valueClass}`}>{value}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${valueClass}`}>{sub}</p>}
    </div>
  );
}
