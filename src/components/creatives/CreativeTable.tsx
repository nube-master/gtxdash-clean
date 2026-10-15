import { useState, useCallback, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ShieldAlert, ArrowUp, ArrowDown, ArrowUpDown, BarChart3, ExternalLink, GitCompareArrows, X } from "lucide-react";
import { type CreativeRow, type CreativeSortKey } from "@/lib/creativeUtils";
import { CreativeDiagnosticsModal } from "./CreativeDiagnosticsModal";
import { CreativeCompareModal } from "./CreativeCompareModal";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}
function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v);
}
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

type SortDir = "asc" | "desc";

interface Props {
  creatives: CreativeRow[];
  isAdmin: boolean;
  sharedCreativeId?: string | null;
  onSharedCreativeConsumed?: () => void;
  filterTestMode?: string;
}

const TIER_COLORS: Record<string, string> = {
  ESCALAVEL: "bg-wr-positive/10 text-wr-positive border-wr-positive/30",
  PROMISSOR: "bg-muted/30 text-muted-foreground border-border",
  INICIOU: "bg-muted/20 text-muted-foreground border-border",
  TESTE: "bg-muted/20 text-muted-foreground border-border",
  CRITICO: "bg-destructive/10 text-destructive border-destructive/30",
};

const TIER_LABELS: Record<string, string> = {
  ESCALAVEL: "Escalável",
  PROMISSOR: "Promissor",
  INICIOU: "Iniciou",
  TESTE: "Teste",
  CRITICO: "Crítico",
};

function getSortValue(c: CreativeRow, key: CreativeSortKey): number {
  switch (key) {
    case "creativeScore": return c.creativeScore;
    case "roi": return c.roi;
    case "hookRate": return c.hookRate;
    case "holdRate": return c.holdRate;
    case "ctr": return c.ctr;
    case "sales": return c.sales;
    case "cpc": return c.cpc;
    case "spend": return c.spend;
    case "revenue": return c.revenue;
    case "profit": return c.profit;
    case "icCount": return c.icCount;
    case "costPerIc": return c.costPerIc;
    case "checkoutConvRate": return c.checkoutConvRate;
    case "cac": return c.cac;
    case "campaignCount": return c.campaignNames.size;
    case "accountCount": return c.accountIds.size;
    default: return 0;
  }
}

interface SortableHeaderProps {
  label: string;
  sortKey: CreativeSortKey;
  currentSort: CreativeSortKey | null;
  currentDir: SortDir;
  onSort: (key: CreativeSortKey) => void;
  className?: string;
  tooltip?: string;
}

function SortableHeader({ label, sortKey, currentSort, currentDir, onSort, className = "", tooltip }: SortableHeaderProps) {
  const isActive = currentSort === sortKey;
  const content = (
    <span className="inline-flex items-center gap-0.5">
      {label}
      {isActive ? (
        currentDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />
      )}
    </span>
  );
  return (
    <TableHead
      className={`text-[10px] font-medium uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-0.5 border-b border-dashed border-muted-foreground/40">
              {content}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : content}
    </TableHead>
  );
}

export function CreativeTable({ creatives, isAdmin, sharedCreativeId, onSharedCreativeConsumed, filterTestMode }: Props) {
  const [sortKey, setSortKey] = useState<CreativeSortKey>("creativeScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [diagCreativeId, setDiagCreativeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CreativeRow[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Derive from latest data so metrics stay fresh
  const diagCreative = useMemo(
    () => (diagCreativeId ? creatives.find(c => c.creativeId === diagCreativeId) ?? null : null),
    [diagCreativeId, creatives]
  );

  // Auto-open shared creative
  useEffect(() => {
    if (sharedCreativeId && creatives.length > 0 && !diagCreativeId) {
      const found = creatives.find(c => c.creativeId === sharedCreativeId);
      if (found) {
        setDiagCreativeId(found.creativeId);
        onSharedCreativeConsumed?.();
      }
    }
  }, [sharedCreativeId, creatives]);

  const toggleSelect = useCallback((c: CreativeRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const key = `${c.creativeId}-${c.project.tag || 'none'}`;
      const exists = prev.some(s => `${s.creativeId}-${s.project.tag || 'none'}` === key);
      if (exists) return prev.filter(s => `${s.creativeId}-${s.project.tag || 'none'}` !== key);
      if (prev.length >= 2) return [prev[1], c];
      return [...prev, c];
    });
  }, []);

  const isSelected = useCallback((c: CreativeRow) => {
    const key = `${c.creativeId}-${c.project.tag || 'none'}`;
    return selected.some(s => `${s.creativeId}-${s.project.tag || 'none'}` === key);
  }, [selected]);

  const handleSort = useCallback((key: CreativeSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }, [sortKey]);

  const sorted = useMemo(() => {
    const arr = [...creatives];
    arr.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return arr;
  }, [creatives, sortKey, sortDir]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Performance de Criativos</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      {/* Compare bar */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
          <GitCompareArrows className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs text-foreground font-medium">
            {selected.length}/2 selecionados
            {selected.map(s => (
              <Badge key={`${s.creativeId}-${s.project.tag}`} variant="outline" className="ml-1.5 text-[9px] font-mono">
                {s.creativeId} {s.project.tag ? `(${s.project.label})` : ""}
              </Badge>
            ))}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setSelected([])}>
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
            <Button
              size="sm"
              className="h-7 text-[10px]"
              disabled={selected.length < 2}
              onClick={() => setCompareOpen(true)}
            >
              <GitCompareArrows className="h-3 w-3 mr-1" /> Comparar
            </Button>
          </div>
        </div>
      )}
      <Card className="bg-card border-border overflow-hidden" style={{ maxWidth: '100%', width: '100%' }}>
        <CardContent className="p-0 overflow-hidden">
          <div className="overflow-x-auto overflow-y-visible" style={{ width: 0, minWidth: '100%' }}>
          <TooltipProvider>
            <table className="w-full caption-bottom text-sm" style={{ minWidth: '1600px' }}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px] text-center">
                    <GitCompareArrows className="h-3 w-3 mx-auto text-muted-foreground" />
                  </TableHead>
                  <SortableHeader label="Score" sortKey="creativeScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="min-w-[50px] text-center" />
                  <TableHead className="text-[10px] font-medium uppercase tracking-wider min-w-[100px]">Criativo</TableHead>
                  <TableHead className="text-[10px] font-medium uppercase tracking-wider text-center">Copy</TableHead>
                  <TableHead className="text-[10px] font-medium uppercase tracking-wider text-center">Editor</TableHead>
                  <TableHead className="text-[10px] font-medium uppercase tracking-wider text-center">Tier</TableHead>
                  <SortableHeader label="Hook %" sortKey="hookRate" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="Hold %" sortKey="holdRate" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="CTR" sortKey="ctr" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                   <SortableHeader label="CPC" sortKey="cpc" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                   <SortableHeader label="ICs" sortKey="icCount" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                   <SortableHeader label="Custo/IC" sortKey="costPerIc" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                   <SortableHeader label="Conv. CK %" sortKey="checkoutConvRate" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                   <SortableHeader label="Vendas" sortKey="sales" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                   <SortableHeader
                     label="CAC"
                     sortKey="cac"
                     currentSort={sortKey}
                     currentDir={sortDir}
                     onSort={handleSort}
                     className="text-right"
                     tooltip="CAC calculado apenas sobre vendas front-end. Faturamento e ROI consideram todas as vendas do criativo."
                   />
                  <SortableHeader label="Invest." sortKey="spend" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="Fatur." sortKey="revenue" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="Lucro" sortKey="profit" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="ROI" sortKey="roi" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="Camp." sortKey="campaignCount" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-center" />
                  <SortableHeader label="Contas" sortKey="accountCount" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="text-center" />
                  <TableHead className="text-[10px] font-medium uppercase tracking-wider text-center w-[40px]">👁</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={23} className="text-center text-xs text-muted-foreground py-12">
                      Nenhum criativo encontrado neste período
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.slice(0, 100).map((c, idx) => {
                    const tierColor = TIER_COLORS[c.tier.tier] || TIER_COLORS.TESTE;
                    const tierLabel = TIER_LABELS[c.tier.tier] || c.tier.label;
                    const uniqueKey = `${c.creativeId}-${c.project.tag || 'none'}-${idx}`;

                    return (
                      <TableRow
                        key={uniqueKey}
                        className={`cursor-pointer hover:bg-muted/30 transition-colors ${c.budgetAlert ? "bg-destructive/5" : ""} ${isSelected(c) ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
                        onClick={() => setDiagCreativeId(c.creativeId)}
                      >
                        {/* Compare checkbox */}
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected(c)}
                            onCheckedChange={() => toggleSelect(c, { stopPropagation: () => {} } as React.MouseEvent)}
                            className="h-3.5 w-3.5"
                          />
                        </TableCell>
                        {/* Score */}
                        <TableCell className="text-center font-data text-xs font-bold">
                          <span className={
                            c.creativeScore >= 70 ? "text-wr-positive" :
                            c.creativeScore >= 40 ? "text-muted-foreground" :
                            "text-muted-foreground/50"
                          }>
                            {c.creativeScore.toFixed(0)}
                          </span>
                        </TableCell>

                        {/* Creative ID */}
                        <TableCell className="font-data text-xs font-bold">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {c.budgetAlert && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-[10px]">Desligar — Spend alto com ROI &lt; 0.7</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {c.integrity.status !== "ok" && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs">
                                  <p className="text-[10px] font-semibold mb-1">
                                    {c.integrity.status === "cross_project_conflict" && "Conflito entre projetos"}
                                    {c.integrity.status === "mismatch_project" && "Divergência de projeto"}
                                    {c.integrity.status === "missing_meta_data" && "Sem dados Meta"}
                                    {c.integrity.status === "missing_utm" && "UTM ausente"}
                                  </p>
                                  {c.integrity.details.map((d, i) => (
                                    <p key={i} className="text-[10px] text-muted-foreground">{d}</p>
                                  ))}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{c.creativeId}</span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                <p className="text-[10px] mb-1">
                                  {c.accountIds.size} conta(s) · {c.campaignNames.size} campanha(s) · {c.adNames.length} anúncio(s)
                                  {c.isTestStructure && " · Estrutura 1-50-1"}
                                </p>
                                <div className="text-[10px] text-muted-foreground space-y-0.5">
                                  {c.adNames.slice(0, 5).map((n) => (
                                    <p key={n} className="truncate max-w-[250px]">{n}</p>
                                  ))}
                                  {c.adNames.length > 5 && <p>+{c.adNames.length - 5} mais...</p>}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                            {c.project.tag && (
                              <span
                                className={`inline-flex items-center rounded border px-1 py-0 font-mono text-[9px] font-semibold leading-4 ${c.project.className}`}
                              >
                                {c.project.label}
                              </span>
                            )}
                            {c.isTestStructure && (
                              <span className="inline-flex items-center rounded border border-border bg-muted/20 px-1 py-0 font-mono text-[9px] leading-4 text-muted-foreground">
                                teste
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Copy */}
                        <TableCell className="text-center font-data text-xs">
                          {c.copyWriter ? (
                            <span className="text-foreground">✍️ {c.copyWriter}</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>

                        {/* Editor */}
                        <TableCell className="text-center font-data text-xs">
                          {c.editor ? (
                            <span className="text-foreground">🎬 {c.editor}</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>

                        {/* Tier badge */}
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={`font-data text-[10px] px-1.5 py-0 ${tierColor}`}
                          >
                            {tierLabel}
                          </Badge>
                        </TableCell>

                        {/* Hook — ≥45% verde, 35-45% neutro, <35% vermelho */}
                        <TableCell className="text-right font-data text-xs">
                          {!c.isVideo ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="text-muted-foreground/40 italic text-[10px]">N/A</span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[220px]">
                                <p className="text-[10px] font-semibold mb-1">Sem dados de vídeo</p>
                                <p className="text-[10px] text-muted-foreground">Este criativo não possui métricas de vídeo.</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger>
                                {c.hookSanity === "low_volume" ? (
                                  <span className="text-muted-foreground/50 italic">{fmtPct(c.hookRate)} *</span>
                                ) : c.hookSanity === "inflated" ? (
                                  <span className="text-muted-foreground italic">{fmtPct(c.hookRate)}</span>
                                ) : (
                                  <span className={c.hookRate >= 45 ? "text-wr-positive" : c.hookRate >= 35 ? "text-foreground" : "text-destructive"}>
                                    {fmtPct(c.hookRate)}
                                  </span>
                                )}
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[240px]">
                                <p className="text-[10px] font-semibold mb-1">Auditoria Hook Rate</p>
                                <p className="text-[10px] text-muted-foreground">3s Views: {fmt(c.video3sViews)} · Impressões: {fmt(c.impressions)}</p>
                                {c.hookSanity === "inflated" && (
                                  <p className="text-[10px] text-destructive mt-1">3s Views &gt; Impressões — inflação por autoplay.</p>
                                )}
                                {c.hookSanity === "low_volume" && (
                                  <p className="text-[10px] text-muted-foreground mt-1">Volume baixo — hook não confiável.</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>

                        {/* Hold — ≥4% verde, 2-4% neutro, <2% vermelho */}
                        <TableCell className="text-right font-data text-xs">
                          <span className={c.holdRate >= 4 ? "text-wr-positive" : c.holdRate >= 2 ? "text-foreground" : "text-destructive"}>
                            {fmtPct(c.holdRate)}
                          </span>
                        </TableCell>

                        {/* CTR — neutro sempre */}
                        <TableCell className="text-right font-data text-xs text-foreground">{fmtPct(c.ctr)}</TableCell>

                        {/* CPC — cost per click */}
                        <TableCell className="text-right font-data text-xs text-foreground">
                          {c.cpc > 0 ? fmtCurrency(c.cpc) : <span className="text-muted-foreground">—</span>}
                        </TableCell>

                         {/* ICs — quantidade (RedTrack primário, Meta como fallback) */}
                         <TableCell className="text-right font-data text-xs">
                           {c.icCount > 0 ? fmt(c.icCount) : "—"}
                         </TableCell>

                         {/* Custo por IC */}
                         <TableCell className="text-right font-data text-xs">
                           {c.costPerIc > 0 ? fmtCurrency(c.costPerIc) : "—"}
                         </TableCell>

                         {/* Conv. Checkout % */}
                         <TableCell className={`text-right font-data text-xs ${c.checkoutConvRate >= 25 ? "text-wr-positive font-semibold" : ""}`}>
                           {c.checkoutConvRate > 0 ? fmtPct(c.checkoutConvRate) : "—"}
                         </TableCell>

                        {/* Sales — neutro */}
                        <TableCell className="text-right font-data text-xs text-foreground">{c.sales}</TableCell>

                         {/* CAC — baseado apenas em vendas front-end */}
                         <TableCell className="text-right font-data text-xs text-foreground">
                           {c.cac > 0 ? fmtCurrency(c.cac) : <span className="text-muted-foreground">—</span>}
                         </TableCell>

                        {/* Investimento — neutro */}
                        <TableCell className="text-right font-data text-xs text-foreground">
                          {fmtCurrency(c.spend)}
                        </TableCell>

                        {/* Faturamento — neutro */}
                        <TableCell className="text-right font-data text-xs text-foreground">
                          {c.revenue > 0 ? fmtCurrency(c.revenue) : <span className="text-muted-foreground">—</span>}
                        </TableCell>

                        {/* Lucro — positivo verde, negativo vermelho */}
                        <TableCell className="text-right font-data text-xs">
                          <span className={`font-bold ${c.profit > 0 ? "text-wr-positive" : c.profit < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {fmtCurrency(c.profit)}
                          </span>
                        </TableCell>

                        {/* ROI — ≥1 verde, <1 vermelho */}
                        <TableCell className="text-right font-data text-xs">
                          <span className={`font-bold ${c.roi >= 1 ? "text-wr-positive" : c.roi > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {c.roi > 0 ? `${c.roi.toFixed(2)}x` : "—"}
                          </span>
                        </TableCell>

                        {/* Campaigns — neutro */}
                        <TableCell className="text-center font-data text-xs text-muted-foreground">
                          {c.campaignNames.size}
                        </TableCell>

                        {/* Accounts — neutro */}
                        <TableCell className="text-center font-data text-xs text-muted-foreground">
                          {c.accountIds.size}
                        </TableCell>

                        {/* Preview link */}
                        <TableCell className="text-center">
                          <a
                            href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(c.creativeId)}&search_type=keyword_unordered`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                            title="Ver no Meta Ad Library"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </table>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
    <CreativeDiagnosticsModal
      creative={diagCreative}
      open={diagCreative !== null}
      onOpenChange={(open) => { if (!open) setDiagCreativeId(null); }}
      filterTestMode={filterTestMode}
    />
    <CreativeCompareModal
      creatives={selected.length === 2 ? [selected[0], selected[1]] : null}
      open={compareOpen}
      onOpenChange={(open) => { setCompareOpen(open); if (!open) setSelected([]); }}
    />
    </div>
  );
}
