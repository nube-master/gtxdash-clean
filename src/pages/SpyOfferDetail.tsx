import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Heart, Loader2, Pencil, RefreshCw, Sparkles, Trash2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSpyOfferDetail } from "@/hooks/useSpyOfferDetail";
import { useSpyFavorites } from "@/hooks/useSpyFavorites";
import { useSpyDeleteOffer } from "@/hooks/useSpyOffers";
import { AttributeChip, StatusBadge, TrafficBadge } from "@/components/spy/SpyBadges";

import { SpyVslIntelTab } from "@/components/spy/SpyVslIntelTab";
import { SpyBriefingTab } from "@/components/spy/SpyBriefingTab";
import { SpyEvolutionPreview } from "@/components/spy/SpyEvolutionPreview";
import { SpyEvolutionTab } from "@/components/spy/SpyEvolutionTab";
import { SpyOfferEditDialog } from "@/components/spy/SpyOfferEditDialog";
import { SpyCoverEditDialog } from "@/components/spy/SpyCoverEditDialog";
import { ImageIcon } from "lucide-react";

import { SpyImportantLinks, type ExtraLink } from "@/components/spy/SpyImportantLinks";
import { SpySimilarOffers } from "@/components/spy/SpySimilarOffers";
import { SpyOfferFolders } from "@/components/spy/SpyOfferFolders";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatStat(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR");
}

function daysFromDate(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

export default function SpyOfferDetail() {
  const { offerId } = useParams<{ offerId: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useSpyOfferDetail(offerId);
  const { isFavorite, toggle } = useSpyFavorites();
  const del = useSpyDeleteOffer();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState("vsl");
  const [editOpen, setEditOpen] = useState(false);
  const [coverEditOpen, setCoverEditOpen] = useState(false);

  async function handleSync() {
    if (!offerId) return;
    setSyncing(true);
    toast.loading("Sincronizando criativos via Ad Library…", { id: "sync" });
    const { data: r, error } = await supabase.functions.invoke("spy-sync-offer", {
      body: { offer_id: offerId },
    });
    setSyncing(false);
    if (error || !r?.ok) {
      toast.error(r?.error ?? error?.message ?? "Erro ao sincronizar", { id: "sync" });
      return;
    }
    if (r.count_source === "sample") {
      toast.warning(`Total oficial indisponível; salvei amostra de ${(r.sample_seen ?? 0).toLocaleString("pt-BR")} ads.`, { id: "sync" });
    } else {
      const total = r.library_total ?? r.ads_active ?? 0;
      toast.success(`${total.toLocaleString("pt-BR")} ads ativos na biblioteca (amostra: ${r.sample_seen ?? 0})`, { id: "sync" });
    }
    qc.invalidateQueries({ queryKey: ["spy-offer-detail", offerId] });
    qc.invalidateQueries({ queryKey: ["spy-offers"] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const offer = data?.offer;
  if (!offer) {
    return (
      <div className="p-6 space-y-3">
        <Button size="sm" variant="ghost" onClick={() => navigate("/spy")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Voltar
        </Button>
        <p className="text-sm text-muted-foreground">Oferta não encontrada.</p>
      </div>
    );
  }
  const fav = isFavorite(offer.id);
  const adLibraryUrl = (offer as any).ad_library_url as string | null;
  const funnelUrls = (((offer as any).funnel_urls as string[] | null) ?? []).filter(Boolean);
  const checkoutUrls = (((offer as any).checkout_urls as string[] | null) ?? []).filter(Boolean);
  // fallback: se ainda não houver array mas houver o singular antigo, exibe ele
  if (funnelUrls.length === 0 && (offer as any).funnel_url) funnelUrls.push((offer as any).funnel_url);
  if (checkoutUrls.length === 0 && (offer as any).checkout_url) checkoutUrls.push((offer as any).checkout_url);
  const extraLinks = (((offer as any).extra_links ?? []) as ExtraLink[]);
  const daysRunning = offer.days_running_max ?? daysFromDate(offer.oldest_active_ad_at);

  async function handleDelete() {
    if (!confirm("Remover esta oferta do Swipe File? Esta ação não pode ser desfeita.")) return;
    try {
      await del.mutateAsync(offer.id);
      toast.success("Oferta removida");
      navigate("/spy");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao remover");
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Button size="sm" variant="ghost" onClick={() => navigate("/spy")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="default" onClick={() => navigate(`/offers?prefill_from_spy=${offer.id}`)} className="bg-gradient-to-r from-primary to-primary/80">
            <Rocket className="h-3.5 w-3.5 mr-1.5" /> Replicar oferta
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggle.mutate(offer.id)}>
            <Heart className={cn("h-3.5 w-3.5 mr-1.5", fav && "fill-rose-400 text-rose-400")} />
            {fav ? "Favorita" : "Favoritar"}
          </Button>
          {adLibraryUrl && (
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} />
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <Card className="overflow-hidden relative group">
          <div className="aspect-[4/5] bg-muted">
            {offer.hero_thumbnail_url ? (
              <img src={offer.hero_thumbnail_url} alt={offer.offer_name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground/40 text-5xl font-bold">
                {offer.offer_name.charAt(0)}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="absolute bottom-2 right-2 h-7 text-[11px] shadow-md"
            onClick={() => setCoverEditOpen(true)}
          >
            <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Trocar capa
          </Button>
        </Card>

        <div className="space-y-3">
          <div className="flex items-start gap-3 flex-wrap">
            <h1 className="text-2xl font-bold flex-1">{offer.offer_name}</h1>
            <StatusBadge status={offer.status} />
            <TrafficBadge traffic={offer.trafego} />
          </div>
          {offer.primary_advertiser && (
            <p className="text-sm text-muted-foreground">por <span className="text-foreground">{offer.primary_advertiser}</span></p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Ads ativos" value={formatStat(offer.active_ads_count)} />
            <Stat label="Total ads" value={formatStat(offer.total_ads_count)} />
            <Stat label="Anunciantes únicos" value={formatStat(offer.advertiser_count)} hint="Páginas distintas rodando ads desta oferta" />
            <Stat
              label="Dias rodando"
              value={daysRunning ?? "—"}
              hint={
                offer.oldest_active_ad_at
                  ? `desde ${new Date(offer.oldest_active_ad_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                  : undefined
              }
            />
          </div>

          <SpyImportantLinks
            offerId={offer.id}
            adLibraryUrl={adLibraryUrl}
            funnelUrls={funnelUrls}
            checkoutUrls={checkoutUrls}
            extraLinks={extraLinks}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <InfoRow label="Produto" value={offer.product_name} />
            <InfoRow label="Nicho" value={offer.nicho} />
            <InfoRow label="Subnicho" value={offer.subnicho} />
            <InfoRow label="Idioma" value={offer.idioma} />
            <InfoRow label="GEO" value={offer.geo_main} />
            <InfoRow label="Score" value={offer.score} />
            <InfoRow label="Payout est. (USD)" value={offer.payout_estimated_usd} />
            <InfoRow label="Fonte" value={offer.source} />
          </div>

          {offer.atributos?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {offer.atributos.map((a) => <AttributeChip key={a} label={a} />)}
            </div>
          )}

          {offer.notes && (
            <Card className="p-3 text-sm whitespace-pre-wrap bg-muted/30">{offer.notes}</Card>
          )}
        </div>
      </div>


      {/* Sync status */}
      {((offer as any).sync_status === "error" || (offer as any).sync_status === "partial") && (offer as any).sync_error && (
        <Card className={cn("p-3 text-xs", (offer as any).sync_status === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-500/30 bg-amber-500/5 text-amber-300")}>
          {(offer as any).sync_status === "error" ? "Falha na última sincronização" : "Sincronização parcial"}: {(offer as any).sync_error}
        </Card>
      )}


      {/* Evolução de Anúncios — preview compacto (snapshots intraday/diário) */}
      <SpyEvolutionPreview
        history={data?.history ?? []}
        currentActive={offer.active_ads_count ?? 0}
        onSeeMore={() => {
          setActiveTab("evolution");
          // garante que o usuário veja a tab que acabou de abrir
          setTimeout(() => {
            document.getElementById("spy-offer-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 60);
        }}
      />

      {/* Concorrentes diretos (mesmo nicho/idioma) */}
      <SpySimilarOffers
        offerId={offer.id}
        nicho={offer.nicho}
        subnicho={offer.subnicho}
        idioma={offer.idioma}
        operationId={(offer as any).operation_id}
      />

      {/* Pastas — uploads de criativos, checkout, transcrição, VSL */}
      <SpyOfferFolders offerId={offer.id} />

      {/* Tabs */}
      <Tabs id="spy-offer-tabs" value={activeTab} onValueChange={setActiveTab} className="mt-2">
        <TabsList>
          <TabsTrigger value="evolution">Evolução diária</TabsTrigger>
          <TabsTrigger value="vsl">Análise VSL</TabsTrigger>
          <TabsTrigger value="briefing">Briefing Enzo</TabsTrigger>
          <TabsTrigger value="lps">LPs ({data?.lps.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="evolution" className="mt-3">
          <SpyEvolutionTab
            history={data?.history ?? []}
            currentActive={offer.active_ads_count ?? 0}
          />
        </TabsContent>


        <TabsContent value="vsl" className="mt-3">
          <SpyVslIntelTab
            offerId={offer.id}
            vslIntelSummary={(offer as any).vsl_intel_summary}
            vslIntelAnalyzedAt={(offer as any).vsl_intel_analyzed_at}
            vslIntelSourceFiles={(offer as any).vsl_intel_source_files}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["spy-offer-detail", offerId] })}
          />
        </TabsContent>


        <TabsContent value="briefing" className="mt-3">
          <SpyBriefingTab
            offerId={offer.id}
            offerName={offer.offer_name}
            briefingMd={(offer as any).briefing_md}
            briefingGeneratedAt={(offer as any).briefing_generated_at}
            onUpdate={() => qc.invalidateQueries({ queryKey: ["spy-offer-detail", offerId] })}
          />
        </TabsContent>

        <TabsContent value="lps" className="mt-3">
          {data?.lps.length === 0 ? (
            <Empty msg="Nenhuma LP arquivada." />
          ) : (
            <div className="space-y-2">
              {data?.lps.map((lp: any) => (
                <Card key={lp.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{lp.title ?? lp.url}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{lp.url}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => window.open(lp.url, "_blank")}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <SpyOfferEditDialog open={editOpen} onOpenChange={setEditOpen} offer={offer} />
      <SpyCoverEditDialog
        open={coverEditOpen}
        onOpenChange={setCoverEditOpen}
        offerId={offer.id}
        currentUrl={offer.hero_thumbnail_url ?? null}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <Card className="p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value ?? "—"}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium truncate">{value ?? "—"}</span>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center py-12 border border-dashed border-border rounded-lg">
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}
