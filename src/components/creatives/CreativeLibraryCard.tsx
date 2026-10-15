import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, DollarSign, Rocket, Trophy, Video, ImageIcon, Loader2 } from "lucide-react";
import { type CreativeRow } from "@/lib/creativeUtils";
import { useCreativePreview } from "@/hooks/useCreativePreview";

interface Props {
  creative: CreativeRow;
  isMostProfit: boolean;
  isTopSales: boolean;
  onClick: () => void;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) {
  return v.toFixed(1) + "%";
}

export function CreativeLibraryCard({ creative: c, isMostProfit, isTopSales, onClick }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Lazy load: only fetch when card is visible in viewport
  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  const adName = c.adNames[0];
  const accountId = Array.from(c.accountIds)[0];
  const { preview, loading } = useCreativePreview(adName, accountId, isVisible);

  const hasThumbnail = preview?.thumbnail_url;

  const isBestHook = c.hookRate > 50;
  const isScaled = c.isScaleStructure || c.isF3;
  const hasBadge = isBestHook || isMostProfit || isTopSales || isScaled;

  const structureLabel = (c.isScaleStructure || c.isF3)
    ? { label: c.isF3 ? "Escala (F3)" : "Escala", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
    : c.isTestStructure
    ? { label: "Teste", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
    : null;

  const campaignCount = c.campaignNames.size;

  return (
    <Card
      ref={cardRef}
      className="bg-card border-border overflow-hidden hover:border-primary/30 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      {/* Preview area */}
      <div className="relative aspect-video bg-muted/50 flex items-center justify-center overflow-hidden">
        {hasThumbnail ? (
          <img
            src={preview!.thumbnail_url!}
            alt={c.creativeId}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
        ) : c.isVideo ? (
          <Video className="h-10 w-10 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
        ) : (
          <ImageIcon className="h-10 w-10 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
        )}
        {hasBadge && (
          <div className="absolute top-2 right-2 flex flex-wrap gap-1 max-w-[70%] justify-end">
            {isBestHook && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/20 border border-orange-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400 backdrop-blur-sm">
                <Flame className="h-3 w-3" /> Hook
              </span>
            )}
            {isMostProfit && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 backdrop-blur-sm">
                <DollarSign className="h-3 w-3" /> Lucro
              </span>
            )}
            {isScaled && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 backdrop-blur-sm">
                <Rocket className="h-3 w-3" /> Escala
              </span>
            )}
            {isTopSales && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 backdrop-blur-sm">
                <Trophy className="h-3 w-3" /> Top
              </span>
            )}
          </div>
        )}
        {structureLabel && (
          <div className="absolute bottom-2 left-2">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${structureLabel.cls}`}>
              {structureLabel.label}
            </span>
          </div>
        )}
        {/* Project badge */}
        {c.project.tag && (
          <div className="absolute top-2 left-2">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${c.project.className}`}>
              {c.project.label}
            </span>
          </div>
        )}
      </div>

      <CardContent className="p-3 space-y-2">
        {/* Name */}
        <div>
          <p className="text-sm font-bold text-foreground truncate" title={c.creativeId}>
            {c.creativeId}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono truncate" title={c.adNames[0]}>
            {c.adNames[0] || "—"}
          </p>
        </div>

        {/* Team */}
        <div className="flex items-center gap-3 text-[11px]">
          {c.copyWriter && (
            <span className="text-muted-foreground">
              Copy: <span className="text-foreground font-medium">{c.copyWriter}</span>
            </span>
          )}
          {c.editor && (
            <span className="text-muted-foreground">
              Editor: <span className="text-foreground font-medium">{c.editor}</span>
            </span>
          )}
          {!c.copyWriter && !c.editor && (
            <span className="text-muted-foreground/50 italic">Sem atribuição</span>
          )}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded-md bg-muted/40 py-1 px-0.5">
            <p className="text-[9px] text-muted-foreground">Hook</p>
            <p className="text-[11px] font-bold text-foreground">{fmtPct(c.hookRate)}</p>
          </div>
          <div className="rounded-md bg-muted/40 py-1 px-0.5">
            <p className="text-[9px] text-muted-foreground">CTR</p>
            <p className="text-[11px] font-bold text-foreground">{fmtPct(c.ctr)}</p>
          </div>
          <div className="rounded-md bg-muted/40 py-1 px-0.5">
            <p className="text-[9px] text-muted-foreground">Vendas</p>
            <p className="text-[11px] font-bold text-foreground">{fmt(c.sales)}</p>
          </div>
          <div className="rounded-md bg-muted/40 py-1 px-0.5">
            <p className="text-[9px] text-muted-foreground">ROI</p>
            <p className={`text-[11px] font-bold ${c.roi >= 1 ? "text-emerald-400" : "text-destructive"}`}>
              {c.roi.toFixed(2)}x
            </p>
          </div>
        </div>

        {/* Campaigns count */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{campaignCount} campanha{campaignCount !== 1 ? "s" : ""}</span>
          <span className="text-primary/70 group-hover:text-primary transition-colors">Ver detalhes →</span>
        </div>
      </CardContent>
    </Card>
  );
}
