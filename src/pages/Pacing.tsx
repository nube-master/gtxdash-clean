import { useMemo, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { PacingDateRangeSelector } from "@/components/pacing/PacingDateRangeSelector";
import { PacingHeader } from "@/components/pacing/PacingHeader";
import { PacingCard } from "@/components/pacing/PacingCard";
import { CampaignTable } from "@/components/pacing/CampaignTable";
import { CampaignFilters, applyFilters, type FiltersState, type SortKey, DEFAULT_FILTERS } from "@/components/pacing/CampaignFilters";
import { CampaignDetailPanel } from "@/components/pacing/CampaignDetailPanel";
import { EventTimeline } from "@/components/pacing/EventTimeline";
import { RuleBuilder } from "@/components/pacing/RuleBuilder";
import { TriggerGlossary } from "@/components/pacing/TriggerGlossary";
import { KillSquadLogPanel } from "@/components/pacing/KillSquadLogPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaskConical } from "lucide-react";
import { TestAllRulesDialog } from "@/components/pacing/TestAllRulesDialog";
import { type PacingCampaign } from "@/components/pacing/mockData";
import { useLivePacingCampaigns, usePacingSalesMatchStats, type LivePacingRow } from "@/hooks/useLivePacingCampaigns";
import { usePacingICs } from "@/hooks/usePacingICs";
import { useLivePacingEvents } from "@/hooks/useLivePacingEvents";
import { usePacingRules } from "@/hooks/usePacingRules";
import { usePacingSettings } from "@/hooks/usePacingSettings";
import { useOfferTags } from "@/hooks/useOfferTags";
import { useLastPacingActions } from "@/hooks/useLastPacingActions";
import { useCampaignHourlyStatus } from "@/hooks/useCampaignHourlyStatus";
import { usePacingCooldowns } from "@/hooks/usePacingCooldowns";
import { useGtxMetaData, computeGtxDecision } from "@/hooks/useGtxMetaData";
import { useGtxThresholds } from "@/hooks/useGtxThresholds";
import { useProductMargins } from "@/hooks/useProductMargins";
import type { GtxOverlay } from "@/components/pacing/CampaignTable";
import { usePacingFullscreen } from "@/contexts/PacingFullscreenContext";
import { useCurrency, CURRENCY_META } from "@/contexts/CurrencyContext";
import { usePacingDateRange } from "@/contexts/PacingDateRangeContext";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { PacingMobileSummary } from "@/components/pacing/PacingMobileSummary";
import { supabase } from "@/integrations/supabase/client";
import { regionOfCampaign, killReason } from "@/lib/killSquad";

function toBrtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysISO(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function PacingPage() {
  const isMobile = useIsMobile();
  return isMobile ? <PacingMobileSummary /> : <PacingDesktop />;
}

function PacingDesktop() {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selected, setSelected] = useState<PacingCampaign | null>(null);
  const [testAllOpen, setTestAllOpen] = useState(false);
  const { enterFullscreen } = usePacingFullscreen();
  const isFullscreen = true;
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const navigate = useNavigate();
  const { settings: pacingSettings } = usePacingSettings();
  const { isToday, label: rangeLabel } = usePacingDateRange();
  const dryRun = !!pacingSettings?.dry_run_global;
  const hourlyWindowMode: "fixed" | "rolling" =
    pacingSettings?.hourly_window_mode === "rolling" ? "rolling" : "fixed";
  const { rules: allRules } = usePacingRules();
  const activeRulesCount = allRules.filter((r) => r.enabled).length;
  const { convertFromBRL, currency } = useCurrency();
  const currencyPrefix = `${CURRENCY_META[currency].symbol} `;

  // Fullscreen sempre ligado em /pacing — sem opção de sair
  useEffect(() => {
    enterFullscreen();
  }, [enterFullscreen]);


  const { data: campaigns, isLoading, error } = useLivePacingCampaigns();
  const { data: matchStats } = usePacingSalesMatchStats();
  const { data: offerTags = [] } = useOfferTags();
  const ruleNameById = useMemo(() => new Map(allRules.map((r) => [r.id, r.name])), [allRules]);
  const { events: liveEvents } = useLivePacingEvents({ limit: 50, ruleNameById });
  const { data: lastActionsByCampaign } = useLastPacingActions();
  const { campaigns: gtxCampaigns } = useGtxMetaData();
  const { score: scoreCfg } = useGtxThresholds();
  const list = campaigns ?? [];
  const fixed3DEndDate = useMemo(() => toBrtDate(new Date()), []);
  const fixed3DStartDate = useMemo(() => addDaysISO(fixed3DEndDate, -2), [fixed3DEndDate]);
  const { data: fixed3DRows = [] } = useQuery({
    queryKey: ["pacing-fixed-3d-totals", fixed3DStartDate, fixed3DEndDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_pacing_campaigns_for_range", {
        d_start: fixed3DStartDate,
        d_end: fixed3DEndDate,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
  // Index GTX por nome pra lookup O(1). Fonte de: scoreGtx, decision, 3D totals.
  const gtxIndex = useMemo(() => {
    const map = new Map<string, (typeof gtxCampaigns)[number]>();
    for (const r of gtxCampaigns) map.set(r.fullName, r);
    return map;
  }, [gtxCampaigns]);

  const fixed3DIndex = useMemo(() => {
    const map = new Map<string, LivePacingRow>();
    for (const r of fixed3DRows) {
      map.set(r.id, r);
      map.set(r.name, r);
    }
    return map;

  }, [fixed3DRows]);

  // Overlay por campanha da tabela ao vivo. Antes iterávamos gtxCampaigns
  // (que vem do DateRangeContext global — vazio às 00h BRT), então rows sem
  // gasto no range do dashboard viravam "—" mesmo tendo faturamento ao vivo.
  // Agora iteramos `list` (fonte real da tabela): sempre calcula lucro/margem
  // do próprio live e só deixa scoreGtx/3D vazios se o GTX genuinamente não
  // tem a campanha.
  const gtxByName = useMemo(() => {
    const map = new Map<string, GtxOverlay>();
    for (const c of list) {
      const r = gtxIndex.get(c.name);
      const fixed3D = fixed3DIndex.get(c.id) ?? fixed3DIndex.get(c.name);
      const hasGtx3D = !!r && (
        Math.abs(r.profit3DTotal ?? 0) > 0 ||
        (r.spend3DTotal ?? 0) > 0 ||
        (r.revenue3DTotal ?? 0) > 0
      );
      const fixedSpend3D = Number(fixed3D?.spend ?? 0);
      const fixedRevenue3D = Number(fixed3D?.revenue ?? 0);

      const hasFixed3D = fixedSpend3D > 0 || fixedRevenue3D > 0;
      const liveRevenue = c.revenue ?? r?.revenue ?? 0;
      const liveSpend = c.spend ?? r?.spend ?? 0;
      const liveProfit = liveRevenue - liveSpend;
      // Fallback chain: GTX 3D → fixed3D RPC → live range values (c.spend/c.revenue).
      // Isso garante que campanhas PAUSADAS com prejuízo real nos últimos 3d
      // (que aparecem em `list` mas não têm gtxIndex nem fixed3D) ainda tenham
      // profit3DTotal preenchido — filtro "Prejuízo 3D" precisa disso.
      const spend3DTotal = hasGtx3D ? r.spend3DTotal : (hasFixed3D ? fixedSpend3D : liveSpend);
      const revenue3DTotal = hasGtx3D ? r.revenue3DTotal : (hasFixed3D ? fixedRevenue3D : liveRevenue);
      const profit3DTotal = hasGtx3D
        ? r.profit3DTotal
        : (hasFixed3D ? (fixedRevenue3D - fixedSpend3D) : liveProfit);
      const sales3DCount = r ? (r.sales3D?.reduce((a, b) => a + b, 0) ?? 0) : 0;
      const cpa3D = sales3DCount > 0 ? spend3DTotal / sales3DCount : 0;
      map.set(c.name, {
        margin: liveRevenue > 0 ? (liveProfit / liveRevenue) * 100 : (r?.margin ?? 0),
        profit: liveProfit,
        profit3DTotal,
        spend3DTotal,
        revenue3DTotal,
        roas3D: spend3DTotal > 0 ? revenue3DTotal / spend3DTotal : (r?.roas3D ?? 0),
        scoreGtx: r?.scoreGtx ?? 0,
        decision: r ? computeGtxDecision(r).decision : "OBSERVAR",
        hasGtxSource: !!r,
        sales3DCount,
        cpa3D,
      });
    }
    return map;
  }, [fixed3DIndex, gtxIndex, list]);


  const handleSort = useCallback((key: import("@/components/pacing/CampaignFilters").SortKey) => {
    setFilters((prev) => ({
      ...prev,
      sort: key,
      sortDir: prev.sort === key ? (prev.sortDir === "desc" ? "asc" : "desc") : "desc",
    }));
  }, []);

  const { data: icByCampaign } = usePacingICs();
  const { data: hourlyStatusByCampaign } = useCampaignHourlyStatus();
  const { data: cooldownsByCampaign } = usePacingCooldowns();
  const filtered = useMemo(() => applyFilters(list, filters, offerTags, gtxByName, lastActionsByCampaign, icByCampaign, hourlyStatusByCampaign), [list, filters, offerTags, gtxByName, lastActionsByCampaign, icByCampaign, hourlyStatusByCampaign]);

  const kpis = useMemo(() => {
    const totalSpend = list.reduce((s, c) => s + c.spend, 0);
    const active = list.filter((c) => c.status !== "paused").length;
    const paused = list.filter((c) => c.status === "paused").length;
    return { spend: totalSpend, activeCount: active, pausedCount: paused, totalCount: list.length };
  }, [list]);

  // Contagem de candidatas Kill Squad + diagnóstico
  const killCounts = useMemo(() => {
    const diag = {
      eu: { candidates: 0, active: 0, withTag: 0, noSaleHit: 0, cpaHit: 0 },
      us: { candidates: 0, active: 0, withTag: 0, noSaleHit: 0, cpaHit: 0 },
    };
    for (const c of list) {
      const region = regionOfCampaign(c.name, offerTags);
      if (!region) continue;
      const d = diag[region];
      // Conta ativas + pausadas (kill squad rebate as duas)
      d.active++;
      const hasTop = /\[top\]|-\s*top\b/i.test(c.name);
      if (hasTop) d.withTag++;

      const g = gtxByName.get(c.name);
      const spend3d = g?.spend3DTotal ?? 0;
      const sales3d = g?.sales3DCount ?? 0;
      const cpa3d = g?.cpa3D ?? 0;
      const reason = killReason({ region, spend3d, sales3d, cpa3d, campaignName: c.name, status: c.status });
      if (hasTop) {
        const t = region === "eu" ? { s: 220, c: 400 } : { s: 800, c: 800 };
        if (sales3d <= 0 && spend3d >= t.s) d.noSaleHit++;
        if (sales3d > 0 && cpa3d > t.c) d.cpaHit++;
      }
      if (reason) d.candidates++;
    }

    return {
      eu: diag.eu.candidates,
      us: diag.us.candidates,
      diag,
    };
  }, [list, offerTags, gtxByName]);

  return (
    <div
      className={cn(
        "space-y-4 pb-10 px-4 md:px-6",
        isFullscreen && "full-width-page"
      )}
    >
      <div className="flex items-center justify-between">
        <PacingHeader onNewRule={() => setBuilderOpen(true)} title="Meta Ads" />
        <div className="flex items-center gap-2 ml-2">
          <PacingDateRangeSelector />
          <Button
            variant="default"
            size="sm"
            onClick={() => setTestAllOpen(true)}
            className="gap-1.5 text-xs"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Testar regras agora
          </Button>
        </div>

      </div>


      {dryRun ? (
        <div className="rounded border border-[hsl(var(--wr-warning))]/40 bg-[hsl(var(--wr-warning))]/10 px-3 py-2 text-xs text-[hsl(var(--wr-warning))]">
          ⚠️ Modo dry-run global ATIVO — daemon avalia campanhas a cada 2 min mas <b>não executa ações</b> no Meta. Desligue em /pacing/settings para ir ao vivo.
        </div>
      ) : (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-500 flex items-center justify-between">
          <span>
            ✅ Daemon <b>LIVE</b> — {activeRulesCount} regra(s) armada(s) executando ações reais no Meta a cada 2 min.
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-500 hover:text-emerald-400" onClick={() => navigate("/pacing/regras")}>
            Ver regras →
          </Button>
        </div>
      )}

      {matchStats && matchStats.total_sales > 0 && (
        <div className={`rounded border px-3 py-2 text-xs flex items-center justify-between ${
          matchStats.unmatched_sales === 0
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
            : "border-amber-500/40 bg-amber-500/10 text-amber-500"
        }`}>
          <span>
            Atribuição de vendas hoje: <b>{matchStats.matched_sales}/{matchStats.total_sales}</b> casadas
            <span className="opacity-70"> · {matchStats.matched_by_name} por nome + {matchStats.matched_by_rt} por ID RedTrack</span>
            {matchStats.unmatched_sales > 0 && ` · ${matchStats.unmatched_sales} sem match (${currencyPrefix}${convertFromBRL(Number(matchStats.unmatched_revenue)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) — campanhas deletadas no Meta`}
          </span>
          <span className="tabular-nums">
            {Math.round((matchStats.matched_sales / matchStats.total_sales) * 100)}%
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PacingCard label={isToday ? "Spend Hoje" : `Spend · ${rangeLabel}`} value={convertFromBRL(kpis.spend)} prefix={currencyPrefix} decimals={2} hero
          sparkline={[20, 35, 28, 42, 38, 55, 50, 68, 72, 78, 85, 92, 95, 100]} />
        <PacingCard label="Campanhas ATIVAS" value={kpis.activeCount}
          footer={`${kpis.pausedCount} pausadas · ${kpis.totalCount} total`} hero
          sparkline={[40, 42, 44, 43, 45, 46, 47, 47]} />
        <PacingCard label="Contas Conectadas" value={new Set(list.map((c) => c.account)).size}
          footer="via Meta API (CATALOG + HU)" hero
          sparkline={[10, 12, 14, 14, 13, 14, 14, 14]} sparkColor="hsl(var(--primary))" />
        <PacingCard label="Motor de Regras" value={dryRun ? 0 : 1} footer={dryRun ? "DRY-RUN · avalia a cada 2 min" : "AO VIVO · avalia a cada 2 min"} hero
          sparkline={[10, 12, 14, 14, 13, 14, 14, 14]} sparkColor="hsl(var(--wr-warning))" />
      </div>

      

      <div id="pacing-status-section" className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {isLoading ? "carregando…" : `${filtered.length} de ${list.length} campanhas · atualiza a cada 2 min`}
          </span>
        </div>
        <CampaignFilters campaigns={list} value={filters} onChange={setFilters} />
        {isLoading ? (
          <div className="space-y-2 mt-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error && list.length === 0 ? (
          <div className="mt-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            Erro ao carregar campanhas: {(error as Error).message}
            <div className="mt-1 opacity-70">Tentando reconectar automaticamente…</div>
          </div>
        ) : list.length === 0 ? (
          <div className="mt-4 rounded border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhuma campanha ativa encontrada nas contas conectadas via Meta API.
          </div>
        ) : (
          <CampaignTable
            campaigns={filtered}
            onSelect={(c) => setSelected(c)}
            selectedId={selected?.id ?? null}
            gtxByName={gtxByName}
            scoreThresholds={{ green: scoreCfg.green, yellow: scoreCfg.yellow }}
            rules={allRules}
            lastActions={lastActionsByCampaign}
            sortKey={filters.sort}
            sortDir={filters.sortDir}
            onSortChange={handleSort}
            icByCampaign={icByCampaign}
            hourlyStatusByCampaign={hourlyStatusByCampaign}
            hourlyWindowMode={hourlyWindowMode}
            cooldownsByCampaign={cooldownsByCampaign}
            ruleNameById={ruleNameById}
            isToday={isToday}
          />
        )}
      </div>


      {/* Row 3 — Events */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-3 bg-card border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Timeline de Eventos
            </h2>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/pacing/historico")}>
              Ver tudo →
            </Button>
          </div>
          <EventTimeline events={liveEvents} max={6} />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button variant="outline" className="w-full justify-start h-12" onClick={() => navigate("/pacing/regras")}>
          Gerenciar Regras
        </Button>
        <Button variant="outline" className="w-full justify-start h-12" onClick={() => navigate("/pacing/adsets")}>
          🎯 Lance & Meta (Adsets)
        </Button>
        <Button variant="outline" className="w-full justify-start h-12" onClick={() => navigate("/pacing/hierarchy")}>
          🗂️ Hierarquia (Campanha › Adset › Ad)
        </Button>
      </div>

      <div className="mt-8">
        <TriggerGlossary />
      </div>

      <RuleBuilder open={builderOpen} onOpenChange={setBuilderOpen} />
      <CampaignDetailPanel campaign={selected} allRules={allRules} onClose={() => setSelected(null)} />
      <TestAllRulesDialog
        open={testAllOpen}
        onClose={() => setTestAllOpen(false)}
        rules={allRules}
        campaigns={list}
      />
    </div>
  );
}
