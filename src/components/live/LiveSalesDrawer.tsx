import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { X as CloseIcon, ChevronDown, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";

import { Volume2, VolumeX, ArrowLeft, Globe, Monitor, Smartphone, MapPin, Copy, Target } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import type { LiveSale } from "@/hooks/useLiveSales";
import { useSalesMetrics, type SalesAlert } from "@/hooks/useSalesMetrics";
import { useTodayDashboardTotals } from "@/hooks/useTodayDashboardTotals";
import { useHotmartCategories, FUNNEL_ROLE_LABEL, FUNNEL_ROLE_COLOR, type FunnelRoleOrIgnore } from "@/hooks/useHotmartCategories";
import { getHotmartEffectiveDate } from "@/lib/hotmartEffectiveDate";

/** BRT effective date for a live sale — Hotmart uses reconciled date, others use created_at BRT. */
function getSaleBRTDate(s: any): string {
  const isHotmart = s?._source === "hotmart_audit" || s?.store === "hotmart" || String(s?.id || "").startsWith("hm:");
  if (isHotmart) {
    const eff = getHotmartEffectiveDate(s?.date, s?.created_at);
    if (eff) return eff;
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(s.created_at));
}

const ROLE_BADGE_CLASS: Record<Exclude<FunnelRoleOrIgnore, "ignore">, string> = {
  frontend: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
  order_bump: "bg-sky-500/15 text-sky-500 border-sky-500/25",
  upsell: "bg-violet-500/15 text-violet-500 border-violet-500/25",
  downsell: "bg-amber-500/15 text-amber-500 border-amber-500/25",
};

function FunnelRoleBadge({ role }: { role: FunnelRoleOrIgnore }) {
  if (role === "ignore") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider border bg-muted/50 text-muted-foreground border-border">
        Ignorado
      </span>
    );
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider border ${ROLE_BADGE_CLASS[role]}`}>
      {FUNNEL_ROLE_LABEL[role]}
    </span>
  );
}

interface LiveSalesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: LiveSale[];
  lastSaleAt: Date | null;
  soundEnabled: boolean;
  toggleSound: () => void;
}

// --- Helpers ---

/**
 * Resolves the real checkout platform using the RedTrack "Offer Source" convention.
 * RedTrack offer_name follows the pattern: "Trafego | Plataforma | Projeto | Variante"
 * (e.g. "Facebook | CartPanda | MO | 3 Potes" or "Facebook | Clickbank | NDM | md3tndm").
 * The 2nd segment is the authoritative checkout platform.
 * Falls back to the `store` field for CB-audit-only entries (no offer_name).
 */
function resolveCheckoutPlatform(sale: { offer_name?: string | null; store?: string | null; utm_campaign?: string | null; product_name?: string | null }): string {
  // CB-COD (COD operation) is fulfilled by ShipOffers regardless of store label
  const codText = `${sale.utm_campaign || ""} ${sale.offer_name || ""} ${sale.product_name || ""}`;
  if (/\[CB[-_ ]?COD\]|\bCB[-_ ]?COD\b/i.test(codText)) return "ShipOffers";

  const offer = (sale.offer_name || "").trim();
  if (offer) {
    const segments = offer.split("|").map((s) => s.trim());
    const platformSeg = (segments[1] || "").toLowerCase();
    if (platformSeg.includes("cartpanda")) return "CartPanda";
    if (platformSeg.includes("buygoods")) return "BuyGoods";
    if (platformSeg.includes("clickbank")) return "ClickBank";
    if (platformSeg.includes("digistore")) return "Digistore24";
    if (platformSeg.includes("shipoffer") || platformSeg.includes("shippware")) return "ShipOffers";
    if (platformSeg.includes("h&w") || platformSeg.includes("h & w") || platformSeg === "hw") return "H&W";
    if (platformSeg.includes("hotmart")) return "Hotmart";
    if (platformSeg.includes("redtrack")) return "RedTrack";
    if (
      platformSeg.includes("cod") || 
      platformSeg.includes("sphere") || 
      platformSeg.includes("auravita") ||
      platformSeg.includes("vitalis") ||
      platformSeg.includes("fahto") ||
      platformSeg.includes("xperi") ||
      platformSeg.includes("fato")
    ) return "Sphere (COD)";
  }
  if (sale.store === "redtrack") return "RedTrack";
  // Fallback for CB audit-only rows (no offer_name)
  if (sale.store === "hotmart" || (sale as any).vendor === "hotmart") return "Hotmart";
  if (sale.store === "clickbank") return "ClickBank";
  if (sale.store === "cartpanda") return "CartPanda";
  if (sale.store === "buygoods") return "BuyGoods";
  if (sale.store === "shipoffers") return "ShipOffers";
  if (sale.store === "h&w" || sale.store === "hw") return "H&W";
  if (
    sale.store === "sphere" || 
    sale.store?.includes("cod") ||
    sale.store?.includes("auravita") ||
    sale.store?.includes("vitalis") ||
    sale.store?.includes("fahto") ||
    sale.store?.includes("xperi") ||
    sale.store?.includes("fato")
  ) return "Sphere (COD)";
  return "ClickBank";
}

function fmtCurrency(v: number, precise = false) {
  if (!precise && Math.abs(v) >= 100_000) {
    // Evita truncamento em cards estreitos: 286.200 -> R$ 286,2K / 1.250.000 -> R$ 1,3M
    const abs = Math.abs(v);
    const { div, suf } = abs >= 1_000_000 ? { div: 1_000_000, suf: "M" } : { div: 1_000, suf: "K" };
    const n = v / div;
    return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suf}`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: precise ? 2 : 0,
    maximumFractionDigits: precise ? 2 : 0,
  }).format(v);
}


function formatTime(dateStr: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(dateStr));
}

function formatRelativeTime(dateStr: string, now: number): string {
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  // Future timestamps (e.g. ClickBank reconciliation) → show the actual time
  if (diffSec < 0) return formatTime(dateStr);
  if (diffSec < 10) return "agora";
  if (diffSec < 60) return `há ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  const remainMin = diffMin % 60;
  return remainMin > 0 ? `há ${diffH}h${remainMin}m` : `há ${diffH}h`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
  if (m === 0) return `${s}s`;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function extractShortProduct(sale: LiveSale): string {
  // Use project name (Neurodyne, Lean Drops, etc) when available
  if (sale.project && sale.project !== "Outros" && sale.project !== "OUTROS" && !/^\d+$/.test(sale.project)) return sale.project;
  
  // Detect known COD products from product_name or offer_name
  const productText = `${sale.product_name || ""} ${sale.offer_name || ""}`.toUpperCase();
  if (productText.includes("AURAVITA") || productText.includes("XPERI")) return "AURAVITA";
  if (productText.includes("VITALIS") || productText.includes("FATO")) return "Vitalis Prime";
  if (productText.includes("VTP")) return "VTP";
  const raw = (sale.product_name || "").trim();
  // Hotmart às vezes grava só o product_id numérico — nunca mostrar como nome.
  if (!raw || /^\d+$/.test(raw)) {
    if ((sale as any).vendor === "hotmart" || sale.store === "hotmart") return "Hotmart";
    return "Produto";
  }
  const cleaned = raw.replace(/^(NeuroDyne|Leandrops DTC FE)\s+/i, "");
  return cleaned.length > 24 ? cleaned.slice(0, 22) + "…" : cleaned;
}

// --- Status colors ---
type TimerStatus = "green" | "yellow" | "orange" | "red" | "critical";

function getTimerStatus(diffMin: number): TimerStatus {
  if (diffMin < 3) return "green";
  if (diffMin < 15) return "yellow";
  if (diffMin < 30) return "orange";
  if (diffMin < 40) return "red";
  return "critical";
}

const STATUS_COLORS: Record<TimerStatus, { dot: string; text: string; label: string }> = {
  green: { dot: "bg-emerald-400", text: "text-emerald-400", label: "🟢" },
  yellow: { dot: "bg-yellow-400", text: "text-yellow-400", label: "🟡" },
  orange: { dot: "bg-orange-400", text: "text-orange-400", label: "🟠" },
  red: { dot: "bg-red-500", text: "text-red-500", label: "🔴" },
  critical: { dot: "bg-red-600", text: "text-red-500", label: "🔴" },
};

// --- Alert Banner ---
function AlertBanner({ alert }: { alert: SalesAlert }) {
  const bg =
    alert.type === "spike" || alert.type === "burst"
      ? "bg-emerald-500/10 border-emerald-500/20"
      : "bg-red-500/10 border-red-500/20";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={`px-3 py-2 rounded-md border text-[11px] font-medium flex items-center gap-2 ${bg}`}
    >
      <span>{alert.icon}</span>
      <span className="text-foreground/90">{alert.message}</span>
    </motion.div>
  );
}

// --- Sale Detail Panel ---
function SaleDetail({ sale, onBack, now }: { sale: LiveSale; onBack: () => void; now: number }) {
  const storeLabel = resolveCheckoutPlatform(sale);
  const variantLabel = sale.variant || "—";
  const { roleOf: roleOfDetail } = useHotmartCategories();


  return (
    <motion.div
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full"
    >
      {/* Header — pt respeita notch iOS via safe-area-inset-top */}
      <div
        className="px-4 pb-4 border-b border-border flex items-center gap-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      >
        <button
          onClick={onBack}
          className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate">
              {extractShortProduct(sale)}
            </p>
            {resolveCheckoutPlatform(sale) === "Hotmart" && (
              <FunnelRoleBadge role={roleOfDetail(sale.product_name, (sale as any).item_name)} />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {formatTime(sale.created_at)} • {formatRelativeTime(sale.created_at, now)}
          </p>
        </div>
        <span className="text-lg font-data font-bold text-emerald-600 dark:text-emerald-400">
          {fmtCurrency(sale.revenue, true)}
        </span>
      </div>

      {/* Details */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* General */}
          <DetailSection title="Informações Gerais">
            <DetailRow label="Order ID" value={sale.order_id} mono />
            <DetailRow label="Projeto" value={sale.project || "—"} />
            <DetailRow label="Variante" value={variantLabel} />
            <DetailRow label="Produto" value={sale.product_name || "—"} />
            <DetailRow label="Plataforma" value={storeLabel} />
            <DetailRow label="Status" value={sale.status} />
          </DetailSection>

          {/* Meta Ads Cross-Reference (Escola do Dólar via UTMfy SCK) */}
          {(sale.meta_campaign_id || sale.meta_ad_id) && (
            <DetailSection
              title={
                <span className="flex items-center gap-1.5">
                  <Target className="h-3 w-3 text-primary" />
                  Meta Ads
                  <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[8px] font-semibold text-primary">
                    🎯 Cruzado via UTMfy
                  </span>
                </span>
              }
            >
              <DetailRow 
                label="Campanha" 
                value={
                  sale.meta_campaign_name || 
                  sale.raw_payload?.source || 
                  (sale as any).rt_campaign ||
                  sale.utm_campaign || 
                  "—"
                } 
              />
              <DetailRow label="Campaign ID" value={sale.meta_campaign_id || sale.raw_payload?.rt_campaign_id} mono copyable />
              <DetailRow 
                label="Adset" 
                value={(() => {
                  const isSujo = (val: any) => !val || typeof val !== 'string' || /^v3_|^[a-f0-9]{8}-|^[a-z0-9]{20}/i.test(val) || /[,&]/.test(val);
                  
                  if (sale.meta_adset_name && !isSujo(sale.meta_adset_name)) return sale.meta_adset_name;
                  if (sale.raw_payload?.rt_adgroup && !isSujo(sale.raw_payload.rt_adgroup)) return sale.raw_payload.rt_adgroup;
                  if (sale.sub5 && !isSujo(sale.sub5)) return sale.sub5;
                  if (sale.raw_payload?.source && !isSujo(sale.raw_payload.source)) return sale.raw_payload.source;
                  
                  return "—";
                })()} 
              />
              <DetailRow label="Adset ID" value={sale.meta_adset_id || sale.raw_payload?.rt_adgroup_id} mono copyable />
              <DetailRow 
                label="Anúncio" 
                value={(() => {
                  const isSujo = (val: any) => !val || typeof val !== 'string' || /^v3_|^[a-f0-9]{8}-|^[a-z0-9]{20}/i.test(val) || /[,&]/.test(val);
                  
                  if (sale.meta_ad_name && !isSujo(sale.meta_ad_name)) return sale.meta_ad_name;
                  if (sale.raw_payload?.rt_ad && !isSujo(sale.raw_payload.rt_ad)) return sale.raw_payload.rt_ad;
                  if (sale.raw_payload?.sub4 && !isSujo(sale.raw_payload.sub4)) return sale.raw_payload.sub4;
                  if (sale.raw_payload?.rt_placement && !isSujo(sale.raw_payload.rt_placement)) return sale.raw_payload.rt_placement;
                  if (sale.raw_payload?.source && !isSujo(sale.raw_payload.source)) return sale.raw_payload.source;
                  
                  return "—";
                })()} 
              />
              <DetailRow label="Ad ID" value={sale.meta_ad_id || sale.raw_payload?.rt_ad_id} mono copyable />
              <DetailRow label="Posicionamento" value={
                sale.raw_payload?.rt_placement || sale.raw_payload?.clickSub7 || sale.meta_placement || "—"
              } />

            </DetailSection>
          )}

          {/* UTMs */}
          <DetailSection title="UTMs">
            <DetailRow 
              label="Campaign" 
              value={
                sale.meta_campaign_name || 
                sale.raw_payload?.source || 
                (sale.sub6 && !/v3_|[,&]/.test(sale.sub6) ? sale.sub6 : null) || 
                sale.utm_campaign || 
                "—"
              } 
              mono 
            />
            <DetailRow 
              label="Source" 
              value={
                sale.raw_payload?.rt_source || 
                sale.raw_payload?.clickSub9 || 
                (sale.utm_source && /^(facebook|instagram|tiktok|google|newsbreak|youtube|mgid)$/i.test(sale.utm_source) ? sale.utm_source.toLowerCase() : null) ||
                (sale.utm_source?.toLowerCase().includes("fb") || sale.utm_source?.toLowerCase().includes("facebook") ? "facebook" : sale.utm_source || "facebook")
              } 
              mono 
            />
            <DetailRow 
              label="Medium" value={sale.raw_payload?.rt_medium || sale.utm_medium || "—"} mono />
            <DetailRow 
              label="Content" 
              value={(() => {
                const isSujo = (val: any) => !val || typeof val !== 'string' || /^v3_|^[a-f0-9]{8}-|^[a-z0-9]{20}/i.test(val) || /[,&]/.test(val);
                
                // Priority 1: Real Meta Ad Name (quando sync popular)
                if (sale.meta_ad_name && !isSujo(sale.meta_ad_name)) return sale.meta_ad_name;
                
                // Priority 2: Creative code from RedTrack payload (rt_ad ou sub4)
                if (sale.raw_payload?.rt_ad && !isSujo(sale.raw_payload.rt_ad)) return sale.raw_payload.rt_ad;
                if (sale.raw_payload?.sub4 && !isSujo(sale.raw_payload.sub4)) return sale.raw_payload.sub4;
                
                // Priority 3: Humanized source from RedTrack when it's short (like a code)
                if (sale.raw_payload?.source && sale.raw_payload.source.length < 20 && !isSujo(sale.raw_payload.source)) return sale.raw_payload.source;
                
                // Priority 4: Placement (ex: Facebook_Mobile_Reels)
                if (sale.raw_payload?.rt_placement && !isSujo(sale.raw_payload.rt_placement)) return sale.raw_payload.rt_placement;
                
                // Priority 5: Source (Nome adset humanizado no payload RedTrack)
                if (sale.raw_payload?.source && !isSujo(sale.raw_payload.source)) return sale.raw_payload.source;
                
                // Fallbacks sanificados
                if (sale.sub4_ad_name && !isSujo(sale.sub4_ad_name)) return sale.sub4_ad_name;
                if (sale.utm_content && !isSujo(sale.utm_content)) return sale.utm_content;
                
                return "—";
              })()} 
              mono 
            />
            <DetailRow label="Term" value={sale.raw_payload?.rt_placement || sale.utm_term || "—"} mono />
            <DetailRow label="Landing" value={sale.raw_payload?.landing || "—"} mono />
            <DetailRow label="Offer RedTrack" value={sale.raw_payload?.offer || "—"} mono />
          </DetailSection>


          {/* RedTrack tracking */}
          {sale.store === "redtrack" && (
            <>
              <DetailSection title="Rastreamento RedTrack">
                <DetailRow label="Projeto" value={(sale as any).rt_project} />
                <DetailRow label="Produto" value={(sale as any).rt_product} />
                <DetailRow label="Campanha" value={(sale as any).rt_campaign} mono />
                <DetailRow label="Conjunto" value={(sale as any).rt_adgroup} mono />
                <DetailRow label="Anúncio" value={(sale as any).rt_ad} mono />
                <DetailRow label="Posicionamento" value={(sale as any).rt_placement} mono />
              </DetailSection>

              <DetailSection title="IDs (Debug)">
                <DetailRow label="Campaign ID" value={(sale as any).rt_campaign_id} mono copyable />
                <DetailRow label="Adgroup ID" value={(sale as any).rt_adgroup_id} mono copyable />
                <DetailRow label="Ad ID" value={(sale as any).rt_ad_id} mono copyable />
              </DetailSection>

              <DetailSection title="Dispositivo & Localização">
                <DetailRow label="Dispositivo" value={(sale as any).device_fullname || sale.device} icon={<Smartphone className="h-3 w-3" />} />
                <DetailRow label="Navegador" value={sale.browser} icon={<Globe className="h-3 w-3" />} />
                <DetailRow label="SO" value={sale.os} icon={<Monitor className="h-3 w-3" />} />
                <DetailRow label="País" value={sale.country} icon={<MapPin className="h-3 w-3" />} />
                <DetailRow label="Cidade" value={sale.city} icon={<MapPin className="h-3 w-3" />} />
              </DetailSection>
            </>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}

function DetailSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, icon, copyable }: { label: string; value?: string | null; mono?: boolean; icon?: React.ReactNode; copyable?: boolean }) {
  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => toast.success("Copiado"));
  };
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
      <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1.5 max-w-[240px]">
        <span className={`text-[11px] text-foreground text-right break-all ${mono ? "font-mono" : ""}`}>
          {value || "—"}
        </span>
        {copyable && value && (
          <button
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Copiar ${label}`}
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </span>
    </div>
  );
}

// --- Main Component ---
export function LiveSalesDrawer({ open, onOpenChange, sales, lastSaleAt, soundEnabled, toggleSound }: LiveSalesDrawerProps) {
  const isMobile = useIsMobile();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  // Tick every second for the timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Update now on open
  useEffect(() => {
    if (open) setNow(Date.now());
  }, [open]);

  // Categorias de funil (frontend / order_bump / upsell / downsell / ignore)
  const { roleOf } = useHotmartCategories();

  const isCountedRevenueSale = useCallback((sale: LiveSale) => {
    if (resolveCheckoutPlatform(sale) === "Hotmart") {
      return roleOf(sale.product_name, (sale as any).item_name) !== "ignore";
    }
    return sale.event_type !== "upsell";
  }, [roleOf]);

  // Detail view
  const [selectedSale, setSelectedSale] = useState<LiveSale | null>(null);
  
  
  // Reset detail when drawer closes
  useEffect(() => {
    if (!open) setSelectedSale(null);
  }, [open]);

  const { data: todayTotals } = useTodayDashboardTotals();
  const sparklineData = useMemo(() => {
    const bucketCount = 12;
    const bucketMs = 10 * 60_000;
    const buckets: { label: string; vendas: number }[] = [];
    const baseTime = now - bucketCount * bucketMs;
    for (let i = 0; i < bucketCount; i++) {
      const start = baseTime + i * bucketMs;
      const end = start + bucketMs;
      const count = sales.filter((s) => {
        if (!isCountedRevenueSale(s)) return false;
        const t = new Date(s.created_at).getTime();
        return t >= start && t < end;
      }).length;
      const d = new Date(start);
      const timeParts = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      }).format(d);
      buckets.push({ label: timeParts, vendas: count });
    }
    return buckets;
  }, [sales, now, isCountedRevenueSale]);

  // Period filter
  const [periodFilter, setPeriodFilter] = useState<"today" | "2h" | "24h">("today");

  const periodFilteredSales = useMemo(() => {
    if (periodFilter === "today") {
      // Use standard Brasília date formatting to match the operational day (UTC-3).
      const todayBRT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(now));
      return sales.filter((s) => getSaleBRTDate(s) === todayBRT);
    }
    const windowMs = periodFilter === "2h" ? 2 * 60 * 60_000 : 24 * 60 * 60_000;
    const cutoff = now - windowMs;
    return sales.filter((s) => new Date(s.created_at).getTime() >= cutoff);
  }, [sales, periodFilter, now]);

  // Financial summary — based on period filter, with multi-source dedup
  // Sources: redtrack (primary tracking), clickbank (audit-only, already receipt-deduped vs RT in useLiveSales)
  // To avoid double-counting: use only RedTrack as primary source since it covers most sales.
  // CB audit-only entries (store === "clickbank") only add sales that RedTrack missed entirely.
  const dedupedSales = useMemo(() => {
    // RedTrack is the primary & most complete source for the live feed
    const rtSales = periodFilteredSales.filter((s) => s.store === "redtrack");
    // CB audit-only entries were already receipt-deduped against RT in useLiveSales
    const cbOnlySales = periodFilteredSales.filter((s) => s.store === "clickbank");
    // CartPanda sales (if any)
    const cpSales = periodFilteredSales.filter((s) => s.store !== "redtrack" && s.store !== "clickbank");

    return [...rtSales, ...cbOnlySales, ...cpSales];
  }, [periodFilteredSales]);

  const nonUpsellSales = useMemo(() => dedupedSales.filter(isCountedRevenueSale), [dedupedSales, isCountedRevenueSale]);
  const metrics = useSalesMetrics(nonUpsellSales, now);
  const localRevenue = useMemo(() => nonUpsellSales.reduce((sum, s) => sum + s.revenue, 0), [nonUpsellSales]);
  const localSales = nonUpsellSales.length;
  const paidNonUpsell = useMemo(() => nonUpsellSales.filter((s) => s.revenue > 0), [nonUpsellSales]);
  const localAvgTicket = paidNonUpsell.length > 0 ? paidNonUpsell.reduce((sum, s) => sum + s.revenue, 0) / paidNonUpsell.length : 0;
  // Header cards refletem o feed real (respeita allowlist Hotmart e demais filtros de fonte).
  // Antes usávamos todayTotals do dashboard, mas ele ignora allowlist e causava divergência
  // (ex.: header mostrava 14 vendas / R$ 5k, lista mostrava só 9 dos produtos permitidos).
  // Se estiver na Escola do Dólar, priorizamos os totais do Dashboard para garantir paridade 1:1,
  // pois o feed do War Room pode divergir levemente devido a filtros de allowlist de produtos.
  const isEscolaDolar = (sales.length > 0 && ((sales[0] as any)?.project === "EDD" || (sales[0] as any)?.vendor === "hotmart"));
  
  const todayBRT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(now));
  
  const forcedRev = null;
  const forcedSales = null;

  // Para EDD, usamos os números do dashboard (todayTotals) se disponíveis, para garantir paridade 1:1,
  // mas apenas se o filtro for "Hoje". Para "2h" e "24h", usamos os números reais do feed filtrado.
  // Fallback obrigatório: se o dashboard vier zerado (ex.: operações que só têm
  // vendas RedTrack), usamos os números reais do feed em vez de mostrar R$ 0.
  // BUGFIX: todayTotals é SEMPRE do dia inteiro. Só pode alimentar os cards quando
  // o filtro é "Hoje" — caso contrário 2h/24h mostravam o faturamento do dia todo.
  const useDashboardTotals = periodFilter === "today";

  const totalRevenue = forcedRev ?? (useDashboardTotals && todayTotals && todayTotals.totalRevenue > 0 ? todayTotals.totalRevenue : localRevenue);

  const totalSales = forcedSales ?? (useDashboardTotals && todayTotals && todayTotals.totalConversions > 0 ? todayTotals.totalConversions : localSales);

  const avgTicket = (forcedRev && forcedSales)
    ? (forcedRev / forcedSales)
    : (totalSales > 0 ? totalRevenue / totalSales : localAvgTicket);


  // Two-level filter: project (Neurodyne, LDG) + variant (NDM, NDR)
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [variantFilter, setVariantFilter] = useState<string | null>(null);
  // Platform filter: ClickBank / CartPanda
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);

  const uniqueProjects = useMemo(() => {
    const projects = new Set<string>();
    periodFilteredSales.forEach((s) => { if (s.project) projects.add(s.project); });
    return Array.from(projects).sort();
  }, [periodFilteredSales]);

  const uniqueVariants = useMemo(() => {
    const variants = new Set<string>();
    const base = projectFilter ? periodFilteredSales.filter((s) => s.project === projectFilter) : periodFilteredSales;
    base.forEach((s) => { if (s.variant && s.variant !== s.project) variants.add(s.variant); });
    return Array.from(variants).sort();
  }, [periodFilteredSales, projectFilter]);

  const filteredSales = useMemo(() => {
    let result = periodFilteredSales;
    if (platformFilter) {
      result = result.filter((s) => {
        const platform = resolveCheckoutPlatform(s).toLowerCase();
        return platform === platformFilter;
      });
    }
    if (projectFilter) result = result.filter((s) => s.project === projectFilter);
    if (variantFilter) result = result.filter((s) => s.variant === variantFilter);
    return result;
  }, [periodFilteredSales, projectFilter, variantFilter, platformFilter]);

  const timeSinceLastSec = lastSaleAt ? Math.max(0, Math.floor((now - lastSaleAt.getTime()) / 1000)) : null;
  const timeSinceLastMin = timeSinceLastSec !== null ? timeSinceLastSec / 60 : Infinity;
  const timerStatus = getTimerStatus(timeSinceLastMin);
  const colors = STATUS_COLORS[timerStatus];

  const timerLabel = useMemo(() => {
    if (timeSinceLastSec === null) return "Sem dados";
    const h = Math.floor(timeSinceLastSec / 3600);
    const m = Math.floor((timeSinceLastSec % 3600) / 60);
    const s = timeSinceLastSec % 60;
    if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }, [timeSinceLastSec]);

  // Track new sales for animation
  const prevSalesRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(sales.map((s) => s.id));
    const fresh = new Set<string>();
    currentIds.forEach((id) => {
      if (!prevSalesRef.current.has(id)) fresh.add(id);
    });
    prevSalesRef.current = currentIds;
    if (fresh.size > 0) {
      setNewIds(fresh);
      const timeout = setTimeout(() => setNewIds(new Set()), 800);
      return () => clearTimeout(timeout);
    }
  }, [sales]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
       <SheetContent
        side={isMobile ? "bottom" : "right"}
        style={
          isMobile
            ? { paddingBottom: "calc(78px + env(safe-area-inset-bottom, 0px))" }
            : undefined
        }
        className={
          isMobile
            ? "w-full h-[92dvh] max-h-[92dvh] p-0 border-t border-border bg-popover z-[60] flex flex-col rounded-t-2xl [&>button.absolute]:hidden overflow-hidden"
            : "w-[calc(100vw-16px)] max-w-[380px] sm:w-[420px] sm:max-w-[420px] p-0 border-l border-border bg-popover z-[60] flex flex-col h-[100dvh] sm:h-full sm:pb-0 [&>button.absolute]:hidden overflow-hidden"
        }
      >
        {isMobile && (
          <div
            className="pb-1 flex justify-center shrink-0"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
          >
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        <AnimatePresence mode="wait">
          {selectedSale ? (
            <SaleDetail key="detail" sale={selectedSale} onBack={() => setSelectedSale(null)} now={now} />
          ) : (
            <motion.div
              key="feed"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex flex-col h-full min-h-0"
            >
              {/* HEADER (sticky) — pt respects iOS notch via safe-area-inset-top */}
              <SheetHeader
                className="px-3 sm:px-4 pb-2 border-b border-border shrink-0 space-y-0"
                style={{ paddingTop: isMobile ? "0.25rem" : "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <SheetTitle className="text-[13px] sm:text-sm font-semibold text-foreground flex items-center gap-1.5 truncate min-w-0">
                    <span className="text-primary">🔥</span>
                    {isMobile ? (
                      <span className="truncate">
                        Live · <span className="tabular-nums">{totalSales}</span> · <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtCurrency(totalRevenue)}</span>
                      </span>
                    ) : (
                      <span className="truncate">War Room — Live</span>
                    )}
                  </SheetTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={toggleSound}
                      className={`${isMobile ? "h-10 w-10" : "h-8 w-8"} rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors`}
                      title={soundEnabled ? "Silenciar" : "Ativar som"}
                    >
                      {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    </button>
                    <SheetClose asChild>
                      <button
                        className={`${isMobile ? "h-10 w-10" : "h-9 w-9"} rounded-md flex items-center justify-center text-foreground border border-border bg-muted/40 hover:bg-muted active:scale-95 transition`}
                        aria-label="Fechar"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </SheetClose>
                  </div>
                </div>
                {/* Period Segmented Control */}
                {isMobile ? (
                  <div className="mt-2 flex rounded-md border border-border bg-muted/30 p-0.5 overflow-hidden">
                    {([
                      { key: "today" as const, label: "Hoje" },
                      { key: "2h" as const, label: "2h" },
                      { key: "24h" as const, label: "24h" },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setPeriodFilter(key)}
                        className={`flex-1 h-8 rounded text-[11px] font-medium transition-colors ${
                          periodFilter === key
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {([
                      { key: "today" as const, label: "Hoje" },
                      { key: "2h" as const, label: "2h" },
                      { key: "24h" as const, label: "24h" },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setPeriodFilter(key)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                          periodFilter === key
                            ? "bg-primary text-primary-foreground border-transparent"
                            : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </SheetHeader>


              {/* SCROLLABLE BODY (everything below header in one scroll on mobile) */}
              <ScrollArea className="flex-1 min-h-0 w-full max-w-full [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:w-full">
              {/* FINANCIAL SUMMARY — 2x2 on mobile (adds "Últ 30min"), 3-col on desktop */}
              <div className={`px-3 sm:px-4 py-2 sm:py-3 border-b border-border grid gap-1 sm:gap-2 ${isMobile ? "grid-cols-4" : "grid-cols-3"}`}>
                <div className={`rounded-md ${isMobile ? "px-1.5 py-1.5" : "px-2 sm:px-2.5 py-2"} bg-emerald-500/10 border border-emerald-500/15 min-w-0`}>
                  <p className={`${isMobile ? "text-[8px]" : "text-[9px]"} text-muted-foreground uppercase tracking-wider truncate leading-tight`}>
                    {isMobile ? "Fat." : periodFilter === "today" ? "Fat. Hoje" : periodFilter === "2h" ? "Fat. 2h" : "Fat. 24h"}
                  </p>
                  <p className={`${isMobile ? "text-[11px]" : "text-sm sm:text-base"} font-data font-bold text-emerald-600 dark:text-emerald-400 truncate tabular-nums leading-tight`}>{fmtCurrency(totalRevenue)}</p>
                </div>
                <div className={`rounded-md ${isMobile ? "px-1.5 py-1.5" : "px-2 sm:px-2.5 py-2"} bg-muted/50 min-w-0`}>
                  <p className={`${isMobile ? "text-[8px]" : "text-[9px]"} text-muted-foreground uppercase tracking-wider truncate leading-tight`}>Vendas</p>
                  <p className={`${isMobile ? "text-[11px]" : "text-sm sm:text-base"} font-data font-bold text-foreground truncate tabular-nums leading-tight`}>{totalSales}</p>
                </div>
                <div className={`rounded-md ${isMobile ? "px-1.5 py-1.5" : "px-2 sm:px-2.5 py-2"} bg-muted/50 min-w-0`}>
                  <p className={`${isMobile ? "text-[8px]" : "text-[9px]"} text-muted-foreground uppercase tracking-wider truncate leading-tight`}>Ticket</p>
                  <p className={`${isMobile ? "text-[11px]" : "text-sm sm:text-base"} font-data font-bold text-foreground truncate tabular-nums leading-tight`}>{fmtCurrency(avgTicket)}</p>
                </div>
                {isMobile && (
                  <div className="rounded-md px-1.5 py-1.5 bg-yellow-500/10 border border-yellow-500/15 min-w-0">
                    <p className="text-[8px] text-muted-foreground uppercase tracking-wider truncate leading-tight">30min</p>
                    <p className="text-[11px] font-data font-bold text-yellow-600 dark:text-yellow-400 truncate tabular-nums leading-tight">{metrics.sales30min}</p>
                  </div>
                )}
              </div>


              {/* SPARKLINE */}
              <div className={`${isMobile ? "px-3 py-1.5" : "px-4 py-2"} border-b border-border overflow-hidden`}>
                {!isMobile && (
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Vendas / 10 min (últimas 2h)</p>
                )}
                <div className="relative w-full overflow-hidden" style={{ height: isMobile ? 32 : 48 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparklineData} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
                      <defs>
                        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" hide />
                      <YAxis hide domain={[0, "auto"]} />
                      <Tooltip
                        cursor={false}
                        allowEscapeViewBox={{ x: false, y: false }}
                        isAnimationActive={false}
                        position={{ y: 0 }}
                        offset={8}
                        wrapperStyle={{ outline: "none", zIndex: 1, pointerEvents: "none" }}
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11, color: "hsl(var(--foreground))", padding: "2px 6px", lineHeight: 1.2 }}
                        labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 9 }}
                        itemStyle={{ color: "hsl(var(--primary))", padding: 0 }}
                        formatter={(v: number) => [`${v} vendas`, ""]}
                      />
                      <Area
                        type="monotone"
                        dataKey="vendas"
                        stroke="hsl(var(--primary))"
                        strokeWidth={1.5}
                        fill="url(#sparkGrad)"
                        dot={false}
                        activeDot={{ r: 3, fill: "hsl(var(--primary))" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`${isMobile ? "px-3 py-2 space-y-1.5" : "px-4 py-3 space-y-3"} border-b border-border`}>
                {/* Line 1: Time since last sale */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-2 w-2 rounded-full animate-pulse shrink-0 ${colors.dot}`} />
                  <span className={`${isMobile ? "text-[10px]" : "text-[11px]"} text-muted-foreground shrink-0`}>{isMobile ? "Últ." : "Última venda há"}</span>
                  <span className={`${isMobile ? "text-[12px]" : "text-sm"} font-mono font-bold tabular-nums truncate ${colors.text}`}>
                    {timerLabel}
                  </span>
                  {timerStatus === "critical" && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-red-500 animate-pulse ml-auto shrink-0">
                      CRÍTICO
                    </span>
                  )}
                </div>

                {/* Line 2: Rhythm */}
                <div className={`grid grid-cols-3 ${isMobile ? "gap-1" : "gap-2"}`}>
                  <div className={`rounded-md ${isMobile ? "px-1.5 py-1 text-center" : "px-2 py-1.5"} bg-emerald-500/10 border border-emerald-500/15 min-w-0`}>
                    <p className={`${isMobile ? "text-[8px]" : "text-[9px]"} text-muted-foreground uppercase tracking-wider leading-tight truncate`}>{isMobile ? "🟢 10m" : "🟢 10 min"}</p>
                    <p className={`${isMobile ? "text-[11px] leading-tight" : "text-sm"} font-data font-bold text-emerald-600 dark:text-emerald-400 tabular-nums`}>{metrics.sales10min}</p>
                  </div>
                  <div className={`rounded-md ${isMobile ? "px-1.5 py-1 text-center" : "px-2 py-1.5"} bg-yellow-500/10 border border-yellow-500/15 min-w-0`}>
                    <p className={`${isMobile ? "text-[8px]" : "text-[9px]"} text-muted-foreground uppercase tracking-wider leading-tight truncate`}>{isMobile ? "🟡 30m" : "🟡 30 min"}</p>
                    <p className={`${isMobile ? "text-[11px] leading-tight" : "text-sm"} font-data font-bold text-yellow-600 dark:text-yellow-400 tabular-nums`}>{metrics.sales30min}</p>
                  </div>
                  <div className={`rounded-md ${isMobile ? "px-1.5 py-1 text-center" : "px-2 py-1.5"} bg-blue-500/10 border border-blue-500/15 min-w-0`}>
                    <p className={`${isMobile ? "text-[8px]" : "text-[9px]"} text-muted-foreground uppercase tracking-wider leading-tight truncate`}>{isMobile ? "🔵 60m" : "🔵 60 min"}</p>
                    <p className={`${isMobile ? "text-[11px] leading-tight" : "text-sm"} font-data font-bold text-blue-600 dark:text-blue-400 tabular-nums`}>{metrics.sales60min}</p>
                  </div>
                </div>

                {/* Interval comparison — hidden on mobile */}
                {!isMobile && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md px-2 py-1.5 bg-muted/50">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Intervalo (30min)</p>
                      <p className="text-sm font-data font-bold text-foreground">
                        {formatDuration(metrics.avgInterval30min)}
                      </p>
                    </div>
                    <div className="rounded-md px-2 py-1.5 bg-muted/50">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Média (2h)</p>
                      <p className="text-sm font-data font-bold text-foreground">
                        {formatDuration(metrics.avgInterval2h)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Line 3: Historical comparison */}
                {metrics.avgInterval2h > 0 && (
                  <div className="flex items-center gap-2">
                    {metrics.pctDiff > 40 ? (
                      <>
                        <span className="text-[10px]">⚠️</span>
                        <span className="text-[10px] font-medium text-amber-400">
                          Ritmo {Math.round(metrics.pctDiff)}% abaixo da média 2h
                        </span>
                      </>
                    ) : metrics.pctDiff < -60 ? (
                      <>
                        <span className="text-[10px]">🔥</span>
                        <span className="text-[10px] font-medium text-emerald-400">
                          Aceleração de {Math.abs(Math.round(metrics.pctDiff))}% detectada
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px]">📊</span>
                        <span className="text-[10px] text-muted-foreground">
                          Ritmo dentro da média (intervalo médio 2h: {formatDuration(metrics.avgInterval2h)})
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ALERTS — collapsible chip on mobile */}
              <AnimatePresence>
                {metrics.alerts.length > 0 && (
                  isMobile ? (
                    <div className="px-3 py-2 border-b border-border">
                      <button
                        onClick={() => setAlertsOpen((v) => !v)}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20"
                      >
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {metrics.alerts.length} {metrics.alerts.length === 1 ? "alerta" : "alertas"}
                        </span>
                        <ChevronDown className={`h-3.5 w-3.5 text-amber-500 transition-transform ${alertsOpen ? "rotate-180" : ""}`} />
                      </button>
                      {alertsOpen && (
                        <div className="mt-1.5 space-y-1.5">
                          {metrics.alerts.map((alert) => (
                            <AlertBanner key={alert.id} alert={alert} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-2 space-y-1.5">
                      {metrics.alerts.map((alert) => (
                        <AlertBanner key={alert.id} alert={alert} />
                      ))}
                    </div>
                  )
                )}
              </AnimatePresence>

              {/* PLATFORM + PROJECT FILTER */}
              <div className="px-3 sm:px-4 py-2 space-y-1.5 border-b border-border">
                {/* Platform filter — scroll horizontal no mobile */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                  <span className="text-[8px] text-muted-foreground uppercase tracking-wider mr-0.5 shrink-0">Plataforma</span>
                  {([
                    { key: null, label: "Todos" },
                    { key: "clickbank", label: "ClickBank" },
                    { key: "cartpanda", label: "CartPanda" },
                    { key: "buygoods", label: "BuyGoods" },
                    { key: "hotmart", label: "Hotmart" },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={label}
                      onClick={() => setPlatformFilter(platformFilter === key ? null : key)}
                      className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-medium transition-colors border ${
                        platformFilter === key
                          ? "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25"
                          : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/60"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Project filter — dropdown on mobile, chips on desktop */}
                {isMobile ? (
                  <div className="relative">
                    <button
                      onClick={() => setProjectMenuOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-border bg-muted/30 text-[11px] font-medium text-foreground"
                    >
                      <span className="truncate">
                        Projeto: <span className="text-muted-foreground">{projectFilter || "Todos"}</span>
                        {variantFilter ? <span className="text-muted-foreground"> · {variantFilter}</span> : null}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${projectMenuOpen ? "rotate-180" : ""}`} />
                    </button>
                    {projectMenuOpen && (
                      <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-lg max-h-64 overflow-y-auto">
                        <button
                          onClick={() => { setProjectFilter(null); setVariantFilter(null); setProjectMenuOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-[12px] hover:bg-muted/60 ${projectFilter === null ? "text-primary font-semibold" : "text-foreground"}`}
                        >
                          Todos
                        </button>
                        {uniqueProjects.map((proj) => (
                          <button
                            key={proj}
                            onClick={() => { setProjectFilter(proj); setVariantFilter(null); setProjectMenuOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-[12px] hover:bg-muted/60 border-t border-border/50 ${projectFilter === proj ? "text-primary font-semibold" : "text-foreground"}`}
                          >
                            {proj}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                    <button
                      onClick={() => { setProjectFilter(null); setVariantFilter(null); }}
                      className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                        projectFilter === null
                          ? "bg-primary text-primary-foreground border-transparent"
                          : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/60"
                      }`}
                    >
                      Todos
                    </button>
                    {uniqueProjects.map((proj) => (
                      <button
                        key={proj}
                        onClick={() => { setProjectFilter(projectFilter === proj ? null : proj); setVariantFilter(null); }}
                        className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                          projectFilter === proj
                            ? "bg-primary text-primary-foreground border-transparent"
                            : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/60"
                        }`}
                      >
                        {proj}
                      </button>
                    ))}
                  </div>
                )}
                {/* Sub-filter: variants */}
                {uniqueVariants.length > 0 && projectFilter && (
                  <div className="flex items-center gap-1.5 flex-wrap pl-2">
                    <span className="text-[9px] text-muted-foreground mr-0.5">↳</span>
                    <button
                      onClick={() => setVariantFilter(null)}
                      className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                        variantFilter === null ? "bg-muted text-foreground" : "bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      Todos
                    </button>
                    {uniqueVariants.map((v) => (
                      <button
                        key={v}
                        onClick={() => setVariantFilter(variantFilter === v ? null : v)}
                        className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                          variantFilter === v ? "bg-muted text-foreground" : "bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* FEED */}
              <div className="p-3 space-y-0.5">
                <div className="flex items-center justify-between px-1 pb-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <span>
                    {periodFilter === "today" ? "Vendas hoje" : periodFilter === "2h" ? "Vendas · últimas 2h" : "Vendas · últimas 24h"}
                  </span>
                  <span className="tabular-nums">
                    {filteredSales.length}
                    {filteredSales.length !== periodFilteredSales.length ? ` de ${periodFilteredSales.length}` : ""} no feed
                  </span>
                </div>
                {filteredSales.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-xs">
                    Nenhuma venda{projectFilter ? ` de ${projectFilter}` : ""} no período
                  </div>

                ) : (
                  <AnimatePresence initial={false}>
                    {filteredSales.map((sale, i) => {
                      const isNew = newIds.has(sale.id);
                      return (
                        <motion.div
                          key={sale.id}
                          initial={{ opacity: 0, x: 40, scale: 0.95 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          onClick={() => setSelectedSale(sale)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                            isNew ? "bg-primary/5" : ""
                          } ${i < filteredSales.length - 1 ? "border-b border-border/50" : ""}`}
                        >
                          {/* Time */}
                          <div className="flex flex-col items-center min-w-[40px]">
                            <span className="text-[11px] font-data font-medium text-foreground">
                              {formatTime(sale.created_at)}
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                              {formatRelativeTime(sale.created_at, now)}
                            </span>
                          </div>

                          {/* Product */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-medium text-foreground truncate">
                                {extractShortProduct(sale)}
                              </p>
                              {resolveCheckoutPlatform(sale) === "Hotmart" && (
                                <FunnelRoleBadge role={roleOf(sale.product_name, (sale as any).item_name)} />
                              )}
                            </div>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider truncate">
                              {resolveCheckoutPlatform(sale)}{sale.variant ? ` · ${sale.variant}` : ""}
                            </p>
                          </div>

                          {/* Value */}
                          <motion.div
                            className="text-right shrink-0"
                            animate={isNew ? { scale: [1, 1.15, 1] } : {}}
                            transition={{ duration: 0.5 }}
                          >
                            <span className="text-[12px] font-data font-bold text-emerald-600 dark:text-emerald-400">
                              {fmtCurrency(sale.revenue, true)}
                            </span>
                          </motion.div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
