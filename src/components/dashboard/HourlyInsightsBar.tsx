import { useMemo, useState } from "react";
import { Flame, Skull, TrendingUp, TrendingDown, Sparkles, BarChart3, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface HourlyInsightDatum {
  hour: number;
  /** Primary metric value (lucro/vendas/qualquer base) */
  value: number;
  /** Optional context fields for the drawer */
  revenue?: number;
  spend?: number;
  sales?: number;
  roas?: number;
  clicks?: number;
  ic?: number;
  lpv?: number;
  cac?: number;
  cpic?: number;
  lucroLiquido?: number;
}

interface HourlyInsightsBarProps {
  data: HourlyInsightDatum[];
  /** Label do que é "value" (ex: "Lucro Líquido", "Vendas", "% Vendas") */
  metricLabel: string;
  /** Como formatar o "value" */
  formatter: (v: number) => string;
  /** Se true, baseline é 0 (lucro). Se false (vendas/percent), baseline é a média */
  pivotZero?: boolean;
  /** Hora atual (limite de cálculo). Se omitido, usa todas as horas com value !== 0 */
  currentHour?: number;
  /** Título do drawer detalhado */
  detailTitle?: string;
}

const fmtPct = (v: number) =>
  `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;

function classifyHour(value: number, avg: number, pivotZero: boolean) {
  if (pivotZero) {
    if (value < 0) return "loss";
    if (value > avg * 1.4 && value > 0) return "hot";
    if (value < avg * 0.4 && value >= 0) return "cold";
  } else {
    if (value > avg * 1.4) return "hot";
    if (value < avg * 0.4) return "cold";
  }
  return "neutral";
}

export function HourlyInsightsBar({
  data,
  metricLabel,
  formatter,
  pivotZero = false,
  currentHour,
  detailTitle = "Insights por Horário",
}: HourlyInsightsBarProps) {
  const [open, setOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof HourlyInsightDatum | 'deltaPct'; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: keyof HourlyInsightDatum | 'deltaPct') => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof HourlyInsightDatum | 'deltaPct') => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown className="ml-1 h-3 w-3 inline-block opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="ml-1 h-3 w-3 inline-block text-primary" /> : <ChevronDown className="ml-1 h-3 w-3 inline-block text-primary" />;
  };

  const insights = useMemo(() => {
    // Consider only hours that have any data (value !== 0) and are not in the future
    const limit = currentHour ?? 23;
    const valid = data.filter((d) => d.hour <= 23 && (d.value !== 0 || (d.spend ?? 0) > 0 || (d.sales ?? 0) > 0));
    if (valid.length === 0) {
      return null;
    }

    const total = valid.reduce((s, d) => s + d.value, 0);
    const avg = total / valid.length;

    // Peak / dead
    const sortedDesc = [...valid].sort((a, b) => b.value - a.value);
    const peak = sortedDesc[0];
    const dead = sortedDesc[sortedDesc.length - 1];

    // Hot window: best contiguous 3-hour block
    let bestBlock = { start: 0, end: 0, sum: -Infinity };
    const byHour = new Map(data.map((d) => [d.hour, d]));
    for (let h = 0; h <= limit - 2; h++) {
      const a = byHour.get(h)?.value ?? 0;
      const b = byHour.get(h + 1)?.value ?? 0;
      const c = byHour.get(h + 2)?.value ?? 0;
      const sum = a + b + c;
      if (sum > bestBlock.sum) bestBlock = { start: h, end: h + 2, sum };
    }
    const blockShare = total > 0 ? (bestBlock.sum / total) * 100 : 0;

    // Loss / cold hours
    const lossHours = pivotZero ? valid.filter((d) => d.value < 0) : [];
    const coldHours = valid.filter((d) => classifyHour(d.value, avg, pivotZero) === "cold");

    // Classify each hour for table
    const enriched = data.map((d) => {
      const inRange = d.hour <= 23;
      const cls = inRange && (d.value !== 0 || (d.spend ?? 0) > 0 || (d.sales ?? 0) > 0)
        ? classifyHour(d.value, avg, pivotZero)
        : "empty";
      const deltaPct = d.revenue && d.revenue > 0 ? (d.lucroLiquido / d.revenue) * 100 : 0;
      return { ...d, cls, deltaPct, inRange };
    });

    const sortedEnriched = [...enriched];
    if (sortConfig) {
      sortedEnriched.sort((a, b) => {
        const aValue = (a as any)[sortConfig.key] ?? 0;
        const bValue = (b as any)[sortConfig.key] ?? 0;
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return { peak, dead, bestBlock, blockShare, lossHours, coldHours, avg, total, enriched: sortedEnriched };
  }, [data, pivotZero, currentHour, sortConfig]);

  if (!insights) return null;

  const { peak, dead, bestBlock, blockShare, lossHours, coldHours, enriched } = insights;

  return (
    <>
      {/* Resume bar */}
      <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-md bg-secondary/40 border border-border/50">
        <div className="flex items-center gap-3 flex-wrap text-[10.5px]">
          <span className="flex items-center gap-1.5">
            <Flame className="h-3 w-3 text-orange-400" />
            <span className="text-muted-foreground">Pico</span>
            <strong className="text-foreground font-data">
              {String(peak.hour).padStart(2, "0")}h
            </strong>
            <span className="text-muted-foreground/70">({formatter(peak.value)})</span>
          </span>
          <span className="text-border">•</span>
          <span className="flex items-center gap-1.5">
            <Skull className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Morto</span>
            <strong className="text-foreground font-data">
              {String(dead.hour).padStart(2, "0")}h
            </strong>
            <span className="text-muted-foreground/70">({formatter(dead.value)})</span>
          </span>
          <span className="text-border">•</span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground">Janela quente</span>
            <strong className="text-foreground font-data">
              {String(bestBlock.start).padStart(2, "0")}-{String(bestBlock.end).padStart(2, "0")}h
            </strong>
            <span className="text-muted-foreground/70">= {blockShare.toFixed(0)}%</span>
          </span>
          {pivotZero && lossHours.length > 0 && (
            <>
              <span className="text-border">•</span>
              <span className="flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3 text-destructive" />
                <strong className="text-destructive font-data">{lossHours.length}h</strong>
                <span className="text-muted-foreground">no prejuízo</span>
              </span>
            </>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 shrink-0">
              <BarChart3 className="h-3 w-3" />
              Insights
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-6 bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-sm">{detailTitle}</DialogTitle>
              <DialogDescription className="text-[11px]">
                Análise hora a hora da performance operacional
              </DialogDescription>
            </DialogHeader>

            {/* Peak Analysis & Peak Hours Detection */}
            <div className="space-y-3 my-4">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Flame className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] font-black font-sora uppercase tracking-wider text-foreground">
                    Horários de Pico (Performance Máxima)
                  </span>
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                  O horário de pico absoluto foi às <strong className="text-foreground">{String(peak.hour).padStart(2, "0")}h</strong> com {formatter(peak.value)}. 
                  A janela de maior concentração é entre <strong className="text-foreground">{String(bestBlock.start).padStart(2, "0")}h–{String(bestBlock.end).padStart(2, "0")}h</strong>, 
                  representando <strong className="text-foreground">{blockShare.toFixed(1)}%</strong> do total acumulado.
                </p>
              </div>

              <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-tight">
                    Recomendação de Escala
                  </span>
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                  Considere aumentar budget no bloco{" "}
                  <strong className="text-foreground">
                    {String(bestBlock.start).padStart(2, "0")}h–{String(bestBlock.end).padStart(2, "0")}h
                  </strong>
                  , onde a oferta apresenta maior tração e eficiência.
                </p>
              </div>

              {(pivotZero ? lossHours.length > 0 : coldHours.length > 0) && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-[11px] font-semibold text-foreground uppercase tracking-tight">
                      Zonas Críticas / Pausa
                    </span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                    {pivotZero ? (
                      <>
                        Detectadas <strong className="text-destructive">{lossHours.length} janelas</strong> em
                        prejuízo:{" "}
                        <span className="font-data text-foreground">
                          {lossHours
                            .slice(0, 12)
                            .map((h) => String(h.hour).padStart(2, "0") + "h")
                            .join(", ")}
                        </span>
                        . Avalie aplicar dayparting nessas faixas para proteger a margem.
                      </>
                    ) : (
                      <>
                        Existem <strong className="text-foreground">{coldHours.length} horas</strong> com volume
                        crítico:{" "}
                        <span className="font-data text-foreground">
                          {coldHours
                            .slice(0, 12)
                            .map((h) => String(h.hour).padStart(2, "0") + "h")
                            .join(", ")}
                        </span>
                        .
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="flex-1 -mx-6 overflow-y-auto px-6">
              <Table className="relative">
                <TableHeader className="sticky top-0 bg-card z-20 shadow-[0_1px_0_0_hsl(var(--border))]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead 
                      className="h-8 text-[10px] uppercase cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('hour')}
                    >
                      Hora {getSortIcon('hour')}
                    </TableHead>
                    <TableHead 
                      className="h-8 text-[10px] uppercase text-right cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('spend')}
                    >
                      Investimento {getSortIcon('spend')}
                    </TableHead>
                    <TableHead 
                      className="h-8 text-[10px] uppercase text-right cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('sales')}
                    >
                      Vendas {getSortIcon('sales')}
                    </TableHead>
                    <TableHead 
                      className="h-8 text-[10px] uppercase text-right cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('clicks')}
                    >
                      Cliques {getSortIcon('clicks')}
                    </TableHead>
                    <TableHead 
                      className="h-8 text-[10px] uppercase text-right cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('ic')}
                    >
                      IC {getSortIcon('ic')}
                    </TableHead>
                    <TableHead 
                      className="h-8 text-[10px] uppercase text-right cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('cac')}
                    >
                      CAC {getSortIcon('cac')}
                    </TableHead>
                    <TableHead 
                      className="h-8 text-[10px] uppercase text-right cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('cpic')}
                    >
                      Custo/IC {getSortIcon('cpic')}
                    </TableHead>
                    <TableHead 
                      className="h-8 text-[10px] uppercase text-right cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('value')}
                    >
                      {metricLabel} {getSortIcon('value')}
                    </TableHead>
                    <TableHead 
                      className="h-8 text-[10px] uppercase text-right cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('deltaPct')}
                    >
                      Margem % {getSortIcon('deltaPct')}
                    </TableHead>
                    <TableHead className="h-8 text-[10px] uppercase text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enriched.map((d) => (
                    <TableRow key={d.hour} className={!d.inRange ? "opacity-40" : ""}>
                      <TableCell className="py-1.5 font-data text-[11px]">
                        {String(d.hour).padStart(2, "0")}:00
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-data text-[11px]">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.spend || 0)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-data text-[11px]">
                        {d.sales || 0}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-data text-[11px]">
                        {d.clicks || 0}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-data text-[11px]">
                        {d.ic || 0}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-data text-[11px]">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.cac || 0)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-data text-[11px]">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.cpic || 0)}
                      </TableCell>
                      <TableCell
                        className={`py-1.5 text-right font-data text-[11px] ${
                          d.lucroLiquido !== undefined 
                            ? (d.lucroLiquido > 0 ? "text-[#24D67E] font-semibold" : d.lucroLiquido < 0 ? "text-[#F2354A] font-semibold" : "text-foreground")
                            : (d.value > 0 ? "text-[#24D67E] font-semibold" : d.value < 0 ? "text-[#F2354A] font-semibold" : "text-foreground")
                        }`}
                      >
                        {formatter(d.value)}
                      </TableCell>
                      <TableCell
                        className={`py-1.5 text-right font-data text-[11px] ${
                          d.deltaPct > 0 ? "text-[#24D67E] font-semibold" : d.deltaPct < 0 ? "text-[#F2354A] font-semibold" : "text-foreground"
                        }`}
                      >
                        {d.inRange ? (d.deltaPct === 0 && d.value < 0 ? "-100.0%" : d.deltaPct.toFixed(1) + "%") : "—"}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        {d.inRange && (
                          <div className="flex justify-end gap-1 flex-wrap">
                            {d.cls === "hot" && (
                              <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/15 text-[9px] px-1.5 py-0 h-4 flex items-center gap-1">
                                <span>🔥</span>
                                <span>quente</span>
                              </Badge>
                            )}
                            {d.cls === "cold" && (
                              <Badge variant="outline" className="text-muted-foreground border-border text-[9px] px-1.5 py-0 h-4">
                                fria
                              </Badge>
                            )}
                            {d.cls === "loss" && (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                                prejuízo
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
