// Spy — Ofertas similares (mesmo nicho/idioma) — mapa de mercado direto na tela de detalhe
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Eye, TrendingUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  offerId: string;
  nicho: string | null;
  subnicho: string | null;
  idioma: string | null;
  operationId: string;
}

export function SpySimilarOffers({ offerId, nicho, subnicho, idioma, operationId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["spy-similar", offerId, nicho, subnicho, idioma, operationId],
    enabled: !!nicho || !!subnicho,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("spy_offers")
        .select("id, offer_name, hero_thumbnail_url, active_ads_count, primary_advertiser, idioma, nicho, subnicho")
        .neq("id", offerId)
        .eq("operation_id", operationId)
        .order("active_ads_count", { ascending: false })
        .limit(8);
      if (subnicho) q = q.eq("subnicho", subnicho);
      else if (nicho) q = q.eq("nicho", nicho);
      if (idioma) q = q.eq("idioma", idioma);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading || !data?.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Concorrentes diretos</h3>
          <span className="text-[11px] text-muted-foreground">
            mesmo {subnicho ? "subnicho" : "nicho"}{idioma ? ` · ${idioma}` : ""}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
        {data.map((o) => (
          <button
            key={o.id}
            onClick={() => navigate(`/spy/${o.id}`)}
            className={cn(
              "group text-left rounded-lg overflow-hidden border border-border/60 bg-card hover:border-primary/40 transition-colors",
            )}
          >
            <div className="aspect-[4/5] bg-muted relative overflow-hidden">
              {o.hero_thumbnail_url ? (
                <img
                  src={o.hero_thumbnail_url}
                  alt={o.offer_name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl text-muted-foreground/40 font-bold">
                  {o.offer_name.charAt(0)}
                </div>
              )}
              <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                <Eye className="h-2.5 w-2.5" />
                {(o.active_ads_count ?? 0).toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="p-1.5">
              <p className="text-[11px] font-medium leading-tight line-clamp-2">{o.offer_name}</p>
              {o.primary_advertiser && (
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{o.primary_advertiser}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
