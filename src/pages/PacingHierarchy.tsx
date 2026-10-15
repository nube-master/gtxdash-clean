import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { PacingHeader } from "@/components/pacing/PacingHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, RefreshCw, ChevronRight, Loader2, X,
  Megaphone, Layers, Image as ImageIcon, ArrowRight,
} from "lucide-react";
import { isMetaCampaignPaused } from "@/lib/metaCampaignStatus";

type CampaignRow = {
  campaign_id: string; account_id: string; campaign_name: string;
  status: string; effective_status: string; daily_budget?: number | null;
  operation_id: string | null;
};
type AdsetRow = {
  adset_id: string; campaign_id: string; account_id: string; adset_name: string;
  status: string; effective_status: string; daily_budget: number;
  bid_amount: number | null; bid_strategy: string | null; optimization_goal: string | null;
  operation_id: string | null;
};
type AdRow = {
  ad_id: string; adset_id: string; campaign_id: string; account_id: string;
  name: string; status: string; effective_status: string;
  thumbnail_url: string | null; preview_url: string | null;
  spend_brl: number; impressions: number; clicks: number;
  purchases: number; revenue_brl: number;
};

const STRATEGY_LABELS: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: "Auto",
  LOWEST_COST_WITH_BID_CAP: "Bid cap",
  COST_CAP: "Cost cap",
  LOWEST_COST_WITH_MIN_ROAS: "Min ROAS",
};

const fmtBrl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtNum = (v: number) => v.toLocaleString("pt-BR");

type Level = "campaign" | "adset" | "ad";

export default function PacingHierarchy() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const opId = useOperationId();

  const [level, setLevel] = useState<Level>("campaign");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "PAUSED" | "ALL">("ACTIVE");
  // Drill-down chips
  const [campaignScope, setCampaignScope] = useState<CampaignRow | null>(null);
  const [adsetScope, setAdsetScope] = useState<AdsetRow | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const campaignsQ = useQuery({
    queryKey: ["hier-campaigns", opId],
    queryFn: async (): Promise<CampaignRow[]> => {
      let q = supabase.from("meta_campaign_status" as any)
        .select("campaign_id, account_id, campaign_name, status, effective_status, daily_budget, operation_id")
        .order("updated_at", { ascending: false })
        .limit(2000);
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
    staleTime: 30_000,
  });

  const adsetsQ = useQuery({
    queryKey: ["hier-adsets", opId],
    queryFn: async (): Promise<AdsetRow[]> => {
      const PAGE = 1000;
      const all: AdsetRow[] = [];
      let from = 0;
      while (true) {
        let q = supabase.from("meta_adset_status" as any)
          .select("adset_id, campaign_id, account_id, adset_name, status, effective_status, daily_budget, bid_amount, bid_strategy, optimization_goal, operation_id")
          .range(from, from + PAGE - 1);
        if (opId) q = q.eq("operation_id", opId);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as any as AdsetRow[];
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: 30_000,
  });

  // Ads: filtered by scope for performance
  const adsQ = useQuery({
    queryKey: ["hier-ads-scoped", opId, campaignScope?.campaign_id ?? null, adsetScope?.adset_id ?? null, level],
    enabled: level === "ad",
    queryFn: async (): Promise<AdRow[]> => {
      const PAGE = 1000;
      const all: AdRow[] = [];
      let from = 0;
      while (true) {
        let q = supabase.from("meta_ad_status" as any)
          .select("*")
          .order("spend_brl", { ascending: false })
          .range(from, from + PAGE - 1);
        if (opId) q = q.eq("operation_id", opId);
        if (adsetScope) q = q.eq("adset_id", adsetScope.adset_id);
        else if (campaignScope) q = q.eq("campaign_id", campaignScope.campaign_id);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as any as AdRow[];
        all.push(...rows);
        if (rows.length < PAGE || (!campaignScope && !adsetScope)) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: 60_000,
  });

  const adsetCountByCampaign = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of adsetsQ.data ?? []) m.set(a.campaign_id, (m.get(a.campaign_id) ?? 0) + 1);
    return m;
  }, [adsetsQ.data]);

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (campaignsQ.data ?? []).filter((c) => {
      const paused = isMetaCampaignPaused(c.status, c.effective_status);
      if (statusFilter === "ACTIVE" && paused) return false;
      if (statusFilter === "PAUSED" && !paused) return false;
      if (q && !c.campaign_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [campaignsQ.data, search, statusFilter]);

  const filteredAdsets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (adsetsQ.data ?? []).filter((a) => {
      if (campaignScope && a.campaign_id !== campaignScope.campaign_id) return false;
      const paused = isMetaCampaignPaused(a.status, a.effective_status);
      if (statusFilter === "ACTIVE" && paused) return false;
      if (statusFilter === "PAUSED" && !paused) return false;
      if (q && !(a.adset_name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [adsetsQ.data, search, statusFilter, campaignScope]);

  const filteredAds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (adsQ.data ?? []).filter((a) => {
      const paused = isMetaCampaignPaused(a.status, a.effective_status);
      if (statusFilter === "ACTIVE" && paused) return false;
      if (statusFilter === "PAUSED" && !paused) return false;
      if (q && !(a.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [adsQ.data, search, statusFilter]);

  // Drill-down actions ("push" into next level)
  const pushCampaign = (c: CampaignRow) => {
    setCampaignScope(c); setAdsetScope(null); setLevel("adset");
  };
  const pushAdset = (a: AdsetRow) => {
    if (!campaignScope) {
      const camp = (campaignsQ.data ?? []).find((c) => c.campaign_id === a.campaign_id);
      if (camp) setCampaignScope(camp);
    }
    setAdsetScope(a); setLevel("ad");
  };
  const clearCampaignScope = () => { setCampaignScope(null); setAdsetScope(null); };
  const clearAdsetScope = () => setAdsetScope(null);

  const changeLevel = (v: Level) => {
    setLevel(v);
    if (v === "campaign") { setCampaignScope(null); setAdsetScope(null); }
    if (v === "adset") setAdsetScope(null);
  };

  const syncAll = useCallback(async () => {
    setSyncing(true);
    try {
      toast({ title: "Sincronizando em background…", description: "Isso pode levar 1-3 min. Vamos recarregar sozinhos." });
      await supabase.functions.invoke("sync-campaign-status", { body: opId ? { operation_id: opId } : {} });
      await supabase.functions.invoke("sync-adset-status", { body: opId ? { operation_id: opId } : {} });
      await supabase.functions.invoke("sync-ad-status", { body: opId ? { operation_id: opId } : {} });
      for (const delay of [8_000, 20_000, 45_000, 90_000, 150_000]) {
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["hier-campaigns"] });
          qc.invalidateQueries({ queryKey: ["hier-adsets"] });
          qc.invalidateQueries({ queryKey: ["hier-ads-scoped"] });
        }, delay);
      }
      toast({ title: "Sync iniciado", description: "Dados vão aparecendo aos poucos." });
    } catch (e: any) {
      toast({ title: "Falha ao sincronizar", description: e.message, variant: "destructive" });
    } finally { setSyncing(false); }
  }, [opId, qc]);

  const toggleAdStatus = async (ad: AdRow) => {
    const nextStatus = isMetaCampaignPaused(ad.status, ad.effective_status) ? "ACTIVE" : "PAUSED";
    setToggling((s) => new Set(s).add(ad.ad_id));
    try {
      const { data, error } = await supabase.functions.invoke("update-ad-status", {
        body: { items: [{ ad_id: ad.ad_id, account_id: ad.account_id, status: nextStatus }], reason: "hierarchy_toggle" },
      });
      if (error) throw error;
      const r = (data as any)?.results?.[0];
      if (!r?.ok) throw new Error(r?.error || "update_failed");
      toast({ title: nextStatus === "ACTIVE" ? "Anúncio ativado" : "Anúncio pausado", description: ad.name });
      qc.invalidateQueries({ queryKey: ["hier-ads-scoped"] });
    } catch (e: any) {
      toast({ title: "Falha", description: e.message, variant: "destructive" });
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(ad.ad_id); return n; });
    }
  };

  const counts = {
    campaign: filteredCampaigns.length,
    adset: (campaignScope
      ? (adsetsQ.data ?? []).filter((a) => a.campaign_id === campaignScope.campaign_id)
      : adsetsQ.data ?? []).length,
    ad: adsQ.data?.length ?? 0,
  };

  const isLoading =
    (level === "campaign" && campaignsQ.isLoading) ||
    (level === "adset" && adsetsQ.isLoading) ||
    (level === "ad" && adsQ.isLoading);

  return (
    <div className="min-h-screen bg-background">
      <PacingHeader />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/pacing")}>
            <ArrowLeft className="w-4 h-4 mr-1" />Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Meta Ads · Campanhas › Conjuntos › Anúncios</h1>
            <p className="text-xs text-muted-foreground">
              Layout em abas como o Meta Ads Manager. Clique em uma linha para "empurrar" para o nível seguinte.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={syncAll} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando…" : "Sincronizar tudo"}
          </Button>
        </div>

        {/* Tabs — Meta-style */}
        <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
          <Tabs value={level} onValueChange={(v) => changeLevel(v as Level)}>
            <TabsList className="w-full h-auto rounded-none border-b border-border/60 bg-muted/30 p-0 justify-start">
              <TabsTrigger
                value="campaign"
                className="flex-1 sm:flex-none gap-2 rounded-none border-r border-border/40 px-6 py-3 data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-b-primary"
              >
                <Megaphone className="w-4 h-4" />
                <span>Campanhas</span>
                <Badge variant="secondary" className="text-[10px] ml-1">{counts.campaign}</Badge>
              </TabsTrigger>
              <TabsTrigger
                value="adset"
                className="flex-1 sm:flex-none gap-2 rounded-none border-r border-border/40 px-6 py-3 data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-b-primary"
              >
                <Layers className="w-4 h-4" />
                <span>Conjuntos de anúncios</span>
                <Badge variant="secondary" className="text-[10px] ml-1">{counts.adset}</Badge>
              </TabsTrigger>
              <TabsTrigger
                value="ad"
                className="flex-1 sm:flex-none gap-2 rounded-none px-6 py-3 data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-b-primary"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Anúncios</span>
                <Badge variant="secondary" className="text-[10px] ml-1">{counts.ad}</Badge>
              </TabsTrigger>
            </TabsList>

            {/* Scope chips + toolbar */}
            <div className="p-3 space-y-3 border-b border-border/40">
              {(campaignScope || adsetScope) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Escopo:</span>
                  {campaignScope && (
                    <Badge variant="outline" className="gap-1.5 pl-2 pr-1 py-1 font-mono text-[10px]">
                      <Megaphone className="w-3 h-3" />
                      <span className="max-w-[240px] truncate">{campaignScope.campaign_name}</span>
                      <button onClick={clearCampaignScope} className="hover:bg-muted rounded p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                  {adsetScope && (
                    <>
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      <Badge variant="outline" className="gap-1.5 pl-2 pr-1 py-1 font-mono text-[10px]">
                        <Layers className="w-3 h-3" />
                        <span className="max-w-[240px] truncate">{adsetScope.adset_name}</span>
                        <button onClick={clearAdsetScope} className="hover:bg-muted rounded p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-muted-foreground block mb-1">Buscar</label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={level === "campaign" ? "nome da campanha…" : level === "adset" ? "nome do conjunto…" : "nome do anúncio…"}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Status</label>
                  <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                    <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Ativas</SelectItem>
                      <SelectItem value="PAUSED">Pausadas</SelectItem>
                      <SelectItem value="ALL">Todas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-x-auto">
              {level === "campaign" && (
                <CampaignTable
                  rows={filteredCampaigns}
                  adsetCount={adsetCountByCampaign}
                  isLoading={isLoading}
                  onPush={pushCampaign}
                />
              )}
              {level === "adset" && (
                <AdsetTable
                  rows={filteredAdsets}
                  isLoading={isLoading}
                  onPush={pushAdset}
                />
              )}
              {level === "ad" && (
                <AdTable
                  rows={filteredAds}
                  isLoading={isLoading}
                  toggling={toggling}
                  onToggle={toggleAdStatus}
                  scoped={!!(campaignScope || adsetScope)}
                />
              )}
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ============================ TABLES ============================

const HEADER_CLASSES =
  "grid gap-2 px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold sticky top-0 z-10";
const ROW_CLASSES =
  "grid gap-2 px-3 py-2 items-center hover:bg-muted/30 border-t border-border/30 text-left";

function EmptyState({ msg }: { msg: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{msg}</div>;
}

function LoadingRows() {
  return (
    <div className="p-6 space-y-2">
      <Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" />
    </div>
  );
}

function CampaignTable({
  rows, adsetCount, isLoading, onPush,
}: {
  rows: CampaignRow[]; adsetCount: Map<string, number>; isLoading: boolean;
  onPush: (c: CampaignRow) => void;
}) {
  const cols = "grid-cols-[minmax(0,1fr)_120px_100px_100px]";
  return (
    <>
      <div className={`${HEADER_CLASSES} ${cols}`}>
        <div>Campanha</div>
        <div className="text-right">Orçamento diário</div>
        <div className="text-center">Status</div>
        <div className="text-center">Conjuntos</div>
      </div>
      {isLoading ? <LoadingRows /> :
        rows.length === 0 ? <EmptyState msg="Nenhuma campanha. Clique em Sincronizar tudo." /> :
        rows.map((c) => {
          const paused = isMetaCampaignPaused(c.status, c.effective_status);
          return (
            <button
              key={c.campaign_id}
              onClick={() => onPush(c)}
              className={`w-full ${ROW_CLASSES} ${cols} group`}
              title="Ver conjuntos desta campanha"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Megaphone className="w-4 h-4 text-primary shrink-0" />
                <span className="font-medium truncate">{c.campaign_name}</span>
              </div>
              <div className="text-right text-xs">{fmtBrl(c.daily_budget ?? null)}</div>
              <div className="text-center">
                <Badge variant={paused ? "secondary" : "default"} className="text-[10px]">
                  {paused ? "Pausada" : "Ativa"}
                </Badge>
              </div>
              <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                <span className="font-semibold text-foreground">{adsetCount.get(c.campaign_id) ?? 0}</span>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
              </div>
            </button>
          );
        })}
    </>
  );
}

function AdsetTable({
  rows, isLoading, onPush,
}: { rows: AdsetRow[]; isLoading: boolean; onPush: (a: AdsetRow) => void }) {
  const cols = "grid-cols-[minmax(0,1fr)_120px_140px_100px]";
  return (
    <>
      <div className={`${HEADER_CLASSES} ${cols}`}>
        <div>Conjunto</div>
        <div className="text-right">Orçamento diário</div>
        <div className="text-center">Estratégia / Bid</div>
        <div className="text-center">Status</div>
      </div>
      {isLoading ? <LoadingRows /> :
        rows.length === 0 ? <EmptyState msg="Nenhum conjunto para o escopo atual." /> :
        rows.map((a) => {
          const paused = isMetaCampaignPaused(a.status, a.effective_status);
          return (
            <button
              key={a.adset_id}
              onClick={() => onPush(a)}
              className={`w-full ${ROW_CLASSES} ${cols} group`}
              title="Ver anúncios deste conjunto"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-sm truncate">{a.adset_name || "—"}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition shrink-0" />
              </div>
              <div className="text-right text-xs">{fmtBrl(a.daily_budget || null)}</div>
              <div className="text-center">
                {a.bid_strategy ? (
                  <Badge variant="outline" className="text-[10px]">
                    {STRATEGY_LABELS[a.bid_strategy] ?? a.bid_strategy}
                    {a.bid_amount != null && ` · ${fmtBrl(a.bid_amount)}`}
                  </Badge>
                ) : <span className="text-[10px] text-muted-foreground">—</span>}
              </div>
              <div className="text-center">
                <Badge variant={paused ? "secondary" : "default"} className="text-[10px]">
                  {paused ? "Pausado" : "Ativo"}
                </Badge>
              </div>
            </button>
          );
        })}
    </>
  );
}

function AdTable({
  rows, isLoading, toggling, onToggle, scoped,
}: {
  rows: AdRow[]; isLoading: boolean; toggling: Set<string>;
  onToggle: (ad: AdRow) => void; scoped: boolean;
}) {
  const cols = "grid-cols-[minmax(0,1fr)_90px_80px_100px_80px_60px]";
  return (
    <>
      <div className={`${HEADER_CLASSES} ${cols}`}>
        <div>Anúncio</div>
        <div className="text-right">Gasto 7d</div>
        <div className="text-right">Compras</div>
        <div className="text-right">Receita</div>
        <div className="text-right">ROAS</div>
        <div className="text-center">On/Off</div>
      </div>
      {isLoading ? <LoadingRows /> :
        !scoped ? <EmptyState msg="Selecione uma campanha ou conjunto para carregar os anúncios." /> :
        rows.length === 0 ? <EmptyState msg="Nenhum anúncio sincronizado para este escopo." /> :
        rows.map((ad) => {
          const paused = isMetaCampaignPaused(ad.status, ad.effective_status);
          const roas = ad.spend_brl > 0 ? (ad.revenue_brl / ad.spend_brl) : 0;
          const isBusy = toggling.has(ad.ad_id);
          return (
            <div key={ad.ad_id} className={`${ROW_CLASSES} ${cols}`}>
              <div className="flex items-center gap-2 min-w-0">
                {ad.thumbnail_url ? (
                  <img src={ad.thumbnail_url} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
                    <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                )}
                {ad.preview_url ? (
                  <a href={ad.preview_url} target="_blank" rel="noreferrer"
                     className="text-xs truncate hover:underline" title={ad.name}>{ad.name || "—"}</a>
                ) : (
                  <span className="text-xs truncate" title={ad.name}>{ad.name || "—"}</span>
                )}
              </div>
              <div className="text-right text-xs">{fmtBrl(ad.spend_brl)}</div>
              <div className="text-right text-xs">{fmtNum(ad.purchases)}</div>
              <div className="text-right text-xs">{fmtBrl(ad.revenue_brl)}</div>
              <div className={`text-right text-xs font-medium ${roas >= 1.2 ? "text-green-500" : roas >= 1 ? "text-yellow-500" : "text-muted-foreground"}`}>
                {roas > 0 ? roas.toFixed(2) : "—"}
              </div>
              <div className="flex justify-center">
                {isBusy ? (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                ) : (
                  <Switch checked={!paused} onCheckedChange={() => onToggle(ad)} />
                )}
              </div>
            </div>
          );
        })}
    </>
  );
}
