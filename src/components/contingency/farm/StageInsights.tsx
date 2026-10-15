import { TrendingUp, AlertTriangle, Skull, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  readyInNext3d: number;
  zombieReadyCount: number;
  burnedLast7d: number;
  totalAccounts: number;
}

/**
 * Banner premium acima do Kanban com previsão de prontidão,
 * detecção de "pronta zumbi" e taxa de queima dos últimos 7 dias.
 */
export function ForecastBanner({ readyInNext3d, zombieReadyCount, burnedLast7d, totalAccounts }: Props) {
  const burnPct = totalAccounts > 0 ? (burnedLast7d / totalAccounts) * 100 : 0;

  // Nada relevante? Não polui a UI.
  if (readyInNext3d === 0 && zombieReadyCount === 0 && burnedLast7d === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-gradient-to-r from-muted/30 via-muted/10 to-transparent px-3 py-2 backdrop-blur-sm">
      <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground shrink-0">
        Sinais do Farm
      </span>
      <div className="h-3 w-px bg-border/50" />

      {readyInNext3d > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 cursor-help">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-[11px] font-semibold text-emerald-400 tabular-nums">
                ≈ {readyInNext3d}
              </span>
              <span className="text-[10px] text-emerald-400/80">
                ficarão prontas em 3 dias
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Contas aquecendo / quase prontas a 1-3 dias da maturidade
          </TooltipContent>
        </Tooltip>
      )}

      {zombieReadyCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/40 cursor-help">
              <Skull className="h-3 w-3 text-amber-400" />
              <span className="text-[11px] font-semibold text-amber-400 tabular-nums">
                {zombieReadyCount}
              </span>
              <span className="text-[10px] text-amber-400/80">
                pronta(s) sem gasto há 48h
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Marcadas como Pronta mas sem nenhum gasto nas últimas 48h — provável zumbi
          </TooltipContent>
        </Tooltip>
      )}

      {burnedLast7d > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 cursor-help">
              <AlertTriangle className="h-3 w-3 text-rose-400" />
              <span className="text-[11px] font-semibold text-rose-400 tabular-nums">
                {burnedLast7d}
              </span>
              <span className="text-[10px] text-rose-400/80">
                queimadas em 7d ({burnPct.toFixed(0)}%)
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Contas que sairam de Ativa nas últimas 168h (log do Meta)
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

interface StageMetricsProps {
  avgDays: number | null;
  churn7d: number;
}

/**
 * Mostrado no header de cada coluna do Kanban, abaixo do título principal.
 */
export function StageHeaderMetrics({ avgDays, churn7d }: StageMetricsProps) {
  if (avgDays === null && churn7d === 0) return null;
  return (
    <div className="flex items-center gap-2 px-3 pb-1.5 -mt-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
      {avgDays !== null && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">⌀ {avgDays.toFixed(1)}d</span>
          </TooltipTrigger>
          <TooltipContent>Média de dias rodando nas contas deste status</TooltipContent>
        </Tooltip>
      )}
      {avgDays !== null && churn7d > 0 && <span className="opacity-40">·</span>}
      {churn7d > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-rose-400/80">↓ {churn7d} em 7d</span>
          </TooltipTrigger>
          <TooltipContent>
            Contas deste status que caíram (Meta) nos últimos 7 dias
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
