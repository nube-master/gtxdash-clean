import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { MoreVertical, Bell, BellOff, Clock, Target, Zap, HelpCircle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PacingRuleV2 } from "./mockData";

interface Props {
  rule: PacingRuleV2;
  onToggle: (id: string, next: boolean) => void;
  onEdit: (rule: PacingRuleV2) => void;
  onDuplicate: (rule: PacingRuleV2) => void;
  onHistory: (rule: PacingRuleV2) => void;
  onDelete: (rule: PacingRuleV2) => void;
  onSimulate?: (rule: PacingRuleV2) => void;
  onLigaTudo?: (rule: PacingRuleV2) => void;
}

const triggerLabel = (r: PacingRuleV2): string => {
  const t = r.trigger;
  switch (t.kind) {
    case "linear_pacing": {
      const base = `linear_pacing × ${t.tolerance.toFixed(2).replace(/\.?0+$/, "")}`;
      return t.andNoSale ? `${base} + sem venda ${t.noSaleMinutes}min` : base;
    }
    case "group_cap":
      return `group_cap · ${t.groupId || "—"}`;
    case "daily_cap":
      return `daily_cap · spend > 100% daily budget`;
    case "acceleration_no_sale":
      return `aceleração · ${t.accelPctOfDaily}% / 5min`;
  }
};

const triggerTip = (kind: PacingRuleV2["trigger"]["kind"]): string => {
  switch (kind) {
    case "linear_pacing":
      return "Compara o gasto acumulado do dia contra o esperado proporcionalmente ao horário. Dispara se a campanha consome mais do que o múltiplo configurado do esperado linear.";
    case "group_cap":
      return "Soma o gasto da última hora de todas as campanhas do mesmo budget group. Dispara se o total ultrapassar o teto por hora configurado.";
    case "daily_cap":
      return "Verifica se o gasto acumulado do dia estourou o orçamento diário (com tolerância). Freio de arrumação para não passar do budget total.";
    case "acceleration_no_sale":
      return "Mede o delta de gasto nos últimos 5 minutos. Dispara se a campanha consumir mais do que o percentual configurado do orçamento diário em apenas 5 minutos.";
    case "campaign_hourly_cap":
      return "Teto de spend por hora por campanha. Pausa quando a hora atual (ou última fechada) ultrapassa o limite em R$ ou % do orçamento diário.";
    case "hourly_window":
      return "Dispara dentro de uma janela horária BRT específica quando o spend acumulado está entre os limites configurados.";
    case "profit_threshold":
      return "Compara profit (revenue − spend) contra um threshold em R$ absoluto ou % de margem.";
    case "daily_schedule":
      return "Agendamento fixo 1×/dia em horário BRT. Útil para ligar/desligar campanhas em horário definido.";
    case "metric_threshold":
      return "Disparo por métrica derivada (CPC, CPA, CTR, ROAS, ROI, Profit). Use as Condições Extras para definir o limite — ex.: cpc > R$ 16 pausa campanhas com CPC acima do teto.";
    default:
      return "";
  }
};

const actionLabel = (r: PacingRuleV2): string => {
  const a = r.action;
  const base =
    a.kind === "pause" ? "⏸ pausar"
    : a.kind === "reduce_budget" ? `↓ reduzir budget ${a.reducePct}%`
    : "🔔 apenas alertar";
  return `${base} · cooldown: ${a.cooldownMin}min`;
};

const scopeLabel = (r: PacingRuleV2): string => {
  const parts: string[] = [];
  if (r.scope.nameContains) parts.push(`name contains "${r.scope.nameContains}"`);
  if (r.scope.projects.length) parts.push(`projetos: ${r.scope.projects.join(", ")}`);
  if (r.scope.account !== "all") parts.push(`conta: ${r.scope.account}`);
  if (r.scope.phases.length) parts.push(`fase: ${r.scope.phases.join("/")}`);
  if (r.scope.minBudget > 0) parts.push(`min R$ ${r.scope.minBudget}`);
  return parts.length ? parts.join(" · ") : "todas as campanhas ativas";
};

const formatLastFired = (iso: string | null): string => {
  if (!iso) return "Nunca disparou";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
};

const formatLastFiredTime = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

export function RuleCard({ rule, onToggle, onEdit, onDuplicate, onHistory, onDelete, onSimulate, onLigaTudo }: Props) {
  const firedRecently =
    rule.lastFiredAt && Date.now() - new Date(rule.lastFiredAt).getTime() < 30 * 60_000;

  return (
    <TooltipProvider delayDuration={300}>
    <Card
      onClick={() => onEdit(rule)}
      className={cn(
        "relative p-4 border-border/60 bg-card transition-all cursor-pointer hover:border-border hover:bg-card/80",
        !rule.enabled && "opacity-50",
        firedRecently && "border-l-2 border-l-destructive/70"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Toggle */}
        <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
          <Switch checked={rule.enabled} onCheckedChange={(v) => onToggle(rule.id, v)} />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm uppercase tracking-wide">{rule.name}</h3>
            {rule.notification.pushcut ? (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] uppercase tracking-wider border-primary/40 text-primary"
              >
                <Bell className="size-2.5" /> Pushcut
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <BellOff className="size-2.5" /> silencioso
              </Badge>
            )}
            {firedRecently && (
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wider border-destructive/40 text-destructive animate-pulse"
              >
                disparou
              </Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            <span className="text-muted-foreground/70">filtros:</span> {scopeLabel(rule)}
          </p>
          <p className="text-xs">
            <span className="text-muted-foreground/70">trigger:</span>{" "}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 cursor-help text-foreground tabular-nums">
                  {triggerLabel(rule)}
                  <HelpCircle className="size-3 text-muted-foreground/60" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px]">
                <p className="text-[11px] leading-relaxed">{triggerTip(rule.trigger.kind)}</p>
              </TooltipContent>
            </Tooltip>
          </p>
          <p className="text-xs">
            <span className="text-muted-foreground/70">ação:</span>{" "}
            <span className="text-foreground tabular-nums">{actionLabel(rule)}</span>
          </p>

          <div className="flex items-center gap-4 pt-1 text-[11px] text-muted-foreground tabular-nums flex-wrap">
            <span className="flex items-center gap-1">
              <Target className="size-3" />
              atinge <span className="text-foreground font-semibold">{rule.matchedCampaigns}</span> campanhas
            </span>
            <span className="flex items-center gap-1">
              <Zap className="size-3" />
              disparou <span className="text-foreground font-semibold">{rule.firedToday}×</span> hoje · {rule.firedTotal} total
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              última: {formatLastFiredTime(rule.lastFiredAt)} ({formatLastFired(rule.lastFiredAt)})
            </span>
          </div>
        </div>

        {/* Actions */}
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
          {onSimulate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[10px] uppercase tracking-wider"
                  onClick={() => onSimulate(rule)}
                >
                  <FlaskConical className="size-3 mr-1" /> testar
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px]">
                <p className="text-[11px] leading-relaxed">
                  Roda a regra agora contra todas as campanhas em modo simulação (não pausa nada).
                  Mostra quais campanhas dispararão, quais bloqueiam e por quê.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onEdit(rule)}>Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(rule)}>Duplicar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onHistory(rule)}>Ver histórico</DropdownMenuItem>
              {onLigaTudo && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onLigaTudo(rule)}>
                    ⚡ Liga Tudo (ignora spend)
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(rule)}
              >
                Deletar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
    </TooltipProvider>
  );
}
