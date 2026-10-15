import { useState, useMemo } from "react";
import { Loader2, ExternalLink, TrendingUp, Users, MousePointerClick, ShoppingCart, DollarSign, BarChart3, Target } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useVslUtm } from "@/hooks/useVslUtm";
import { useVslSalesUtm } from "@/hooks/useVslSalesUtm";

interface VslUtmDrawerProps {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  startDate?: string;
  endDate?: string;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

function getUtmPlayRate(row: { play_rate?: number; total_views?: number; total_plays?: number }) {
  if (row.play_rate != null && Number.isFinite(row.play_rate)) return row.play_rate;
  if (row.total_views && row.total_views > 0) return (Number(row.total_plays || 0) / row.total_views) * 100;
  return 0;
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

const UTM_OPTIONS = [
  { value: "utm_campaign", label: "UTM Campaign" },
  { value: "utm_source", label: "UTM Source" },
  { value: "utm_content", label: "UTM Content" },
  { value: "utm_term", label: "UTM Term" },
];

// ─── Unified Campaign Tab ──────────────────────────────────────────────────────
// Joins Vturb UTM data + Sales data + Traffic spend by utm_campaign/source/etc
function UnifiedCampaignTab({
  playerId,
  startDate,
  endDate,
}: {
  playerId: string;
  startDate?: string;
  endDate?: string;
}) {
  const [groupBy, setGroupBy] = useState("utm_campaign");

  // Vturb UTM data (views, plays, retention, button clicks) per utm_value for THIS player
  const { data: vturbData, isLoading: loadingVturb, error: vturbError } = useVslUtm(
    playerId || null,
    startDate,
    endDate,
    groupBy
  );

  // Sales data (sales count, revenue) per utm_value — global but we join with Vturb keys
  // When Vturb has UTM data, we use those keys to filter; otherwise show sales-only view
  const { data: salesData, isLoading: loadingSales } = useVslSalesUtm(startDate, endDate, groupBy);

  const isLoading = loadingVturb || loadingSales;

  // Build sales map: utm_value → { sales, revenue, spend, roas }
  const salesMap = useMemo(() => {
    const map = new Map<string, { sales: number; revenue: number; spend: number; roas: number | null }>();
    for (const s of salesData || []) {
      map.set(s.utm_value, {
        sales: s.sales,
        revenue: s.revenue,
        spend: s.spend,
        roas: s.roas,
      });
    }
    return map;
  }, [salesData]);

  // When Vturb has UTM data — build unified rows merging both sources
  const vturbRows = vturbData || [];
  const hasVturbData = vturbRows.length > 0;

  // Unified rows: use Vturb as primary (has viewer funnel), enrich with sales
  const unifiedRows = useMemo(() => {
    if (!hasVturbData) return [];
    return vturbRows
      .map((row) => {
        const s = salesMap.get(row.utm_value) || { sales: 0, revenue: 0, spend: 0, roas: null };
        const playRate = getUtmPlayRate(row);
        const cac = s.sales > 0 && s.spend > 0 ? s.spend / s.sales : null;
        return { ...row, playRate, ...s, cac };
      })
      .sort((a, b) => b.unique_views - a.unique_views);
  }, [vturbRows, salesMap, hasVturbData]);

  // Sales-only rows: when Vturb has no UTM data, show sales by UTM as fallback
  const salesOnlyRows = useMemo(() => {
    if (hasVturbData) return [];
    return (salesData || []).map((s) => ({
      utm_value: s.utm_value,
      sales: s.sales,
      revenue: s.revenue,
      spend: s.spend,
      roas: s.roas,
      cac: s.sales > 0 && s.spend > 0 ? s.spend / s.sales : null,
    }));
  }, [salesData, hasVturbData]);

  // Totals
  const totals = useMemo(() => {
    if (hasVturbData) {
      return {
        unique_views: unifiedRows.reduce((s, r) => s + r.unique_views, 0),
        button_clicks: unifiedRows.reduce((s, r) => s + r.button_clicks, 0),
        checkout_clicks: unifiedRows.reduce((s, r) => s + r.checkout_clicks, 0),
        sales: unifiedRows.reduce((s, r) => s + r.sales, 0),
        revenue: unifiedRows.reduce((s, r) => s + r.revenue, 0),
        spend: unifiedRows.reduce((s, r) => s + r.spend, 0),
      };
    }
    return {
      unique_views: 0,
      button_clicks: 0,
      checkout_clicks: 0,
      sales: salesOnlyRows.reduce((s, r) => s + r.sales, 0),
      revenue: salesOnlyRows.reduce((s, r) => s + r.revenue, 0),
      spend: salesOnlyRows.reduce((s, r) => s + r.spend, 0),
    };
  }, [hasVturbData, unifiedRows, salesOnlyRows]);

  const overallRoas = totals.spend > 0 ? totals.revenue / totals.spend : null;
  const overallCac = totals.sales > 0 && totals.spend > 0 ? totals.spend / totals.sales : null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* GroupBy selector */}
      <div className="px-6 py-3 border-b border-border shrink-0">
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UTM_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : vturbError && !hasVturbData && salesOnlyRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-8">
            <ExternalLink className="h-8 w-8 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-foreground">Endpoint não disponível</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              A API do Vturb não retornou dados de UTM para este player. Verifique se o plano inclui acesso ao
              endpoint de origem de tráfego.
            </p>
          </div>
        ) : (
          <>
            {/* Vturb limitation notice when no vturb data but has sales */}
            {!hasVturbData && salesOnlyRows.length > 0 && (
              <div className="mx-6 mt-4 mb-0 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                <strong>Limitação de plano Vturb:</strong> métricas de visualização (visitantes, plays, retenção)
                indisponíveis. Exibindo apenas dados de vendas e investimento Meta por UTM.
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 px-6 py-4 border-b border-border">
              {hasVturbData && (
                <>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                      <Users className="h-3 w-3" /> Visitantes
                    </p>
                    <p className="text-lg font-bold font-data mt-0.5">{fmt(totals.unique_views)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                      <MousePointerClick className="h-3 w-3" /> Cliques
                    </p>
                    <p className="text-lg font-bold font-data mt-0.5">{fmt(totals.button_clicks)}</p>
                  </div>
                </>
              )}
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                  <ShoppingCart className="h-3 w-3" /> Vendas
                </p>
                <p className="text-lg font-bold font-data mt-0.5 text-[hsl(var(--wr-positive))]">
                  {fmt(totals.sales)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                  <DollarSign className="h-3 w-3" /> Receita
                </p>
                <p className="text-lg font-bold font-data mt-0.5 text-[hsl(var(--wr-positive))]">
                  {fmtBRL(totals.revenue)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Invest. Meta
                </p>
                <p className="text-lg font-bold font-data mt-0.5">{fmtBRL(totals.spend)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                  <Target className="h-3 w-3" /> CAC
                </p>
                <p
                  className={`text-lg font-bold font-data mt-0.5 ${
                    overallCac !== null && overallCac < 100
                      ? "text-[hsl(var(--wr-positive))]"
                      : overallCac !== null && overallCac > 300
                        ? "text-destructive"
                        : ""
                  }`}
                >
                  {overallCac !== null ? fmtBRL(overallCac) : "—"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                  <TrendingUp className="h-3 w-3" /> ROAS
                </p>
                <p
                  className={`text-lg font-bold font-data mt-0.5 ${
                    overallRoas !== null && overallRoas >= 2
                      ? "text-[hsl(var(--wr-positive))]"
                      : overallRoas !== null && overallRoas < 1
                        ? "text-destructive"
                        : ""
                  }`}
                >
                  {overallRoas !== null ? `${overallRoas.toFixed(2)}x` : "—"}
                </p>
              </div>
            </div>

            {/* Unified Table */}
            {hasVturbData ? (
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="text-[11px] min-w-[180px]">Campanha / Criativo</TableHead>
                    <TableHead className="text-right text-[11px]">Visitantes</TableHead>
                    <TableHead className="text-right text-[11px]">Play Rate</TableHead>
                    <TableHead className="text-right text-[11px]">Retenção</TableHead>
                    <TableHead className="text-right text-[11px]">Cliques</TableHead>
                    <TableHead className="text-right text-[11px]">Vendas</TableHead>
                    <TableHead className="text-right text-[11px]">Receita</TableHead>
                    <TableHead className="text-right text-[11px]">Invest. Meta</TableHead>
                    <TableHead className="text-right text-[11px]">CAC</TableHead>
                    <TableHead className="text-right text-[11px]">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unifiedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8 text-xs">
                        Nenhum dado encontrado para o período
                      </TableCell>
                    </TableRow>
                  ) : (
                    unifiedRows.map((row, i) => {
                      const roasColor =
                        row.roas !== null && row.roas >= 2
                          ? "text-[hsl(var(--wr-positive))] font-semibold"
                          : row.roas !== null && row.roas < 1
                            ? "text-destructive"
                            : "text-muted-foreground";
                      return (
                        <TableRow key={i} className="text-xs font-data">
                          <TableCell className="max-w-[220px] font-medium">
                            <span className="truncate block text-xs" title={row.utm_value}>
                              {row.utm_value || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{fmt(row.unique_views)}</TableCell>
                          <TableCell className="text-right">{fmtPct(row.playRate)}</TableCell>
                          <TableCell className="text-right">{fmtPct(row.retention_rate)}</TableCell>
                          <TableCell className="text-right">{fmt(row.button_clicks)}</TableCell>
                          <TableCell className="text-right font-semibold text-[hsl(var(--wr-positive))]">
                            {row.sales > 0 ? fmt(row.sales) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-[hsl(var(--wr-positive))]">
                            {row.revenue > 0 ? fmtBRL(row.revenue) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {row.spend > 0 ? fmtBRL(row.spend) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {row.cac !== null ? fmtBRL(row.cac) : "—"}
                          </TableCell>
                          <TableCell className={`text-right ${roasColor}`}>
                            {row.roas !== null ? `${row.roas.toFixed(2)}x` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            ) : (
              // Sales-only fallback table (no Vturb UTM data)
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="text-[11px] min-w-[200px]">Campanha / Criativo</TableHead>
                    <TableHead className="text-right text-[11px]">Vendas</TableHead>
                    <TableHead className="text-right text-[11px]">Receita</TableHead>
                    <TableHead className="text-right text-[11px]">AOV</TableHead>
                    <TableHead className="text-right text-[11px]">Invest. Meta</TableHead>
                    <TableHead className="text-right text-[11px]">CAC</TableHead>
                    <TableHead className="text-right text-[11px]">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesOnlyRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-xs">
                        Nenhuma venda encontrada para o período
                      </TableCell>
                    </TableRow>
                  ) : (
                    salesOnlyRows.map((row, i) => {
                      const avgTicket = row.sales > 0 ? row.revenue / row.sales : 0;
                      const roasColor =
                        row.roas !== null && row.roas >= 2
                          ? "text-[hsl(var(--wr-positive))] font-semibold"
                          : row.roas !== null && row.roas < 1
                            ? "text-destructive"
                            : "text-muted-foreground";
                      return (
                        <TableRow key={i} className="text-xs font-data">
                          <TableCell className="max-w-[300px] font-medium">
                            <span className="truncate block" title={row.utm_value}>
                              {row.utm_value || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-[hsl(var(--wr-positive))]">
                            {fmt(row.sales)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-[hsl(var(--wr-positive))]">
                            {fmtBRL(row.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmtBRL(avgTicket)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {row.spend > 0 ? fmtBRL(row.spend) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {row.cac !== null ? fmtBRL(row.cac) : "—"}
                          </TableCell>
                          <TableCell className={`text-right ${roasColor}`}>
                            {row.roas !== null ? `${row.roas.toFixed(2)}x` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Drawer ───────────────────────────────────────────────────────────────
export function VslUtmDrawer({ open, onClose, playerId, playerName, startDate, endDate }: VslUtmDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
          <SheetTitle className="text-sm font-semibold truncate">Análise por Campanha / Criativo</SheetTitle>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{playerName || "VSL"}</p>
        </SheetHeader>

        <UnifiedCampaignTab playerId={playerId} startDate={startDate} endDate={endDate} />
      </SheetContent>
    </Sheet>
  );
}
