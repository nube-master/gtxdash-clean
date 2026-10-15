import { useMemo, useState, useCallback } from "react";
import { DataEmptyState } from "@/components/DataEmptyState";
import { Loader2, RefreshCw, Play, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useVslData } from "@/hooks/useVslData";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VslKpiCards } from "@/components/vsl/VslKpiCards";
import { VslFunnel } from "@/components/vsl/VslFunnel";
import { VslRetentionChart } from "@/components/vsl/VslRetentionChart";
import { VslPerformanceTable } from "@/components/vsl/VslPerformanceTable";

interface AggregatedVsl {
  id: string;
  name: string;
  views: number;
  unique: number;
  retention: number;
  weightedRetention: number;
  btnClicks: number;
  checkout: number;
  revenue: number;
  count: number;
}

function aggregateVslData(vslData: any[]): AggregatedVsl[] {
  if (!vslData?.length) return [];
  const map = new Map<string, AggregatedVsl>();
  for (const v of vslData) {
    if (!map.has(v.video_id)) {
      map.set(v.video_id, { 
        id: v.video_id, 
        name: v.video_name, 
        views: 0, 
        unique: 0, 
        retention: 0, 
        weightedRetention: 0, 
        btnClicks: 0, 
        checkout: 0, 
        revenue: 0, 
        count: 0 
      });
    }
    const m = map.get(v.video_id)!;
    if (!m.name || m.name.startsWith("Player ")) m.name = v.video_name;
    
    m.views += Number(v.total_views || 0);
    m.unique += Number(v.unique_views || 0);
    // Retention rate is stored as a percentage (e.g., 28.0)
    m.weightedRetention += Number(v.total_views || 0) * Number(v.retention_rate || 0);
    m.btnClicks += Number(v.button_clicks || 0);
    m.checkout += Number(v.checkout_clicks || 0);
    m.revenue += Number(v.revenue || 0);
    m.count++;
  }
  return Array.from(map.values()).map((m) => ({
    ...m,
    retention: m.views > 0 ? m.weightedRetention / m.views : 0,
  }));
}

export default function Vsls() {
  const { data: vslData, isLoading: vslLoading } = useVslData();
  
  const { dateRange } = useDateRange();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const aggregated = useMemo(() => aggregateVslData(vslData || []), [vslData]);

  const allSelected = selectedIds.size === 0; // empty = all selected

  const toggleVsl = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelectedIds(new Set()), []);

  const filteredAggregated = useMemo(() => {
    if (allSelected) return aggregated;
    return aggregated.filter((v) => selectedIds.has(v.id));
  }, [aggregated, selectedIds, allSelected]);

  const currentVsl = useMemo(() => {
    const source = filteredAggregated;
    return source.reduce(
      (acc, v) => ({
        views: acc.views + v.views,
        unique: acc.unique + v.unique,
        // Weight retention by total plays for accurate weighted average
        weightedRetentionSum: acc.weightedRetentionSum + (v.views * v.retention),
        btnClicks: acc.btnClicks + v.btnClicks,
        checkout: acc.checkout + v.checkout,
        revenue: acc.revenue + v.revenue,
      }),
      { views: 0, unique: 0, weightedRetentionSum: 0, btnClicks: 0, checkout: 0, revenue: 0 }
    );
  }, [filteredAggregated]);

  // Weighted average retention: sum(total_plays * retention%) / sum(total_plays)
  // Matching Overview.tsx and VslPerformanceTable.tsx
  const avgRetention = currentVsl.views > 0 ? currentVsl.weightedRetentionSum / currentVsl.views : 0;
  const audienceAtPitch = Math.round(currentVsl.views * (avgRetention / 100));
  const ctrButton = currentVsl.unique > 0 ? (currentVsl.btnClicks / currentVsl.unique) * 100 : 0;
  const conversionRate = currentVsl.unique > 0 ? (currentVsl.checkout / currentVsl.unique) * 100 : 0;

  const selectorLabel = allSelected
    ? "Todas as VSLs"
    : selectedIds.size === 1
      ? (aggregated.find((v) => selectedIds.has(v.id))?.name || "1 VSL")
      : `${selectedIds.size} VSLs selecionadas`;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await supabase.functions.invoke("sync-vturb");
      if (res.error) throw res.error;
      toast({ title: "Sincronização concluída!", description: `${res.data?.records || 0} registros atualizados.` });
      queryClient.invalidateQueries({ queryKey: ["vsl-data"] });
    } catch (err) {
      toast({ title: "Erro na sincronização", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  if (vslLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!aggregated.length) {
    return (
      <div className="space-y-6 full-width-page w-full">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Central de Performance de Vídeo</h1>
          <p className="text-xs text-muted-foreground font-data mt-0.5">Nenhum dado disponível</p>
        </div>
        <DataEmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6 full-width-page w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Central de Performance de Vídeo</h1>
          <p className="text-xs text-muted-foreground font-data mt-0.5">
            {filteredAggregated.length} de {aggregated.length} VSLs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-8 w-[280px] px-3 rounded-md text-xs border border-border bg-secondary/50 text-foreground flex items-center justify-between gap-2 hover:bg-secondary transition-colors truncate">
                <span className="truncate">{selectorLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0 z-50 bg-popover border border-border" align="end">
              <div className="max-h-[320px] overflow-y-auto">
                <button
                  onClick={selectAll}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-secondary/60 transition-colors border-b border-border ${allSelected ? "text-foreground font-medium" : "text-muted-foreground"}`}
                >
                  {allSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  {!allSelected && <span className="w-3.5" />}
                  Todas as VSLs
                </button>
                {aggregated.map((v) => {
                  const checked = selectedIds.has(v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() => toggleVsl(v.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-secondary/60 transition-colors text-left"
                    >
                      <Checkbox
                        checked={checked}
                        className="h-3.5 w-3.5 shrink-0 pointer-events-none"
                        tabIndex={-1}
                      />
                      <span className={`truncate ${checked ? "text-foreground" : "text-muted-foreground"}`}>
                        {v.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar
          </Button>
        </div>
      </div>

      {/* BLOCO 1 — KPIs */}
      <VslKpiCards
        uniqueViews={currentVsl.unique}
        totalPlays={currentVsl.views}
        retentionAtPitch={avgRetention}
        audienceAtPitch={audienceAtPitch}
        buttonClicks={currentVsl.btnClicks}
        ctrButton={ctrButton}
        conversions={currentVsl.checkout}
        conversionRate={conversionRate}
        revenue={currentVsl.revenue}
      />

      {/* BLOCO 2 — Funil de Conversão */}
      <VslFunnel
        uniqueViews={currentVsl.unique}
        totalPlays={currentVsl.views}
        audienceAtPitch={audienceAtPitch}
        buttonClicks={currentVsl.btnClicks}
        conversions={currentVsl.checkout}
      />

      {/* BLOCO 4 — Curva de Retenção */}
      <VslRetentionChart
        playerId={allSelected ? null : (selectedIds.size === 1 ? Array.from(selectedIds)[0] : null)}
        playerName={allSelected ? "" : (selectedIds.size === 1 ? (aggregated.find(a => selectedIds.has(a.id))?.name || "") : "")}
        startDate={dateRange[0]}
        endDate={dateRange[1]}
      />


      {/* BLOCO 5 — Tabela Comparativa */}
      <VslPerformanceTable data={filteredAggregated} startDate={dateRange[0]} endDate={dateRange[1]} />
    </div>
  );
}
