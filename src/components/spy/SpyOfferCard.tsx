import { useState } from "react";
import { Heart, ExternalLink, Eye, TrendingUp, Calendar, Users, Pencil, Rocket, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useSpyFavorites } from "@/hooks/useSpyFavorites";
import { useAuth } from "@/contexts/AuthContext";
import { AttributeChip, StatusBadge, TrafficBadge } from "./SpyBadges";
import { SpyCoverEditDialog } from "./SpyCoverEditDialog";
import type { SpyOffer } from "@/types/spy";

interface SpyOfferCardProps {
  offer: SpyOffer;
}

function daysFromDate(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

const IDIOMA_FLAG: Record<string, { flag: string; label: string }> = {
  "Inglês": { flag: "🇺🇸", label: "EUA" },
  "Português": { flag: "🇧🇷", label: "Brasil" },
  "Espanhol": { flag: "🇪🇸", label: "Espanha" },
  "Italiano": { flag: "🇮🇹", label: "Itália" },
  "Francês": { flag: "🇫🇷", label: "França" },
  "Alemão": { flag: "🇩🇪", label: "Alemanha" },
};

export function SpyOfferCard({ offer }: SpyOfferCardProps) {
  const navigate = useNavigate();
  const { isFavorite, toggle } = useSpyFavorites();
  const { isAdmin, hasRole } = useAuth();
  // Edição de capa liberada para admins e editores (Samuka, Yan etc.)
  const canEdit = isAdmin || hasRole("editor");
  const [coverOpen, setCoverOpen] = useState(false);
  const fav = isFavorite(offer.id);
  const daysRunning = offer.days_running_max ?? daysFromDate(offer.oldest_active_ad_at);


  return (
    <Card
      className={cn(
        "group relative overflow-hidden border border-border/60 bg-card rounded-xl",
        "transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
        "cursor-pointer flex flex-col",
      )}
      onClick={() => navigate(`/spy/${offer.id}`)}
    >
      {/* Thumb */}
      <div className="relative aspect-[4/5] bg-muted overflow-hidden">
        {offer.hero_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={offer.hero_thumbnail_url}
            alt={offer.offer_name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground/40 text-4xl font-bold">
            {offer.offer_name.charAt(0)}
          </div>
        )}

        {/* Top-left: Growth alerts (Constant 7d/20k, Emerging 5d/10k) ou Escalando */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {(() => {
            const cgAt = offer.last_constant_growth_alert_at;
            const cgFresh = cgAt && Date.now() - new Date(cgAt).getTime() < 3 * 86_400_000;
            if (cgFresh) {
              return (
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 h-5 rounded-md bg-rose-500/95 text-white font-semibold shadow-lg shadow-rose-500/30"
                  title="7 dias consecutivos acima de 20.000 ads"
                >
                  <Rocket className="h-3 w-3" />
                  Em escala — 7d constante + 20k ads
                </span>
              );
            }
            return null;
          })()}
          {(() => {
            const egAt = offer.last_emerging_growth_alert_at;
            const egFresh = egAt && Date.now() - new Date(egAt).getTime() < 3 * 86_400_000;
            if (egFresh) {
              return (
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 h-5 rounded-md bg-sky-500/95 text-white font-semibold shadow-lg shadow-sky-500/30"
                  title="5 dias consecutivos acima de 10.000 ads com crescimento +15%"
                >
                  <Zap className="h-3 w-3" />
                  Em escala — 5d constante + 10k ads
                </span>
              );
            }
            return null;
          })()}
          {(() => {
            const cgFresh = offer.last_constant_growth_alert_at && Date.now() - new Date(offer.last_constant_growth_alert_at).getTime() < 3 * 86_400_000;
            const egFresh = offer.last_emerging_growth_alert_at && Date.now() - new Date(offer.last_emerging_growth_alert_at).getTime() < 3 * 86_400_000;
            if (!cgFresh && !egFresh && offer.escalando) {
              return (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 h-5 rounded-md bg-emerald-500/90 text-white font-semibold">
                  <TrendingUp className="h-3 w-3" />
                  Escalando
                </span>
              );
            }
            return null;
          })()}
        </div>

        {/* Top-right: tráfego + ações */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <TrafficBadge traffic={offer.trafego} />
          {canEdit && (
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setCoverOpen(true);
              }}
              className="h-7 w-7 rounded-full bg-black/40 backdrop-blur hover:bg-black/60"
              aria-label="Editar capa"
              title="Editar capa"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              toggle.mutate(offer.id);
            }}
            className={cn(
              "h-7 w-7 rounded-full bg-black/40 backdrop-blur hover:bg-black/60",
              fav && "text-rose-400",
            )}
            aria-label={fav ? "Remover dos favoritos" : "Favoritar"}
          >
            <Heart className={cn("h-4 w-4", fav && "fill-current")} />
          </Button>
        </div>



        {/* Hover overlay actions */}
        <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/80 to-transparent">
          {offer.domain && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-[11px] flex-1"
              onClick={(e) => {
                e.stopPropagation();
                window.open(`https://${offer.domain}`, "_blank", "noopener");
              }}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              LP
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px] flex-1"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/spy/${offer.id}`);
            }}
          >
            <Eye className="h-3 w-3 mr-1" />
            Ver
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1 min-w-0">
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="text-sm font-semibold leading-tight line-clamp-2 break-words">{offer.offer_name}</h3>
          <div className="flex items-center justify-between gap-2 min-h-[18px] min-w-0">
            {offer.primary_advertiser ? (
              <p className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">{offer.primary_advertiser}</p>
            ) : <span className="flex-1" />}
            <StatusBadge status={offer.status} />
          </div>
        </div>


        {/* Mini-stats */}
        <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground mt-auto pt-2 border-t border-border/40">
          <div className="flex items-center gap-1" title="Ads ativos na biblioteca">
            <Eye className="h-3 w-3" />
            <span className="font-medium text-foreground">{offer.active_ads_count.toLocaleString("pt-BR")}</span>
          </div>
          <div className="flex items-center gap-1" title="Páginas únicas vistas na amostra sincronizada">
            <Users className="h-3 w-3" />
            <span className="font-medium text-foreground">{offer.advertiser_count.toLocaleString("pt-BR")}</span>
          </div>
          <div
            className="flex items-center gap-1"
            title={
              offer.oldest_active_ad_at
                ? `Anúncio ativo mais antigo desde ${new Date(offer.oldest_active_ad_at).toLocaleString("pt-BR")}`
                : "Dias rodando"
            }
          >
            <Calendar className="h-3 w-3" />
            <span className="font-medium text-foreground">
              {daysRunning ?? "—"}
              {daysRunning != null && "d"}
            </span>
          </div>
        </div>
        {(offer.oldest_active_ad_at || offer.idioma) && (
          <div className="flex items-center justify-between gap-2 -mt-1">
            <div className="text-[10px] text-muted-foreground">
              {offer.oldest_active_ad_at && (
                <>Desde {new Date(offer.oldest_active_ad_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })}</>
              )}
            </div>
            {offer.idioma && IDIOMA_FLAG[offer.idioma] && (
              <span
                className="text-sm leading-none"
                title={IDIOMA_FLAG[offer.idioma].label}
              >
                {IDIOMA_FLAG[offer.idioma].flag}
              </span>
            )}
          </div>
        )}

        {/* Attributes */}
        {offer.atributos?.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1">
            {offer.atributos.slice(0, 3).map((a) => (
              <AttributeChip key={a} label={a} />
            ))}
            {offer.atributos.length > 3 && (
              <span className="text-[10px] text-muted-foreground self-center">+{offer.atributos.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {canEdit && (
        <SpyCoverEditDialog
          open={coverOpen}
          onOpenChange={setCoverOpen}
          offerId={offer.id}
          currentUrl={offer.hero_thumbnail_url}
        />
      )}
    </Card>
  );
}


export function SpyOfferCardSkeleton() {
  return (
    <Card className="overflow-hidden border border-border/60 rounded-xl">
      <Skeleton className="aspect-[4/5] w-full" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </Card>
  );
}
