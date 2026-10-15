import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Users, Clapperboard, PenTool, TrendingUp, TrendingDown, X } from "lucide-react";
import { type CreativeRow } from "@/lib/creativeUtils";

interface TeamMember {
  name: string;
  totalCreatives: number;
  totalSales: number;
  totalRevenue: number;
  totalSpend: number;
  totalProfit: number;
  avgRoi: number;
  avgHook: number;
  avgCtr: number;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}
function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) {
  return v.toFixed(1) + "%";
}

function PositionBadge({ pos }: { pos: number }) {
  if (pos === 1) return <span className="text-lg">🥇</span>;
  if (pos === 2) return <span className="text-lg">🥈</span>;
  if (pos === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-[11px] font-bold font-mono text-muted-foreground">#{pos}</span>;
}

function buildRanking(creatives: CreativeRow[], field: "editor" | "copyWriter"): TeamMember[] {
  const map = new Map<string, { sales: number; revenue: number; spend: number; count: number; hookSum: number; ctrSum: number; hookCount: number }>();

  for (const c of creatives) {
    const name = field === "editor" ? c.editor : c.copyWriter;
    if (!name) continue;
    if (!map.has(name)) map.set(name, { sales: 0, revenue: 0, spend: 0, count: 0, hookSum: 0, ctrSum: 0, hookCount: 0 });
    const d = map.get(name)!;
    d.sales += c.sales;
    d.revenue += c.revenue;
    d.spend += c.spend;
    d.count += 1;
    if (c.hookRate > 0) { d.hookSum += c.hookRate; d.hookCount += 1; }
    d.ctrSum += c.ctr;
  }

  const entries: TeamMember[] = [];
  for (const [name, d] of map) {
    entries.push({
      name,
      totalCreatives: d.count,
      totalSales: d.sales,
      totalRevenue: d.revenue,
      totalSpend: d.spend,
      totalProfit: d.revenue - d.spend,
      avgRoi: d.spend > 0 ? d.revenue / d.spend : 0,
      avgHook: d.hookCount > 0 ? d.hookSum / d.hookCount : 0,
      avgCtr: d.count > 0 ? d.ctrSum / d.count : 0,
    });
  }

  entries.sort((a, b) => b.totalRevenue - a.totalRevenue);
  return entries;
}

function MemberCard({ member, position, topRevenue, onClick }: { member: TeamMember; position: number; topRevenue: number; onClick: () => void }) {
  const trend = member.totalProfit > 0 && member.avgRoi >= 1.3 ? "up" : member.totalProfit < 0 ? "down" : "stable";

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 transition-all hover:scale-[1.01] cursor-pointer ${
        position === 0
          ? "border-amber-500/40 bg-amber-500/5 shadow-[0_0_20px_hsl(45,90%,55%,0.08)]"
          : position < 3
          ? "border-border/60 bg-secondary/20"
          : "border-border/30 bg-card"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <PositionBadge pos={position + 1} />
        <span className="text-sm font-bold text-foreground flex-1">{member.name}</span>
        {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
        {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Criativos</span>
          <span className="text-[11px] font-bold font-mono text-foreground">{member.totalCreatives}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Vendas</span>
          <span className="text-[11px] font-bold font-mono text-foreground">{fmt(member.totalSales)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Faturamento</span>
          <span className="text-[11px] font-bold font-mono text-foreground">{fmtCurrency(member.totalRevenue)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Lucro</span>
          <span className={`text-[11px] font-bold font-mono ${member.totalProfit >= 0 ? "text-emerald-400" : "text-destructive"}`}>
            {fmtCurrency(member.totalProfit)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Investido</span>
          <span className="text-[11px] font-bold font-mono text-foreground">{fmtCurrency(member.totalSpend)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">ROI médio</span>
          <span className={`text-[11px] font-bold font-mono ${member.avgRoi >= 1.3 ? "text-emerald-400" : member.avgRoi >= 1 ? "text-amber-400" : "text-destructive"}`}>
            {member.avgRoi > 0 ? `${member.avgRoi.toFixed(2)}x` : "—"}
          </span>
        </div>
      </div>

      {/* Revenue bar */}
      <div className="mt-3">
        <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-amber-400"
            style={{ width: `${Math.min((member.totalRevenue / (topRevenue || 1)) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Drill-down Drawer ──────────────────────────────────────────────────

function MemberDrawer({
  open,
  onClose,
  member,
  creatives,
  role,
}: {
  open: boolean;
  onClose: () => void;
  member: TeamMember | null;
  creatives: CreativeRow[];
  role: "editor" | "copyWriter";
}) {
  const filtered = useMemo(() => {
    if (!member) return [];
    return creatives
      .filter((c) => (role === "editor" ? c.editor : c.copyWriter) === member.name)
      .sort((a, b) => b.revenue - a.revenue);
  }, [member, creatives, role]);

  if (!member) return null;

  const roleLabel = role === "editor" ? "Editor" : "Copy";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            {role === "editor" ? <Clapperboard className="h-4 w-4 text-primary" /> : <PenTool className="h-4 w-4 text-primary" />}
            {member.name}
            <Badge variant="outline" className="text-[9px] font-mono ml-auto">{roleLabel}</Badge>
          </SheetTitle>
        </SheetHeader>

        {/* Aggregated KPIs */}
        <div className="grid grid-cols-3 gap-2 px-4 py-3">
          {[
            { label: "Criativos", value: String(member.totalCreatives) },
            { label: "Vendas", value: fmt(member.totalSales) },
            { label: "Faturamento", value: fmtCurrency(member.totalRevenue) },
            { label: "Lucro", value: fmtCurrency(member.totalProfit), color: member.totalProfit >= 0 ? "text-emerald-400" : "text-destructive" },
            { label: "ROI médio", value: member.avgRoi > 0 ? `${member.avgRoi.toFixed(2)}x` : "—", color: member.avgRoi >= 1 ? "text-emerald-400" : "text-destructive" },
            { label: "Hook médio", value: fmtPct(member.avgHook) },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg bg-muted/40 p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-sm font-bold font-mono ${kpi.color || "text-foreground"}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Creatives table */}
        <div className="px-4 pb-4">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
            Criativos ({filtered.length})
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Criativo</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Hook</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Hold</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">CTR</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Vendas</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Invest</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Fatur.</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Lucro</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.creativeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-mono font-semibold text-foreground max-w-[120px] truncate" title={c.creativeId}>
                        {c.creativeId}
                      </td>
                      <td className="text-right px-2 py-2 font-mono text-foreground">{fmtPct(c.hookRate)}</td>
                      <td className="text-right px-2 py-2 font-mono text-foreground">{fmtPct(c.holdRate)}</td>
                      <td className="text-right px-2 py-2 font-mono text-foreground">{fmtPct(c.ctr)}</td>
                      <td className="text-right px-2 py-2 font-mono font-semibold text-foreground">{fmt(c.sales)}</td>
                      <td className="text-right px-2 py-2 font-mono text-foreground">{fmtCurrency(c.spend)}</td>
                      <td className="text-right px-2 py-2 font-mono text-foreground">{fmtCurrency(c.revenue)}</td>
                      <td className={`text-right px-2 py-2 font-mono font-semibold ${c.profit >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                        {fmtCurrency(c.profit)}
                      </td>
                      <td className={`text-right px-2 py-2 font-mono font-semibold ${c.roi >= 1 ? "text-emerald-400" : "text-destructive"}`}>
                        {c.roi.toFixed(2)}x
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

interface Props {
  creatives: CreativeRow[];
}

export function CreativeTeamLeaderboard({ creatives }: Props) {
  const editors = useMemo(() => buildRanking(creatives, "editor"), [creatives]);
  const copys = useMemo(() => buildRanking(creatives, "copyWriter"), [creatives]);
  const [selected, setSelected] = useState<{ member: TeamMember; role: "editor" | "copyWriter" } | null>(null);

  if (editors.length === 0 && copys.length === 0) return null;

  return (
    <>
      <div className="space-y-6">
        {/* Section Header */}
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Creative Leaderboard</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editors Ranking */}
          {editors.length > 0 && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clapperboard className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Ranking Editores</span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto font-mono text-muted-foreground">
                    {editors.length} editor{editors.length > 1 ? "es" : ""}
                  </Badge>
                </div>
                {editors.map((m, i) => (
                  <MemberCard
                    key={m.name}
                    member={m}
                    position={i}
                    topRevenue={editors[0]?.totalRevenue || 1}
                    onClick={() => setSelected({ member: m, role: "editor" })}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Copys Ranking */}
          {copys.length > 0 && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <PenTool className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Ranking Copys</span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto font-mono text-muted-foreground">
                    {copys.length} copy{copys.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                {copys.map((m, i) => (
                  <MemberCard
                    key={m.name}
                    member={m}
                    position={i}
                    topRevenue={copys[0]?.totalRevenue || 1}
                    onClick={() => setSelected({ member: m, role: "copyWriter" })}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Drill-down Drawer */}
      <MemberDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        member={selected?.member || null}
        creatives={creatives}
        role={selected?.role || "editor"}
      />
    </>
  );
}
