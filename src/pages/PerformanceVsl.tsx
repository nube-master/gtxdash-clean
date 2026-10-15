import { useMemo, useState } from "react";
import { Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePerformanceVslData, type VslProject, type PerformanceVslRow } from "@/hooks/usePerformanceVslData";
import { PerformanceVslDetailModal } from "@/components/performance-vsl/PerformanceVslDetailModal";

const PROJECTS: { key: VslProject; label: string }[] = [
  { key: "ALL", label: "Todos" },
  { key: "NDM", label: "NDM" },
  { key: "ERX", label: "ERX" },
  { key: "GLP", label: "GLP" },
  { key: "CRT", label: "CRT" },
  { key: "LDR", label: "LDR" },
  { key: "NDR", label: "NDR" },
  { key: "NEURO", label: "NEURO" },
];

const PERIODS = [1, 7, 14, 30];

type SortKey =
  | "vsl_name" | "project"
  | "meta_spend_brl" | "views" | "unique_views" | "plays" | "pitch_pct" | "retention_25" | "retention_50" | "retention_75" | "retention_100" | "retention_avg"
  | "cta_clicks" | "cta_rate" | "conversions" | "conv_rate" | "rt_revenue_brl" | "roi";


function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);
}

function roiColor(roi: number) {
  if (roi >= 2) return "text-emerald-500";
  if (roi >= 1) return "text-amber-500";
  if (roi > 0) return "text-rose-500";
  return "text-muted-foreground";
}

function retentionColor(pct: number) {
  if (pct >= 50) return "text-emerald-500";
  if (pct >= 25) return "text-amber-500";
  return "text-muted-foreground";
}

export default function PerformanceVsl() {
  const [project, setProject] = useState<VslProject>("ALL");
  const [days, setDays] = useState<number>(7);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<PerformanceVslRow | null>(null);

  const { data, isLoading, isFetching } = usePerformanceVslData({ days, project, search });

  const sortedRows = useMemo(() => {
    const rows = [...(data?.rows || [])];
    rows.sort((a, b) => {
      const av = a[sortKey] as any;
      const bv = b[sortKey] as any;
      if (typeof av === "string" || typeof bv === "string") {
        const r = String(av || "").localeCompare(String(bv || ""));
        return sortDir === "asc" ? r : -r;
      }
      const an = Number(av || 0);
      const bn = Number(bv || 0);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const totals = useMemo(() => {
    const rows = sortedRows;
    return {
      vsls: rows.length,
      views: rows.reduce((s, r) => s + r.views, 0),
      spend: rows.reduce((s, r) => s + r.meta_spend_brl, 0),
      revenue: rows.reduce((s, r) => s + r.rt_revenue_brl, 0),
      conversions: rows.reduce((s, r) => s + r.conversions, 0),
      avgRetention50: rows.length > 0
        ? rows.reduce((s, r) => s + r.retention_50, 0) / rows.length
        : 0,
    };
  }, [sortedRows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 inline-block ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 inline-block ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 inline-block ml-1 text-primary" />;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Performance VSL</h1>
            {isFetching && !isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Cruzamento Meta Ads × Vturb × RedTrack consolidado <strong>por projeto</strong>. Clique em uma VSL para ver as campanhas Meta atreladas.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
          <Tabs value={project} onValueChange={(v) => setProject(v as VslProject)}>
            <TabsList className="h-9">
              {PROJECTS.map((p) => (
                <TabsTrigger key={p.key} value={p.key} className="text-xs px-3">
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <TabsList className="h-9">
              {PERIODS.map((p) => (
                <TabsTrigger key={p} value={String(p)} className="text-xs px-3">
                  {p === 1 ? "Hoje" : `${p}d`}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por VSL, UTM ou ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="VSLs" value={totals.vsls.toString()} />
          <KpiCard label="Views Totais" value={totals.views.toLocaleString("pt-BR")} />
          <KpiCard label="Conversões" value={totals.conversions.toLocaleString("pt-BR")} />
          <KpiCard
            label="Retenção 50% (média)"
            value={`${totals.avgRetention50.toFixed(1)}%`}
            valueClass={retentionColor(totals.avgRetention50)}
          />
        </div>

        {/* Cross-source totals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard label="Meta Spend" value={formatBRL(totals.spend)} />
          <KpiCard label="RedTrack Revenue" value={formatBRL(totals.revenue)} />
          <KpiCard
            label="ROI Global"
            value={totals.spend > 0 ? `${(totals.revenue / totals.spend).toFixed(2)}x` : "—"}
            valueClass={roiColor(totals.spend > 0 ? totals.revenue / totals.spend : 0)}
          />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/40 overflow-hidden bg-card">
          <div className="overflow-x-auto responsive-table-sticky">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/40">
                <tr className="text-left text-muted-foreground uppercase text-[10px] tracking-wider">
                  <Th onClick={() => toggleSort("vsl_name")} className="sticky-col">VSL <SortIcon k="vsl_name" /></Th>
                  <Th onClick={() => toggleSort("project")} className="text-center">Projeto <SortIcon k="project" /></Th>
                  <Th className="text-center">Campanhas Meta</Th>
                  <Th onClick={() => toggleSort("meta_spend_brl")} className="text-right">Spend <SortIcon k="meta_spend_brl" /></Th>
                  <Th onClick={() => toggleSort("views")} className="text-right">Views <SortIcon k="views" /></Th>
                  <Th onClick={() => toggleSort("unique_views")} className="text-right">Views Únicas <SortIcon k="unique_views" /></Th>
                  <Th onClick={() => toggleSort("plays")} className="text-right">Plays <SortIcon k="plays" /></Th>
                  <Th onClick={() => toggleSort("retention_25")} className="text-right">R25% <SortIcon k="retention_25" /></Th>
                  <Th onClick={() => toggleSort("retention_50")} className="text-right">R50% <SortIcon k="retention_50" /></Th>
                  <Th onClick={() => toggleSort("retention_75")} className="text-right">R75% <SortIcon k="retention_75" /></Th>
                  <Th onClick={() => toggleSort("retention_100")} className="text-right">R100% <SortIcon k="retention_100" /></Th>
                  <Th onClick={() => toggleSort("pitch_pct")} className="text-right">Pitch% <SortIcon k="pitch_pct" /></Th>
                  <Th onClick={() => toggleSort("retention_avg")} className="text-right">Engaj% <SortIcon k="retention_avg" /></Th>
                  <Th onClick={() => toggleSort("cta_clicks")} className="text-right">Botão <SortIcon k="cta_clicks" /></Th>
                  <Th onClick={() => toggleSort("cta_rate")} className="text-right">CTA% <SortIcon k="cta_rate" /></Th>
                  <Th onClick={() => toggleSort("conversions")} className="text-right">Conv <SortIcon k="conversions" /></Th>
                  <Th onClick={() => toggleSort("conv_rate")} className="text-right">Conv% <SortIcon k="conv_rate" /></Th>
                  <Th onClick={() => toggleSort("rt_revenue_brl")} className="text-right">Revenue <SortIcon k="rt_revenue_brl" /></Th>
                  <Th onClick={() => toggleSort("roi")} className="text-right">ROI <SortIcon k="roi" /></Th>

                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={19} className="text-center py-12 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                      Carregando dados Vturb × Meta × RedTrack...
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="text-center py-12 text-muted-foreground">
                      Nenhuma VSL com dados no período selecionado.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => (
                    <tr
                      key={r.key}
                      onClick={() => setSelected(r)}
                      className="border-b border-border/20 hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="sticky-col px-3 py-2 font-medium max-w-[260px]">
                        <div className="truncate" title={r.vsl_name}>{r.vsl_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate" title={r.vsl_id}>{r.vsl_id}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="text-[10px]">{r.project}</Badge>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.top_campaigns.length > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="text-[10px] cursor-help">
                                {r.top_campaigns.length}+
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-md">
                              <div className="text-[10px] font-semibold mb-1 uppercase tracking-wider">Top campanhas Meta</div>
                              <div className="space-y-0.5">
                                {r.top_campaigns.slice(0, 3).map((c) => (
                                  <div key={c.campaign_name} className="text-[11px] font-mono truncate max-w-[400px]">
                                    {formatBRL(c.spend_brl)} · {c.campaign_name}
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.meta_spend_brl > 0 ? formatBRL(r.meta_spend_brl) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.views.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.unique_views.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.plays.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.retention_25.toFixed(1)}%</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${retentionColor(r.retention_50)}`}>{r.retention_50.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.retention_75.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.retention_100.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.pitch_pct.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.retention_avg.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.cta_clicks.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.cta_rate.toFixed(2)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.conversions}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{r.conv_rate.toFixed(2)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.rt_revenue_brl > 0 ? formatBRL(r.rt_revenue_brl) : <span className="text-muted-foreground">—</span>}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-bold ${roiColor(r.roi)}`}>
                        {r.roi > 0 ? `${r.roi.toFixed(2)}x` : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))
                )}

              </tbody>
            </table>
          </div>
          {sortedRows.length > 0 && (
            <div className="px-3 py-2 border-t border-border/40 bg-muted/10 text-[11px] text-muted-foreground">
              {sortedRows.length} VSL{sortedRows.length === 1 ? "" : "s"} · período {data?.period.start} → {data?.period.end} · clique em uma linha para detalhes
            </div>
          )}
        </div>

        <PerformanceVslDetailModal row={selected} onClose={() => setSelected(null)} />
      </div>
    </TooltipProvider>
  );
}

function KpiCard({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border/40 p-3 bg-card">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}

function Th({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 font-medium select-none ${onClick ? "cursor-pointer hover:text-foreground" : ""} ${className}`}
    >
      {children}
    </th>
  );
}
