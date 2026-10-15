import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, HelpCircle, Pencil, X, Shield, Pause, Play, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Timer, Lock as LockIcon, DollarSign, GitCompare, Power, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LiveBadge } from "./LiveBadge";
import { Sparkline } from "./Sparkline";
import type { PacingCampaign, PacingRuleV2 } from "./mockData";
import { getIcCount } from "@/hooks/usePacingICs";
import { useToggleCampaign } from "@/hooks/useToggleCampaign";
import { GTX_DECISION_CONFIG, type GtxCampaignRow, type GtxDecision } from "@/hooks/useGtxMetaData";
import { cn } from "@/lib/utils";
import { CampaignTargetOverrideDialog } from "./CampaignTargetOverrideDialog";
import { BulkTargetOverrideDialog } from "./BulkTargetOverrideDialog";
import { BulkBudgetDialog } from "./BulkBudgetDialog";
import { BulkToggleDialog } from "./BulkToggleDialog";
import { PauseModeSelector, loadDefaultPauseMode, type PauseModeValue } from "./PauseModeSelector";
import { CampaignCompareDialog } from "./CampaignCompareDialog";
import { KillSquadDialog } from "./KillSquadDialog";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getMatchingRules, getBlockedRules } from "@/lib/pacingScope";
import { formatRelativeTime, type LastPacingAction } from "@/hooks/useLastPacingActions";
import { getEffectiveHourlyCap, type CampaignHourlyStatus } from "@/hooks/useCampaignHourlyStatus";
import { type PacingCooldown, formatCooldownRemaining, formatResumeTimeBRT } from "@/hooks/usePacingCooldowns";
import type { SortKey } from "./CampaignFilters";
import { NameEditCell, BudgetEditCell } from "./CampaignInlineEditors";
import { HourlyCapEditPopover } from "./HourlyCapEditPopover";
import { useProductMargins, computeRoasColor, roasColorClass } from "@/hooks/useProductMargins";
import { extractProjectCode } from "@/lib/projectUtils";

/**
 * Encurta o nome da conta para caber na coluna estreita.
 * Remove pipes "|" e IDs longos tipo A75752775, prioriza o "apelido" da conta.
 * Ex.: "AURORA | A75752775 | GTX AURORA 02 NEW" → "AURORA 02 NEW"
 */
function shortenAccountName(name: string): string {
  if (!name) return "—";
  const parts = name.split("|").map((p) => p.trim()).filter(Boolean);
  // Descarta segmentos que são apenas IDs (A + dígitos, ou só dígitos)
  const meaningful = parts.filter((p) => !/^A?\d{5,}$/i.test(p));
  let candidate = meaningful[meaningful.length - 1] || parts[0] || name;
  // Remove prefixos redundantes tipo "GTX ", "BM ", "C0X - GTX -"
  candidate = candidate
    .replace(/^C\d+\s*-\s*GTX\s*-\s*/i, "")
    .replace(/^GTX\s+/i, "")
    .trim();
  return candidate;
}


export type GtxOverlay = {
  margin: number;
  profit: number;
  profit3DTotal: number;
  spend3DTotal: number;
  revenue3DTotal: number;
  roas3D: number;
  scoreGtx: number;
  decision: GtxDecision;
  hasGtxSource?: boolean; // false = overlay sintetizado só do live (sem GTX 3D)
  /** Contagem total de vendas nos últimos 3d (soma de sales3D[]). Usado por Kill Squad. */
  sales3DCount?: number;
  /** CPA 3d = spend3DTotal / sales3DCount (0 se não tem venda). Usado por Kill Squad. */
  cpa3D?: number;
};

export type TrendMetric = "spend" | "revenue" | "roas" | "cpa" | "profit" | "profit3d";
const TREND_METRIC_KEY = "pacing.trendMetric";

const fmtBR = (v: number, d = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtInt = (v: number) => v.toLocaleString("pt-BR");

const dash = (v: number | null | undefined, fn: (n: number) => string) =>
  v == null || v === 0 ? <span className="text-muted-foreground/60">—</span> : fn(v);

function HeadTooltip({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-help">
          {label}
          <HelpCircle className="size-3 text-muted-foreground/60" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        <p className="text-[11px] leading-relaxed">{tip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function SortableHead({
  label,
  tip,
  sortKey: myKey,
  align = "left",
  activeKey,
  activeDir,
  onClick,
  minWidth,
}: {
  label: string;
  tip: string;
  sortKey: SortKey;
  align?: "left" | "right" | "center";
  activeKey?: SortKey;
  activeDir?: "asc" | "desc";
  onClick?: (key: SortKey) => void;
  minWidth?: string;
}) {
  const active = activeKey === myKey;
  return (
    <TableHead
      className={cn(
        "text-xs uppercase tracking-wider cursor-pointer select-none transition-colors hover:bg-muted/30 whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        minWidth
      )}
      onClick={() => onClick?.(myKey)}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1">
            {label}
            {active ? (
              activeDir === "asc" ? (
                <ArrowUp className="size-3 text-primary" />
              ) : (
                <ArrowDown className="size-3 text-primary" />
              )
            ) : (
              <ArrowUpDown className="size-3 text-muted-foreground/40" />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px]">
          <p className="text-[11px] leading-relaxed">{tip}</p>
        </TooltipContent>
      </Tooltip>
    </TableHead>
  );
}

export function CampaignTable({
  campaigns,
  onSelect,
  selectedId,
  gtxByName,
  scoreThresholds,
  rules = [],
  lastActions,
  sortKey,
  sortDir,
  onSortChange,
  icByCampaign,
  hourlyStatusByCampaign,
  hourlyWindowMode = "fixed",
  cooldownsByCampaign,
  ruleNameById,
  isToday = true,
}: {
  campaigns: PacingCampaign[];
  onSelect?: (c: PacingCampaign) => void;
  selectedId?: string | null;
  gtxByName?: Map<string, GtxOverlay>;
  scoreThresholds?: { green: number; yellow: number };
  rules?: PacingRuleV2[];
  lastActions?: Map<string, LastPacingAction>;
  sortKey?: SortKey;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: SortKey) => void;
  icByCampaign?: import("@/hooks/usePacingICs").PacingICMaps;
  hourlyStatusByCampaign?: Map<string, CampaignHourlyStatus>;
  hourlyWindowMode?: "fixed" | "rolling";
  cooldownsByCampaign?: Map<string, PacingCooldown>;
  ruleNameById?: Map<string, string>;
  /** Quando false, esconde colunas que só fazem sentido em tempo real (Bucket/Última 1h, Pace). */
  isToday?: boolean;
}) {
  const tableFrameRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const noFit = true;
  const green = scoreThresholds?.green ?? 70;
  const yellow = scoreThresholds?.yellow ?? 40;
  const toggle = useToggleCampaign();
  const { margins: productMargins } = useProductMargins();
  // Conversão BRL → moeda do dashboard (segue o seletor global)
  const { format: fmtMoney, currency } = useCurrency();
  const money = (v: number, d = 2) => fmtMoney(v, { decimals: d });
  const [pending, setPending] = useState<{ c: PacingCampaign; next: "ACTIVE" | "PAUSED" } | null>(null);
  const [pendingPauseMode, setPendingPauseMode] = useState<PauseModeValue>(() => loadDefaultPauseMode());
  const [editingTarget, setEditingTarget] = useState<PacingCampaign | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBudgetOpen, setBulkBudgetOpen] = useState(false);
  const [bulkToggleOpen, setBulkToggleOpen] = useState(false);
  const [killSquadOpen, setKillSquadOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>(() => {
    if (typeof window === "undefined") return "spend";
    const v = window.localStorage.getItem(TREND_METRIC_KEY);
    return (v === "revenue" || v === "roas" || v === "cpa" || v === "profit" || v === "spend") ? v : "spend";
  });
  useEffect(() => {
    try { window.localStorage.setItem(TREND_METRIC_KEY, trendMetric); } catch {}
  }, [trendMetric]);

  const allChecked = campaigns.length > 0 && selectedIds.size === campaigns.length;
  const someChecked = selectedIds.size > 0 && !allChecked;
  const toggleAll = (checked: boolean) =>
    setSelectedIds(checked ? new Set(campaigns.map((c) => c.id)) : new Set());
  const toggleOne = (id: string, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  const selectedCampaigns = campaigns.filter((c) => selectedIds.has(c.id));

  // Bucket label da hora corrente e da última hora fechada (BRT). Ex: "17:00–18:00".
  const { currentBucketLabel, previousBucketLabel } = (() => {
    const fmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    });
    const h = Number(fmt.format(new Date()));
    const hh = String(h).padStart(2, "0");
    const nn = String((h + 1) % 24).padStart(2, "0");
    const pp = String((h + 23) % 24).padStart(2, "0");
    return {
      currentBucketLabel: `${hh}:00–${nn}:00`,
      previousBucketLabel: `${pp}:00–${hh}:00`,
    };
  })();

  // Tick a cada 15s pra atualizar contagem regressiva do cooldown sem refetch.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const hasAnyCooldown = !!cooldownsByCampaign && cooldownsByCampaign.size > 0;
    if (!hasAnyCooldown) return;
    const id = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [cooldownsByCampaign]);

  // Largura redimensionável da coluna "Campanha" (persistida em localStorage).
  const [nameColWidth, setNameColWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 360;
    const v = Number(window.localStorage.getItem("pacing.nameColWidth"));
    return Number.isFinite(v) && v >= 200 ? v : 360;
  });
  useEffect(() => {
    try { window.localStorage.setItem("pacing.nameColWidth", String(nameColWidth)); } catch {}
  }, [nameColWidth]);
  // Largura redimensionável da coluna "Conta" (persistida em localStorage).
  const [accountColWidth, setAccountColWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 110;
    const v = Number(window.localStorage.getItem("pacing.accountColWidth"));
    return Number.isFinite(v) && v >= 60 ? v : 110;
  });
  useEffect(() => {
    try { window.localStorage.setItem("pacing.accountColWidth", String(accountColWidth)); } catch {}
  }, [accountColWidth]);
  useEffect(() => {
    const frame = tableFrameRef.current;
    if (!frame) return;
    if (noFit) {
      setFitScale(1);
      return;
    }

    // Measure the nearest constrained ancestor (dashboard-content or window)
    // instead of the frame itself, which is pushed by the table's min-width.
    const getAvailableWidth = () => {
      const dash = document.getElementById("dashboard-content");
      if (dash) {
        const styles = getComputedStyle(dash);
        const padL = parseFloat(styles.paddingLeft) || 0;
        const padR = parseFloat(styles.paddingRight) || 0;
        return Math.max(0, dash.clientWidth - padL - padR);
      }
      return window.innerWidth;
    };

    const updateScale = () => {
      const width = getAvailableWidth();
      const tableBaseWidth = 2700 + Math.max(0, nameColWidth - 360);
      const next = width > 0 ? Math.min(1, width / tableBaseWidth) : 1;
      setFitScale((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
    };

    updateScale();
    const dash = document.getElementById("dashboard-content");
    const observer = new ResizeObserver(updateScale);
    if (dash) observer.observe(dash);
    observer.observe(frame);
    window.addEventListener("resize", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [nameColWidth, noFit]);
  const startNameResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = nameColWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(220, Math.min(1000, startW + (ev.clientX - startX)));
      setNameColWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const startAccountResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = accountColWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(60, Math.min(400, startW + (ev.clientX - startX)));
      setAccountColWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <TooltipProvider delayDuration={300}>
    <>
    {selectedIds.size > 0 && (
      <div className="flex items-center justify-between gap-3 mb-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5">
        <div className="text-xs">
          <b className="text-foreground">{selectedIds.size}</b> campanha(s) selecionada(s)
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="default" onClick={() => setBulkOpen(true)}>
            <Pencil className="size-3.5 mr-1" /> Teto em lote
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBulkBudgetOpen(true)}>
            <DollarSign className="size-3.5 mr-1" /> Orçam. CBO
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBulkToggleOpen(true)}>
            <Power className="size-3.5 mr-1" /> Ativar/Pausar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setKillSquadOpen(true)}
            title="Kill Squad — renomeia [top]→[xxx] + pausa (só candidatas COD/Nutra)"
          >
            <Skull className="size-3.5 mr-1" /> Matar → xxx
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCompareOpen(true)}
            disabled={selectedIds.size < 2}
            title={selectedIds.size < 2 ? "Selecione 2 ou mais campanhas" : "Comparar selecionadas"}
          >
            <GitCompare className="size-3.5 mr-1" /> Comparar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X className="size-3.5 mr-1" /> Limpar
          </Button>
        </div>
      </div>
    )}
    <div ref={tableFrameRef} className="rounded-lg border border-border/60 bg-card overflow-x-auto overflow-y-hidden">

      <div
        style={{
          zoom: noFit ? 1 : fitScale,
          width: !noFit && fitScale < 1 ? `${100 / fitScale}%` : "100%",
        }}
      >
      <Table className="tabular-nums text-xs min-w-[2700px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/40">
            <TableHead className="w-10">
              <Checkbox
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={(v) => toggleAll(!!v)}
                aria-label="Selecionar todas"
              />
            </TableHead>
            <TableHead className="w-10"></TableHead>
            <TableHead
              style={{ width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth }}
              className="text-xs uppercase tracking-wider cursor-pointer select-none transition-colors hover:bg-muted/30 relative group whitespace-nowrap"
              onClick={() => onSortChange?.("name")}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1">
                    Campanha
                    {sortKey === "name" ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="size-3 text-primary" />
                      ) : (
                        <ArrowDown className="size-3 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 text-muted-foreground/40" />
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px]">
                  <p className="text-[11px] leading-relaxed">
                    Nome da campanha no Meta Ads. Arraste a borda direita do cabeçalho para ajustar a largura.
                  </p>
                </TooltipContent>
              </Tooltip>
              <span
                role="separator"
                aria-orientation="vertical"
                onMouseDown={startNameResize}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/40 group-hover:bg-border transition-colors"
                title="Arraste para redimensionar"
              />
            </TableHead>
            <TableHead
              style={{ width: accountColWidth, minWidth: accountColWidth, maxWidth: accountColWidth }}
              className="text-xs uppercase tracking-wider cursor-pointer select-none transition-colors hover:bg-muted/30 relative group whitespace-nowrap"
              onClick={() => onSortChange?.("account")}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1">
                    Conta
                    {sortKey === "account" ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="size-3 text-primary" />
                      ) : (
                        <ArrowDown className="size-3 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 text-muted-foreground/40" />
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px]">
                  <p className="text-[11px] leading-relaxed">
                    Conta publicitária do Meta Ads. Arraste a borda direita do cabeçalho para ajustar a largura. Passe o mouse na célula para ver o nome completo.
                  </p>
                </TooltipContent>
              </Tooltip>
              <span
                role="separator"
                aria-orientation="vertical"
                onMouseDown={startAccountResize}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/40 group-hover:bg-border transition-colors"
                title="Arraste para redimensionar"
              />
            </TableHead>
            <SortableHead label="Orçam." tip="Orçamento diário configurado no Meta Ads para esta campanha (CBO). Vazio em campanhas ABO." sortKey="dailyBudget" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Teto Diário" tip={`Teto diário alvo (${currency}). Prioridade: override manual > CBO do Meta > padrão da regra. Usado para Pace e Daily Cap. Funciona em ABO e CBO.`} sortKey="dailyTargetBrl" align="right" minWidth="min-w-[160px]" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            {isToday && (
              <SortableHead
                label={hourlyWindowMode === "fixed" ? "Bucket h/últ." : "Última 1h"}
                tip={
                  hourlyWindowMode === "fixed"
                    ? `Maior gasto entre o bucket corrente (${currentBucketLabel} BRT) e a última hora fechada (${previousBucketLabel} BRT) vs teto horário da regra campaign_hourly_cap. Isso evita perder estouro exatamente na virada da hora. Clique para ordenar.`
                    : "Gasto REAL nos últimos 60 minutos (Meta hourly API por campanha) vs teto horário da regra campaign_hourly_cap aplicável. Clique para ordenar (maior → menor por padrão)."
                }
                sortKey="hourlySpend"
                align="right"
                minWidth="min-w-[170px]"
                activeKey={sortKey}
                activeDir={sortDir}
                onClick={onSortChange}
              />
            )}
            <SortableHead label="Gasto" tip="Valor total gasto pela campanha (soma do range selecionado)." sortKey="spend" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            {isToday && (
              <SortableHead label="Pace" tip="Percentual do orçamento diário já consumido em relação ao horário atual. 100% = ritmo exato; acima = aceleração. Só faz sentido para Hoje." sortKey="pace" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            )}
            <SortableHead label="Impr." tip="Número de vezes que o anúncio foi exibido (impressions)." sortKey="impressions" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="CPM" tip="Custo por mil impressões (cost per mille)." sortKey="cpm" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="CTR" tip="Taxa de cliques em relação às impressões (%)." sortKey="ctr" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Cliques" tip="Número total de cliques no anúncio." sortKey="clicks" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="CPC" tip="Custo médio por clique (cost per click)." sortKey="cpc" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="CPA" tip="Custo por aquisição/venda (cost per acquisition). Calculado apenas quando há vendas." sortKey="cpa" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Vendas" tip="Quantidade de vendas atribuídas à campanha hoje (front-end)." sortKey="sales" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="IC" tip="Initiate Checkouts hoje (RedTrack event=initiate_checkout, matchado por meta_campaign_id)." sortKey="ic" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Custo IC" tip="Custo médio por Initiate Checkout (gasto hoje ÷ ICs hoje)." sortKey="costPerIC" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Conv. Checkout" tip="Taxa de conversão do checkout: vendas ÷ ICs (%). Mostra quantos dos checkouts iniciados viraram venda hoje." sortKey="checkoutConv" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="ROAS" tip="Retorno sobre investimento em anúncios (receita / gasto). Acima de 2.0 é excelente." sortKey="roas" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Lucro" tip="Lucro líquido estimado da campanha hoje (GTX)." sortKey="profit" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Faturamento" tip="Faturamento bruto da campanha hoje (soma de revenue das vendas atribuídas)." sortKey="revenue" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Margem" tip="Margem de lucro em percentual sobre a receita." sortKey="margin" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Score" tip="Pontuação GTX (0–100) baseada em ROAS, consistência, lucro e volume. Configurável em /pacing/score-rules." sortKey="score" align="center" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            
            <SortableHead label="Regras" tip="Quantas regras de pacing ativas estão armadas para esta campanha agora (scope: nome, projeto, conta, fase, mínimo). Passe o mouse para ver a lista." sortKey="rules" align="center" minWidth="min-w-[80px]" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Última Ação" tip="Última ação automática executada nesta campanha (últimas 24h): pausa/religar + qual regra disparou e o porquê." sortKey="lastAction" align="left" minWidth="min-w-[220px]" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <TableHead className="text-xs uppercase tracking-wider min-w-[150px]">
              <HeadTooltip
                label="Reativa em"
                tip="Cooldown ativo: tempo restante e horário previsto (BRT) em que o smart-reenable vai religar a campanha automaticamente. Só aparece em campanhas pausadas por uma regra com cooldown definido (ex.: campaign_hourly_cap 60 min)."
              />
            </TableHead>
            <SortableHead label="Status da Campanha" tip="Estado atual da campanha no Meta Ads." sortKey="status" align="left" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Invest. 3D" tip="FIXO: investimento (spend) somado dos últimos 3 dias em BRT — hoje, ontem e anteontem. Independente do filtro de data." sortKey="spend3d" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Faturam. 3D" tip="FIXO: faturamento bruto somado dos últimos 3 dias em BRT — hoje, ontem e anteontem. Independente do filtro de data." sortKey="revenue3d" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="ROAS 3D" tip="FIXO: ROAS médio dos últimos 3 dias (faturamento 3D ÷ investimento 3D). Independente do filtro de data." sortKey="roas3d" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <SortableHead label="Lucro 3D" tip="FIXO: lucro bruto (revenue − spend) dos últimos 3 dias em BRT — hoje, ontem e anteontem. Independente do filtro de data. Verde = no azul, vermelho = prejuízo." sortKey="profit3d" align="right" activeKey={sortKey} activeDir={sortDir} onClick={onSortChange} />
            <TableHead className="text-xs uppercase tracking-wider min-w-[140px]">
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 cursor-help">
                      Trend
                      <HelpCircle className="size-3 text-muted-foreground/60" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    <p className="text-[11px] leading-relaxed">
                      Variação % da métrica escolhida entre hoje e ontem (dados reais).
                      Para Lucro, compara o lucro de hoje com a média dos 2 dias anteriores (via GTX 3D).
                    </p>
                  </TooltipContent>
                </Tooltip>
                <select
                  value={trendMetric}
                  onChange={(e) => setTrendMetric(e.target.value as TrendMetric)}
                  className="text-[10px] uppercase tracking-wider bg-muted/40 hover:bg-muted/60 border border-border/40 rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="spend">Gasto</option>
                  <option value="revenue">Faturam.</option>
                  <option value="roas">ROAS</option>
                  <option value="cpa">CPA</option>
                  <option value="profit">Lucro</option>
                  <option value="profit3d">Lucro 3D</option>
                </select>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((c) => {
            const isLive = c.status !== "paused";
            const isPending = toggle.isPending && toggle.variables?.campaign_id === c.id;
            return (
              <TableRow
                key={c.id}
                className={cn(
                  "cursor-pointer hover:bg-muted/40 border-border/40",
                  selectedId === c.id && "bg-primary/5 hover:bg-primary/10",
                  c.rulesExempt && "border-l-2 border-l-amber-500"
                )}
                onClick={() => onSelect?.(c)}
              >

                <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(c.id)}
                    onCheckedChange={(v) => toggleOne(c.id, !!v)}
                    aria-label={`Selecionar ${c.name}`}
                  />
                </TableCell>
                <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="relative inline-flex items-center gap-2">
                    <Switch
                      checked={isLive}
                      disabled={isPending}
                      className="data-[state=checked]:bg-[hsl(var(--wr-positive))] [&>span]:bg-white"
                      onCheckedChange={(checked) => {
                        const next = checked ? "ACTIVE" : "PAUSED";
                        const prev = checked ? "PAUSED" : "ACTIVE";
                        toggle.mutate(
                          {
                            campaign_id: c.id,
                            account_id: c.accountId ?? "",
                            campaign_name: c.name,
                            new_status: next,
                          },
                          {
                            onSuccess: () => {
                              toast.success(
                                next === "PAUSED" ? "Campanha pausada" : "Campanha religada",
                                {
                                  description: c.name,
                                  action: {
                                    label: "Desfazer",
                                    onClick: () =>
                                      toggle.mutate({
                                        campaign_id: c.id,
                                        account_id: c.accountId ?? "",
                                        campaign_name: c.name,
                                        new_status: prev,
                                      }),
                                  },
                                }
                              );
                            },
                          }
                        );
                      }}
                    />
                    {isPending && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </TableCell>
                <TableCell
                  className="py-1.5 align-top"
                  style={{ width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth }}
                >
                  <div className="flex items-start gap-1.5">
                    {c.rulesExempt && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="shrink-0 inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            🛡️ ISENTA
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px]">
                          <p className="text-[11px]">
                            Fora das regras automáticas{c.hourlyCapBrlOverride ? ` · teto/hora custom ${money(c.hourlyCapBrlOverride)}` : ""}
                            {c.exemptUntil ? ` · até ${new Date(c.exemptUntil).toLocaleString("pt-BR")}` : " · sem expiração"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <NameEditCell
                      campaignId={c.id}
                      accountId={(c as any).accountId ?? (c as any).account_id ?? ""}
                      currentName={c.name}
                    />
                  </div>
                </TableCell>

                <TableCell
                  className="py-1.5 text-muted-foreground"
                  style={{ width: accountColWidth, minWidth: accountColWidth, maxWidth: accountColWidth }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="truncate text-xs" title={c.account}>
                          {c.account}
                        </div>
                        {((c as any).accountId ?? (c as any).account_id) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const id = String((c as any).accountId ?? (c as any).account_id ?? "");
                              navigator.clipboard?.writeText(id);
                            }}
                            className="truncate text-[9px] text-muted-foreground/60 hover:text-primary text-left font-mono"
                            title="Clique para copiar o ID"
                          >
                            {(c as any).accountId ?? (c as any).account_id}
                          </button>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[320px] break-words">
                      <div>{c.account}</div>
                      {((c as any).accountId ?? (c as any).account_id) && (
                        <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                          ID: {(c as any).accountId ?? (c as any).account_id}
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-right py-1.5">
                  <BudgetEditCell
                    campaignId={c.id}
                    accountId={(c as any).accountId ?? (c as any).account_id ?? ""}
                    currentBudget={c.dailyBudget}
                    formatMoney={money}
                  />
                </TableCell>
                <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const target = c.dailyTargetBrl;
                    const src = c.dailyTargetSource;
                    const pct = target && target > 0 ? (c.spend / target) * 100 : 0;
                    const barColor = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-[hsl(var(--wr-warning))]" : "bg-primary/70";
                    const srcLabel = src === "override" ? "OVR" : src === "cbo" ? "CBO" : src === "rule" ? "REGRA" : "—";
                    const srcCls =
                      src === "override" ? "bg-primary/15 text-primary border-primary/30"
                      : src === "cbo" ? "bg-muted text-muted-foreground border-border"
                      : src === "rule" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : "bg-muted/40 text-muted-foreground/60 border-border";
                    return (
                      <div className="flex items-center gap-2 justify-end">
                        <div className="flex flex-col items-end min-w-0">
                          {target ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className={cn("text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded border", srcCls)}>
                                  {srcLabel}
                                </span>
                                <span className="font-semibold tabular-nums">{money(target)}</span>
                              </div>
                              <div className="w-24 h-1 rounded bg-muted mt-1 overflow-hidden">
                                <div
                                  className={cn("h-full transition-all", barColor)}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                              <span className={cn(
                                "text-[10px] tabular-nums mt-0.5",
                                pct >= 100 ? "text-red font-semibold" : pct >= 80 ? "text-[hsl(var(--wr-warning))]" : "text-muted-foreground"
                              )}>
                                {pct.toFixed(0)}%
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/60 text-[11px]">sem teto</span>
                          )}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setEditingTarget(c)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="size-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left"><p className="text-[11px]">Definir teto manual</p></TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })()}
                </TableCell>
                {isToday && (() => {
                  const status = hourlyStatusByCampaign?.get(c.id);
                  const matched = getMatchingRules(rules, c).map((r) => ({
                    id: r.id,
                    name: r.name,
                    enabled: r.enabled,
                    trigger: r.trigger as any,
                  }));
                  const ruleCap = getEffectiveHourlyCap({
                    matchedRules: matched,
                    dailyTargetBrl: c.dailyTargetBrl,
                  });
                  const overrideCap = c.hourlyCapBrlOverride && c.hourlyCapBrlOverride > 0
                    ? { capBrl: Number(c.hourlyCapBrlOverride), ruleName: "Override manual" }
                    : null;
                  const cap = overrideCap ?? ruleCap;
                  const spend60 = status?.spendLast60mBrl ?? null;
                  const hasData = spend60 != null && spend60 > 0;
                  const hourlyEditor = (
                    <div className="absolute top-0.5 right-0.5">
                      <HourlyCapEditPopover
                        campaignId={c.id}
                        accountId={c.accountId}
                        currentRuleCap={ruleCap?.capBrl ?? null}
                        currentOverride={c.hourlyCapBrlOverride || null}
                        rulesExempt={c.rulesExempt}
                        exemptUntil={c.exemptUntil}
                      />
                    </div>
                  );
                  if (!cap && !hasData) {
                    return (
                      <TableCell className="text-right py-1.5 relative group/hourly">
                        <span className="text-muted-foreground/60">—</span>
                        {hourlyEditor}
                      </TableCell>
                    );
                  }
                  if (!cap && hasData) {
                    return (
                      <TableCell className="text-right py-1.5 relative group/hourly">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground tabular-nums cursor-help">{money(spend60!)}</span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[260px]">
                            <p className="text-[11px]">
                              Gasto real últimos 60 min (Meta hourly API). Sem regra <code>campaign_hourly_cap</code> aplicável p/ esta campanha — sem teto pra comparar.
                            </p>
                            {status?.snapshotAt && (
                              <p className="text-[10px] text-muted-foreground mt-1">Atualizado {formatRelativeTime(status.snapshotAt)}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                        {hourlyEditor}
                      </TableCell>
                    );
                  }
                  const pct = cap && hasData ? (spend60! / cap.capBrl) * 100 : 0;
                  const barColor =
                    pct >= 90 ? "bg-destructive"
                    : pct >= 70 ? "bg-[hsl(var(--wr-warning))]"
                    : pct >= 40 ? "bg-primary/70"
                    : "bg-muted-foreground/40";
                  const txtColor =
                    pct >= 90 ? "text-red font-semibold"
                    : pct >= 70 ? "text-[hsl(var(--wr-warning))] font-semibold"
                    : "text-muted-foreground";
                  const remaining = cap!.capBrl - (spend60 ?? 0);
                  const isOver = remaining < 0;
                  const remainingLabel = isOver
                    ? `estourou ${money(Math.abs(remaining))}`
                    : `faltam ${money(remaining)}`;
                  const remainingColor = isOver
                    ? "text-red font-semibold"
                    : pct >= 90
                    ? "text-red"
                    : pct >= 70
                    ? "text-[hsl(var(--wr-warning))]"
                    : "text-muted-foreground";
                  const windowLabel =
                    hourlyWindowMode === "fixed"
                      ? `maior entre ${currentBucketLabel} e ${previousBucketLabel}`
                      : "últimos 60 min";
                  return (
                    <TableCell className="text-right py-1.5 relative group/hourly">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-end gap-0.5 cursor-help">
                            <div className="flex items-baseline gap-1 tabular-nums">
                              <span className={cn("text-[11px]", hasData ? "" : "text-muted-foreground/60")}>
                                {hasData ? money(spend60!) : "R$ 0,00"}
                              </span>
                              <span className="text-[10px] text-muted-foreground/70">/ {money(cap!.capBrl, 0)}</span>
                            </div>
                            <div className="w-24 h-1 rounded bg-muted overflow-hidden">
                              <div
                                className={cn("h-full transition-all", barColor)}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={cn("text-[10px] tabular-nums", txtColor)}>
                                {pct.toFixed(0)}%
                              </span>
                              <span className={cn("text-[10px] tabular-nums", remainingColor)}>
                                · {remainingLabel}
                              </span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[320px]">
                          <p className="text-[11px] font-semibold mb-1">Teto horário · {cap!.ruleName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Janela: <b className="text-foreground">{windowLabel}</b> ({hourlyWindowMode === "fixed" ? "fixa" : "corrida"}).
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Gastou <b className="text-foreground">{money(spend60 ?? 0)}</b> de um teto de <b className="text-foreground">{money(cap!.capBrl)}</b>.
                          </p>
                          <p className={cn("text-[11px] mt-1", remainingColor)}>
                            {isOver ? "🔴" : "🟢"} {remainingLabel} {isOver ? "acima" : "para"} o teto.
                          </p>
                          {pct >= 90 && !isOver && (
                            <p className="text-[11px] text-red mt-1">⚠️ Vai pausar/reduzir na próxima avaliação (cron 2 min).</p>
                          )}
                          {pct >= 70 && pct < 90 && (
                            <p className="text-[11px] text-[hsl(var(--wr-warning))] mt-1">⚠️ Próximo do teto — atenção.</p>
                          )}
                          {status?.snapshotAt && (
                            <p className="text-[10px] text-muted-foreground mt-2">Atualizado {formatRelativeTime(status.snapshotAt)} · fonte: {status.source ?? "—"}</p>
                          )}
                          {!hasData && (
                            <p className="text-[10px] text-muted-foreground mt-2">Sem snapshot ainda — aguarde a próxima execução do controller.</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                      {hourlyEditor}
                    </TableCell>
                  );
                })()}
                <TableCell className="text-right py-1.5 font-semibold">
                  {dash(c.spend, (v) => money(v))}
                </TableCell>
                {isToday && (
                  <TableCell
                    className={cn(
                      "text-right py-1.5 font-semibold",
                      c.pacePct > 130 && "text-[#F2354A]",
                      c.pacePct > 110 && c.pacePct <= 130 && "text-[hsl(var(--wr-warning))]",
                      c.pacePct === 0 && "text-muted-foreground/60"
                    )}
                  >
                    {c.pacePct > 0 ? `${c.pacePct}%` : "—"}
                  </TableCell>
                )}
                <TableCell className="text-right py-1.5">{dash(c.impressions, fmtInt)}</TableCell>
                <TableCell className="text-right py-1.5">{dash(c.cpm, (v) => money(v))}</TableCell>
                <TableCell className="text-right py-1.5">
                  {dash(c.ctr, (v) => `${fmtBR(v)}%`)}
                </TableCell>
                <TableCell className="text-right py-1.5">{dash(c.clicks, fmtInt)}</TableCell>
                <TableCell className="text-right py-1.5">{dash(c.cpc, (v) => money(v))}</TableCell>
                <TableCell className="text-right py-1.5">
                  {c.cpa != null ? money(c.cpa) : <span className="text-muted-foreground/60">—</span>}
                </TableCell>
                <TableCell className="text-right py-1.5 font-semibold">
                  {dash(c.sales, fmtInt)}
                </TableCell>
                {(() => {
                  const ic = getIcCount(icByCampaign, c);
                  const costIc = ic > 0 && c.spend > 0 ? c.spend / ic : 0;
                  const convCko = ic > 0 && c.sales > 0 ? (c.sales / ic) * 100 : 0;
                  return (
                    <>
                      <TableCell className="text-right py-1.5">
                        {ic > 0 ? fmtInt(ic) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className="text-right py-1.5">
                        {costIc > 0 ? money(costIc) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right py-1.5 font-semibold",
                          convCko >= 8 && "text-[hsl(var(--wr-positive))]",
                          convCko > 0 && convCko < 3 && "text-[hsl(var(--wr-warning))]",
                        )}
                      >
                        {convCko > 0 ? `${fmtBR(convCko, 1)}%` : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                    </>
                  );
                })()}
                {(() => {
                  const projectCode = extractProjectCode(c.name);
                  const rc = computeRoasColor(c.roas, projectCode, productMargins);
                  const beTxt = rc.be ? rc.be.toFixed(2) : "—";
                  const grTxt = rc.greenAt ? rc.greenAt.toFixed(2) : "—";
                  const marginPct = projectCode ? productMargins[projectCode.toUpperCase()]?.margin_pct : undefined;
                  const tip = marginPct
                    ? `${projectCode} · Margem ${(marginPct * 100).toFixed(0)}% · Break Even ${beTxt} · Verde ≥ ${grTxt}`
                    : `Sem margem cadastrada — fallback global · Break Even 1.00 · Verde ≥ 1.20`;
                  return (
                    <TableCell className={cn("text-right py-1.5 font-semibold", roasColorClass(rc.color))} title={tip}>
                      {c.roas > 0 ? c.roas.toFixed(2) : <span className="text-muted-foreground/60">—</span>}
                    </TableCell>
                  );
                })()}
                {(() => {
                  const g = gtxByName?.get(c.name);
                  const profitCls = (v?: number) =>
                    v == null || v === 0 ? "" : v > 0 ? "text-[hsl(var(--wr-positive))]" : "text-[#F2354A]";
                  return (
                    <>
                      <TableCell className={cn("text-right py-1.5 font-semibold", profitCls(g?.profit))}>
                        {g ? money(g.profit) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className="text-right py-1.5 font-semibold">
                        {dash(c.revenue, (v) => money(v))}
                      </TableCell>
                      <TableCell className={cn("text-right py-1.5", profitCls(g?.margin))}>
                        {g && g.margin !== 0 ? `${fmtBR(g.margin, 1)}%` : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className="text-center py-1.5 font-semibold">
                        {g?.hasGtxSource ? (
                          <span className={cn(
                            g.scoreGtx >= green ? "text-[hsl(var(--wr-positive))]"
                              : g.scoreGtx >= yellow ? "text-[hsl(var(--wr-warning))]"
                              : "text-[#F2354A]"
                          )}>{g.scoreGtx}</span>
                        ) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                    </>
                  );
                })()}
                {(() => {
                  const matched = getMatchingRules(rules, c);
                  const blocked = getBlockedRules(rules, c);
                  const hasAny = matched.length > 0 || blocked.length > 0;
                  return (
                    <TableCell className="text-center py-1.5" onClick={(e) => e.stopPropagation()}>
                      {!hasAny ? (
                        <span className="text-muted-foreground/60">—</span>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold cursor-help",
                              matched.length > 0
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border/40 bg-muted/30 text-muted-foreground"
                            )}>
                              <Shield className="size-3" />
                              {matched.length}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[360px]">
                            {matched.length > 0 && (
                              <>
                                <div className="text-[11px] font-semibold mb-1 text-[hsl(var(--wr-positive))]">
                                  ✓ Armadas ({matched.length}):
                                </div>
                                <ul className="text-[11px] space-y-0.5 mb-2">
                                  {matched.map((r) => (
                                    <li key={r.id} className="flex items-start gap-1.5">
                                      <span className="size-1.5 mt-1.5 rounded-full bg-emerald-500 shrink-0" />
                                      <span>{r.name}</span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                            {blocked.length > 0 && (
                              <>
                                <div className="text-[11px] font-semibold mb-1 text-muted-foreground">
                                  ✗ Bloqueadas ({blocked.length}):
                                </div>
                                <ul className="text-[11px] space-y-0.5">
                                  {blocked.map(({ rule, reason }) => (
                                    <li key={rule.id} className="flex items-start gap-1.5">
                                      <span className="size-1.5 mt-1.5 rounded-full bg-destructive/60 shrink-0" />
                                      <span>
                                        <span className="text-foreground">{rule.name}</span>
                                        <span className="text-muted-foreground"> — {reason}</span>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  );
                })()}
                {(() => {
                  const last = lastActions?.get(c.id);
                  if (!last) {
                    return (
                      <TableCell className="py-1.5 text-muted-foreground/60 text-[11px]">
                        sem ação 24h
                      </TableCell>
                    );
                  }
                  const isPause = last.action_type?.toLowerCase().includes("pause");
                  const isResume = last.action_type?.toLowerCase().includes("resume") || last.action_type?.toLowerCase().includes("activate");
                  const Icon = isPause ? Pause : isResume ? Play : AlertTriangle;
                  const iconCls = isPause
                    ? "text-[#F2354A]"
                    : isResume
                    ? "text-emerald-500"
                    : "text-[hsl(var(--wr-warning))]";
                  return (
                    <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-start gap-1.5 cursor-help">
                            <Icon className={cn("size-3.5 mt-0.5 shrink-0", iconCls)} />
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-medium text-foreground leading-tight truncate">
                                {last.rule_name ?? "Regra removida"}
                              </div>
                              <div className="text-[10px] text-muted-foreground tabular-nums">
                                {formatRelativeTime(last.triggered_at)}
                                {last.dry_run && <span className="ml-1 text-[hsl(var(--wr-warning))]">· dry-run</span>}
                                {!last.success && <span className="ml-1 text-[#F2354A]">· falhou</span>}
                              </div>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[320px]">
                          <div className="text-[11px] font-semibold mb-1">
                            {isPause ? "Pausa automática" : isResume ? "Religada automática" : "Ação automática"}
                          </div>
                          <div className="text-[11px] mb-1">
                            <b>Regra:</b> {last.rule_name ?? "—"}
                          </div>
                          {last.reason && (
                            <div className="text-[11px] mb-1 break-words">
                              <b>Motivo:</b> {last.reason}
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground tabular-nums mt-1">
                            {new Date(last.triggered_at).toLocaleString("pt-BR")}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  );
                })()}
                {(() => {
                  const cd = cooldownsByCampaign?.get(c.id);
                  if (!cd) {
                    return (
                      <TableCell className="py-1.5 text-muted-foreground/60 text-[11px]">—</TableCell>
                    );
                  }
                  const isManual = cd.setBy === 'manual';
                  const remainingMs = new Date(cd.snoozedUntil).getTime() - nowTick;
                  const remaining = formatCooldownRemaining(cd.snoozedUntil, nowTick);
                  const resumeAt = formatResumeTimeBRT(cd.snoozedUntil);
                  const ruleName = cd.ruleId ? ruleNameById?.get(cd.ruleId) ?? null : null;
                  const urgent = !isManual && remainingMs <= 5 * 60_000; // <5 min
                  const cls = isManual
                    ? "text-[hsl(var(--wr-info,210_90%_60%))]"
                    : urgent
                      ? "text-[hsl(var(--wr-warning))]"
                      : "text-foreground";
                  return (
                    <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-start gap-1.5 cursor-help">
                            {isManual ? (
                              <LockIcon className={cn("size-3.5 mt-0.5 shrink-0", cls)} />
                            ) : (
                              <Timer className={cn("size-3.5 mt-0.5 shrink-0", cls)} />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className={cn("text-[11px] font-semibold leading-tight tabular-nums", cls)}>
                                {isManual ? "🔒 Manual" : remaining}
                              </div>
                              <div className="text-[10px] text-muted-foreground tabular-nums">
                                {isManual ? `até religar manualmente` : `religa ${resumeAt} BRT`}
                              </div>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[320px]">
                          <div className="text-[11px] font-semibold mb-1">
                            {isManual ? "🔒 Pausa manual permanente" : "⏱ Cooldown de regra"}
                          </div>
                          {isManual ? (
                            <div className="text-[11px]">
                              Pausa manual/externa detectada. Nenhuma regra automática pode religar esta campanha; só volta ao fluxo normal quando você religar manualmente.
                            </div>
                          ) : (
                            <div className="text-[11px]">
                              Restam <b>{remaining}</b> · religa às <b>{resumeAt} BRT</b>
                            </div>
                          )}
                          {ruleName && (
                            <div className="text-[11px] mt-1">
                              <b>Regra:</b> {ruleName}
                            </div>
                          )}
                          {cd.reason && (
                            <div className="text-[11px] mt-1 break-words text-muted-foreground">
                              {cd.reason}
                            </div>
                          )}
                          {!isManual && (
                            <div className="text-[10px] text-muted-foreground mt-2">
                              Reativação acontece automaticamente se a regra tem <code>smartReEnable</code>. Caso contrário, fica pausada até ação manual ou agendamento diário.
                            </div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  );
                })()}
                <TableCell className="py-1.5"><LiveBadge status={c.status} /></TableCell>
                {(() => {
                  const g = gtxByName?.get(c.name);
                  const profitCls = (v?: number) =>
                    v == null ? "" : v > 0 ? "text-[hsl(var(--wr-positive))]" : v < 0 ? "text-[#F2354A]" : "";
                  const roas3d = g?.roas3D ?? 0;
                  const roasCls = roas3d >= 1.20 ? "text-[hsl(var(--wr-positive))]" : roas3d >= 1.0 ? "text-[hsl(var(--wr-warning))]" : roas3d > 0 ? "text-[#F2354A]" : "";
                  return (
                    <>
                      <TableCell className="text-right py-1.5 tabular-nums">
                        {g && g.spend3DTotal > 0 ? money(g.spend3DTotal) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className="text-right py-1.5 tabular-nums">
                        {g && g.revenue3DTotal > 0 ? money(g.revenue3DTotal) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className={cn("text-right py-1.5 tabular-nums font-semibold", roasCls)}>
                        {g && roas3d > 0 ? roas3d.toFixed(2) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className={cn("text-right py-1.5 font-semibold", profitCls(g?.profit3DTotal))}>
                        {g && (g.spend3DTotal > 0 || g.revenue3DTotal > 0 || g.profit3DTotal !== 0) ? money(g.profit3DTotal) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                    </>
                  );
                })()}
                <TableCell className="py-1.5">
                  {(() => {
                    const g = gtxByName?.get(c.name);
                    // Calcula valor de hoje e referência (ontem ou média 2 dias anteriores p/ profit)
                    let today: number | null = null;
                    let prev: number | null = null;
                    let fmt: (v: number) => string = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
                    let invert = false; // true para métricas onde "menor é melhor" (CPA)
                    if (trendMetric === "spend") {
                      today = c.spend ?? 0;
                      prev = c.spendYesterday ?? 0;
                    } else if (trendMetric === "revenue") {
                      today = c.revenue ?? 0;
                      prev = c.revenueYesterday ?? 0;
                    } else if (trendMetric === "roas") {
                      today = c.spend > 0 ? (c.revenue ?? 0) / c.spend : 0;
                      const spY = c.spendYesterday ?? 0;
                      prev = spY > 0 ? (c.revenueYesterday ?? 0) / spY : 0;
                    } else if (trendMetric === "cpa") {
                      today = (c.sales ?? 0) > 0 ? c.spend / (c.sales as number) : 0;
                      const syY = c.salesYesterday ?? 0;
                      prev = syY > 0 ? (c.spendYesterday ?? 0) / syY : 0;
                      invert = true;
                    } else if (trendMetric === "profit") {
                      if (g) {
                        today = g.profit ?? 0;
                        const prior2 = (g.profit3DTotal ?? 0) - (g.profit ?? 0);
                        prev = prior2 / 2;
                      }
                    } else if (trendMetric === "profit3d") {
                      // Compara o lucro de hoje com a média dos 2 dias anteriores (janela 3D fixa)
                      // para ver se o lucro diário está em crescente dentro da janela de 3 dias.
                      if (g) {
                        today = g.profit ?? 0;
                        const prior2 = (g.profit3DTotal ?? 0) - (g.profit ?? 0);
                        prev = prior2 / 2;
                      }
                    }
                    if (today == null || prev == null) {
                      return <span className="text-muted-foreground/60">—</span>;
                    }
                    // Para profit/profit3d: se a base é <= 0 ou os sinais divergem, % fica enganoso.
                    // Nesse caso, mostra o Δ absoluto em R$ ao invés de %.
                    const isProfitMetric = trendMetric === "profit" || trendMetric === "profit3d";
                    // Lucro sempre em R$ — % com base pequena/negativa engana
                    const baseUnreliable = isProfitMetric;
                    const absDelta = today - prev;
                    let displayText: string;
                    let directionUp: boolean;
                    if (baseUnreliable) {
                      directionUp = absDelta >= 0;
                      displayText = `${absDelta >= 0 ? "+" : "−"}${money(Math.abs(absDelta))}`;
                    } else {
                      if (prev === 0) return <span className="text-muted-foreground/60">—</span>;
                      let delta = ((today - prev) / Math.abs(prev)) * 100;
                      // Capa em ±999% pra não poluir visual com bases minúsculas
                      if (delta > 999) delta = 999;
                      if (delta < -999) delta = -999;
                      directionUp = delta >= 0;
                      displayText = fmt(delta);
                    }
                    const isPositive = invert ? !directionUp : directionUp;
                    const isFlat = baseUnreliable ? Math.abs(absDelta) < 0.5 : false;
                    const colorCls = isFlat
                      ? "text-muted-foreground"
                      : isPositive
                      ? "text-[hsl(var(--wr-positive))]"
                      : "text-[#F2354A]";
                    const Icon = directionUp ? ArrowUp : ArrowDown;
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums cursor-help", colorCls)}>
                            <Icon className="size-3" />
                            {displayText}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[260px]">
                          <p className="text-[11px]">
                            <b>{trendMetric === "profit3d" ? "LUCRO 3D" : trendMetric.toUpperCase()}</b> — hoje vs {trendMetric === "profit" || trendMetric === "profit3d" ? "média 2 dias anteriores" : "ontem"}
                          </p>
                          <p className="text-[11px] mt-1 tabular-nums">
                            Hoje: <b>{trendMetric === "roas" ? today.toFixed(2) : trendMetric === "cpa" || trendMetric === "spend" || trendMetric === "revenue" || trendMetric === "profit" || trendMetric === "profit3d" ? money(today) : today.toFixed(2)}</b>
                          </p>
                          <p className="text-[11px] tabular-nums">
                            Ref.: <b>{trendMetric === "roas" ? prev.toFixed(2) : money(prev)}</b>
                          </p>
                          {invert && (
                            <p className="text-[10px] text-muted-foreground mt-1">CPA: menor é melhor (verde = caindo).</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {campaigns.length > 0 && (() => {
          const sum = (fn: (c: PacingCampaign) => number | null | undefined) =>
            campaigns.reduce((acc, c) => acc + (fn(c) ?? 0), 0);
          const totalSpend = sum((c) => c.spend);
          const totalBudget = sum((c) => c.dailyBudget);
          const totalTarget = sum((c) => c.dailyTargetBrl);
          const totalImpr = sum((c) => c.impressions);
          const totalClicks = sum((c) => c.clicks);
          const totalSales = sum((c) => c.sales);
          const totalRevenue = sum((c) => c.revenue);
          const totalIC = campaigns.reduce((a, c) => a + getIcCount(icByCampaign, c), 0);
          const totalSpend60 = campaigns.reduce(
            (a, c) => a + (hourlyStatusByCampaign?.get(c.id)?.spendLast60mBrl ?? 0),
            0,
          );
          // GTX aggregates
          let totalProfit = 0, totalProfit3D = 0, totalSpend3D = 0, totalRevenue3D = 0, hasGtx = false;
          campaigns.forEach((c) => {
            const g = gtxByName?.get(c.name);
            if (g) {
              hasGtx = true;
              totalProfit += g.profit ?? 0;
              totalProfit3D += g.profit3DTotal ?? 0;
              totalSpend3D += g.spend3DTotal ?? 0;
              totalRevenue3D += g.revenue3DTotal ?? 0;
            }
          });
          const avgROAS3D = totalSpend3D > 0 ? totalRevenue3D / totalSpend3D : 0;
          const avgCPM = totalImpr > 0 ? (totalSpend / totalImpr) * 1000 : 0;
          const avgCTR = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
          const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
          const avgCPA = totalSales > 0 ? totalSpend / totalSales : 0;
          const avgROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
          const avgCostIC = totalIC > 0 ? totalSpend / totalIC : 0;
          const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
          const avgPace = totalTarget > 0 ? (totalSpend / totalTarget) * 100 : 0;
          const profitCls = (v: number) =>
            v > 0 ? "text-[hsl(var(--wr-positive))]" : v < 0 ? "text-[#F2354A]" : "";
          return (
            <TableFooter className="bg-muted/40 border-t-2 border-border sticky bottom-0">
              <TableRow className="hover:bg-muted/50 font-semibold">
                <TableCell colSpan={3} className="py-2 text-xs uppercase tracking-wider text-foreground">
                  Total · {campaigns.length} campanha{campaigns.length === 1 ? "" : "s"}
                </TableCell>
                <TableCell className="py-2" />
                <TableCell className="text-right py-2 tabular-nums">{totalBudget > 0 ? money(totalBudget) : "—"}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{totalTarget > 0 ? money(totalTarget) : "—"}</TableCell>
                {isToday && (
                  <TableCell className="text-right py-2 tabular-nums text-muted-foreground">{totalSpend60 > 0 ? money(totalSpend60) : "—"}</TableCell>
                )}
                <TableCell className="text-right py-2 tabular-nums">{money(totalSpend)}</TableCell>
                {isToday && (
                  <TableCell className={cn("text-right py-2 tabular-nums", avgPace > 130 && "text-[#F2354A]", avgPace > 110 && avgPace <= 130 && "text-[hsl(var(--wr-warning))]")}>
                    {avgPace > 0 ? `${avgPace.toFixed(0)}%` : "—"}
                  </TableCell>
                )}
                <TableCell className="text-right py-2 tabular-nums">{fmtInt(totalImpr)}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{avgCPM > 0 ? money(avgCPM) : "—"}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{avgCTR > 0 ? `${fmtBR(avgCTR)}%` : "—"}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{fmtInt(totalClicks)}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{avgCPC > 0 ? money(avgCPC) : "—"}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{avgCPA > 0 ? money(avgCPA) : "—"}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{fmtInt(totalSales)}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{totalIC > 0 ? fmtInt(totalIC) : "—"}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{avgCostIC > 0 ? money(avgCostIC) : "—"}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{totalIC > 0 && totalSales > 0 ? `${fmtBR((totalSales / totalIC) * 100, 1)}%` : "—"}</TableCell>
                <TableCell className={cn("text-right py-2 tabular-nums", avgROAS >= 2 && "text-[hsl(var(--wr-positive))]", avgROAS < 1.5 && avgROAS > 0 && "text-[#F2354A]")}>
                  {avgROAS > 0 ? avgROAS.toFixed(2) : "—"}
                </TableCell>
                <TableCell className={cn("text-right py-2 tabular-nums", profitCls(totalProfit))}>
                  {hasGtx ? money(totalProfit) : "—"}
                </TableCell>
                <TableCell className="text-right py-2 tabular-nums">{totalRevenue > 0 ? money(totalRevenue) : "—"}</TableCell>
                <TableCell className={cn("text-right py-2 tabular-nums", profitCls(avgMargin))}>
                  {hasGtx && avgMargin !== 0 ? `${fmtBR(avgMargin, 1)}%` : "—"}
                </TableCell>
                <TableCell className="py-2" />
                <TableCell className="py-2" />
                <TableCell className="py-2" />
                <TableCell className="py-2" />
                <TableCell className="py-2" />
                <TableCell className="text-right py-2 tabular-nums">{totalSpend3D > 0 ? money(totalSpend3D) : "—"}</TableCell>
                <TableCell className="text-right py-2 tabular-nums">{totalRevenue3D > 0 ? money(totalRevenue3D) : "—"}</TableCell>
                <TableCell className={cn("text-right py-2 tabular-nums font-semibold", avgROAS3D >= 1.20 && "text-[hsl(var(--wr-positive))]", avgROAS3D >= 1.0 && avgROAS3D < 1.20 && "text-[hsl(var(--wr-warning))]", avgROAS3D > 0 && avgROAS3D < 1.0 && "text-[#F2354A]")}>
                  {avgROAS3D > 0 ? avgROAS3D.toFixed(2) : "—"}
                </TableCell>
                <TableCell className={cn("text-right py-2 tabular-nums", profitCls(totalProfit3D))}>
                  {hasGtx ? money(totalProfit3D) : "—"}
                </TableCell>
                <TableCell className="py-2" />
              </TableRow>
            </TableFooter>
          );
        })()}
      </Table>
      </div>
    </div>

    <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setPendingPauseMode(loadDefaultPauseMode()); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending?.next === "PAUSED" ? "Pausar campanha?" : "Religar campanha?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <span className="block font-medium text-foreground mb-1 break-all">{pending?.c.name}</span>
              <span className="block text-xs">Conta: {pending?.c.account}</span>
              <span className="block text-xs mt-2">
                Esta ação será executada via Meta API e logada em <code>pacing_action_log</code>.
                Se o dry-run global estiver ON, nada acontece no Meta (só log).
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {pending?.next === "PAUSED" && (
          <div className="-mt-2">
            <PauseModeSelector value={pendingPauseMode} onChange={setPendingPauseMode} compact />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!pending) return;
              const isPause = pending.next === "PAUSED";
              toggle.mutate({
                campaign_id: pending.c.id,
                account_id: pending.c.accountId ?? "",
                campaign_name: pending.c.name,
                new_status: pending.next,
                pause_mode: isPause ? pendingPauseMode.mode : undefined,
                wake_up_hour_brt:
                  isPause && pendingPauseMode.mode === "wake_up"
                    ? pendingPauseMode.hourBrt
                    : undefined,
                wake_up_minute_brt:
                  isPause && pendingPauseMode.mode === "wake_up"
                    ? pendingPauseMode.minuteBrt
                    : undefined,
              });
              setPending(null);
            }}
            className={pending?.next === "PAUSED" ? "bg-destructive hover:bg-destructive/90" : ""}
          >
            {pending?.next === "PAUSED"
              ? pendingPauseMode.mode === "wake_up"
                ? `Pausar até ${String(pendingPauseMode.hourBrt).padStart(2, "0")}:${String(pendingPauseMode.minuteBrt).padStart(2, "0")}`
                : "Pausar"
              : "Religar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {editingTarget && (
      <CampaignTargetOverrideDialog
        open={!!editingTarget}
        onClose={() => setEditingTarget(null)}
        campaignId={editingTarget.id}
        campaignName={editingTarget.name}
        accountId={editingTarget.accountId}
        currentTarget={editingTarget.dailyTargetBrl}
        currentSource={editingTarget.dailyTargetSource}
      />
    )}

    <BulkTargetOverrideDialog
      open={bulkOpen}
      onClose={() => setBulkOpen(false)}
      campaigns={selectedCampaigns}
    />
    <BulkBudgetDialog
      open={bulkBudgetOpen}
      onClose={() => setBulkBudgetOpen(false)}
      campaigns={selectedCampaigns}
    />
    <BulkToggleDialog
      open={bulkToggleOpen}
      onClose={() => setBulkToggleOpen(false)}
      campaigns={selectedCampaigns}
    />
    <CampaignCompareDialog
      open={compareOpen}
      onClose={() => setCompareOpen(false)}
      campaigns={selectedCampaigns}
    />
    <KillSquadDialog
      open={killSquadOpen}
      onClose={() => setKillSquadOpen(false)}
      campaigns={selectedCampaigns}
      gtxByName={gtxByName}
    />
    </>
    </TooltipProvider>
  );
}
