import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone, Monitor, Tablet, Radio, Copy, ChevronRight, MapPin, AlertTriangle, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend, LabelList } from "recharts";
import { toast } from "sonner";
import { ViewerGlobe } from "@/components/live/ViewerGlobe";
import { GlobePaletteSelector, useGlobePalette } from "@/components/live/GlobePaletteSelector";
import { useRetentionAlerts } from "@/components/live/useRetentionAlerts";
import { useDurationBucketsConfig, bucketsFromConfig, bucketize, type BucketCounts } from "@/components/live/durationBuckets";
import { DurationBucketsConfigDialog } from "@/components/live/DurationBucketsConfigDialog";
import { PlayerHistoryDialog } from "@/components/live/PlayerHistoryDialog";
import { LiveLeadsFeed, type LiveAdOption, type LiveLead, type LiveProductOption, type LiveTopCampaign, type LiveSummary24h } from "@/components/live/LiveLeadsFeed";
import { TopCampaignsCard } from "@/components/live/TopCampaignsCard";
import { ConversionSummaryCard } from "@/components/live/ConversionSummaryCard";
import { LiveHistoryTab } from "@/components/live/LiveHistoryTab";
import { OrphanSalesTab } from "@/components/live/OrphanSalesTab";
import { PlayerSalesDialog } from "@/components/live/PlayerSalesDialog";
import { KpiHelpIcon } from "@/components/KpiHelpIcon";
import { ExportLeadsButton } from "@/components/live/ExportLeadsButton";
import { AoVivoTheaterMode, TheaterModeButton } from "@/components/live/AoVivoTheaterMode";
import { DeviceBreakdownCard, type DeviceFunnelAgg } from "@/components/live/DeviceBreakdownCard";
import { LiveRetentionCurveCard } from "@/components/live/LiveRetentionCurveCard";
import { LiveViewersHeatmapCard } from "@/components/live/LiveViewersHeatmapCard";
import { resolveGeo, flagEmoji, densityBucket } from "@/lib/geoCoords";
import { cn } from "@/lib/utils";

type LocAgg = { country: string; state: string | null; count: number; pct: number };
type DeviceAgg = { mobile: number; desktop: number; tablet: number };
type DurationAgg = { d_0_5: number; d_5_15: number; d_15_30: number; d_30_60: number; d_60_plus: number };
type BucketAvgAgg = { d_0_5: number; d_5_15: number; d_15_30: number; d_30_60: number; d_60_plus: number };
type PlayerSnapshot = {
  player_id: string;
  player_name: string | null;
  product: string | null;
  count: number;
  share_pct: number;
  by_country: LocAgg[];
  by_device: DeviceAgg;
  viewers_at_pitch: number;
  viewers_at_cta: number;
  by_session_duration?: DurationAgg;
  avg_session_seconds?: number;
  median_session_seconds?: number;
  bucket_avg_seconds?: BucketAvgAgg;
  session_seconds?: number[];
  seconds_curve?: { sec: number; viewers: number }[];
  sales_today?: number;
  revenue_today_usd?: number;
  last_sale_at?: string | null;
};

type InactivePlayer = {
  player_id: string;
  player_name: string | null;
  product: string | null;
  viewers_window: number;
  last_seen_at: string;
};

type LiveKpis = {
  sales_today: number;
  revenue_today_usd: number;
  cr_live_pct: number;
  avg_time_to_sale_seconds: number;
  tts_p50_seconds?: number;
  tts_p90_seconds?: number;
  orphans_today: number;
  matched_today?: number;
  coverage_pct?: number;
};

type Snapshot = {
  total_viewers: number;
  by_country: LocAgg[];
  by_device: DeviceAgg;
  device_funnel?: DeviceFunnelAgg;
  by_player: { player_id: string; player_name: string | null; count: number }[];
  players: PlayerSnapshot[];
  viewers_at_pitch: number;
  viewers_at_cta: number;
  by_session_duration?: DurationAgg;
  avg_session_seconds?: number;
  median_session_seconds?: number;
  bucket_avg_seconds?: BucketAvgAgg;
  session_seconds?: number[];
  concurrent_series: { t: string; viewers: number }[];
  inactive_players?: InactivePlayer[];
  inactive_window_hours?: number;
  live_kpis?: LiveKpis;
};



const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type ViewMode = "active" | "1h" | "6h" | "24h";

async function fetchSnapshot(
  filters: { player_id?: string; product?: string; ad_id?: string },
  windowHours: number,
  operationId: string,
): Promise<Snapshot> {
  const params = new URLSearchParams();
  if (filters.player_id && filters.player_id !== "all") params.set("player_id", filters.player_id);
  if (filters.product && filters.product !== "all") params.set("product", filters.product);
  if (filters.ad_id && filters.ad_id !== "all") params.set("ad_id", filters.ad_id);
  params.set("inactive_window_hours", String(windowHours));
  params.set("operation_id", operationId);
  const url = `${SUPABASE_URL}/functions/v1/live-viewers?${params.toString()}`;

  const doFetch = (token: string) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } });

  const { data: s1 } = await supabase.auth.getSession();
  let token = s1.session?.access_token ?? ANON_KEY;
  let r = await doFetch(token);
  if (r.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token ?? token;
    r = await doFetch(token);
  }
  if (!r.ok) throw new Error(`live-viewers ${r.status}`);
  return r.json();
}

export default function AoVivo() {
  const operationId = useOperationId();
  const [filters, setFilters] = useState<{ player_id?: string; product?: string; ad_id?: string }>({});
  const [adsOptions, setAdsOptions] = useState<LiveAdOption[]>([]);
  const [productOptions, setProductOptions] = useState<LiveProductOption[]>([]);
  const [leadsFeed, setLeadsFeed] = useState<LiveLead[]>([]);
  const [topCampaigns, setTopCampaigns] = useState<LiveTopCampaign[]>([]);
  const [summary24h, setSummary24h] = useState<LiveSummary24h | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const windowHours = viewMode === "active" ? 6 : viewMode === "1h" ? 1 : viewMode === "6h" ? 6 : 24;

  const refetch = useMemo(() => () => {
    if (!operationId) { setLoading(false); return; }
    fetchSnapshot(filters, windowHours, operationId).then((s) => { setSnapshot(s); setLoading(false); }).catch(() => setLoading(false));
  }, [filters, windowHours, operationId]);

  // Dedupe semântica por clickid+operation_id (mesma venda pode chegar via UPSERT múltiplos)
  const knownSaleKeysRef = useRef<Set<string>>(new Set());
  const saleToastBootRef = useRef<boolean>(false);

  useEffect(() => {
    // Guard: sem operação selecionada não faz nada (ProtectedRoute redireciona pra /select-operation)
    if (!operationId) { setLoading(false); setSnapshot(null); return; }
    refetch();
    const channel = supabase
      .channel(`live_viewers_changes_${operationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_viewers" }, (payload) => {
        // F9-DIA3.5: filtro cliente por operation_id ativa (payload pode conter NULL ou outra op)
        const rowOp = (payload.new as any)?.operation_id ?? (payload.old as any)?.operation_id;
        if (rowOp !== operationId) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(refetch, 500);
      })
      .subscribe();

    // Toast realtime para novas vendas atribuídas (RLS já filtra por operation_id)
    const salesChannel = supabase
      .channel(`live_sale_attribution_changes_${operationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_sale_attribution" },
        (payload) => {
          const row = payload.new as {
            clickid: string;
            operation_id: string | null;
            sale_status: string;
            sale_value_usd: number;
            product: string | null;
            matched_player_name: string | null;
            is_orphan: boolean;
            time_to_sale_seconds: number | null;
          };
          // F9-DIA3.5: filtro cliente por operation_id ativa
          if (row.operation_id !== operationId) return;
          if (row.sale_status !== "CONVERTED") return;
          const key = `${row.clickid}|${row.operation_id ?? ""}`;
          if (knownSaleKeysRef.current.has(key)) return;
          knownSaleKeysRef.current.add(key);
          // Evita rajada inicial quando o canal entra subscrito após backfill da página
          if (!saleToastBootRef.current) return;
          const player = row.matched_player_name || (row.is_orphan ? "Órfã" : "VSL");
          const prod = row.product ? ` · ${row.product}` : "";
          const tts = row.time_to_sale_seconds ? ` · TTS ${Math.round(row.time_to_sale_seconds / 60)}m` : "";
          toast.success(`💰 Venda ao vivo $${Number(row.sale_value_usd).toFixed(0)}`, {
            description: `${player}${prod}${tts}`,
          });
          // Atualiza o snapshot pra refletir KPIs/badges
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(refetch, 300);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // libera toasts apenas após estarmos efetivamente conectados
          setTimeout(() => { saleToastBootRef.current = true; }, 1500);
        }
      });

    const interval = setInterval(refetch, 15_000);
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(salesChannel);
      clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saleToastBootRef.current = false;
    };
  }, [refetch, operationId]);

  const total = snapshot?.total_viewers ?? 0;
  const players = snapshot?.players ?? [];
  const baseProducts = ["MMP", "MMPB", "NDM", "NDB", "NDR", "CRT", "MEMO", "LDR", "NEURO"];
  const products = useMemo(() => {
    const map = new Map<string, number>();
    baseProducts.forEach((p) => map.set(p, 0));
    productOptions.forEach((p) => map.set(p.product, p.count));
    return Array.from(map.entries()).map(([product, count]) => ({ product, count }));
  }, [productOptions]);
  const [bucketsCfg, setBucketsCfg, resetBuckets] = useDurationBucketsConfig();
  const bucketDefs = useMemo(() => bucketsFromConfig(bucketsCfg), [bucketsCfg]);
  const [drillPlayer, setDrillPlayer] = useState<{ id: string; name: string | null } | null>(null);
  const openDrill = (id: string, name: string | null) => setDrillPlayer({ id, name });
  const [salesDrillPlayer, setSalesDrillPlayer] = useState<{ id: string; name: string | null } | null>(null);
  const openSalesDrill = (id: string, name: string | null) => setSalesDrillPlayer({ id, name });
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [palettePage] = useGlobePalette();

  return (
    <div className="full-width-page space-y-6 p-2 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radio className="h-7 w-7 text-destructive" />
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive animate-ping" />
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ao Vivo</h1>
            <p className="text-sm text-muted-foreground">
              {total} viewers em {players.length} {players.length === 1 ? "VSL" : "VSLs"}
              {loading && " · atualizando…"}
            </p>
            {snapshot?.live_kpis && (
              <div className="mt-2 hidden md:flex flex-wrap gap-3 text-xs">
                <KpiPill label="Vendas hoje" value={String(snapshot.live_kpis.sales_today)} tone="emerald" term="Vendas hoje" />
                <KpiPill label="Revenue" value={`$${snapshot.live_kpis.revenue_today_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} tone="emerald" term="Revenue" />
                <KpiPill label="CR live" value={`${snapshot.live_kpis.cr_live_pct.toFixed(2)}%`} tone="primary" term="CR live" />
                {(snapshot.live_kpis.coverage_pct ?? 0) > 0 && (
                  <KpiPill
                    label="Cobertura"
                    value={`${snapshot.live_kpis.coverage_pct!.toFixed(0)}%`}
                    tone={
                      snapshot.live_kpis.coverage_pct! >= 80
                        ? "emerald"
                        : snapshot.live_kpis.coverage_pct! >= 50
                        ? "primary"
                        : "amber"
                    }
                    term="Cobertura"
                  />
                )}
                {(snapshot.live_kpis.tts_p50_seconds ?? 0) > 0 && (
                  <KpiPill
                    label="TTS p50"
                    value={`${Math.round((snapshot.live_kpis.tts_p50_seconds ?? 0) / 60)}m`}
                    tone="muted"
                    term="TTS p50"
                  />
                )}
                {(snapshot.live_kpis.tts_p90_seconds ?? 0) > 0 && (
                  <KpiPill
                    label="TTS p90"
                    value={`${Math.round((snapshot.live_kpis.tts_p90_seconds ?? 0) / 60)}m`}
                    tone="muted"
                    term="TTS p90"
                  />
                )}
                {snapshot.live_kpis.avg_time_to_sale_seconds > 0 && (
                  <KpiPill label="TTS médio" value={`${Math.round(snapshot.live_kpis.avg_time_to_sale_seconds / 60)}m`} tone="muted" term="TTS médio" />
                )}
                {snapshot.live_kpis.orphans_today > 0 && (
                  <KpiPill label="Órfãs" value={String(snapshot.live_kpis.orphans_today)} tone="amber" term="Órfãs" />
                )}
              </div>
            )}
          </div>

        </div>
        <div className="hidden md:flex flex-wrap gap-2 w-full md:w-auto">
          <Select value={filters.player_id ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, player_id: v }))}>
            <SelectTrigger className="w-full sm:w-[220px] rounded-lg"><SelectValue placeholder="VSL" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as VSLs</SelectItem>
              {(snapshot?.by_player ?? []).map((p) => (
                <SelectItem key={p.player_id} value={p.player_id}>
                  {p.player_name || p.player_id} ({p.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.product ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, product: v }))}>
            <SelectTrigger className="flex-1 sm:w-[160px] sm:flex-none rounded-lg"><SelectValue placeholder="Produto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos produtos</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.product} value={p.product}>
                  {p.product}{p.count ? ` (${p.count})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.ad_id ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, ad_id: v }))}>
            <SelectTrigger className="w-full sm:w-[220px] rounded-lg"><SelectValue placeholder="ad_id" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ad_ids ({adsOptions.length})</SelectItem>
              {adsOptions.map((a) => (
                <SelectItem key={a.ad_id} value={a.ad_id}>
                  …{a.ad_id.slice(-8)} · {a.count} viewers
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="inline-flex rounded-lg border bg-background p-0.5 overflow-x-auto scrollbar-none">
            {(["active", "1h", "6h", "24h"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap",
                  viewMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                title={m === "active" ? "Apenas VSLs com viewers agora" : `Inclui VSLs com tráfego nas últimas ${m}`}
              >
                {m === "active" ? "Ativas agora" : `Últimas ${m}`}
              </button>
            ))}
          </div>
          <ExportLeadsButton filters={filters} />
          <TheaterModeButton onClick={() => setTheaterOpen(true)} />
        </div>
      </div>

      <AoVivoTheaterMode
        open={theaterOpen}
        onClose={() => setTheaterOpen(false)}
        locations={snapshot?.by_country ?? []}
        palette={palettePage}
        totalViewers={total}
        filters={filters}
        initialLeads={leadsFeed}
        initialTopCampaigns={topCampaigns}
        initialSummary={summary24h}
      />

      <Tabs defaultValue="dashboard">
        <TabsList className="w-full grid grid-cols-4 rounded-lg gap-0.5 md:w-max md:flex">
          <TabsTrigger value="dashboard" className="whitespace-nowrap rounded-md px-2 py-1 text-xs md:px-3 md:py-1.5 md:text-sm">Dashboard</TabsTrigger>
          <TabsTrigger value="historico" className="whitespace-nowrap rounded-md px-2 py-1 text-xs md:px-3 md:py-1.5 md:text-sm"><span className="md:hidden">24h</span><span className="hidden md:inline">Histórico 24h</span></TabsTrigger>
          <TabsTrigger value="orfas" className="whitespace-nowrap rounded-md px-2 py-1 text-xs md:px-3 md:py-1.5 md:text-sm">Órfãs</TabsTrigger>
          <TabsTrigger value="install" className="whitespace-nowrap rounded-md px-2 py-1 text-xs md:px-3 md:py-1.5 md:text-sm"><span className="md:hidden">Instalar</span><span className="hidden md:inline">Como instalar</span></TabsTrigger>
        </TabsList>



        <TabsContent value="dashboard" className="space-y-6">
          {/* Hero: globo agregado + KPIs gerais */}
          {players.length === 0 ? (
            <Card className="rounded-xl">
              <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
                <Radio className="h-10 w-10 text-muted-foreground/50" />
                <div className="text-muted-foreground">Nenhum viewer assistindo agora.</div>
                <div className="text-xs text-muted-foreground/70 max-w-md">
                  Quando alguém abrir uma VSL com o snippet instalado, ela aparece aqui em tempo real.
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <HeroGlobeCard
                snapshot={snapshot!}
                bucketDefs={bucketDefs}
                bucketsCfg={bucketsCfg}
                setBucketsCfg={setBucketsCfg}
                resetBuckets={resetBuckets}
              />

              {/* Feed ao vivo: conversão, leads e top campanhas */}
              <Card className="rounded-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio className="h-4 w-4 text-destructive" />
                    Feed ao vivo · UTMs · Sessões · Checkouts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ConversionSummaryCard summary={summary24h} />
                  <LiveLeadsFeed
                    filters={filters}
                    active={!theaterOpen}
                    onLeadsLoaded={setLeadsFeed}
                    onAdsLoaded={setAdsOptions}
                    onProductsLoaded={setProductOptions}
                    onTopCampaignsLoaded={setTopCampaigns}
                    onSummaryLoaded={setSummary24h}
                  />
                  <TopCampaignsCard campaigns={topCampaigns} />
                </CardContent>
              </Card>

              {/* Compact rows por VSL */}
              <Card className="rounded-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>VSLs ativas ({players.length})</span>
                    <DensityLegend />
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Critério: heartbeat ≤ 3 min e exit_reason = active · {total} viewer{total === 1 ? "" : "s"} ao vivo agora
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {players.map((p) => <PlayerRow key={p.player_id} player={p} totalViewers={total} onClick={() => openDrill(p.player_id, p.player_name)} onOpenSales={() => openSalesDrill(p.player_id, p.player_name)} />)}
                  </div>
                </CardContent>
              </Card>

              {/* VSLs inativas no momento (com tráfego nas últimas N horas, mas zero viewers agora) */}
              {viewMode !== "active" && (
                <InactivePlayersCard
                  items={snapshot?.inactive_players ?? []}
                  windowHours={snapshot?.inactive_window_hours ?? windowHours}
                />
              )}


              {/* Tempo na sessão por VSL */}
              <SessionDurationByPlayerCard players={players} bucketDefs={bucketDefs} onSelectPlayer={openDrill} />

              {/* Comparação lado a lado entre 2 VSLs */}
              <CompareTwoPlayersCard players={players} bucketDefs={bucketDefs} />

              {/* Sprint E · Breakdown por device */}
              <DeviceBreakdownCard funnel={snapshot?.device_funnel} total={total} />

              {/* Sprint E · Curva de retenção ao vivo por VSL */}
              <LiveRetentionCurveCard players={players} />
            </>
          )}

          {/* Sprint E · Heatmap 24×7 (independente de ter viewers ativos agora) */}
          <LiveViewersHeatmapCard filters={filters} />

          {/* Trend chart */}
          <Card className="rounded-xl">
            <CardHeader><CardTitle className="text-sm">Viewers concorrentes (últimas 24h)</CardTitle></CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshot?.concurrent_series ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip labelFormatter={(v) => new Date(v as string).toLocaleString()} />
                  <Line type="monotone" dataKey="viewers" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
          <ConversionSummaryCard summary={summary24h} />
          <LiveHistoryTab filters={filters} />
        </TabsContent>

        <TabsContent value="orfas" className="space-y-6">
          <OrphanSalesTab />
        </TabsContent>

        <TabsContent value="install">
          <InstallGuide />
        </TabsContent>
      </Tabs>

      <PlayerHistoryDialog
        open={!!drillPlayer}
        onOpenChange={(v) => { if (!v) setDrillPlayer(null); }}
        playerId={drillPlayer?.id ?? null}
        playerName={drillPlayer?.name ?? null}
        bucketDefs={bucketDefs}
      />

      <PlayerSalesDialog
        open={!!salesDrillPlayer}
        onOpenChange={(v) => { if (!v) setSalesDrillPlayer(null); }}
        playerId={salesDrillPlayer?.id ?? null}
        playerName={salesDrillPlayer?.name ?? null}
      />
    </div>
  );
}

function HeroGlobeCard({
  snapshot,
  bucketDefs,
  bucketsCfg,
  setBucketsCfg,
  resetBuckets,
}: {
  snapshot: Snapshot;
  bucketDefs: ReturnType<typeof bucketsFromConfig>;
  bucketsCfg: import("@/components/live/durationBuckets").DurationBucketsConfig;
  setBucketsCfg: (cfg: import("@/components/live/durationBuckets").DurationBucketsConfig) => void;
  resetBuckets: () => void;
}) {
  const total = snapshot.total_viewers;
  const dev = snapshot.by_device;
  const devTotal = dev.mobile + dev.desktop + dev.tablet || 1;
  const pitchPct = total ? Math.round((snapshot.viewers_at_pitch / total) * 100) : 0;
  const ctaPct = total ? Math.round((snapshot.viewers_at_cta / total) * 100) : 0;
  const mobilePct = Math.round((dev.mobile / devTotal) * 100);
  const [palette, paletteId, setPaletteId] = useGlobePalette();
  const globalBuckets = useMemo(() => bucketize(snapshot.session_seconds, bucketDefs), [snapshot.session_seconds, bucketDefs]);
  const { activeAlert } = useRetentionAlerts({
    scope: "global",
    scopeLabel: "Audiência global",
    buckets: globalBuckets,
    total,
  });

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* Globo grande */}
          <div className="flex flex-col items-center justify-start gap-3 w-full">
            <div className="relative w-full max-w-[520px]">
              <ViewerGlobe locations={snapshot.by_country} size={520} palette={palette} />
              {/* Contador overlay */}
              <div className="absolute top-2 left-2 flex items-center gap-2 bg-background/70 backdrop-blur px-3 py-1.5 rounded-full border">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
                </span>
                <span className="text-xs font-medium">AO VIVO</span>
              </div>
              {/* Seletor de paleta */}
              <div className="absolute top-2 right-2">
                <GlobePaletteSelector currentId={paletteId} onSelect={setPaletteId} />
              </div>
            </div>
            {/* Legenda do globo (logo abaixo) */}
            <div className="w-full max-w-[520px] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-background/70 backdrop-blur px-3 py-1.5 rounded-md border text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary))]" />
                Pin = localização ao vivo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex items-end gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                  <span className="h-2 w-2 rounded-full bg-primary/85" />
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                Tamanho = nº de viewers
              </span>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full border border-primary/60 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary m-auto" />
                </span>
                Anel = atividade em tempo real
              </span>
            </div>
          </div>

          {/* KPIs sidebar */}
          <div className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Viewers totais</div>
              <div className="text-5xl font-bold tabular-nums leading-none">{total}</div>
              <div className="text-xs text-muted-foreground mt-1">em {snapshot.players.length} {snapshot.players.length === 1 ? "VSL ativa" : "VSLs ativas"}</div>
            </div>

            {/* Top 3 países/estados */}
            <div>
              <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <MapPin className="h-3 w-3" /> Top localizações
              </div>
              {snapshot.by_country.length === 0 ? (
                <div className="text-xs text-muted-foreground">Sem geo data</div>
              ) : (
                <div className="space-y-1.5">
                  {snapshot.by_country.slice(0, 3).map((c, i) => {
                    const geo = resolveGeo(c.country, c.state);
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-base leading-none">{flagEmoji(geo?.iso2)}</span>
                        <span className="flex-1 truncate">{c.state || c.country}</span>
                        <span className="tabular-nums font-medium">{c.count}</span>
                        <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">{c.pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mini funil */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Funil agregado</div>
              <div className="flex items-stretch gap-1">
                <FunnelStep label="Started" value={total} active />
                <FunnelStep label={`Pitch (${pitchPct}%)`} value={snapshot.viewers_at_pitch} reference={total} />
                <FunnelStep label={`CTA (${ctaPct}%)`} value={snapshot.viewers_at_cta} reference={total} highlight />
              </div>
            </div>

            {/* Tempo na sessão */}
            <SessionDurationBreakdown
              buckets={globalBuckets}
              total={total}
              avgSecs={snapshot.avg_session_seconds}
              medianSecs={snapshot.median_session_seconds}
              alert={activeAlert}
              configSlot={
                <DurationBucketsConfigDialog
                  config={bucketsCfg}
                  onChange={setBucketsCfg}
                  onReset={resetBuckets}
                />
              }
            />

            {/* Device split rapido */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-3">
              <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" />{dev.mobile}</span>
              <span className="flex items-center gap-1"><Monitor className="h-3 w-3" />{dev.desktop}</span>
              <span className="flex items-center gap-1"><Tablet className="h-3 w-3" />{dev.tablet}</span>
              <span className="ml-auto">{mobilePct}% mobile</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function fmtSecs(s?: number) {
  if (!s || s <= 0) return "0s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function SessionDurationBreakdown({
  buckets,
  total,
  avgSecs,
  medianSecs,
  alert,
  configSlot,
}: {
  buckets: BucketCounts[];
  total: number;
  avgSecs?: number;
  medianSecs?: number;
  alert?: import("@/components/live/useRetentionAlerts").RetentionAlert | null;
  configSlot?: React.ReactNode;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div>
      {alert && (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="leading-tight">
            <div className="font-semibold">Retenção caindo (Δ {alert.delta} pp)</div>
            <div className="text-destructive/80">
              {alert.shortLabel} {alert.shortPctBase}% → <span className="font-semibold">{alert.shortPctNow}%</span> · {alert.longLabel} {alert.longPctBase}% → <span className="font-semibold">{alert.longPctNow}%</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tempo na sessão
        </div>
        <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
          <span>média <span className="text-foreground font-semibold">{fmtSecs(avgSecs)}</span></span>
          <span className="opacity-50">·</span>
          <span>mediana <span className="text-foreground font-semibold">{fmtSecs(medianSecs)}</span></span>
          {configSlot}
        </div>
      </div>
      <div className="space-y-1.5">
        {buckets.map((b) => {
          const pct = total ? Math.round((b.count / total) * 100) : 0;
          const widthPct = (b.count / max) * 100;
          return (
            <div key={b.key} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-muted-foreground tabular-nums truncate">{b.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", b.count > 0 ? "bg-primary" : "bg-transparent")}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="w-7 text-right tabular-nums font-medium">{b.count}</span>
              <span className="w-9 text-right tabular-nums text-muted-foreground">{pct}%</span>
              <span className="w-12 text-right tabular-nums text-muted-foreground/80" title="Tempo médio do bucket">
                {b.count > 0 ? `~${fmtSecs(b.avgSecs)}` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function bucketColor(i: number, n: number): string {
  if (n <= 1) return "hsl(var(--primary))";
  if (i === 0) return "hsl(var(--muted-foreground))";
  if (i === n - 1) return "hsl(var(--destructive))";
  // intermediate gradient on primary
  const t = (i / (n - 1));
  const opacity = 0.4 + t * 0.6;
  return `hsl(var(--primary) / ${opacity.toFixed(2)})`;
}

function SessionDurationByPlayerCard({
  players,
  bucketDefs,
  onSelectPlayer,
}: {
  players: PlayerSnapshot[];
  bucketDefs: ReturnType<typeof bucketsFromConfig>;
  onSelectPlayer?: (id: string, name: string | null) => void;
}) {
  const [mode, setMode] = useState<"abs" | "pct">("pct");
  const [selected, setSelected] = useState<Set<string> | null>(null); // null = todas
  const [filterOpen, setFilterOpen] = useState(false);

  const allIds = useMemo(() => players.map((p) => p.player_id), [players]);

  // Limpa seleção de IDs que não existem mais
  useEffect(() => {
    if (!selected) return;
    const valid = new Set(allIds);
    const filtered = new Set(Array.from(selected).filter((id) => valid.has(id)));
    if (filtered.size !== selected.size) setSelected(filtered.size === 0 ? null : filtered);
  }, [allIds, selected]);

  const visiblePlayers = useMemo(() => {
    if (!selected || selected.size === 0) return players;
    return players.filter((p) => selected.has(p.player_id));
  }, [players, selected]);

  const playerBucketsMap = useMemo(() => {
    const m = new Map<string, BucketCounts[]>();
    for (const p of visiblePlayers) m.set(p.player_id, bucketize(p.session_seconds, bucketDefs));
    return m;
  }, [visiblePlayers, bucketDefs]);

  const data = useMemo(() => {
    return visiblePlayers
      .map((p) => {
        const buckets = playerBucketsMap.get(p.player_id) ?? [];
        const totalDur = buckets.reduce((s, b) => s + b.count, 0) || 1;
        const row: Record<string, number | string> = {
          name: (p.player_name || p.player_id).slice(0, 22),
          fullName: p.player_name || p.player_id,
          total: p.count,
          avgSecs: p.avg_session_seconds ?? 0,
          medianSecs: p.median_session_seconds ?? 0,
        };
        for (const b of buckets) {
          row[b.key] = mode === "pct" ? Math.round((b.count / totalDur) * 1000) / 10 : b.count;
          row[`${b.key}_avg`] = b.avgSecs;
          row[`${b.key}_label`] = b.label;
        }
        return row;
      })
      .sort((a, b) => (b.total as number) - (a.total as number));
  }, [visiblePlayers, mode, playerBucketsMap, bucketDefs]);

  if (players.length === 0) return null;

  const selectedCount = selected?.size ?? 0;
  const filterLabel = !selected || selected.size === 0
    ? `Todas (${players.length})`
    : `${selectedCount} selecionada${selectedCount === 1 ? "" : "s"}`;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const base = new Set(prev ?? []);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span>Tempo na sessão por VSL</span>
          <div className="flex flex-wrap items-center gap-1">
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1.5">
                  <Filter className="h-3 w-3" />
                  {filterLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-2">
                <div className="flex items-center justify-between px-1 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">VSLs</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setSelected(new Set(allIds))}>Todas</Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setSelected(null)}>Limpar</Button>
                  </div>
                </div>
                <div className="max-h-[260px] overflow-y-auto space-y-0.5">
                  {players
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((p) => {
                      const checked = !selected ? false : selected.has(p.player_id);
                      const name = p.player_name || p.player_id;
                      return (
                        <label
                          key={p.player_id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/60 cursor-pointer text-xs"
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggle(p.player_id)} />
                          <span className="flex-1 truncate" title={name}>{name}</span>
                          <span className="text-muted-foreground tabular-nums">{p.count}</span>
                        </label>
                      );
                    })}
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex gap-1">
              <Button size="sm" variant={mode === "pct" ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setMode("pct")}>%</Button>
              <Button size="sm" variant={mode === "abs" ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setMode("abs")}>Abs</Button>
            </div>
          </div>
        </CardTitle>
        <PlayerRetentionAlertsBar players={visiblePlayers} bucketsByPlayer={playerBucketsMap} />
      </CardHeader>
      <CardContent className="h-[320px]">
        {visiblePlayers.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Nenhuma VSL selecionada.
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 16, left: 8, bottom: 5 }}
            stackOffset={mode === "pct" ? "expand" : undefined}
            onClick={(e: any) => {
              const fullName = e?.activePayload?.[0]?.payload?.fullName as string | undefined;
              if (!fullName || !onSelectPlayer) return;
              const target = visiblePlayers.find((p) => (p.player_name || p.player_id) === fullName);
              if (target) onSelectPlayer(target.player_id, target.player_name);
            }}
            style={onSelectPlayer ? { cursor: "pointer" } : undefined}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (mode === "pct" ? `${Math.round((v as number) * 100)}%` : String(v))}
              domain={mode === "pct" ? [0, 1] : undefined}
            />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(value: number, name: string, item: any) => {
                const label = item?.payload?.[`${name}_label`] as string | undefined;
                const avg = item?.payload?.[`${name}_avg`] as number | undefined;
                const main = mode === "pct" ? `${value}%` : `${value} viewers`;
                return [`${main}${avg ? ` · média ${fmtSecs(avg)}` : ""}`, label ?? name];
              }}
              labelFormatter={(_, payload) => {
                const p: any = payload?.[0]?.payload;
                if (!p) return "";
                return `${p.fullName}  ·  média ${fmtSecs(p.avgSecs)}  ·  mediana ${fmtSecs(p.medianSecs)}`;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => bucketDefs.find((b) => b.key === value)?.label ?? value} />
            {bucketDefs.map((b, i) => (
              <Bar key={b.key} dataKey={b.key} stackId="dur" fill={bucketColor(i, bucketDefs.length)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function CompareTwoPlayersCard({
  players,
  bucketDefs,
}: {
  players: PlayerSnapshot[];
  bucketDefs: ReturnType<typeof bucketsFromConfig>;
}) {
  const sorted = useMemo(() => [...players].sort((a, b) => b.count - a.count), [players]);
  const [aId, setAId] = useState<string | undefined>(sorted[0]?.player_id);
  const [bId, setBId] = useState<string | undefined>(sorted[1]?.player_id ?? sorted[0]?.player_id);
  const [mode, setMode] = useState<"pct" | "abs">("abs");

  useEffect(() => {
    if (!aId && sorted[0]) setAId(sorted[0].player_id);
    if (!bId && sorted[1]) setBId(sorted[1].player_id);
  }, [sorted, aId, bId]);

  const pA = useMemo(() => players.find((p) => p.player_id === aId) ?? null, [players, aId]);
  const pB = useMemo(() => players.find((p) => p.player_id === bId) ?? null, [players, bId]);

  const bucketsA = useMemo(() => bucketize(pA?.session_seconds, bucketDefs), [pA, bucketDefs]);
  const bucketsB = useMemo(() => bucketize(pB?.session_seconds, bucketDefs), [pB, bucketDefs]);

  const totalA = bucketsA.reduce((s, b) => s + b.count, 0);
  const totalB = bucketsB.reduce((s, b) => s + b.count, 0);

  const data = useMemo(() => {
    return bucketDefs.map((d, i) => {
      const a = bucketsA[i];
      const b = bucketsB[i];
      const aCount = a?.count ?? 0;
      const bCount = b?.count ?? 0;
      const aPct = totalA ? Math.round((aCount / totalA) * 1000) / 10 : 0;
      const bPct = totalB ? Math.round((bCount / totalB) * 1000) / 10 : 0;
      const aVal = mode === "pct" ? aPct : aCount;
      const bVal = mode === "pct" ? bPct : bCount;
      return {
        bucket: d.label,
        A: aVal,
        B: bVal,
        Acount: aCount,
        Bcount: bCount,
        Apct: aPct,
        Bpct: bPct,
        Aavg: a?.avgSecs ?? 0,
        Bavg: b?.avgSecs ?? 0,
        delta: Math.round((bVal - aVal) * 10) / 10,
      };
    });
  }, [bucketDefs, bucketsA, bucketsB, mode, totalA, totalB]);

  // ── Highlight ✨AGORA: faixa com mais movimento nos últimos 60s ───────────
  const histRef = useRef<{ t: number; counts: number[] }[]>([]);
  const [hotBucket, setHotBucket] = useState<string | null>(null);
  const signature = data.map((d) => `${d.Acount}/${d.Bcount}`).join("|");

  useEffect(() => {
    const now = Date.now();
    const counts = data.map((d) => d.Acount + d.Bcount);
    const hist = histRef.current;
    hist.push({ t: now, counts });
    while (hist.length > 1 && now - hist[0].t > 60_000) hist.shift();

    const base = hist[0]?.counts ?? counts;
    let bestIdx = -1;
    let bestMove = 0;
    counts.forEach((c, i) => {
      const move = Math.abs(c - (base[i] ?? 0));
      if (move > bestMove) { bestMove = move; bestIdx = i; }
    });
    if (bestIdx < 0 || bestMove === 0) {
      // fallback: faixa com mais gente agora
      let maxC = 0;
      counts.forEach((c, i) => { if (c > maxC) { maxC = c; bestIdx = i; } });
      if (maxC === 0) bestIdx = -1;
    }
    setHotBucket(bestIdx >= 0 ? data[bestIdx].bucket : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Escala Y dinâmica: max = maior barra × 1.1, arredondado pro grid
  const yMax = useMemo(() => {
    const peak = Math.max(0, ...data.map((d) => Math.max(d.A, d.B)));
    if (mode === "pct") return Math.min(100, Math.ceil((peak * 1.1) / 10) * 10) || 10;
    const raw = peak * 1.1;
    const step = raw <= 20 ? 5 : raw <= 100 ? 10 : 25;
    return Math.max(step, Math.ceil(raw / step) * step);
  }, [data, mode]);

  if (players.length < 2) return null;

  const nameA = pA?.player_name || pA?.player_id || "VSL A";
  const nameB = pB?.player_name || pB?.player_id || "VSL B";

  const INFO = "hsl(var(--wr-info))";

  // Shape da barra A: pinta + badge ✨AGORA flutuante sobre a barra da faixa quente
  const barAShape = (props: any) => {
    const { x, y, width, height, payload } = props;
    const isHot = hotBucket && payload.bucket === hotBucket;
    const overB = (payload.B ?? 0) > (payload.A ?? 0);
    const barX = overB ? x + width + 4 : x; // barra B tem mesma largura (+ barGap 4)
    const cx = barX + width / 2;
    const badgeY = Math.max(2, y - 26);
    const showBadge = isHot && ((payload.A ?? 0) > 0 || (payload.B ?? 0) > 0) && width > 0;
    return (
      <g>
        <rect x={x} y={y} width={width} height={Math.max(0, height)} fill="hsl(var(--primary))"
          fillOpacity={hotBucket && !isHot ? 0.55 : 1} rx={4}
          style={{ transition: "x 0.5s ease, y 0.5s ease, width 0.5s ease, height 0.5s ease, fill-opacity 0.3s ease" }} />
        {showBadge && (
          <g className="animate-pulse">
            <title>maior movimento nos últimos 60s nesta faixa</title>
            <rect x={cx - 38} y={badgeY} width={76} height={18} rx={9} fill="hsl(var(--primary))" />
            <polygon
              points={`${cx - 5},${badgeY + 17.5} ${cx + 5},${badgeY + 17.5} ${cx},${badgeY + 24}`}
              fill="hsl(var(--primary))"
            />
            <text x={cx} y={badgeY + 13} textAnchor="middle" fontSize={10} fontWeight={700}
              fill="hsl(var(--primary-foreground))">✨ AGORA</text>
          </g>
        )}
      </g>
    );
  };

  // Shape da barra B: pinta + aplica dim quando não é a faixa quente
  const barBShape = (props: any) => {
    const { x, y, width, height, payload } = props;
    const isHot = hotBucket && payload.bucket === hotBucket;
    return (
      <rect x={x} y={y} width={width} height={Math.max(0, height)} fill={INFO}
        fillOpacity={hotBucket && !isHot ? 0.55 : 1} rx={4}
        style={{ transition: "x 0.5s ease, y 0.5s ease, width 0.5s ease, height 0.5s ease, fill-opacity 0.3s ease" }} />
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <span>Comparar 2 VSLs · pessoas por faixa (ao vivo)</span>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={aId} onValueChange={setAId}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="VSL A" />
              </SelectTrigger>
              <SelectContent>
                {sorted.map((p) => (
                  <SelectItem key={`a-${p.player_id}`} value={p.player_id}>
                    {(p.player_name || p.player_id)} ({p.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-xs">vs</span>
            <Select value={bId} onValueChange={setBId}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="VSL B" />
              </SelectTrigger>
              <SelectContent>
                {sorted.map((p) => (
                  <SelectItem key={`b-${p.player_id}`} value={p.player_id}>
                    {(p.player_name || p.player_id)} ({p.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button size="sm" variant={mode === "pct" ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setMode("pct")}>%</Button>
              <Button size="sm" variant={mode === "abs" ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setMode("abs")}>Qtd</Button>
            </div>
          </div>
        </CardTitle>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(var(--primary))" }} />
            <span className="text-foreground font-medium truncate max-w-[200px]">{nameA}</span>
            <span>· {totalA} sessões · média {fmtSecs(pA?.avg_session_seconds)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(var(--wr-info))" }} />
            <span className="text-foreground font-medium truncate max-w-[200px]">{nameB}</span>
            <span>· {totalB} sessões · média {fmtSecs(pB?.avg_session_seconds)}</span>
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 34, right: 16, left: 0, bottom: 5 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="bucket"
                tick={(props: any) => {
                  const { x, y, payload } = props;
                  const hot = payload.value === hotBucket;
                  return (
                    <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fontWeight={hot ? 700 : 400}
                      fill={hot ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}>
                      {hot ? `✨ ${payload.value}` : payload.value}
                    </text>
                  );
                }}
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                domain={[0, yMax]}
                allowDecimals={false}
                tickFormatter={(v) => (mode === "pct" ? `${v}%` : String(v))}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(_value: number, name: string, item: any) => {
                  const p = item?.payload ?? {};
                  const isA = name === "A";
                  const count = isA ? p.Acount : p.Bcount;
                  const pct = isA ? p.Apct : p.Bpct;
                  const avg = isA ? p.Aavg : p.Bavg;
                  return [
                    `${count} ${count === 1 ? "pessoa" : "pessoas"} · ${pct}% do total do VSL · ~${fmtSecs(avg)}`,
                    isA ? nameA : nameB,
                  ];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "A" ? nameA : nameB)} />
              <Bar dataKey="A" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={false} shape={barAShape}>
                <LabelList dataKey="A" position="top" fontSize={11} className="fill-foreground"
                  formatter={(v: number) => (v ? (mode === "pct" ? `${v}%` : v) : "")} />
              </Bar>
              <Bar dataKey="B" fill={INFO} radius={[4, 4, 0, 0]} isAnimationActive={false} shape={barBShape}>
                <LabelList dataKey="B" position="top" fontSize={11} className="fill-foreground"
                  formatter={(v: number) => (v ? (mode === "pct" ? `${v}%` : v) : "")} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabela de delta por faixa */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="text-left font-medium py-1.5">Faixa</th>
                <th className="text-right font-medium py-1.5 truncate">{nameA}</th>
                <th className="text-right font-medium py-1.5 truncate">{nameB}</th>
                <th className="text-right font-medium py-1.5">Δ (B − A)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const positive = row.delta > 0;
                const negative = row.delta < 0;
                return (
                  <tr key={row.bucket} className="border-b border-border/50">
                    <td className="py-1.5 text-muted-foreground">{row.bucket}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {mode === "pct" ? `${row.A}%` : row.A} <span className="text-muted-foreground/70">({row.Acount})</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {mode === "pct" ? `${row.B}%` : row.B} <span className="text-muted-foreground/70">({row.Bcount})</span>
                    </td>
                    <td className={cn(
                      "py-1.5 text-right tabular-nums font-medium",
                      positive && "text-emerald-500",
                      negative && "text-destructive",
                      !positive && !negative && "text-muted-foreground",
                    )}>
                      {positive ? "+" : ""}{row.delta}{mode === "pct" ? " pp" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PlayerRow({ player, totalViewers, onClick, onOpenSales }: { player: PlayerSnapshot; totalViewers: number; onClick?: () => void; onOpenSales?: () => void }) {
  const dev = player.by_device;
  const devTotal = dev.mobile + dev.desktop + dev.tablet || 1;
  const mobilePct = Math.round((dev.mobile / devTotal) * 100);
  const sharePct = totalViewers ? Math.round((player.count / totalViewers) * 100) : 0;
  const top = player.by_country[0];
  const topGeo = top ? resolveGeo(top.country, top.state) : null;
  const ctaPct = player.count ? Math.round((player.viewers_at_cta / player.count) * 100) : 0;
  const pitchPct = player.count ? Math.round((player.viewers_at_pitch / player.count) * 100) : 0;
  const title = player.player_name || player.player_id;

  return (
    <div
      className={cn("px-4 py-3 hover:bg-muted/30 transition-colors", onClick && "cursor-pointer")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={onClick ? "Ver evolução do tempo na sessão hoje" : undefined}
    >
      <div className="grid grid-cols-12 gap-3 items-center text-sm">
        {/* Live indicator + count */}
        <div className="col-span-12 sm:col-span-2 flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
          </span>
          <span className="text-2xl font-bold tabular-nums">{player.count}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{sharePct}%</span>
        </div>

        {/* Title + product */}
        <div className="col-span-12 sm:col-span-4 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {player.product && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">
                {player.product}
              </span>
            )}
            <span className="font-mono text-xs truncate">{title}</span>
            {(player.sales_today ?? 0) > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenSales?.(); }}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                title="Ver vendas atribuídas a esta VSL"
              >
                💰 {player.sales_today} {(player.sales_today ?? 0) === 1 ? "venda" : "vendas"}
                <span className="opacity-70 ml-1">${Math.round(player.revenue_today_usd ?? 0)}</span>
              </button>
            )}
          </div>
        </div>


        {/* Top location */}
        <div className="col-span-6 sm:col-span-2 flex items-center gap-1.5 text-xs min-w-0">
          {top ? (
            <>
              <span className="text-base leading-none">{flagEmoji(topGeo?.iso2)}</span>
              <span className="truncate">{top.state || top.country}</span>
              <span className="text-muted-foreground tabular-nums">{top.pct}%</span>
            </>
          ) : <span className="text-muted-foreground">—</span>}
        </div>

        {/* Device */}
        <div className="col-span-6 sm:col-span-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Smartphone className="h-3 w-3" />
          <span className="tabular-nums">{mobilePct}%</span>
        </div>

        {/* Mini funnel: Pitch + CTA */}
        <div className="col-span-12 sm:col-span-3 flex items-center gap-1.5 text-xs">
          <FunnelChip label="Pitch" value={player.viewers_at_pitch} pct={pitchPct} />
          <FunnelChip label="CTA" value={player.viewers_at_cta} pct={ctaPct} highlight />
        </div>
      </div>
    </div>
  );
}

function KpiPill({ label, value, tone = "muted", term }: { label: string; value: string; tone?: "emerald" | "primary" | "muted" | "amber"; term?: string }) {
  const cls =
    tone === "emerald" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
    tone === "primary" ? "border-primary/30 bg-primary/10 text-primary" :
    tone === "amber" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" :
    "border-border bg-muted/40 text-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", cls)}>
      <span className="opacity-70 uppercase tracking-wider text-[9px]">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
      {term && <KpiHelpIcon term={term} className="ml-0.5" />}
    </span>
  );
}

function FunnelChip({ label, value, pct, highlight }: { label: string; value: number; pct: number; highlight?: boolean }) {

  return (
    <div className={cn(
      "flex-1 rounded border px-2 py-1 text-center min-w-0",
      highlight ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-muted/30",
    )}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none">{label}</div>
      <div className={cn(
        "text-sm font-bold tabular-nums leading-tight",
        highlight && "text-emerald-600 dark:text-emerald-400",
      )}>{value} <span className="text-[10px] font-normal text-muted-foreground">{pct}%</span></div>
    </div>
  );
}

function FunnelStep({ label, value, reference, active, highlight }: { label: string; value: number; reference?: number; active?: boolean; highlight?: boolean }) {
  const pct = reference ? Math.round((value / reference) * 100) : null;
  return (
    <div className={cn(
      "flex-1 rounded-md border p-2 text-center",
      active && "border-primary/30 bg-primary/5",
      highlight && "border-emerald-500/30 bg-emerald-500/5",
    )}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "text-lg font-bold tabular-nums",
        highlight && "text-emerald-600 dark:text-emerald-400",
        active && "text-primary",
      )}>{value}</div>
      {pct !== null && <div className="text-[10px] text-muted-foreground tabular-nums">{pct}%</div>}
    </div>
  );
}

function DensityLegend() {
  const buckets = [
    { label: "1–9", count: 5 },
    { label: "10–19", count: 15 },
    { label: "20–49", count: 30 },
    { label: "50–99", count: 70 },
    { label: "100+", count: 150 },
  ];
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="uppercase tracking-wider">Espectadores:</span>
      {buckets.map((b) => {
        const d = densityBucket(b.count);
        return (
          <div key={b.label} className="flex items-center gap-1">
            <span
              className="rounded-full bg-primary"
              style={{ width: 6 + d.size * 30, height: 6 + d.size * 30, opacity: d.alpha }}
            />
            <span>{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function InstallGuide() {
  const snippetUrl = `${window.location.origin}/tracking/live-viewers-snippet.js`;
  const tag = `<script src="${snippetUrl}" defer></script>
<meta name="player-id" content="SEU_PLAYER_ID">
<meta name="player-name" content="[ML-TOM] PITCH 33:13">
<meta name="pitch-second" content="1990">
<meta name="operation-slug" content="gtx-midia">
<meta name="product-slug" content="mmp">`;
  function copy() { navigator.clipboard.writeText(tag); toast.success("Snippet copiado"); }
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Como instalar nas suas VSLs</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">Adicione o snippet abaixo no <code>&lt;head&gt;</code> de cada página de VSL. Auto-detecta player VTurb e captura clickid/UTM/ad_id.</p>
        <div className="rounded-md border bg-muted/30 p-4 font-mono text-xs whitespace-pre-wrap break-all">{tag}</div>
        <Button onClick={copy} size="sm"><Copy className="mr-2 h-3 w-3" /> Copiar snippet</Button>
        <ul className="list-disc list-inside text-muted-foreground space-y-1 pt-2">
          <li><strong>player-id</strong> — ID único da VSL (se omitido, tenta auto-detectar via VTurb).</li>
          <li><strong>player-name</strong> — nome amigável exibido no painel.</li>
          <li><strong>pitch-second</strong> — segundo do vídeo onde começa o pitch (default 1990).</li>
          <li><strong>operation-slug</strong> — slug da sua operação (ex.: gtx-midia) para isolamento multitenant.</li>
          <li><strong>product-slug</strong> — código do produto (ex.: mmp, ndm, ghp). Permite filtrar por produto sem depender de regex no <code>utm_campaign</code>.</li>
        </ul>
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          <ChevronRight className="h-3 w-3" /> O snippet envia heartbeat a cada 15s. Viewers sem heartbeat por +30s viram <code>timeout</code>.
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Per-VSL retention alerts =====
function PlayerRetentionAlertsBar({
  players,
  bucketsByPlayer,
}: {
  players: PlayerSnapshot[];
  bucketsByPlayer: Map<string, BucketCounts[]>;
}) {
  const top = players.slice(0, 8);
  const [activeAlerts, setActiveAlerts] = useState<Record<string, import("@/components/live/useRetentionAlerts").RetentionAlert | null>>({});
  const handleChange = (id: string, alert: import("@/components/live/useRetentionAlerts").RetentionAlert | null) => {
    setActiveAlerts((prev) => {
      if (prev[id] === alert) return prev;
      return { ...prev, [id]: alert };
    });
  };
  const alerts = top.map((p) => ({ player: p, alert: activeAlerts[p.player_id] })).filter((x) => x.alert);
  return (
    <>
      {top.map((p) => (
        <PlayerRetentionWatcher
          key={p.player_id}
          player={p}
          buckets={bucketsByPlayer.get(p.player_id) ?? []}
          onChange={(a) => handleChange(p.player_id, a)}
        />
      ))}
      {alerts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alerts.map(({ player, alert }) => (
            <span
              key={player.player_id}
              className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
              title={`${alert!.shortLabel} ${alert!.shortPctBase}% → ${alert!.shortPctNow}% · ${alert!.longLabel} ${alert!.longPctBase}% → ${alert!.longPctNow}%`}
            >
              <AlertTriangle className="h-3 w-3" />
              {(player.player_name || player.player_id).slice(0, 18)} · Δ {alert!.delta}pp
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function PlayerRetentionWatcher({
  player,
  buckets,
  onChange,
}: {
  player: PlayerSnapshot;
  buckets: BucketCounts[];
  onChange: (alert: import("@/components/live/useRetentionAlerts").RetentionAlert | null) => void;
}) {
  const { activeAlert } = useRetentionAlerts({
    scope: `player:${player.player_id}`,
    scopeLabel: player.player_name || player.player_id,
    buckets,
    total: player.count,
  });
  useEffect(() => {
    onChange(activeAlert);
  }, [activeAlert, onChange]);
  return null;
}

function InactivePlayersCard({ items, windowHours }: { items: InactivePlayer[]; windowHours: number }) {
  if (!items.length) return null;
  const fmtRel = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diffMs / 60000);
    if (m < 1) return "agora";
    if (m < 60) return `há ${m}min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `há ${h}h${rest}m` : `há ${h}h`;
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
            VSLs inativas no momento ({items.length})
          </span>
          <span className="text-[10px] font-normal text-muted-foreground">
            com tráfego nas últimas {windowHours}h, 0 viewers agora
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {items.map((p) => (
            <div
              key={p.player_id}
              className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm hover:bg-muted/30"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">
                  {p.player_name || p.player_id}
                </div>
                {p.product && (
                  <div className="text-[10px] text-muted-foreground truncate">{p.product}</div>
                )}
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {p.viewers_window} viewer{p.viewers_window === 1 ? "" : "s"} na janela
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap min-w-[80px] text-right">
                {fmtRel(p.last_seen_at)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
