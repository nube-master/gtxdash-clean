import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BudgetGroup,
  type PacingCampaign,
  matchCampaignsForGroup,
  aggregateGroupStatus,
} from "./mockData";

const fmt = (v: number, d = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const currencyPrefix = (c: BudgetGroup["currency"]) =>
  c === "USD" ? "$ " : c === "EUR" ? "€ " : "R$ ";

const matcherSummary = (g: BudgetGroup): string => {
  const parts: string[] = [];
  if (g.matcher.nameContains) parts.push(`name contains "${g.matcher.nameContains}"`);
  if (g.matcher.projects.length) parts.push(`project ∈ ${g.matcher.projects.join("/")}`);
  if (g.matcher.account !== "all") parts.push(`account = "${g.matcher.account}"`);
  if (g.matcher.phases.length) parts.push(`fase ∈ ${g.matcher.phases.join("/")}`);
  return parts.length ? parts.join(" AND ") : "todas as campanhas";
};

const fmtRelative = (iso: string | null) => {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 1) return "agora";
  if (diff < 60) return `há ${diff}min`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
};

const barColor = (pct: number) =>
  pct > 90 ? "bg-destructive" : pct >= 70 ? "bg-[hsl(var(--wr-warning))]" : "bg-[hsl(var(--wr-positive))]";

const statusDot: Record<ReturnType<typeof aggregateGroupStatus>, string> = {
  ok: "bg-[hsl(var(--wr-positive))]",
  warning: "bg-[hsl(var(--wr-warning))]",
  critical: "bg-destructive",
};

const statusBorder: Record<ReturnType<typeof aggregateGroupStatus>, string> = {
  ok: "border-l-[hsl(var(--wr-positive))]",
  warning: "border-l-[hsl(var(--wr-warning))]",
  critical: "border-l-destructive",
};

interface Props {
  group: BudgetGroup;
  onEdit: (g: BudgetGroup) => void;
  onDuplicate: (g: BudgetGroup) => void;
  onDelete: (g: BudgetGroup) => void;
  onPauseAll: (g: BudgetGroup) => void;
  onHistory: (g: BudgetGroup) => void;
  onCapBadgeClick?: (g: BudgetGroup) => void;
  onSelectCampaign: (c: PacingCampaign) => void;
}

export function BudgetGroupCard({
  group,
  onEdit,
  onDuplicate,
  onDelete,
  onPauseAll,
  onHistory,
  onCapBadgeClick,
  onSelectCampaign,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const camps = matchCampaignsForGroup(group.matcher) || [];
  const active = camps.filter((c) => c.status !== "paused").length;
  const paused = camps.length - active;
  const status = aggregateGroupStatus(group);

  const hourlyPct = group.capHourly ? (group.hourlySpend / group.capHourly) * 100 : 0;
  const dailyPct = group.capDaily ? (group.dailySpend / group.capDaily) * 100 : 0;
  const prefix = currencyPrefix(group.currency);

  const hourlyLabel =
    hourlyPct > 100 ? "🔴 cap estourado" : hourlyPct >= 75 ? "🟡 acelerando" : "🟢 dentro do orçamento";
  const dailyLabel =
    dailyPct > 100 ? "🔴 cap estourado" : dailyPct >= 75 ? "🟡 acelerando" : "🟢 dentro do orçamento";

  return (
    <Card
      className={cn(
        "p-4 bg-card border-border/60 border-l-4 transition-all hover:shadow-md cursor-pointer",
        statusBorder[status]
      )}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn("size-2.5 rounded-full shrink-0", statusDot[status])} />
          <h3 className="text-sm font-bold truncate">{group.name}</h3>
          {hourlyPct > 100 && (
            <Badge
              variant="destructive"
              className="text-[10px] h-5 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onCapBadgeClick?.(group);
              }}
            >
              CAP ATINGIDO
            </Badge>
          )}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onEdit(group)}>Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPauseAll(group)}>Pausar grupo todo</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(group)}>Duplicar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onHistory(group)}>Ver histórico</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(group)}
                className="text-red focus:text-red"
              >
                Deletar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Matcher + counts */}
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="font-mono">🎯 matcher: {matcherSummary(group)}</div>
        <div>
          📦 <span className="tabular-nums">{camps.length}</span>{" "}
          {camps.length === 1 ? "campanha" : "campanhas"}:{" "}
          <span className="text-[hsl(var(--wr-positive))] tabular-nums">{active} ativas</span> ·{" "}
          <span className="text-muted-foreground tabular-nums">{paused} pausadas</span>
        </div>
      </div>

      {/* Caps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cap horário</div>
          <div className="text-xs tabular-nums mt-0.5">
            {prefix}
            {fmt(group.hourlySpend)} / {prefix}
            {fmt(group.capHourly)}
          </div>
          <div className="relative h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-all",
                barColor(hourlyPct),
                hourlyPct > 90 && "animate-pulse"
              )}
              style={{ width: `${Math.min(100, hourlyPct)}%` }}
            />
          </div>
          <div className="text-[10px] mt-1 text-muted-foreground tabular-nums">
            {hourlyLabel} · {fmt(hourlyPct, 0)}%
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cap diário</div>
          <div className="text-xs tabular-nums mt-0.5">
            {prefix}
            {fmt(group.dailySpend)} / {prefix}
            {fmt(group.capDaily)}
          </div>
          <div className="relative h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-all",
                barColor(dailyPct),
                dailyPct > 90 && "animate-pulse"
              )}
              style={{ width: `${Math.min(100, dailyPct)}%` }}
            />
          </div>
          <div className="text-[10px] mt-1 text-muted-foreground tabular-nums">
            {dailyLabel} · {fmt(dailyPct, 0)}%
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border/40">
        <div className="text-[11px] text-muted-foreground tabular-nums">
          Regras vinculadas: <span className="text-foreground">{group.rulesLinked}</span> ·{" "}
          Última pausa: <span className="text-foreground">{fmtRelative(group.lastPauseAt)}</span> ·{" "}
          Disparou <span className="text-foreground">{group.firedToday}×</span> hoje
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5 mr-1" /> ocultar campanhas
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5 mr-1" /> ver campanhas
            </>
          )}
        </Button>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div
          className="mt-3 pt-3 border-t border-border/40 space-y-1"
          onClick={(e) => e.stopPropagation()}
        >
          {camps.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2 text-center">
              Nenhuma campanha matcha esse grupo.
            </div>
          ) : (
            camps.map((c) => {
              const dot =
                c.status === "critical"
                  ? "bg-destructive"
                  : c.status === "warning"
                  ? "bg-[hsl(var(--wr-warning))]"
                  : c.status === "paused"
                  ? "bg-muted-foreground"
                  : "bg-[hsl(var(--wr-positive))]";
              const label =
                c.status === "critical"
                  ? "🔴 PAUSAR"
                  : c.status === "warning"
                  ? "🟡 REVISAR"
                  : c.status === "paused"
                  ? "⏸ PAUSED"
                  : c.status === "warming"
                  ? "🟦 WARM"
                  : "🟢 OK";
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectCampaign(c)}
                  className="w-full grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("size-1.5 rounded-full shrink-0", dot)} />
                    <span className="font-mono truncate">{c.name}</span>
                  </div>
                  <span className="tabular-nums text-muted-foreground">{fmt(c.pacePct)}% pace</span>
                  <span className="tabular-nums">R$ {fmt(c.spend, 0)}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}
