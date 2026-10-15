import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Activity, Clock, Zap, Ban, Target, HelpCircle } from "lucide-react";
import { usePacingEvaluationLog, aggregateVitalSigns } from "@/hooks/usePacingEvaluationLog";
import { usePacingRules } from "@/hooks/usePacingRules";
import { cn } from "@/lib/utils";

function formatAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function healthFromAgo(iso: string | null): "ok" | "warn" | "stale" | "dead" {
  if (!iso) return "dead";
  const diff = Date.now() - new Date(iso).getTime();
  const min = diff / 60_000;
  if (min < 5) return "ok";
  if (min < 30) return "warn";
  if (min < 24 * 60) return "stale";
  return "dead";
}

const healthColor: Record<string, string> = {
  ok: "bg-[hsl(var(--wr-positive))]",
  warn: "bg-amber-500",
  stale: "bg-orange-500",
  dead: "bg-destructive",
};

const healthLabel: Record<string, string> = {
  ok: "ATIVA",
  warn: "LENTA",
  stale: "PARADA",
  dead: "OFFLINE",
};

export function EvaluationDiagnosticsCard() {
  const [expanded, setExpanded] = useState(true);
  const { rows, loading } = usePacingEvaluationLog();
  const { rules } = usePacingRules();

  const vitals = useMemo(() => {
    const agg = aggregateVitalSigns(rows);
    // mescla com regras conhecidas (mostra regra mesmo se nunca foi avaliada)
    const byKey = new Map(agg.map((v) => [v.ruleId ?? v.ruleName, v]));
    for (const r of rules) {
      const k = r.id;
      if (!byKey.has(k)) {
        byKey.set(k, {
          ruleId: r.id,
          ruleName: r.name,
          lastEvaluatedAt: r.lastFiredAt,
          evaluationsLastHour: 0,
          evaluationsLast24h: 0,
          firesLast24h: 0,
          matchedLast24h: 0,
          blockedLast24h: 0,
          topBlockReason: null,
          lastSkipReason: r.enabled ? null : "disabled",
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => {
      const ta = a.lastEvaluatedAt ? new Date(a.lastEvaluatedAt).getTime() : 0;
      const tb = b.lastEvaluatedAt ? new Date(b.lastEvaluatedAt).getTime() : 0;
      return tb - ta;
    });
  }, [rows, rules]);

  const summary = useMemo(() => {
    const total = vitals.length;
    const active = vitals.filter((v) => healthFromAgo(v.lastEvaluatedAt) === "ok").length;
    const dead = vitals.filter((v) => healthFromAgo(v.lastEvaluatedAt) === "dead").length;
    const totalFires24h = vitals.reduce((s, v) => s + v.firesLast24h, 0);
    const totalEvals24h = vitals.reduce((s, v) => s + v.evaluationsLast24h, 0);
    return { total, active, dead, totalFires24h, totalEvals24h };
  }, [vitals]);

  return (
    <TooltipProvider delayDuration={200}>
    <Card className="border-border/60 bg-card overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <Activity className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">🔬 Diagnóstico das Regras</h2>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider gap-1.5">
            <span className={cn("size-1.5 rounded-full", healthColor[summary.active === summary.total && summary.total > 0 ? "ok" : summary.dead > 0 ? "warn" : "stale"])} />
            {summary.active}/{summary.total} ativas
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
          <span>{summary.totalEvals24h} avaliações/24h</span>
          <span className={cn(summary.totalFires24h > 0 ? "text-foreground" : "")}>
            {summary.totalFires24h} disparos/24h
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/60">
          {/* Legenda — esclarece o que cada métrica significa */}
          <div className="px-4 py-2 bg-muted/10 border-b border-border/40 text-[10px] text-muted-foreground flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1">
              <Target className="size-2.5" /> <b className="text-foreground/80">match</b> = entrou no escopo
            </span>
            <span className="flex items-center gap-1">
              <Zap className="size-2.5" /> <b className="text-foreground/80">disparos</b> = trigger bateu, ação executada
            </span>
            <span className="flex items-center gap-1">
              <Ban className="size-2.5" /> <b className="text-foreground/80">sem trigger</b> = avaliou mas condição não estourou (normal — significa "tudo OK, não precisa agir")
            </span>
          </div>
          {loading && vitals.length === 0 ? (
            <p className="px-4 py-6 text-xs text-center text-muted-foreground">Carregando...</p>
          ) : vitals.length === 0 ? (
            <p className="px-4 py-6 text-xs text-center text-muted-foreground">
              Nenhuma regra carregada.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {vitals.map((v) => {
                const health = healthFromAgo(v.lastEvaluatedAt);
                return (
                  <div key={v.ruleId ?? v.ruleName} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={cn("size-2 rounded-full shrink-0", healthColor[health])} />
                        <span className="text-xs font-semibold uppercase tracking-wide truncate">
                          {v.ruleName}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] uppercase tracking-wider shrink-0",
                            health === "ok" && "border-[hsl(var(--wr-positive))]/40 text-[hsl(var(--wr-positive))]",
                            health === "warn" && "border-amber-500/40 text-amber-500",
                            health === "stale" && "border-orange-500/40 text-orange-500",
                            health === "dead" && "border-destructive/40 text-destructive"
                          )}
                        >
                          {healthLabel[health]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums flex-wrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-help">
                              <Clock className="size-3" /> última {formatAgo(v.lastEvaluatedAt)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[240px]">
                            <p className="text-[11px]">Quando o controller avaliou essa regra pela última vez. "agora" = rodando saudável.</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-help">
                              <Activity className="size-3" /> {v.evaluationsLastHour}/h · {v.evaluationsLast24h}/24h
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[240px]">
                            <p className="text-[11px]">Quantas vezes a regra foi avaliada (passes do controller) na última hora e nas últimas 24h.</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-help">
                              <Target className="size-3" /> {v.matchedLast24h} match
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[240px]">
                            <p className="text-[11px]">Soma de campanhas que entraram no escopo da regra (filtros de nome/projeto/fase) nas últimas 24h.</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "flex items-center gap-1 cursor-help",
                                v.firesLast24h > 0 && "text-[hsl(var(--wr-positive))] font-semibold"
                              )}
                            >
                              <Zap className="size-3" /> {v.firesLast24h} disparos
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[240px]">
                            <p className="text-[11px]">Quantas vezes a regra efetivamente agiu (pausou/reduziu/alertou) em 24h.</p>
                          </TooltipContent>
                        </Tooltip>
                        {v.blockedLast24h > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1 text-muted-foreground/80 cursor-help">
                                <Ban className="size-3" /> {v.blockedLast24h} sem trigger
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px]">
                              <p className="text-[11px] leading-relaxed">
                                <b>Não é a regra bloqueando.</b> Significa que a campanha entrou no escopo mas a condição do trigger não estourou (ex: spend abaixo do cap, profit ainda positivo). Comportamento normal — a regra avaliou e decidiu não agir.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    {(v.lastSkipReason || v.topBlockReason) && (
                      <p className="text-[10px] text-muted-foreground/80 mt-1 pl-4">
                        {v.lastSkipReason && (
                          <>
                            <span className="text-amber-500">skip:</span>{" "}
                            <code className="text-foreground/80">{v.lastSkipReason}</code>
                            {v.topBlockReason && " · "}
                          </>
                        )}
                        {v.topBlockReason && (
                          <>
                            <span>motivo de não disparar:</span>{" "}
                            <code className="text-foreground/80">{v.topBlockReason}</code>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
    </TooltipProvider>
  );
}
