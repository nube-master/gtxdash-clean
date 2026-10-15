import { useMemo } from "react";
import { type CreativeRow } from "@/lib/creativeUtils";

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  }).format(v);
}
function fmtPct(v: number, digits = 1) {
  return `${v.toFixed(digits)}%`;
}
function fmtRoi(v: number) {
  return v > 0 ? `${v.toFixed(2)}x` : "—";
}

// ── Project Config ────────────────────────────────────────────────────────

// Paleta rotativa para projetos dinâmicos (apelidos de offers)
const PROJECT_PALETTE = [
  { dot: "bg-cyan-400",    border: "border-cyan-500/30",    header: "bg-cyan-500/10 text-cyan-300" },
  { dot: "bg-blue-400",    border: "border-blue-500/30",    header: "bg-blue-500/10 text-blue-300" },
  { dot: "bg-amber-400",   border: "border-amber-500/30",   header: "bg-amber-500/10 text-amber-300" },
  { dot: "bg-emerald-400", border: "border-emerald-500/30", header: "bg-emerald-500/10 text-emerald-300" },
  { dot: "bg-rose-400",    border: "border-rose-500/30",    header: "bg-rose-500/10 text-rose-300" },
  { dot: "bg-violet-400",  border: "border-violet-500/30",  header: "bg-violet-500/10 text-violet-300" },
  { dot: "bg-orange-400",  border: "border-orange-500/30",  header: "bg-orange-500/10 text-orange-300" },
  { dot: "bg-teal-400",    border: "border-teal-500/30",    header: "bg-teal-500/10 text-teal-300" },
] as const;
function paletteFor(tag: string) {
  let h = 0; for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return PROJECT_PALETTE[h % PROJECT_PALETTE.length];
}

// ── Metric row config ─────────────────────────────────────────────────────

interface MetricDef {
  key: string;
  label: string;
  format: (v: number) => string;
  unit?: string;
  higherIsBetter: boolean;
  max?: number; // for bar normalization
}

const METRICS: MetricDef[] = [
  { key: "roi",      label: "ROI",       format: fmtRoi,               higherIsBetter: true,  max: 3 },
  { key: "hookRate", label: "Hook Rate", format: (v) => fmtPct(v),    higherIsBetter: true,  max: 100 },
  { key: "holdRate", label: "Hold Rate", format: (v) => fmtPct(v),    higherIsBetter: true,  max: 20 },
  { key: "sales",    label: "Vendas",    format: (v) => String(Math.round(v)), higherIsBetter: true },
  { key: "spend",    label: "Investido", format: fmtCurrency,          higherIsBetter: false },
  { key: "revenue",  label: "Receita",   format: fmtCurrency,          higherIsBetter: true },
  { key: "creatives",label: "Criativos", format: (v) => String(Math.round(v)), higherIsBetter: true },
  { key: "scalable", label: "Escaláveis",format: (v) => String(Math.round(v)), higherIsBetter: true },
  { key: "cac",      label: "CAC médio", format: fmtCurrency,          higherIsBetter: false },
];

// ── Aggregation ───────────────────────────────────────────────────────────

interface ProjectStats {
  tag: string;
  roi: number;
  hookRate: number;
  holdRate: number;
  sales: number;
  spend: number;
  revenue: number;
  creatives: number;
  scalable: number;
  cac: number;
  // raw for bar calcs
  totalImpressions: number;
  totalVideo3s: number;
  totalVideo75: number;
}

function aggregateProject(rows: CreativeRow[]): Omit<ProjectStats, "tag"> {
  let spend = 0, revenue = 0, sales = 0, impressions = 0;
  let video3s = 0, video75 = 0;
  let scalable = 0;

  for (const r of rows) {
    spend += r.spend;
    revenue += r.revenue;
    sales += r.sales;
    impressions += r.impressions;
    video3s += r.video3sViews;
    video75 += r.video75;
    if (r.tier.tier === "ESCALAVEL") scalable++;
  }

  const roi = spend > 0 ? revenue / spend : 0;
  const hookRate = impressions > 0 ? (video3s / impressions) * 100 : 0;
  const holdRate = impressions > 0 ? (video75 / impressions) * 100 : 0;
  const cac = sales > 0 ? spend / sales : 0;

  return {
    roi, hookRate, holdRate, sales, spend, revenue,
    creatives: rows.length, scalable, cac,
    totalImpressions: impressions, totalVideo3s: video3s, totalVideo75: video75,
  };
}

// ── Bar component ─────────────────────────────────────────────────────────

function MetricBar({
  value, max, color, higherIsBetter,
}: { value: number; max: number; color: string; higherIsBetter: boolean }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1 w-full rounded-full bg-muted/30 overflow-hidden mt-0.5">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Color helpers ─────────────────────────────────────────────────────────

function roiColor(v: number) {
  if (v >= 1.5) return "text-wr-positive";
  if (v >= 1.0) return "text-wr-warning";
  if (v > 0)   return "text-destructive";
  return "text-muted-foreground";
}
function hookColor(v: number) {
  if (v >= 55) return "text-wr-positive";
  if (v >= 35) return "text-wr-warning";
  return "text-destructive";
}
function holdColor(v: number) {
  if (v >= 8)  return "text-wr-positive";
  if (v >= 3)  return "text-wr-warning";
  return "text-destructive";
}

// ── Main Component ────────────────────────────────────────────────────────

interface Props {
  creatives: CreativeRow[];
  isAdmin: boolean;
}

export function CreativeProjectComparison({ creatives, isAdmin }: Props) {
  const stats = useMemo<ProjectStats[]>(() => {
    // Deriva projetos dinamicamente a partir dos próprios criativos (sem hardcode).
    // Ignora criativos sem tag de projeto reconhecida.
    const byTag = new Map<string, CreativeRow[]>();
    for (const c of creatives) {
      const tag = c.project?.tag;
      if (!tag || tag === "SEM_TAG") continue;
      const arr = byTag.get(tag) ?? [];
      arr.push(c);
      byTag.set(tag, arr);
    }
    return Array.from(byTag.entries())
      .map(([tag, rows]) => ({ tag, ...aggregateProject(rows) }))
      .sort((a, b) => b.spend - a.spend);
  }, [creatives]);

  // Per-metric max values (across projects) for bar normalization
  const maxValues = useMemo(() => {
    const keys = ["roi","hookRate","holdRate","sales","spend","revenue","creatives","scalable","cac"] as const;
    const m: Record<string, number> = {};
    for (const k of keys) {
      m[k] = Math.max(...stats.map((s) => (s as unknown as Record<string, number>)[k] ?? 0), 0.001);
    }
    return m;
  }, [stats]);

  // Best project per metric
  const bestProject = useMemo(() => {
    const out: Record<string, string> = {};
    const metricsForBest: { key: string; higherIsBetter: boolean }[] = [
      { key: "roi", higherIsBetter: true },
      { key: "hookRate", higherIsBetter: true },
      { key: "holdRate", higherIsBetter: true },
      { key: "sales", higherIsBetter: true },
      { key: "revenue", higherIsBetter: true },
      { key: "cac", higherIsBetter: false },
    ];
    for (const m of metricsForBest) {
      const sorted = [...stats].sort((a, b) => {
        const av = (a as unknown as Record<string, number>)[m.key] ?? 0;
        const bv = (b as unknown as Record<string, number>)[m.key] ?? 0;
        return m.higherIsBetter ? bv - av : av - bv;
      });
      if (sorted.length > 0) out[m.key] = sorted[0].tag;
    }
    return out;
  }, [stats]);

  const totalSpend = stats.reduce((s, p) => s + p.spend, 0);

  if (stats.length === 0) {
    return (
      <div className="text-center text-muted-foreground font-mono text-sm py-16">
        Nenhum criativo com projeto identificado no período selecionado.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Summary cards — one per project ── */}
      <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${stats.length >= 4 ? "lg:grid-cols-4" : stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {stats.map((s) => {
          const cfg = { ...paletteFor(s.tag), tag: s.tag, label: s.tag };
          const spendShare = totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0;
          return (
            <div
              key={s.tag}
              className={`wr-card overflow-hidden border ${cfg.border}`}
            >
              {/* Header */}
              <div className={`px-4 py-3 flex items-center justify-between ${cfg.header}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                  <span className="font-mono font-bold text-sm">{cfg.label}</span>
                </div>
                <span className="font-mono text-[10px] opacity-70">{s.creatives} criativos</span>
              </div>

              {/* Metrics grid */}
              <div className="p-4 space-y-3">
                {/* ROI */}
                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">ROI</span>
                    <span className={`text-lg font-bold font-data ${roiColor(s.roi)}`}>{fmtRoi(s.roi)}</span>
                  </div>
                  <MetricBar value={s.roi} max={Math.max(maxValues.roi, 3)} color={cfg.dot} higherIsBetter={true} />
                </div>

                {/* Hook + Hold */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Hook %</p>
                    <p className={`text-sm font-bold font-data mt-0.5 ${hookColor(s.hookRate)}`}>{fmtPct(s.hookRate)}</p>
                    <MetricBar value={s.hookRate} max={100} color={cfg.dot} higherIsBetter={true} />
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Hold %</p>
                    <p className={`text-sm font-bold font-data mt-0.5 ${holdColor(s.holdRate)}`}>{fmtPct(s.holdRate)}</p>
                    <MetricBar value={s.holdRate} max={Math.max(maxValues.holdRate, 20)} color={cfg.dot} higherIsBetter={true} />
                  </div>
                </div>

                {/* Sales + Scalable */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Vendas</p>
                    <p className="text-sm font-bold font-data mt-0.5 text-foreground">{s.sales}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Escaláveis</p>
                    <p className="text-sm font-bold font-data mt-0.5 text-wr-positive">🟢 {s.scalable}</p>
                  </div>
                </div>

                {/* Financial — admin only */}
                {isAdmin && (
                  <div className="pt-2 border-t border-border/50 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground">Investido</span>
                      <span className="text-[11px] font-mono text-foreground">{fmtCurrency(s.spend)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground">Receita</span>
                      <span className="text-[11px] font-mono text-foreground">{fmtCurrency(s.revenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground">CAC médio</span>
                      <span className="text-[11px] font-mono text-foreground">{s.cac > 0 ? fmtCurrency(s.cac) : "—"}</span>
                    </div>
                    {/* Spend share bar */}
                    <div className="pt-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-[9px] font-mono text-muted-foreground">% do invest. total</span>
                        <span className="text-[9px] font-mono text-muted-foreground">{spendShare.toFixed(0)}%</span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-muted/30 overflow-hidden">
                        <div className={`h-full rounded-full ${cfg.dot}`} style={{ width: `${spendShare}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Ranking table — metrics side by side ── */}
      <div className="wr-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[11px] font-mono font-medium text-muted-foreground uppercase tracking-wider">
            Ranking por Métrica
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-28">Métrica</th>
                {stats.map((s) => {
                  const cfg = { ...paletteFor(s.tag), tag: s.tag, label: s.tag };
                  return (
                    <th key={s.tag} className="text-center px-4 py-2.5">
                      <span className="flex items-center justify-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                        <span className="text-[10px] font-bold text-foreground">{cfg.label}</span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: "ROI", key: "roi", higherIsBetter: true,
                  fmt: fmtRoi,
                  color: (v: number, tag: string) => bestProject.roi === tag ? "font-bold text-wr-positive" : roiColor(v),
                },
                {
                  label: "Hook Rate", key: "hookRate", higherIsBetter: true,
                  fmt: (v: number) => fmtPct(v),
                  color: (v: number, tag: string) => bestProject.hookRate === tag ? "font-bold text-wr-positive" : hookColor(v),
                },
                {
                  label: "Hold Rate", key: "holdRate", higherIsBetter: true,
                  fmt: (v: number) => fmtPct(v),
                  color: (v: number, tag: string) => bestProject.holdRate === tag ? "font-bold text-wr-positive" : holdColor(v),
                },
                {
                  label: "Vendas", key: "sales", higherIsBetter: true,
                  fmt: (v: number) => String(Math.round(v)),
                  color: (_v: number, tag: string) => bestProject.sales === tag ? "font-bold text-wr-positive" : "text-foreground",
                },
                {
                  label: "Criativos", key: "creatives", higherIsBetter: true,
                  fmt: (v: number) => String(Math.round(v)),
                  color: () => "text-foreground",
                },
                {
                  label: "Escaláveis", key: "scalable", higherIsBetter: true,
                  fmt: (v: number) => `🟢 ${Math.round(v)}`,
                  color: () => "text-wr-positive",
                },
                ...(isAdmin ? [
                  {
                    label: "Investido", key: "spend", higherIsBetter: false,
                    fmt: fmtCurrency,
                    color: () => "text-foreground" as string,
                  },
                  {
                    label: "Receita", key: "revenue", higherIsBetter: true,
                    fmt: fmtCurrency,
                    color: (_v: number, tag: string) => bestProject.revenue === tag ? "font-bold text-wr-positive" : "text-foreground",
                  },
                  {
                    label: "CAC médio", key: "cac", higherIsBetter: false,
                    fmt: (v: number) => v > 0 ? fmtCurrency(v) : "—",
                    color: (_v: number, tag: string) => bestProject.cac === tag ? "font-bold text-wr-positive" : "text-foreground",
                  },
                ] : []),
              ].map((row, i) => (
                <tr key={row.key} className={`border-b border-border/40 ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                  <td className="px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {row.label}
                  </td>
                  {stats.map((s) => {
                    const val = (s as unknown as Record<string, number>)[row.key] ?? 0;
                    return (
                      <td key={s.tag} className={`px-4 py-2.5 text-center ${row.color(val, s.tag)}`}>
                        {row.fmt(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border/40">
          <p className="text-[9px] font-mono text-muted-foreground">🏆 Destaque em verde = melhor resultado na métrica</p>
        </div>
      </div>
    </div>
  );
}
