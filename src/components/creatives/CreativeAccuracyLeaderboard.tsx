import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, Crosshair, PenTool, Clapperboard, CheckCircle2, XCircle, Info, Flame, Rocket, FlaskConical, AlertTriangle } from "lucide-react";
import { type CreativeRow } from "@/lib/creativeUtils";

// ─── Types ──────────────────────────────────────────────────────────────

interface AccuracyMember {
  name: string;
  airedCount: number;       // criativos no ar (gasto > 0)
  hitCount: number;         // criativos com >=1 venda
  profitableCount: number;  // criativos com ROI > 1 (lucro positivo)
  burnCount: number;        // criativos com gasto mas zero receita
  totalSales: number;
  totalRevenue: number;
  totalSpend: number;
  hitRate: number;          // hitCount / airedCount
  profitRate: number;       // profitableCount / airedCount
  burnRate: number;         // burnCount / airedCount
  avgSalesPerHit: number;   // totalSales / hitCount (potência média do "acerto")
}

interface BreakdownItem {
  creativeId: string;
  spend: number;
  revenue: number;
  sales: number;
  roi: number;
  hit: boolean;
  profitable: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmtPct = (v: number) => v.toFixed(0) + "%";

function PositionBadge({ pos }: { pos: number }) {
  if (pos === 1) return <span className="text-lg">🥇</span>;
  if (pos === 2) return <span className="text-lg">🥈</span>;
  if (pos === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-[11px] font-bold font-mono text-muted-foreground">#{pos}</span>;
}

function classifyMember(m: AccuracyMember): { label: string; icon: JSX.Element; tone: string } {
  if (m.hitRate >= 0.5 && m.airedCount >= 3)
    return { label: "Sniper", icon: <Crosshair className="h-3 w-3" />, tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  if (m.profitRate >= 0.25 && m.airedCount >= 10)
    return { label: "Producer", icon: <Rocket className="h-3 w-3" />, tone: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
  if (m.airedCount >= 15 && m.hitRate < 0.2)
    return { label: "Tester", icon: <FlaskConical className="h-3 w-3" />, tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  if (m.burnRate >= 0.7)
    return { label: "Refinar", icon: <AlertTriangle className="h-3 w-3" />, tone: "bg-destructive/15 text-destructive border-destructive/30" };
  return { label: "Em curva", icon: <Flame className="h-3 w-3" />, tone: "bg-muted text-muted-foreground border-border" };
}

function buildAccuracyRanking(creatives: CreativeRow[], field: "editor" | "copyWriter"): AccuracyMember[] {
  const map = new Map<string, {
    aired: number; hit: number; profitable: number; burn: number;
    sales: number; revenue: number; spend: number;
  }>();

  for (const c of creatives) {
    const name = field === "editor" ? c.editor : c.copyWriter;
    if (!name) continue;
    if (c.spend <= 0) continue; // Universo: criativos no ar (gasto > 0)

    if (!map.has(name)) map.set(name, { aired: 0, hit: 0, profitable: 0, burn: 0, sales: 0, revenue: 0, spend: 0 });
    const d = map.get(name)!;

    d.aired += 1;
    d.spend += c.spend;
    d.revenue += c.revenue;
    d.sales += c.sales;

    if (c.sales > 0) d.hit += 1;
    if (c.roi > 1) d.profitable += 1;
    if (c.revenue === 0) d.burn += 1;
  }

  const out: AccuracyMember[] = [];
  for (const [name, d] of map) {
    out.push({
      name,
      airedCount: d.aired,
      hitCount: d.hit,
      profitableCount: d.profitable,
      burnCount: d.burn,
      totalSales: d.sales,
      totalRevenue: d.revenue,
      totalSpend: d.spend,
      hitRate: d.aired > 0 ? d.hit / d.aired : 0,
      profitRate: d.aired > 0 ? d.profitable / d.aired : 0,
      burnRate: d.aired > 0 ? d.burn / d.aired : 0,
      avgSalesPerHit: d.hit > 0 ? d.sales / d.hit : 0,
    });
  }

  // Ordena por: 1) Hit Rate desc, 2) qtd no ar desc (desempate)
  out.sort((a, b) => {
    if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
    return b.airedCount - a.airedCount;
  });
  return out;
}

// ─── Member Card ────────────────────────────────────────────────────────

function MemberCard({ member, position, onClick }: { member: AccuracyMember; position: number; onClick: () => void }) {
  const cls = classifyMember(member);
  const hitColor =
    member.hitRate >= 0.4 ? "text-emerald-400" : member.hitRate >= 0.2 ? "text-amber-400" : "text-destructive";

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 transition-all hover:scale-[1.01] cursor-pointer ${
        position === 0
          ? "border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_20px_hsl(155,80%,45%,0.08)]"
          : position < 3
          ? "border-border/60 bg-secondary/20"
          : "border-border/30 bg-card"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <PositionBadge pos={position + 1} />
        <span className="text-sm font-bold text-foreground flex-1">{member.name}</span>
        <Badge variant="outline" className={`text-[9px] gap-1 ${cls.tone}`}>
          {cls.icon}
          {cls.label}
        </Badge>
      </div>

      {/* Hit Rate hero */}
      <div className="rounded-lg bg-secondary/40 p-3 mb-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Assertividade</span>
          <span className={`text-2xl font-bold font-mono ${hitColor}`}>{fmtPct(member.hitRate * 100)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full ${
              member.hitRate >= 0.4 ? "bg-emerald-500" : member.hitRate >= 0.2 ? "bg-amber-500" : "bg-destructive"
            }`}
            style={{ width: `${Math.min(member.hitRate * 100, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
          {member.hitCount} de {member.airedCount} criativos venderam
        </p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">No ar</span>
          <span className="text-[11px] font-bold font-mono text-foreground">{member.airedCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Lucrativos</span>
          <span className="text-[11px] font-bold font-mono text-emerald-400">
            {member.profitableCount} ({fmtPct(member.profitRate * 100)})
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Vendas tot.</span>
          <span className="text-[11px] font-bold font-mono text-foreground">{fmt(member.totalSales)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Queima</span>
          <span className={`text-[11px] font-bold font-mono ${member.burnRate >= 0.7 ? "text-destructive" : "text-muted-foreground"}`}>
            {member.burnCount} ({fmtPct(member.burnRate * 100)})
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Vendas/acerto</span>
          <span className="text-[11px] font-bold font-mono text-foreground">
            {member.avgSalesPerHit > 0 ? member.avgSalesPerHit.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-muted-foreground">Investido</span>
          <span className="text-[11px] font-bold font-mono text-foreground">{fmtCurrency(member.totalSpend)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer ─────────────────────────────────────────────────────────────

function MemberDrawer({
  open,
  onClose,
  member,
  creatives,
  role,
}: {
  open: boolean;
  onClose: () => void;
  member: AccuracyMember | null;
  creatives: CreativeRow[];
  role: "editor" | "copyWriter";
}) {
  const breakdown: BreakdownItem[] = useMemo(() => {
    if (!member) return [];
    return creatives
      .filter((c) => (role === "editor" ? c.editor : c.copyWriter) === member.name && c.spend > 0)
      .map((c) => ({
        creativeId: c.creativeId,
        spend: c.spend,
        revenue: c.revenue,
        sales: c.sales,
        roi: c.roi,
        hit: c.sales > 0,
        profitable: c.roi > 1,
      }))
      .sort((a, b) => Number(b.hit) - Number(a.hit) || b.revenue - a.revenue);
  }, [member, creatives, role]);

  if (!member) return null;
  const cls = classifyMember(member);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            {role === "editor" ? <Clapperboard className="h-4 w-4 text-primary" /> : <PenTool className="h-4 w-4 text-primary" />}
            {member.name}
            <Badge variant="outline" className={`text-[9px] gap-1 ml-auto ${cls.tone}`}>
              {cls.icon}
              {cls.label}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2 px-4 py-3">
          {[
            { label: "Assertividade", value: fmtPct(member.hitRate * 100), color: member.hitRate >= 0.4 ? "text-emerald-400" : member.hitRate >= 0.2 ? "text-amber-400" : "text-destructive" },
            { label: "Hit Lucrativo", value: fmtPct(member.profitRate * 100), color: member.profitRate >= 0.2 ? "text-emerald-400" : "text-muted-foreground" },
            { label: "Burn Rate", value: fmtPct(member.burnRate * 100), color: member.burnRate >= 0.7 ? "text-destructive" : "text-muted-foreground" },
            { label: "No ar", value: String(member.airedCount) },
            { label: "Acertos", value: `${member.hitCount}/${member.airedCount}` },
            { label: "Vendas/Acerto", value: member.avgSalesPerHit > 0 ? member.avgSalesPerHit.toFixed(1) : "—" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg bg-muted/40 p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-sm font-bold font-mono ${kpi.color || "text-foreground"}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Breakdown table */}
        <div className="px-4 pb-4">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
            Criativos no ar — quem vendeu × quem queimou ({breakdown.length})
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Criativo</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Invest.</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Receita</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Vendas</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((c) => (
                    <tr key={c.creativeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2">
                        {c.hit ? (
                          <CheckCircle2 className={`h-3.5 w-3.5 ${c.profitable ? "text-emerald-400" : "text-amber-400"}`} />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive/70" />
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-foreground max-w-[140px] truncate" title={c.creativeId}>
                        {c.creativeId}
                      </td>
                      <td className="text-right px-2 py-2 font-mono text-foreground">{fmtCurrency(c.spend)}</td>
                      <td className="text-right px-2 py-2 font-mono text-foreground">{fmtCurrency(c.revenue)}</td>
                      <td className="text-right px-2 py-2 font-mono font-semibold text-foreground">{fmt(c.sales)}</td>
                      <td className={`text-right px-2 py-2 font-mono font-semibold ${c.roi >= 1 ? "text-emerald-400" : c.roi > 0 ? "text-amber-400" : "text-destructive"}`}>
                        {c.roi > 0 ? `${c.roi.toFixed(2)}x` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground font-mono">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Vendeu c/ lucro</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-amber-400" /> Vendeu s/ lucro</span>
            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-destructive/70" /> Queimou (zero venda)</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────

interface Props {
  creatives: CreativeRow[];
}

export function CreativeAccuracyLeaderboard({ creatives }: Props) {
  const editors = useMemo(() => buildAccuracyRanking(creatives, "editor"), [creatives]);
  const copys = useMemo(() => buildAccuracyRanking(creatives, "copyWriter"), [creatives]);
  const [selected, setSelected] = useState<{ member: AccuracyMember; role: "editor" | "copyWriter" } | null>(null);

  if (editors.length === 0 && copys.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Section Header */}
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Assertividade da Equipe</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs text-xs">
              <p className="font-semibold mb-1">Como é calculado:</p>
              <p className="text-muted-foreground mb-2">
                Para cada Copy/Editor no período, pega <strong>todos os criativos no ar (gasto &gt; R$0)</strong> e calcula
                quantos % geraram pelo menos 1 venda.
              </p>
              <p className="font-mono text-[10px]">Assertividade = criativos com venda ÷ criativos no ar</p>
            </TooltipContent>
          </Tooltip>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editors */}
          {editors.length > 0 && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clapperboard className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Assertividade — Editores</span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto font-mono text-muted-foreground">
                    {editors.length} editor{editors.length > 1 ? "es" : ""}
                  </Badge>
                </div>
                {editors.map((m, i) => (
                  <MemberCard key={m.name} member={m} position={i} onClick={() => setSelected({ member: m, role: "editor" })} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Copys */}
          {copys.length > 0 && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <PenTool className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Assertividade — Copys</span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto font-mono text-muted-foreground">
                    {copys.length} copy{copys.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                {copys.map((m, i) => (
                  <MemberCard key={m.name} member={m} position={i} onClick={() => setSelected({ member: m, role: "copyWriter" })} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <MemberDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        member={selected?.member || null}
        creatives={creatives}
        role={selected?.role || "editor"}
      />
    </TooltipProvider>
  );
}
