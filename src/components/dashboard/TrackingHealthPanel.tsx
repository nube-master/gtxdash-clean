import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Radar,
  CheckCircle,
  AlertTriangle,
  Crosshair,
  Wifi,
  WifiOff,
} from "lucide-react";

function pct(n: number, total: number) {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}

export function TrackingHealthPanel() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;

  const { data: auditData, isLoading } = useQuery({
    queryKey: ["tracking-health", start, end],
    queryFn: async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("clickbank_audit" as any)
          .select(
            "receipt, product_name, aff_sub2, aff_sub3, meta_campaign_id, key_used, affiliate, date"
          )
          .gte("date", start)
          .lte("date", end)
          .range(from, from + PAGE - 1);
        if (error) break;
        all = all.concat(data || []);
        hasMore = (data?.length || 0) === PAGE;
        from += PAGE;
      }
      return all;
    },
    refetchInterval: 120_000,
  });

  // Sync logs
  const { data: syncLogs } = useQuery({
    queryKey: ["tracking-sync-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_logs")
        .select("*")
        .eq("integration", "clickbank_api")
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    refetchInterval: 120_000,
  });

  const stats = useMemo(() => {
    const rows = auditData || [];
    const total = rows.length;

    // Tracking coverage
    const withSub2 = rows.filter((r: any) => r.aff_sub2).length;
    const withSub3 = rows.filter((r: any) => r.aff_sub3).length;
    const withAnySub = rows.filter(
      (r: any) => r.aff_sub2 || r.aff_sub3
    ).length;
    const withCampaignId = rows.filter((r: any) => r.meta_campaign_id).length;

    // Source breakdown
    const fromIPN = rows.filter((r: any) => r.key_used === "IPN").length;
    const fromAPI = rows.filter((r: any) => r.key_used === "API").length;
    const fromBoth = rows.filter(
      (r: any) => r.key_used !== "IPN" && r.key_used !== "API"
    ).length;

    // Per project
    const projects: Record<
      string,
      { total: number; tracked: number; withCampaign: number }
    > = {};
    for (const r of rows) {
      const p = (r as any).product_name || "Outros";
      if (!projects[p]) projects[p] = { total: 0, tracked: 0, withCampaign: 0 };
      projects[p].total++;
      if ((r as any).aff_sub2 || (r as any).aff_sub3) projects[p].tracked++;
      if ((r as any).meta_campaign_id) projects[p].withCampaign++;
    }

    // Per day tracking rate
    const byDay: Record<string, { total: number; tracked: number }> = {};
    for (const r of rows) {
      const d = (r as any).date;
      if (!byDay[d]) byDay[d] = { total: 0, tracked: 0 };
      byDay[d].total++;
      if ((r as any).aff_sub2 || (r as any).aff_sub3) byDay[d].tracked++;
    }

    return {
      total,
      withSub2,
      withSub3,
      withAnySub,
      withCampaignId,
      fromIPN,
      fromAPI,
      fromBoth,
      projects,
      byDay,
      trackingRate: pct(withAnySub, total),
      campaignRate: pct(withCampaignId, total),
    };
  }, [auditData]);

  if (isLoading || stats.total === 0) return null;

  const isGood = stats.trackingRate >= 80;
  const isMedium = stats.trackingRate >= 50 && stats.trackingRate < 80;

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Radar className="h-4 w-4 text-primary" />
          Saúde do Rastreamento ClickBank
          <Badge
            variant="outline"
            className={`ml-auto text-[10px] ${
              isGood
                ? "border-emerald-500/30 text-emerald-400"
                : isMedium
                ? "border-yellow-500/30 text-yellow-400"
                : "border-destructive/30 text-destructive"
            }`}
          >
            {isGood ? (
              <CheckCircle className="h-3 w-3 mr-1" />
            ) : (
              <AlertTriangle className="h-3 w-3 mr-1" />
            )}
            {stats.trackingRate}% rastreado
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Total Vendas"
            value={stats.total}
            icon={<Crosshair className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Com Tracking"
            value={stats.withAnySub}
            sub={`${stats.trackingRate}%`}
            icon={<Wifi className="h-3.5 w-3.5" />}
            color={isGood ? "text-emerald-400" : isMedium ? "text-yellow-400" : "text-destructive"}
          />
          <MetricCard
            label="Com Campaign ID"
            value={stats.withCampaignId}
            sub={`${stats.campaignRate}%`}
            icon={<Crosshair className="h-3.5 w-3.5" />}
            color={stats.campaignRate >= 70 ? "text-emerald-400" : "text-yellow-400"}
          />
          <MetricCard
            label="Sem Tracking"
            value={stats.total - stats.withAnySub}
            sub={`${100 - stats.trackingRate}%`}
            icon={<WifiOff className="h-3.5 w-3.5" />}
            color={stats.total - stats.withAnySub === 0 ? "text-emerald-400" : "text-destructive"}
          />
        </div>

        {/* Source breakdown */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground border-t border-border/30 pt-3">
          <span>
            Fonte: <strong className="text-foreground">{stats.fromIPN}</strong> IPN
          </span>
          <span>
            <strong className="text-foreground">{stats.fromAPI}</strong> API
          </span>
          {stats.fromBoth > 0 && (
            <span>
              <strong className="text-foreground">{stats.fromBoth}</strong> outro
            </span>
          )}
        </div>

        {/* Per project */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Cobertura por Projeto
          </p>
          {Object.entries(stats.projects)
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([project, data]) => {
              const rate = pct(data.tracked, data.total);
              return (
                <div key={project} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-foreground font-medium">{project}</span>
                    <span className="text-muted-foreground">
                      {data.tracked}/{data.total} ({rate}%)
                    </span>
                  </div>
                  <Progress
                    value={rate}
                    className="h-1.5"
                  />
                </div>
              );
            })}
        </div>

        {/* Last sync info */}
        {syncLogs && syncLogs.length > 0 && (
          <div className="border-t border-border/30 pt-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
              Últimos Syncs (API)
            </p>
            <div className="space-y-1">
              {syncLogs.slice(0, 3).map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-[10px] text-muted-foreground"
                >
                  <span className="truncate max-w-[70%]">
                    {log.message?.substring(0, 80)}
                  </span>
                  <span>
                    {new Date(log.created_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-background/50 p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <p className={`text-lg font-bold ${color || "text-foreground"}`}>
        {value}
        {sub && (
          <span className="text-xs font-normal ml-1 text-muted-foreground">
            {sub}
          </span>
        )}
      </p>
    </div>
  );
}
