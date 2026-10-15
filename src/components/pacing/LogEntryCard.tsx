import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Eye, MoreHorizontal, RotateCw, Clock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFalsePositive, logActionIcon, logActionLabel, type LogEntry } from "./historyMock";

interface Props {
  entry: LogEntry;
  onSelect: (e: LogEntry) => void;
  onResume: (e: LogEntry) => void;
  onSnooze: (e: LogEntry, preset: string) => void;
  onViewRule: (e: LogEntry) => void;
  onViewCampaign: (e: LogEntry) => void;
}

const borderByStatus = (e: LogEntry): string => {
  if (e.status === "fail") return "border-l-destructive";
  if (e.status === "manual_resume") return "border-l-muted-foreground";
  if (e.action === "snooze" || e.status === "cooldown_skip") return "border-l-[hsl(var(--wr-info,210_90%_55%))]";
  if (e.action === "alert") return "border-l-[hsl(var(--wr-warning,45_95%_55%))]";
  if (e.action === "pause" && e.status === "success") return "border-l-[hsl(var(--wr-positive,140_70%_45%))]";
  return "border-l-border";
};

const fmtTime = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};

export function LogEntryCard({ entry, onSelect, onResume, onSnooze, onViewRule, onViewCampaign }: Props) {
  const falsePos = isFalsePositive(entry);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry)}
      onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onSelect(entry)}
      className={cn(
        "group border border-border/60 border-l-4 bg-card rounded-md px-3 py-2.5 transition-all",
        "hover:bg-accent/30 hover:shadow-sm cursor-pointer",
        borderByStatus(entry)
      )}
    >
      <div className="flex items-start gap-3">
        {/* timestamp + ícone */}
        <div className="flex items-center gap-2 min-w-[120px] shrink-0">
          <span className="text-base leading-none">{logActionIcon(entry.action)}</span>
          <span className="text-xs font-mono tabular-nums text-muted-foreground">{fmtTime(entry.ts)}</span>
        </div>

        {/* corpo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider",
                entry.action === "pause" && "bg-[hsl(var(--wr-positive,140_70%_45%))]/15 text-[hsl(var(--wr-positive,140_70%_45%))]",
                entry.action === "alert" && "bg-[hsl(var(--wr-warning,45_95%_55%))]/15 text-[hsl(var(--wr-warning,45_95%_55%))]",
                entry.action === "fail" && "bg-destructive/15 text-destructive",
                entry.action === "resume" && "bg-muted text-muted-foreground",
                entry.action === "snooze" && "bg-[hsl(var(--wr-info,210_90%_55%))]/15 text-[hsl(var(--wr-info,210_90%_55%))]",
                entry.action === "reduce_budget" && "bg-muted text-foreground",
                entry.action === "increase_budget" && "bg-emerald-500/15 text-emerald-500",
                entry.action === "activate" && "bg-emerald-500/15 text-emerald-500"
              )}
            >
              {logActionLabel(entry.action)}
            </span>
            <span className="font-mono text-xs font-semibold truncate">{entry.campaign}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-mono">
              {entry.project}
            </Badge>
            <span className="text-[10px] text-muted-foreground truncate">{entry.account}</span>
          </div>

          <div className="mt-1 text-xs text-muted-foreground truncate">
            regra: <span className="text-foreground/80">{entry.ruleName}</span>
          </div>

          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums flex-wrap">
            <span>
              ratio: <span className="text-foreground font-medium">{entry.ratio.toFixed(2)}×</span>
            </span>
            <span>·</span>
            <span>
              spend: <span className="text-foreground font-medium">R${entry.spend.toFixed(0)}</span>
              /R${entry.expected.toFixed(0)}
            </span>
            {entry.lastSaleMinAgo > 0 && (
              <>
                <span>·</span>
                <span>
                  sem venda {Math.floor(entry.lastSaleMinAgo / 60)}h{(entry.lastSaleMinAgo % 60).toString().padStart(2, "0")}min
                </span>
              </>
            )}
            {entry.economy > 0 && (
              <>
                <span>·</span>
                <span className="text-[hsl(var(--wr-positive,140_70%_45%))]">
                  economia: R${entry.economy}
                </span>
              </>
            )}
          </div>

          {/* Janela rolling ~60min — dados que dispararam a regra */}
          {(entry.salesLastHour !== undefined || entry.spendLastHour !== undefined) && (
            <div className="mt-1 flex items-center gap-3 text-[11px] tabular-nums flex-wrap rounded bg-muted/40 px-2 py-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">últ 60min:</span>
              {entry.salesLastHour !== undefined && (
                <span>🛒 <span className="text-foreground font-medium">{entry.salesLastHour}</span> vendas</span>
              )}
              {entry.spendLastHour !== undefined && (
                <>
                  <span>·</span>
                  <span>💰 spend <span className="text-foreground font-medium">R${(entry.spendLastHour ?? 0).toFixed(2)}</span></span>
                </>
              )}
              {entry.salesLastHour !== undefined && entry.spendLastHour !== undefined && entry.spendLastHour > 0 && (
                <>
                  <span>·</span>
                  <span>📈 ROAS <span className="text-foreground font-medium">
                    {/* ROAS aproximado usando avg ticket embutido em reason (fallback) */}
                    {(() => {
                      const m = entry.reason?.match(/ROAS\s+([\d.]+)x/i);
                      return m ? `${m[1]}x` : "—";
                    })()}
                  </span></span>
                </>
              )}
              {entry.dailyBudget !== undefined && (entry.action === "increase_budget" || entry.action === "reduce_budget") && (
                <>
                  <span>·</span>
                  <span>🎯 novo budget <span className="text-foreground font-medium">R${entry.dailyBudget.toFixed(2)}</span></span>
                </>
              )}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {falsePos && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--wr-warning,45_95%_55%))]/15 text-[hsl(var(--wr-warning,45_95%_55%))]">
                ⚠ falso positivo provável
              </span>
            )}
            {entry.status === "manual_resume" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                ↺ religada manualmente por {entry.manualResumeBy} · ativa novamente
              </span>
            )}
            {entry.status === "fail" && entry.metaApiError && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                ❌ {entry.metaApiError}
              </span>
            )}
            {entry.status === "cooldown_skip" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--wr-info,210_90%_55%))]/15 text-[hsl(var(--wr-info,210_90%_55%))]">
                ⏰ cooldown ativo · próx tentativa em {entry.cooldownLeftMin}min
              </span>
            )}
            {entry.action === "snooze" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--wr-info,210_90%_55%))]/15 text-[hsl(var(--wr-info,210_90%_55%))]">
                ⏰ snooze {entry.snoozePreset}
              </span>
            )}
          </div>
        </div>

        {/* ações */}
        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onViewCampaign(entry)}>
            <Eye className="size-3 mr-1" /> ver
          </Button>
          {entry.action === "pause" && entry.status === "success" && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onResume(entry)}>
              <RotateCw className="size-3 mr-1" /> religar
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <Clock className="size-3 mr-1" /> snooze
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              {["15min", "1h", "4h", "até amanhã 9h BRT"].map((p) => (
                <button
                  key={p}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent rounded"
                  onClick={() => onSnooze(entry, p)}
                >
                  {p}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewRule(entry)}>
                <FileText className="size-3.5 mr-2" /> Ver regra
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSelect(entry)}>
                <Eye className="size-3.5 mr-2" /> Detalhes técnicos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
