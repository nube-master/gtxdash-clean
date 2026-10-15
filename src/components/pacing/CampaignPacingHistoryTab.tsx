import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Zap, Ban, Pause, Play, Bell, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionRow {
  id: string;
  triggered_at: string;
  action_type: string;
  success: boolean | null;
  dry_run: boolean;
  reason: string;
  rule_id: string | null;
  spend_at_action: number | null;
  error_message: string | null;
  daily_budget: number | null;
  meta_response: any | null;
}

interface EvalRow {
  id: string;
  evaluated_at: string;
  rule_id: string | null;
  rule_name: string;
  campaigns_fired: number;
  blocked_details: Array<{ campaignId: string; campaignName: string; reason: string }> | null;
}

interface Props {
  campaignId: string;
  ruleNameById: Map<string, string>;
}

const ACTION_ICON: Record<string, JSX.Element> = {
  pause: <Pause className="size-3" />,
  resume: <Play className="size-3" />,
  alert: <Bell className="size-3" />,
  reduce_budget: <Activity className="size-3" />,
};

export function CampaignPacingHistoryTab({ campaignId, ruleNameById }: Props) {
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [evals, setEvals] = useState<EvalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [actRes, evRes] = await Promise.all([
        (supabase as any)
          .from("pacing_action_log")
          .select(
            "id, triggered_at, action_type, success, dry_run, reason, rule_id, spend_at_action, error_message, daily_budget, meta_response"
          )
          .eq("campaign_id", campaignId)
          .gte("triggered_at", since)
          .order("triggered_at", { ascending: false })
          .limit(500),
        (supabase as any)
          .from("pacing_evaluation_log")
          .select("id, evaluated_at, rule_id, rule_name, campaigns_fired, blocked_details")
          .contains("campaign_ids", [campaignId])
          .gte("evaluated_at", since)
          .order("evaluated_at", { ascending: false })
          .limit(500),
      ]);
      if (cancelled) return;
      setActions((actRes.data ?? []) as ActionRow[]);
      setEvals((evRes.data ?? []) as EvalRow[]);
      setLoading(false);
    };
    fetchAll();
    const t = setInterval(fetchAll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [campaignId]);

  // mescla em timeline única
  const timeline = [
    ...actions.map((a) => ({
      kind: "action" as const,
      ts: a.triggered_at,
      sortKey: new Date(a.triggered_at).getTime(),
      data: a,
    })),
    ...evals.map((e) => {
      const blockedHere = (e.blocked_details ?? []).find((b) => b.campaignId === campaignId);
      const fired = e.campaigns_fired > 0;
      return {
        kind: "eval" as const,
        ts: e.evaluated_at,
        sortKey: new Date(e.evaluated_at).getTime(),
        data: { ...e, blockedHere, firedHere: fired },
      };
    }),
  ].sort((a, b) => b.sortKey - a.sortKey);

  const actionCount = actions.length;
  const evalCount = evals.length;
  const blockedCount = evals.filter((e) =>
    (e.blocked_details ?? []).some((b) => b.campaignId === campaignId)
  ).length;

  return (
    <Card className="p-4 bg-card border-border/60">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Histórico de pacing (últimos 7 dias)
        </h2>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-muted-foreground">
            <span className="text-foreground font-semibold">{actionCount}</span> ações
          </span>
          <span className="text-muted-foreground">
            <span className="text-foreground font-semibold">{evalCount}</span> avaliações
          </span>
          {blockedCount > 0 && (
            <span className="text-amber-500">
              <span className="font-semibold">{blockedCount}</span> bloqueios
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : timeline.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6">
          <AlertTriangle className="size-3.5" />
          <span>
            Nenhuma ação ou avaliação registrada para esta campanha nos últimos 7 dias. Se o controller
            estiver rodando, isso pode significar que a campanha não bate em nenhum filtro de regra.
          </span>
        </div>
      ) : (
        <ScrollArea className="h-[480px] pr-2">
          <div className="space-y-1.5">
            {timeline.map((item, i) => {
              const time = new Date(item.ts).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
              if (item.kind === "action") {
                const a = item.data;
                const success = a.success !== false && !a.error_message;
                return (
                  <div
                    key={`a-${a.id}`}
                    className={cn(
                      "rounded border p-2.5 flex items-start gap-2.5",
                      success
                        ? "border-[hsl(var(--wr-positive))]/30 bg-[hsl(var(--wr-positive))]/5"
                        : "border-red/40 bg-red/5"
                    )}
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] uppercase tracking-wider gap-1 shrink-0",
                        success
                          ? "border-[hsl(var(--wr-positive))]/40 text-[hsl(var(--wr-positive))]"
                          : "border-red/40 text-red"
                      )}
                    >
                      {ACTION_ICON[a.action_type] ?? <Zap className="size-3" />} {a.action_type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[11px] flex-wrap">
                        <span className="text-muted-foreground tabular-nums">{time}</span>
                        {a.rule_id && (
                          <span className="text-foreground font-medium">
                            {ruleNameById.get(a.rule_id) ?? "regra removida"}
                          </span>
                        )}
                        {a.dry_run && (
                          <Badge variant="outline" className="text-[9px] uppercase">
                            dry-run
                          </Badge>
                        )}
                        {a.spend_at_action != null && (
                          <span className="text-muted-foreground tabular-nums">
                            spend R$ {Number(a.spend_at_action).toFixed(2)}
                          </span>
                        )}
                        {(() => {
                          const mr = a.meta_response ?? {};
                          const prev = mr.previous_budget_brl ?? a.daily_budget;
                          const next = mr.new_budget_brl;
                          if ((a.action_type === "increase_budget" || a.action_type === "reduce_budget") && prev != null && next != null) {
                            const up = Number(next) > Number(prev);
                            return (
                              <span
                                className={cn(
                                  "tabular-nums font-semibold px-1.5 py-0.5 rounded",
                                  up
                                    ? "bg-[hsl(var(--wr-positive))]/10 text-[hsl(var(--wr-positive))]"
                                    : "bg-red/10 text-red"
                                )}
                              >
                                R$ {Number(prev).toFixed(2)} → R$ {Number(next).toFixed(2)}
                                {mr.capped && <span className="ml-1 text-[9px] opacity-70">(capado)</span>}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{a.reason}</p>
                      {a.error_message && (
                        <p className="text-[11px] text-red mt-0.5">{a.error_message}</p>
                      )}
                    </div>
                  </div>
                );
              }
              // eval
              const e = item.data as EvalRow & { blockedHere?: any; firedHere?: boolean };
              const isBlocked = Boolean(e.blockedHere);
              return (
                <div
                  key={`e-${e.id}`}
                  className={cn(
                    "rounded border p-2 flex items-start gap-2.5 text-[11px]",
                    isBlocked ? "border-amber-500/30 bg-amber-500/5" : "border-border/40 bg-card/40"
                  )}
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] uppercase tracking-wider gap-1 shrink-0",
                      isBlocked && "border-amber-500/40 text-amber-500"
                    )}
                  >
                    {isBlocked ? <Ban className="size-3" /> : <Activity className="size-3" />}
                    {isBlocked ? "bloqueada" : "avaliada"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground tabular-nums">{time}</span>
                      <span className="text-foreground">{e.rule_name}</span>
                    </div>
                    {isBlocked && e.blockedHere && (
                      <p className="text-muted-foreground mt-0.5">{e.blockedHere.reason}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}
