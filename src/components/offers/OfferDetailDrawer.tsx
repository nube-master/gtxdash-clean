import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Pencil, ExternalLink, Loader2, TrendingUp, DollarSign, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis } from "recharts";
import { useOffersTraffic, useOfferTrafficDaily } from "@/hooks/useOffersTraffic";
import { useOfferBenchmarks, useOfferKpiMetrics } from "@/hooks/useOfferBenchmarks";
import { useOperationId } from "@/contexts/OperationContext";
import { useOfferVslMetrics } from "@/hooks/useOfferVslMetrics";
import { useOfferVslBreakdown } from "@/hooks/useOfferVslBreakdown";
import { useDateRange } from "@/contexts/DateRangeContext";
import { BenchmarkPanel } from "@/components/offers/BenchmarkBadge";
import type { Offer, OfferStatus, OfferStatusHistoryEntry } from "@/types/offers";

const STATUS_META: Record<OfferStatus, { label: string; cls: string }> = {
  ativa:     { label: "Ativa",     cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  em_teste:  { label: "Em teste",  cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  pausada:   { label: "Pausada",   cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  morta:     { label: "Morta",     cls: "bg-muted text-muted-foreground border-border" },
  arquivada: { label: "Arquivada", cls: "bg-muted/50 text-muted-foreground border-border/50" },
};

const fmtBRL = (v: number | null) => v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtUSD = (v: number | null) => v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

interface Props {
  offer: Offer | null;
  open: boolean;
  onClose: () => void;
  onEdit: (o: Offer) => void;
  onStatusChange: (offer: Offer, newStatus: OfferStatus) => void;
}

export function OfferDetailDrawer({ offer, open, onClose, onEdit, onStatusChange }: Props) {
  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["offer-history", offer?.id],
    queryFn: async () => {
      if (!offer) return [];
      const { data, error } = await supabase
        .from("offer_status_history")
        .select("*")
        .eq("offer_id", offer.id)
        .order("changed_at", { ascending: true });
      if (error) throw error;
      return data as OfferStatusHistoryEntry[];
    },
    enabled: !!offer,
  });

  if (!offer) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <SheetTitle className="font-mono text-2xl">{offer.apelido_interno}</SheetTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={STATUS_META[offer.status].cls}>
                  {STATUS_META[offer.status].label}
                </Badge>
                <span className="text-sm text-muted-foreground">{offer.produto_real}</span>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onEdit(offer)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
            </Button>
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        {/* Mudança rápida de status */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Mudar status:</span>
          <Select
            value={offer.status}
            onValueChange={(v) => {
              if (v !== offer.status) onStatusChange(offer, v as OfferStatus);
            }}
          >
            <SelectTrigger className="w-[160px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="em_teste">Em teste</SelectItem>
              <SelectItem value="pausada">Pausada</SelectItem>
              <SelectItem value="morta">Morta</SelectItem>
              <SelectItem value="arquivada">Arquivada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Accordion type="multiple" defaultValue={["benchmark", "traffic", "id", "vendor", "economia", "status"]} className="space-y-1">
          <BenchmarkSection offer={offer} />
          <TrafficSection offer={offer} />
          <VslSection offer={offer} />
          <AccordionItem value="id">
            <AccordionTrigger className="text-sm font-semibold">Identificação</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm">
              <Row label="Apelido interno" value={<span className="font-mono">{offer.apelido_interno}</span>} />
              <Row label="Produto real" value={offer.produto_real} />
              <Row label="Tipo" value={offer.tipo} />
              <Row label="Nicho" value={offer.nicho} />
              <Row label="Geo" value={offer.geo} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="vendor">
            <AccordionTrigger className="text-sm font-semibold">Vendor & Tracking</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm">
              <Row label="Vendor" value={offer.vendor} />
              <Row label="Vendor ID" value={offer.vendor_id ?? "—"} />
              <Row label="Nickname afiliado" value={offer.nickname_afiliado ?? "—"} />
              <Row label="Link checkout" value={
                offer.link_checkout ? (
                  <a href={offer.link_checkout} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 break-all">
                    {offer.link_checkout} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : "—"
              } />
              <Row label="Pixel ID" value={offer.pixel_id ? <span className="font-mono text-xs">{offer.pixel_id}</span> : "—"} />
              <Row label="VSL Player" value={offer.vsl_player ?? "—"} />
              <Row label="VSL URL" value={
                offer.vsl_url ? (
                  <a href={offer.vsl_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 break-all">
                    {offer.vsl_url} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : "—"
              } />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="economia">
            <AccordionTrigger className="text-sm font-semibold">Economia</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm">
              <Row label="CPA / Comissão" value={fmtUSD((offer as any).comissao_usd ?? offer.cpa_target_brl)} />
              <Row label="Margem" value={offer.margem_pct != null ? `${Number(offer.margem_pct).toFixed(2)}%` : "—"} />
              <Row label="Comissão" value={offer.comissao_pct != null ? `${Number(offer.comissao_pct).toFixed(2)}%` : "—"} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="funil">
            <AccordionTrigger className="text-sm font-semibold">Funil</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm">
              {offer.landing_pages && offer.landing_pages.length > 0 ? (
                <ul className="space-y-1">
                  {offer.landing_pages.map((lp, i) => (
                    <li key={i}>
                      <a href={lp} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 break-all">
                        {lp} <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Nenhuma landing page cadastrada.</p>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="status">
            <AccordionTrigger className="text-sm font-semibold">Status & Timeline</AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm">
              <Row label="Status atual" value={
                <Badge variant="outline" className={STATUS_META[offer.status].cls}>
                  {STATUS_META[offer.status].label}
                </Badge>
              } />
              <Row label="Data início" value={offer.data_inicio ? format(parseISO(offer.data_inicio), "dd/MM/yyyy") : "—"} />
              {offer.status === "morta" && (
                <>
                  <Row label="Data morte" value={offer.data_morte ? format(parseISO(offer.data_morte), "dd/MM/yyyy") : "—"} />
                  <Row label="Motivo" value={<span className="text-muted-foreground">{offer.motivo_morte ?? "—"}</span>} />
                </>
              )}
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Timeline</p>
              {loadingHistory ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : history.length === 0 ? (
                <p className="text-muted-foreground text-xs">Sem histórico de mudanças de status.</p>
              ) : (
                <ol className="relative border-l border-border/60 ml-2 space-y-3">
                  {history.map((h) => (
                    <li key={h.id} className="ml-4">
                      <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-primary border-2 border-background mt-1" />
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(h.changed_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-sm">
                        {h.status_anterior ? (
                          <>
                            <Badge variant="outline" className={`${STATUS_META[h.status_anterior].cls} mr-1 text-[10px]`}>
                              {STATUS_META[h.status_anterior].label}
                            </Badge>
                            →{" "}
                          </>
                        ) : null}
                        <Badge variant="outline" className={`${STATUS_META[h.status_novo].cls} text-[10px]`}>
                          {STATUS_META[h.status_novo].label}
                        </Badge>
                      </p>
                      {h.motivo && <p className="text-xs text-muted-foreground mt-1 italic">"{h.motivo}"</p>}
                    </li>
                  ))}
                </ol>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="notas">
            <AccordionTrigger className="text-sm font-semibold">Notas</AccordionTrigger>
            <AccordionContent className="text-sm">
              {offer.notas ? (
                <p className="whitespace-pre-wrap text-muted-foreground">{offer.notas}</p>
              ) : (
                <p className="text-muted-foreground">Sem notas.</p>
              )}
            </AccordionContent>
          </AccordionItem>

          {offer.tags && offer.tags.length > 0 && (
            <AccordionItem value="tags">
              <AccordionTrigger className="text-sm font-semibold">Tags</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-wrap gap-1.5">
                  {offer.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
      <span className="text-xs text-muted-foreground uppercase tracking-wider pt-0.5">{label}</span>
      <span className="text-sm text-foreground break-words">{value}</span>
    </div>
  );
}

/* ─────────── Traffic OS section ─────────── */
function TrafficSection({ offer }: { offer: Offer }) {
  const operationId = useOperationId();
  const { data: trafficMap, isLoading } = useOffersTraffic(operationId);
  const { data: daily = [] } = useOfferTrafficDaily(offer.id, operationId);
  const stats = trafficMap?.get(offer.id);

  const hasSpend = stats && stats.spend_30d_brl > 0;
  const hasRevenue = stats && stats.revenue_30d_brl > 0;
  const hasAny = hasSpend || hasRevenue;

  const cleanTag = (offer.apelido_interno ?? "").replace(/^\[|\]$/g, "");
  return (
    <AccordionItem value="traffic">
      <AccordionTrigger className="text-sm font-semibold">
        <span className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          Performance Traffic OS
          <Badge variant="outline" className="font-mono text-[10px] ml-1">[{cleanTag}]</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !hasAny ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma campanha Meta ou venda com a tag <span className="font-mono">[{cleanTag}]</span> nos últimos 30 dias.
          </p>
        ) : (
          <>
            {/* SPEND */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" /> Investimento (Meta Ads)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Hoje" value={fmtBRL(stats!.spend_today_brl)} />
                <MiniStat label="7 dias" value={fmtBRL(stats!.spend_7d_brl)} highlight />
                <MiniStat label="30 dias" value={fmtBRL(stats!.spend_30d_brl)} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <MiniStat label="Contas Meta" value={String(stats!.accounts_count)} />
                <MiniStat label="Campanhas ativas (agora)" value={String(stats!.active_campaigns_count)} />
              </div>
            </div>

            {/* REVENUE */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <DollarSign className="h-3 w-3" /> Receita (Dual-Source MAX)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat
                  label={`Hoje · ${stats!.sales_today} ${stats!.sales_today === 1 ? "venda" : "vendas"}`}
                  value={fmtBRL(stats!.revenue_today_brl)}
                />
                <MiniStat
                  label={`7d · ${stats!.sales_7d} ${stats!.sales_7d === 1 ? "venda" : "vendas"}`}
                  value={fmtBRL(stats!.revenue_7d_brl)}
                  highlight
                />
                <MiniStat
                  label={`30d · ${stats!.sales_30d} ${stats!.sales_30d === 1 ? "venda" : "vendas"}`}
                  value={fmtBRL(stats!.revenue_30d_brl)}
                />
              </div>
            </div>

            {/* ROI / PROFIT */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                ROI & Lucro Bruto
              </p>
              <div className="grid grid-cols-2 gap-2">
                <RoiStat label="ROI 7d" roi={stats!.roi_7d} />
                <RoiStat label="ROI 30d" roi={stats!.roi_30d} />
                <ProfitStat label="Lucro bruto 7d" value={stats!.profit_7d_brl} />
                <ProfitStat label="Lucro bruto 30d" value={stats!.profit_30d_brl} />
              </div>
            </div>

            {daily.length > 0 && hasSpend && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Spend diário (últimos 30 dias)
                </p>
                <div className="h-24 -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={daily} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`g-${offer.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 11,
                        }}
                        labelFormatter={(d) => format(parseISO(d as string), "dd MMM", { locale: ptBR })}
                        formatter={(v: number) => [fmtBRL(v), "Spend"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="spend_brl"
                        stroke="hsl(var(--primary))"
                        strokeWidth={1.5}
                        fill={`url(#g-${offer.id})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground italic">
              * Match automático por tag <span className="font-mono">[{offer.apelido_interno}]</span>. Receita usa MAX(CartPanda, RedTrack) por dia.
            </p>
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold tabular-nums mt-0.5 ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function RoiStat({ label, roi }: { label: string; roi: number | null }) {
  let cls = "text-muted-foreground";
  let bg = "bg-card/50 border-border";
  let txt = "—";
  if (roi != null) {
    txt = `${roi.toFixed(2)}x`;
    if (roi >= 1.2) { cls = "text-emerald-500"; bg = "bg-emerald-500/10 border-emerald-500/30"; }
    else if (roi >= 1.0) { cls = "text-amber-500"; bg = "bg-amber-500/10 border-amber-500/30"; }
    else { cls = "text-red-500"; bg = "bg-red-500/10 border-red-500/30"; }
  }
  return (
    <div className={`rounded-md border p-2.5 ${bg}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold tabular-nums mt-0.5 ${cls}`}>{txt}</p>
    </div>
  );
}

function ProfitStat({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  const cls = positive ? "text-emerald-500" : "text-red-500";
  const bg = positive ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20";
  return (
    <div className={`rounded-md border p-2.5 ${bg}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold tabular-nums mt-0.5 ${cls}`}>
        {positive ? "+" : ""}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)}
      </p>
    </div>
  );
}

/* ─────────── VSL section ─────────── */
function VslSection({ offer }: { offer: Offer }) {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const { data, isLoading } = useOfferVslMetrics(offer.apelido_interno, start, end);
  const { data: breakdown } = useOfferVslBreakdown(offer.apelido_interno, start, end);

  const fmtInt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
  const fmtPct = (v: number | null) => v == null ? "—" : `${v.toFixed(1)}%`;

  // Extrai um label curto do nome da VSL (ex: "TOP 2 - LOIRA")
  const shortLabel = (name: string, idx: number) => {
    const cleaned = name.replace(/\[[^\]]*\]/g, "").trim();
    const first = cleaned.split(/[-—|+]/)[0]?.trim() || cleaned;
    return first.length > 22 ? first.slice(0, 22) + "…" : first || `VSL ${idx + 1}`;
  };

  return (
    <AccordionItem value="vsl">
      <AccordionTrigger className="text-sm font-semibold">
        <span className="flex items-center gap-2">
          📺 Performance VSL
          {data && (
            <Badge variant="outline" className="font-mono text-[10px] ml-1">
              {data.vsl_count_period}/{data.vsl_count_total} VSL{data.vsl_count_total === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.vsl_count_period === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma VSL com a sigla <span className="font-mono">[{offer.apelido_interno}]</span> no período.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Visualizações" value={fmtInt(data.total_views)} />
              <MiniStat label="Visitantes únicos" value={fmtInt(data.unique_views)} highlight />
              <MiniStat label="Retenção média" value={fmtPct(data.avg_retention)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Cliques no botão" value={fmtInt(data.button_clicks)} />
              <MiniStat label="Cliques checkout" value={fmtInt(data.checkout_clicks)} />
              <MiniStat label="Conv. rate" value={fmtPct(data.conversion_rate)} highlight />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <MiniStat label="Receita atribuída (BRL)" value={fmtBRL(data.revenue)} />
            </div>

            {breakdown && breakdown.length > 0 && (
              <VslBreakdownTable
                rows={breakdown}
                shortLabel={shortLabel}
                fmtInt={fmtInt}
                fmtPct={fmtPct}
              />
            )}

            <p className="text-[10px] text-muted-foreground italic">
              * Match por sigla <span className="font-mono">[{offer.apelido_interno}]</span> no nome da VSL. Período segue o filtro do calendário.
            </p>
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

type VslRow = {
  video_id: string;
  video_name: string;
  total_views: number;
  unique_views: number;
  avg_retention: number | null;
  button_clicks: number;
  checkout_clicks: number;
  conversion_rate: number | null;
  revenue: number;
};

type SortKey = "video_name" | "total_views" | "unique_views" | "avg_retention" | "button_clicks" | "checkout_clicks" | "conversion_rate" | "revenue";

function VslBreakdownTable({
  rows,
  shortLabel,
  fmtInt,
  fmtPct,
}: {
  rows: VslRow[];
  shortLabel: (n: string, i: number) => string;
  fmtInt: (n: number) => string;
  fmtPct: (v: number | null) => string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 inline ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 inline ml-1 text-primary" />;
  };

  const columns: { key: SortKey; label: string; align: "left" | "right"; highlight?: boolean }[] = [
    { key: "video_name", label: "VSL", align: "left" },
    { key: "total_views", label: "Views", align: "right" },
    { key: "unique_views", label: "Únicos", align: "right" },
    { key: "avg_retention", label: "Retenção", align: "right" },
    { key: "button_clicks", label: "Cliques botão", align: "right" },
    { key: "checkout_clicks", label: "Checkout", align: "right" },
    { key: "conversion_rate", label: "Conv.", align: "right", highlight: true },
    { key: "revenue", label: "Receita", align: "right", highlight: true },
  ];

  return (
    <div className="mt-4 rounded-md border border-border bg-card/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Resumo por VSL ({rows.length})
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className={`px-3 py-2 font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none ${c.align === "right" ? "text-right" : "text-left"} ${c.key === "video_name" ? "sticky left-0 bg-muted/10 z-10" : ""}`}
                >
                  {c.label}<SortIcon k={c.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((v, i) => (
              <tr key={v.video_id} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                <td className="px-3 py-1.5 text-foreground sticky left-0 bg-card/30 z-10 max-w-[360px] truncate" title={v.video_name}>
                  {v.video_name || `VSL ${i + 1}`}
                </td>
                <td className="px-3 py-1.5 text-right text-foreground">{fmtInt(v.total_views)}</td>
                <td className="px-3 py-1.5 text-right text-foreground">{fmtInt(v.unique_views)}</td>
                <td className="px-3 py-1.5 text-right text-foreground">{fmtPct(v.avg_retention)}</td>
                <td className="px-3 py-1.5 text-right text-foreground">{fmtInt(v.button_clicks)}</td>
                <td className="px-3 py-1.5 text-right text-foreground">{fmtInt(v.checkout_clicks)}</td>
                <td className="px-3 py-1.5 text-right text-primary font-semibold">{fmtPct(v.conversion_rate)}</td>
                <td className="px-3 py-1.5 text-right text-primary font-semibold">{fmtBRL(v.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────── Benchmark section ─────────── */
function BenchmarkSection({ offer }: { offer: Offer }) {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const { data: bMap } = useOfferBenchmarks();
  const { data: kpiMap } = useOfferKpiMetrics(undefined, start, end);
  const target = bMap?.get(offer.nicho);
  const actual = kpiMap?.get(offer.id);

  const periodLabel = start === end
    ? format(parseISO(start), "dd 'de' MMM", { locale: ptBR })
    : `${format(parseISO(start), "dd/MM", { locale: ptBR })} → ${format(parseISO(end), "dd/MM", { locale: ptBR })}`;

  return (
    <AccordionItem value="benchmark">
      <AccordionTrigger className="text-sm font-semibold">
        <span className="flex items-center gap-2">
          🎯 Benchmark vs Realidade
          <Badge variant="outline" className="text-[10px] font-normal ml-1">{periodLabel}</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <BenchmarkPanel nicho={offer.nicho} actual={actual} target={target} periodLabel={periodLabel} />
      </AccordionContent>
    </AccordionItem>
  );
}

