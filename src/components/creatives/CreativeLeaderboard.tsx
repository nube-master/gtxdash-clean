import { useState } from "react";
import { Trophy, ChevronRight, ChevronLeft, TrendingUp, TrendingDown, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLeaderboardMonthlyData, type LeaderboardCreative } from "@/hooks/useLeaderboardMonthlyData";
import { type CreativeRow } from "@/lib/creativeUtils";
import { useDateRange } from "@/contexts/DateRangeContext";

function fmt(v: number, type: "currency" | "number" | "roas") {
  if (type === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(v));
  if (type === "roas") return `${v.toFixed(2).replace(".", ",")}x`;
  return String(v);
}

function PositionBadge({ pos }: { pos: number }) {
  if (pos === 1) return <span className="text-lg">🥇</span>;
  if (pos === 2) return <span className="text-lg">🥈</span>;
  if (pos === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-[11px] font-bold font-mono text-muted-foreground">#{pos}</span>;
}

interface CreativeLeaderboardProps {
  creatives: CreativeRow[];
}

export function CreativeLeaderboard({ creatives }: CreativeLeaderboardProps) {
  const [open, setOpen] = useState(false);
  const { leaderboard } = useLeaderboardMonthlyData(creatives);
  const { rangeKey } = useDateRange();

  if (leaderboard.length === 0) return null;

  const DATE_RANGE_LABELS: Record<string, string> = {
    today: "Hoje",
    yesterday: "Ontem",
    "7": "Últimos 7 dias",
    "14": "Últimos 14 dias",
    "30": "Últimos 30 dias",
    month: "Este mês",
    custom: "Período personalizado",
  };
  const periodLabel = DATE_RANGE_LABELS[rangeKey] || "Período";

  return (
    <>
      {/* Toggle button — fixed right edge */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed right-0 z-40 bg-card/95 backdrop-blur-md border border-border/60 border-r-0 rounded-l-xl px-1.5 py-4 flex flex-col items-center gap-1 hover:bg-secondary/50 transition-all shadow-lg"
        style={{ top: "50%", transform: "translateY(-50%)" }}
        title="Creative Leaderboard"
      >
        <Trophy className="h-4 w-4 text-amber-400" />
        {!open && <ChevronLeft className="h-3 w-3 text-muted-foreground" />}
        {open && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      </button>

      {/* Slide-in panel */}
      <div
        className={`fixed right-0 z-40 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ top: 56, bottom: 0, width: 320 }}
      >
        <div className="h-full bg-card/98 backdrop-blur-xl border-l border-border/50 shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 pb-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold tracking-tight">Creative Leaderboard</h3>
                <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">{periodLabel} • Top 10</p>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {leaderboard.map((entry, i) => (
              <LeaderboardCard key={entry.key} entry={entry} position={i} topScore={leaderboard[0]?.totalRevenue || 1} />
            ))}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-border/30">
            <p className="text-[8px] text-muted-foreground font-mono text-center uppercase tracking-wider">
              Ranking • Faturamento → Vendas → Lucro
            </p>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
      )}
    </>
  );
}

function LeaderboardCard({ entry, position, topScore }: { entry: LeaderboardCreative; position: number; topScore: number }) {
  const trend = entry.totalProfit > 0 && entry.avgRoas >= 1.3 ? "up" : entry.totalProfit < 0 ? "down" : "stable";

  return (
    <div
      className={`rounded-xl border p-3 transition-all hover:scale-[1.01] ${
        position === 0
          ? "border-amber-500/40 bg-amber-500/5 shadow-[0_0_20px_hsl(45,90%,55%,0.08)]"
          : position < 3
          ? "border-border/60 bg-secondary/20"
          : "border-border/30 bg-card"
      }`}
    >
      {/* Top row */}
      <div className="flex items-center gap-2 mb-2">
        <PositionBadge pos={position + 1} />
        <span className="text-xs font-bold font-mono text-foreground flex-1 truncate">
          {entry.creativeId}
        </span>
        {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-400" />}
        {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mb-2">
        {position === 0 && (
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-amber-500/40 text-amber-400 bg-amber-500/10 gap-0.5">
            <Crown className="h-2.5 w-2.5" /> Líder do período
          </Badge>
        )}
        <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${entry.project.className}`}>
          {entry.project.label}
        </Badge>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <div className="flex justify-between">
          <span className="text-[9px] text-muted-foreground">Vendas</span>
          <span className="text-[10px] font-bold font-mono text-foreground">{fmt(entry.totalSales, "number")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-muted-foreground">ROAS</span>
          <span className={`text-[10px] font-bold font-mono ${entry.avgRoas >= 1.3 ? "text-emerald-400" : entry.avgRoas >= 1 ? "text-amber-400" : "text-destructive"}`}>
            {fmt(entry.avgRoas, "roas")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-muted-foreground">Faturamento</span>
          <span className="text-[10px] font-bold font-mono text-foreground">{fmt(entry.totalRevenue, "currency")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-muted-foreground">Lucro</span>
          <span className={`text-[10px] font-bold font-mono ${entry.totalProfit >= 0 ? "text-emerald-400" : "text-destructive"}`}>
            {fmt(entry.totalProfit, "currency")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-muted-foreground">Contas</span>
          <span className="text-[10px] font-bold font-mono text-foreground">{entry.activeAccounts}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-muted-foreground">Investido</span>
          <span className="text-[10px] font-bold font-mono text-foreground">{fmt(entry.totalSpend, "currency")}</span>
        </div>
      </div>

      {/* Revenue bar */}
      <div className="mt-2">
        <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-amber-400"
            style={{ width: `${Math.min((entry.totalRevenue / topScore) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
