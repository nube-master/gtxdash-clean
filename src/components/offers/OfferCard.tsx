import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Eye, Pencil, Archive, Radar, ChevronDown, AlertTriangle, Skull, Trash2,
  ExternalLink, Heart, BarChart3, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { OfferSparkline } from "./OfferSparkline";
import { OfferPreviewImage } from "./OfferPreviewImage";
import { BenchmarkBadge } from "./BenchmarkBadge";
import type {
  Offer, OfferStatus, OfferNicho, OfferVendor, OfferGeo,
} from "@/types/offers";
import { cn } from "@/lib/utils";

/* ─────────── meta ─────────── */
const STATUS_META: Record<OfferStatus, { label: string; cls: string; dot: string; ring: string }> = {
  ativa:     { label: "Escalando",  cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500", ring: "ring-emerald-500/40" },
  em_teste:  { label: "Em teste",   cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",       dot: "bg-amber-500",   ring: "ring-amber-500/40" },
  pausada:   { label: "Pausada",    cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",                dot: "bg-red-500",     ring: "ring-red-500/40" },
  morta:     { label: "Morta",      cls: "bg-muted text-muted-foreground border-border",                                  dot: "bg-muted-foreground/50", ring: "ring-border" },
  arquivada: { label: "Arquivada",  cls: "bg-muted/50 text-muted-foreground border-border/50",                            dot: "bg-muted-foreground/30", ring: "ring-border" },
};

const NICHO_LABEL: Partial<Record<OfferNicho, string>> = {
  brain_memory: "Brain", vision: "Vision", hearing: "Hearing", blood_sugar: "Blood Sugar", glp1: "GLP-1", blood_sugar_glp1: "Blood Sugar / GLP-1",
  weight_loss: "Weight Loss", mens_health_ed: "Mens Health", womens_health: "Womens Health", heart_bp: "Heart", prostate: "Prostate",
  tinnitus: "Tinnitus", joint_pain: "Joint", skin_beauty: "Skin & Beauty", hair_loss: "Hair Loss", dental: "Dental",
  sleep: "Sleep", energy: "Energy", immunity: "Immunity", digestive: "Digestive", kidney_liver: "Kidney/Liver",
  anti_aging: "Anti-Aging", muscle: "Muscle", detox: "Detox", thyroid: "Thyroid", spiritual: "Spiritual",
  survival: "Survival", pet: "Pet", financial: "Financial", outro: "Outros",
};

const VENDOR_LABEL: Partial<Record<OfferVendor, string>> = {
  clickbank: "ClickBank", buygoods: "BuyGoods", cartpanda: "Cartpanda",
  hotmart: "Hotmart", kiwify: "Kiwify", monetizze: "Monetizze", cod_europa: "COD Europa", outro: "Outros",
};

const GEO_FLAG: Record<OfferGeo, string> = {
  BR: "🇧🇷", US: "🇺🇸", UK: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷",
  ES: "🇪🇸", IT: "🇮🇹", CA: "🇨🇦", AU: "🇦🇺",
  HU: "🇭🇺", PL: "🇵🇱", RO: "🇷🇴", NL: "🇳🇱", PT: "🇵🇹", MX: "🇲🇽",
  SK: "🇸🇰", CZ: "🇨🇿", AT: "🇦🇹", CH: "🇨🇭", BE: "🇧🇪", IE: "🇮🇪",
  SE: "🇸🇪", NO: "🇳🇴", DK: "🇩🇰", FI: "🇫🇮", GR: "🇬🇷", BG: "🇧🇬",
  HR: "🇭🇷", SI: "🇸🇮", LT: "🇱🇹", LV: "🇱🇻", EE: "🇪🇪", LU: "🇱🇺",
  AR: "🇦🇷", CL: "🇨🇱", CO: "🇨🇴", PE: "🇵🇪", UY: "🇺🇾", EC: "🇪🇨",
  PY: "🇵🇾", BO: "🇧🇴", VE: "🇻🇪", CR: "🇨🇷", PA: "🇵🇦", DO: "🇩🇴", GT: "🇬🇹",
  NZ: "🇳🇿", ZA: "🇿🇦", IN: "🇮🇳", JP: "🇯🇵", KR: "🇰🇷", SG: "🇸🇬",
  MY: "🇲🇾", PH: "🇵🇭", TH: "🇹🇭", ID: "🇮🇩", VN: "🇻🇳",
  TR: "🇹🇷", IL: "🇮🇱", AE: "🇦🇪", SA: "🇸🇦",
};

const STATUS_OPTIONS: OfferStatus[] = ["ativa", "em_teste", "pausada", "morta", "arquivada"];

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v));

/* ─────────── favorite (localStorage, self-contained) ─────────── */
const FAV_KEY = "offers:favorites:v1";
function readFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }
  catch { return new Set(); }
}
function writeFavs(s: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...s]));
  window.dispatchEvent(new CustomEvent("offers:favorites:changed"));
}

/* ─────────── ROI inline ─────────── */
function RoiPill({ roi }: { roi: number | null }) {
  if (roi == null) return <span className="text-muted-foreground/40 tabular-nums text-xs">—</span>;
  const tone =
    roi >= 1.2 ? { cls: "text-emerald-500 bg-emerald-500/10", Icon: TrendingUp }
    : roi >= 1.0 ? { cls: "text-amber-500 bg-amber-500/10", Icon: Minus }
    : { cls: "text-red-500 bg-red-500/10", Icon: TrendingDown };
  const { Icon } = tone;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums", tone.cls)}>
      <Icon className="h-2.5 w-2.5" />
      {roi.toFixed(2)}x
    </span>
  );
}

/* ─────────── props ─────────── */
export interface OfferCardProps {
  offer: Offer;
  traffic: any;
  health: { score: number; tone: "good" | "warn" | "bad" | "neutral"; reasons: string[] };
  isTwin: boolean;
  killReason: string | null;
  isSelected: boolean;
  density?: "comfortable" | "compact";
  benchmark?: any;
  benchmarkActual?: any;
  onSelectToggle: () => void;
  onOpenDetail: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete?: () => void;
  onSpy: () => void;
  onStatusChange: (s: OfferStatus) => void;
}

export function OfferCard({
  offer: o,
  traffic,
  health,
  isTwin,
  killReason,
  isSelected,
  density = "comfortable",
  benchmark,
  benchmarkActual,
  onSelectToggle,
  onOpenDetail,
  onEdit,
  onArchive,
  onDelete,
  onSpy,
  onStatusChange,
}: OfferCardProps) {
  const meta = STATUS_META[o.status];
  const isDimmed = o.status === "morta" || o.status === "arquivada";
  const lifetime = o.data_inicio
    ? differenceInDays(o.status === "morta" && o.data_morte ? parseISO(o.data_morte) : new Date(), parseISO(o.data_inicio))
    : null;

  const spendToday = traffic?.spend_today_brl ?? 0;
  const revenueToday = traffic?.revenue_today_brl ?? 0;
  const roiToday = spendToday > 0 ? revenueToday / spendToday : null;
  const revenue7d = traffic?.revenue_7d_brl ?? 0;
  const spend7d = traffic?.spend_7d_brl ?? 0;
  const sales7d = traffic?.sales_7d ?? 0;
  const salesToday = traffic?.sales_today ?? 0;
  const roi7d = traffic?.roi_7d ?? null;
  const accounts = traffic?.accounts_count ?? 0;

  /* favorite local */
  const [fav, setFav] = useState(false);
  useEffect(() => {
    const refresh = () => setFav(readFavs().has(o.id));
    refresh();
    window.addEventListener("offers:favorites:changed", refresh);
    return () => window.removeEventListener("offers:favorites:changed", refresh);
  }, [o.id]);
  const toggleFav = () => {
    const s = readFavs();
    if (s.has(o.id)) s.delete(o.id); else s.add(o.id);
    writeFavs(s);
  };

  /* tags coloridas (estilo Swipe) */
  const colorTags: Array<{ label: string; cls: string }> = [
    { label: NICHO_LABEL[o.nicho], cls: "bg-foreground text-background" },
    ...(o.tags ?? []).slice(0, 4).map((t) => ({
      label: t,
      cls: "bg-muted text-foreground border border-border",
    })),
  ];

  return (
    <Card
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-card-click]")) return;
        onOpenDetail();
      }}
      className={cn(
        "group relative overflow-hidden cursor-pointer border-border bg-card rounded-xl",
        "transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5",
        isSelected && "ring-2 ring-primary/50",
        isDimmed && "opacity-60",
        density === "compact" && "rounded-lg",
      )}
    >
      {/* ═══════════ PREVIEW (topo, dominante) ═══════════ */}
      <div className={cn("relative bg-muted/30 overflow-hidden", density === "compact" ? "aspect-[3/4]" : "aspect-[4/5]")}>
        <OfferPreviewImage offer={o} />

        {/* gradiente bottom */}
        <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-card via-card/60 to-transparent pointer-events-none", density === "compact" ? "h-16" : "h-24")} />

        {/* checkbox top-left */}
        <div data-no-card-click className="absolute top-2 left-2">
          <div className={cn(
            "rounded-full bg-background/85 backdrop-blur flex items-center justify-center shadow-sm",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isSelected && "opacity-100",
            density === "compact" ? "h-6 w-6" : "h-7 w-7",
          )}>
            <Checkbox checked={isSelected} onCheckedChange={onSelectToggle} className={cn(density === "compact" ? "h-3 w-3" : "h-3.5 w-3.5")} />
          </div>
        </div>

        {/* favorite top-right */}
        <button
          data-no-card-click
          onClick={toggleFav}
          className={cn(
            "absolute top-2 right-2 rounded-full bg-background/85 backdrop-blur",
            "flex items-center justify-center shadow-sm transition-all",
            "hover:scale-110 active:scale-95",
            density === "compact" ? "h-7 w-7" : "h-8 w-8",
          )}
          title={fav ? "Remover dos favoritos" : "Favoritar"}
        >
          <Heart className={cn("transition-colors", fav ? "fill-red-500 text-red-500" : "text-muted-foreground", density === "compact" ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </button>

        {/* status badge sobre o preview (canto inferior esquerdo) */}
        <div data-no-card-click className="absolute bottom-2 left-2 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button>
                <Badge variant="outline" className={cn(meta.cls, "cursor-pointer backdrop-blur shadow-sm font-semibold", density === "compact" ? "text-[9px] px-1.5 py-0" : "text-[10px]")}>
                  <span className={cn("rounded-full mr-1", meta.dot, density === "compact" ? "h-1 w-1" : "h-1.5 w-1.5")} />
                  {meta.label}
                  <ChevronDown className={cn("ml-0.5 opacity-60", density === "compact" ? "h-2 w-2" : "h-2.5 w-2.5")} />
                </Badge>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {STATUS_OPTIONS.filter((s) => s !== o.status).map((s) => (
                <DropdownMenuItem key={s} onClick={() => onStatusChange(s)}>
                  <span className={cn("h-2 w-2 rounded-full mr-2", STATUS_META[s].dot)} />
                  {STATUS_META[s].label}
                </DropdownMenuItem>
              ))}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Excluir permanente
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* warnings top-right (abaixo do heart) */}
        <div className={cn("absolute right-2 flex flex-col gap-1", density === "compact" ? "top-10" : "top-12")}>
          {isTwin && (
            <div title="Oferta gêmea" className={cn("rounded-full bg-amber-500/90 text-white flex items-center justify-center shadow", density === "compact" ? "h-5 w-5" : "h-6 w-6")}>
              <AlertTriangle className={cn(density === "compact" ? "h-2.5 w-2.5" : "h-3 w-3")} />
            </div>
          )}
          {killReason && (
            <div title={killReason} className={cn("rounded-full bg-red-500/90 text-white flex items-center justify-center shadow", density === "compact" ? "h-5 w-5" : "h-6 w-6")}>
              <Skull className={cn(density === "compact" ? "h-2.5 w-2.5" : "h-3 w-3")} />
            </div>
          )}
        </div>

        {/* ads count (canto inferior direito) */}
        {accounts > 0 && (
          <div className="absolute bottom-2 right-2 z-10">
            <span className={cn("inline-flex items-center gap-1 rounded-full bg-background/85 backdrop-blur font-semibold text-foreground shadow-sm", density === "compact" ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]")}>
              <BarChart3 className={cn("text-primary", density === "compact" ? "h-2.5 w-2.5" : "h-3 w-3")} />
              {accounts}
            </span>
          </div>
        )}

      </div>

      {/* ═══════════ FOOTER (info essencial) ═══════════ */}
      <div className={cn("flex flex-col gap-2", density === "compact" ? "p-2 gap-1" : "p-3 gap-2")}>
        {/* título + geo */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <h3 className={cn("font-bold tracking-tight text-foreground leading-tight truncate", density === "compact" ? "text-xs" : "text-sm")} title={o.apelido_interno}>
              {o.apelido_interno}
            </h3>
            {density !== "compact" && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={o.produto_real}>
                {o.produto_real}
              </p>
            )}
          </div>
          <span className={cn("bg-muted/70 rounded font-semibold text-muted-foreground shrink-0", density === "compact" ? "text-[9px] px-1 py-0" : "text-[10px] px-1.5 py-0.5")}>
            {GEO_FLAG[o.geo] ?? "🌐"} {o.geo}
          </span>
        </div>

        {/* meta line */}
        {density !== "compact" && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{o.data_inicio ? format(parseISO(o.data_inicio), "dd/MM/yyyy") : "—"}</span>
            {lifetime != null && (
              <>
                <span className="opacity-40">·</span>
                <span>{lifetime}d ativa</span>
              </>
            )}
            <span className="opacity-40">·</span>
            <span>{VENDOR_LABEL[o.vendor]}</span>
          </div>
        )}

        {/* tags coloridas (estilo Swipe) */}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {colorTags.slice(0, density === "compact" ? 2 : 5).map((t, i) => (
            <span
              key={i}
              className={cn(
                "rounded-full font-semibold leading-tight",
                density === "compact" ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]",
                t.cls,
              )}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
