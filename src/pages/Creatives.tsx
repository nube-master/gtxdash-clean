import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCreativeData, type CreativeGroupBy } from "@/hooks/useCreativeData";
import { useAuth } from "@/contexts/AuthContext";
import { useOfferProjects } from "@/hooks/useOfferProjects";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useOperationId } from "@/contexts/OperationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CreativeKpiCards } from "@/components/creatives/CreativeKpiCards";
import { CreativeFilters } from "@/components/creatives/CreativeFilters";
import { CreativeTable } from "@/components/creatives/CreativeTable";
import { CreativeLeaderboard } from "@/components/creatives/CreativeLeaderboard";
import { CreativeTeamLeaderboard } from "@/components/creatives/CreativeTeamLeaderboard";
import { CreativeAccuracyLeaderboard } from "@/components/creatives/CreativeAccuracyLeaderboard";
import { CreativeLibrary } from "@/components/creatives/CreativeLibrary";
import { CreativeAuditPanel } from "@/components/creatives/CreativeAuditPanel";
import { CreativeResolutionAudit } from "@/components/creatives/CreativeResolutionAudit";
import { CreativeTeamOverridesPanel } from "@/components/creatives/CreativeTeamOverridesPanel";
import { ReprocessSpendButton } from "@/components/creatives/ReprocessSpendButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bug, AlertTriangle, TableProperties, LayoutGrid } from "lucide-react";

const DATE_RANGE_LABELS: Record<string, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7": "Últimos 7 dias",
  "14": "Últimos 14 dias",
  "30": "Últimos 30 dias",
  custom: "Período personalizado",
};

type ViewMode = "performance" | "library";

export default function Creatives() {
  const { rangeKey } = useDateRange();
  const { isAdmin, user } = useAuth();
  // Registra apelidos de offers como tags de projeto reconhecidas pelo extractor
  // (mesma lógica usada em Analytics — sem isso tags como [MMP], [GHP] caem no fallback NDM)
  useOfferProjects();
  const { data: isSuperAdmin = false } = useSuperAdmin();
  const [search, setSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [filterTestMode, setFilterTestMode] = useState<"off" | "testing_no_sales" | "scale" | "f1">("off");
  const [filterPerson, setFilterPerson] = useState("all");
  const [showDebug, setShowDebug] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("performance");
  const [searchParams, setSearchParams] = useSearchParams();
  const sharedCreativeId = searchParams.get("creative");
  const operationId = useOperationId();

  // GroupBy toggle: per-operation preference in localStorage.
  // Default: EDD (Escola do Dólar) usa 'ad' pois nomenclatura não segue AD##/H##B##;
  // demais operações continuam agregando por creativeId.
  const ESCOLA_DO_DOLAR_OP = "1dd606e3-dac2-4064-b863-9784307c9e98";
  const groupByStorageKey = operationId ? `creatives:groupBy:${operationId}` : "creatives:groupBy:default";
  const defaultGroupBy: CreativeGroupBy = operationId === ESCOLA_DO_DOLAR_OP ? "ad" : "creative";
  const [groupBy, setGroupByState] = useState<CreativeGroupBy>(() => {
    if (typeof window === "undefined") return defaultGroupBy;
    const saved = window.localStorage.getItem(groupByStorageKey);
    return (saved === "ad" || saved === "creative") ? saved : defaultGroupBy;
  });
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(groupByStorageKey) : null;
    setGroupByState((saved === "ad" || saved === "creative") ? saved : defaultGroupBy);
  }, [groupByStorageKey, defaultGroupBy]);
  const setGroupBy = (v: CreativeGroupBy) => {
    setGroupByState(v);
    if (typeof window !== "undefined") window.localStorage.setItem(groupByStorageKey, v);
  };

  // Clear the URL param after it's been consumed
  const clearSharedCreative = () => {
    if (sharedCreativeId) {
      searchParams.delete("creative");
      setSearchParams(searchParams, { replace: true });
    }
  };

  const {
    creatives,
    allCount,
    isLoading,
    lastSync,
    syncing,
    syncNow,
    uniqueAccounts,
    debugInfo,
    integritySummary,
    uniquePeople,
  } = useCreativeData({ search, sortBy: "creativeScore", filterAccount, filterStatus, filterProject, filterTestMode, filterPerson, groupBy });

  const { data: debugSales } = useQuery({
    queryKey: ["debug-sales-confirmed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_data")
        .select("date, revenue, utm_campaign, utm_content, product_name, status")
        .gte("date", "2026-03-23")
        .eq("status", "confirmed")
        .order("date", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: showDebug && isAdmin,
  });

  const { data: debugTestTraffic } = useQuery({
    queryKey: ["debug-test-traffic"],
    queryFn: async () => {
      const { data } = await supabase
        .from("traffic_data")
        .select("date, campaign_name, ad_name, spend:spend_brl")
        .ilike("campaign_name", "%1-50-1%")
        .gte("date", "2026-03-23")
        .order("spend", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: showDebug && isAdmin,
  });

  const periodLabel = DATE_RANGE_LABELS[rangeKey] || "Período";

  const viewTabs: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "performance", label: "Performance", icon: <TableProperties className="h-3.5 w-3.5" /> },
    { key: "library", label: "Library", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="full-width-page space-y-5 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Creative Intelligence</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {allCount} criativos únicos • {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReprocessSpendButton />
          {/* View Mode Switcher */}
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
            {viewTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setViewMode(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          {/* Group By Switcher */}
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5" title="Como agrupar as linhas da tabela">
            {(["creative", "ad"] as CreativeGroupBy[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setGroupBy(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  groupBy === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "creative" ? "Por Criativo" : "Por Anúncio"}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowDebug((v) => !v)}
              className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border"
              title="Modo Debug (Admin)"
            >
              <Bug className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Admin Debug Panel */}
      {isAdmin && showDebug && debugInfo && (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Debug — Admin</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div>
                <span className="text-muted-foreground">Linhas Meta:</span>{" "}
                <span className="text-foreground font-semibold">{debugInfo.trafficRows}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Pedidos:</span>{" "}
                <span className="text-foreground font-semibold">{debugInfo.salesRows}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Vendas com ID:</span>{" "}
                <span className="text-primary font-semibold">{debugInfo.salesWithId}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Vendas SEM_ID:</span>{" "}
                <span className="text-destructive font-semibold">{debugInfo.salesWithoutId}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs font-mono mt-3 pt-3 border-t border-border">
              <div>
                <span className="text-muted-foreground">Spend BRL:</span>{" "}
                <span className="text-foreground font-semibold">R$ {debugInfo.totalSpendRawBrl.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Spend USD:</span>{" "}
                <span className="text-foreground font-semibold">$ {debugInfo.totalSpendRawUsd.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Spend total (BRL):</span>{" "}
                <span className="text-primary font-semibold">R$ {debugInfo.totalSpendConverted.toFixed(2)}</span>
              </div>
            </div>
            {debugInfo.unmatchedUtmSamples.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-mono text-muted-foreground mb-1">UTMs sem match:</p>
                <div className="flex flex-wrap gap-1.5">
                  {debugInfo.unmatchedUtmSamples.map((s, i) => (
                    <Badge key={i} variant="outline" className="font-mono text-[9px] text-muted-foreground">
                      {s.length > 60 ? s.slice(0, 60) + "…" : s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {/* Debug: Últimas vendas confirmadas */}
            {debugSales && debugSales.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Últimas vendas confirmadas (23/03–26/03)</p>
                <div className="space-y-1 text-[10px] font-mono">
                  {debugSales.map((s, i) => (
                    <div key={i} className="flex gap-3 text-muted-foreground">
                      <span className="text-foreground">{s.date}</span>
                      <span className="text-primary font-semibold">R$ {Number(s.revenue).toFixed(2)}</span>
                      <span className="truncate max-w-[200px]">{s.utm_content || "—"}</span>
                      <span className="truncate max-w-[150px]">{s.product_name || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Debug: Top traffic 1-50-1 */}
            {debugTestTraffic && debugTestTraffic.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Top 5 Traffic (1-50-1) desde 23/03</p>
                <div className="space-y-1 text-[10px] font-mono">
                  {debugTestTraffic.map((t, i) => (
                    <div key={i} className="flex gap-3 text-muted-foreground">
                      <span className="text-foreground">{t.date}</span>
                      <span className="text-primary font-semibold">R$ {Number(t.spend).toFixed(2)}</span>
                      <span className="truncate max-w-[250px]">{t.ad_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters — only for Performance view */}
      {viewMode === "performance" && (
        <CreativeFilters
          search={search}
          onSearchChange={setSearch}
          filterStatus={filterStatus}
          onStatusChange={setFilterStatus}
          filterProject={filterProject}
          onProjectChange={setFilterProject}
          filterTestMode={filterTestMode}
          onTestModeChange={setFilterTestMode}
          filterPerson={filterPerson}
          onPersonChange={setFilterPerson}
          uniquePeople={uniquePeople}
          testNoSalesCount={integritySummary.testNoSalesCount}
          scaleCount={integritySummary.scaleCount}
          f1Count={integritySummary.f1Count}
          f3Count={integritySummary.f3Count}
          syncing={syncing}
          lastSync={lastSync}
          onSyncNow={syncNow}
          isAdmin={isAdmin}
        />
      )}

      {/* KPI Cards */}
      <CreativeKpiCards creatives={creatives} isAdmin={isAdmin} />


      {/* Content */}
      {isLoading ? (
        <div className="text-center text-muted-foreground font-mono text-sm py-12">
          Carregando dados...
        </div>
      ) : (
        <>
          {viewMode === "performance" && (
            <CreativeTable creatives={creatives} isAdmin={isAdmin} sharedCreativeId={sharedCreativeId} onSharedCreativeConsumed={clearSharedCreative} filterTestMode={filterTestMode} />
          )}

          {viewMode === "library" && (
            <CreativeLibrary creatives={creatives} sharedCreativeId={sharedCreativeId} onSharedCreativeConsumed={clearSharedCreative} />
          )}

          {/* Leaderboard — always visible */}
          <CreativeLeaderboard creatives={creatives} />
          <CreativeTeamLeaderboard creatives={creatives} />
          <CreativeAccuracyLeaderboard creatives={creatives} />

          {/* Manual copy/editor overrides — restricted to super admin (admin master) only */}
          {viewMode === "performance" && isSuperAdmin && <CreativeTeamOverridesPanel isAdmin={true} />}
        </>
      )}

      {/* Audit panel — only for Gabriel Vidal, at the very bottom */}
      {viewMode === "performance" && (user?.email === "gabrielvidalvidal156@gmail.com" || user?.email === "gabrielvidal156@gmail.com") && (
        <CreativeAuditPanel creatives={creatives} />
      )}
    </div>
  );
}
