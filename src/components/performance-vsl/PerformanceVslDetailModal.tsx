import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as ReTooltip, CartesianGrid, AreaChart, Area } from "recharts";
import { useMemo } from "react";
import type { PerformanceVslRow } from "@/hooks/usePerformanceVslData";
import { VslOriginPanel } from "@/components/performance-vsl/VslOriginPanel";

interface Props {
  row: PerformanceVslRow | null;
  onClose: () => void;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);
}

/** Extract second-by-second retention curve from JSONB (array of {second, pct} or {t, v}) */
function parseCurve(curve: any): { second: number; pct: number }[] {
  if (!curve) return [];
  if (Array.isArray(curve)) {
    return curve.map((p: any) => ({
      second: Number(p.second ?? p.t ?? p.s ?? 0),
      pct: Number(p.pct ?? p.v ?? p.retention ?? 0),
    })).filter((p) => !Number.isNaN(p.second));
  }
  if (typeof curve === "object") {
    return Object.entries(curve).map(([k, v]) => ({ second: Number(k), pct: Number(v) }));
  }
  return [];
}

export function PerformanceVslDetailModal({ row, onClose }: Props) {
  // Use the most-recent day's curve as the representative retention curve
  const retentionCurve = useMemo(() => {
    if (!row?.days?.length) return [];
    const latest = [...row.days].reverse().find((d) => d.retention_curve);
    return parseCurve(latest?.retention_curve);
  }, [row]);

  const dailyChart = useMemo(() => {
    return (row?.days || []).map((d) => ({
      date: d.date.slice(5), // MM-DD
      views: d.views,
      retention_50: d.retention_50,
      conversions: d.conversions,
    }));
  }, [row]);

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{row?.vsl_name || "—"}</span>
            <Badge variant="outline" className="text-[10px]">{row?.project || "—"}</Badge>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            ID: {row?.vsl_id} · Cruzamento Meta/RedTrack consolidado por projeto
          </DialogDescription>
        </DialogHeader>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          <div className="rounded-lg border border-border/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Views</div>
            <div className="text-xl font-bold tabular-nums">{(row?.views || 0).toLocaleString("pt-BR")}</div>
          </div>
          <div className="rounded-lg border border-border/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Retenção 50%</div>
            <div className="text-xl font-bold tabular-nums">{(row?.retention_50 || 0).toFixed(1)}%</div>
          </div>
          <div className="rounded-lg border border-border/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CTA Rate</div>
            <div className="text-xl font-bold tabular-nums">{(row?.cta_rate || 0).toFixed(2)}%</div>
          </div>
          <div className="rounded-lg border border-border/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">ROI</div>
            <div className={`text-xl font-bold tabular-nums ${
              (row?.roi || 0) >= 2 ? "text-emerald-500"
              : (row?.roi || 0) >= 1 ? "text-amber-500"
              : "text-rose-500"
            }`}>
              {(row?.roi || 0).toFixed(2)}x
            </div>
          </div>
        </div>

        {/* Cross-reference cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <div className="rounded-lg border border-border/40 p-3 bg-muted/20">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Meta Ads</div>
            <div className="text-sm font-mono">Spend: <span className="font-bold">{formatBRL(row?.meta_spend_brl || 0)}</span></div>
            <div className="text-xs text-muted-foreground">Clicks: {(row?.meta_clicks || 0).toLocaleString("pt-BR")} · Impr: {(row?.meta_impressions || 0).toLocaleString("pt-BR")}</div>
          </div>
          <div className="rounded-lg border border-border/40 p-3 bg-muted/20">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Vturb</div>
            <div className="text-sm font-mono">Conv: <span className="font-bold">{row?.conversions || 0}</span></div>
            <div className="text-xs text-muted-foreground">CTA Clicks: {(row?.cta_clicks || 0).toLocaleString("pt-BR")}</div>
          </div>
          <div className="rounded-lg border border-border/40 p-3 bg-muted/20">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">RedTrack</div>
            <div className="text-sm font-mono">Revenue: <span className="font-bold">{formatBRL(row?.rt_revenue_brl || 0)}</span></div>
            <div className="text-xs text-muted-foreground">Vendas: {row?.rt_sales || 0}</div>
          </div>
        </div>

        {/* Origem de Criativos (VTurb traffic_origin agrupado por AD ID) */}
        <VslOriginPanel vsl_id={row?.vsl_id} />

        {/* Top Meta Campaigns × RedTrack (cruzamento real) */}
        {row && row.top_campaigns.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-foreground mb-2">
              Campanhas Meta × Vendas reais (RedTrack) · projeto <Badge variant="outline" className="text-[10px] ml-1">{row.project}</Badge>
            </div>
            <div className="rounded-lg border border-border/40 overflow-hidden max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 border-b border-border/40 sticky top-0">
                  <tr className="text-left text-muted-foreground uppercase text-[10px] tracking-wider">
                    <th className="px-3 py-2 font-medium">Campanha</th>
                    <th className="px-3 py-2 font-medium text-right">Spend</th>
                    <th className="px-3 py-2 font-medium text-right">Clicks</th>
                    <th className="px-3 py-2 font-medium text-right">Vendas RT</th>
                    <th className="px-3 py-2 font-medium text-right">Receita RT</th>
                    <th className="px-3 py-2 font-medium text-right">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {row.top_campaigns.map((c) => (
                    <tr key={c.campaign_name} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-[11px] max-w-[360px]">
                        <div className="truncate" title={c.campaign_name}>{c.campaign_name}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatBRL(c.spend_brl)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{c.clicks.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.rt_sales.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatBRL(c.rt_revenue_brl)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        c.roi >= 2 ? "text-emerald-500" : c.roi >= 1 ? "text-amber-500" : c.roi > 0 ? "text-rose-500" : "text-muted-foreground"
                      }`}>
                        {c.roi > 0 ? `${c.roi.toFixed(2)}x` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 italic">
              💡 Cruzamento autoritativo: <span className="font-mono">utm_campaign</span> do RedTrack = <span className="font-mono">campaign_name</span> do Meta. Vendas e receita são reais por campanha. Spend é do Meta para a mesma campanha. Top 10 ordenadas por receita.
            </p>
          </div>
        )}

        {/* UTMs Vturb (origem do tráfego do player) */}
        {row && row.utms.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-foreground mb-2">
              UTMs Vturb · origem do tráfego do player
            </div>
            <div className="rounded-lg border border-border/40 overflow-hidden max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 border-b border-border/40 sticky top-0">
                  <tr className="text-left text-muted-foreground uppercase text-[10px] tracking-wider">
                    <th className="px-3 py-2 font-medium">utm_campaign / Meta</th>
                    <th className="px-3 py-2 font-medium text-right">Spend</th>
                    <th className="px-3 py-2 font-medium text-right">Visits</th>
                    <th className="px-3 py-2 font-medium text-right">Plays</th>
                    
                    <th className="px-3 py-2 font-medium text-right">CTA</th>
                    <th className="px-3 py-2 font-medium text-right">Conv</th>
                    <th className="px-3 py-2 font-medium text-right">Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {row.utms.map((u) => {
                    const pitchColor =
                      u.pitch_pct >= 50 ? "text-emerald-500"
                      : u.pitch_pct >= 30 ? "text-amber-500"
                      : u.pitch_pct > 0 ? "text-rose-500"
                      : "text-muted-foreground";
                    const convColor =
                      u.conv_rate >= 3 ? "text-emerald-500"
                      : u.conv_rate >= 1 ? "text-amber-500"
                      : u.conv_rate > 0 ? "text-rose-500"
                      : "text-muted-foreground";
                    const playRate = u.views > 0 ? (u.plays / u.views) * 100 : 0;
                    return (
                      <tr key={`${u.utm_campaign}-${u.meta_campaign_id ?? "na"}`} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono text-[11px] max-w-[320px]">
                          <div className="truncate" title={u.utm_campaign}>
                            {u.utm_campaign === "(sem utm)" ? (
                              <span className="text-muted-foreground italic">{u.utm_campaign}</span>
                            ) : u.utm_campaign}
                          </div>
                          {u.meta_campaign_id && (
                            <div className="text-[9px] text-muted-foreground/70 font-mono truncate flex items-center gap-1" title={u.meta_campaign_name ?? `Meta ID: ${u.meta_campaign_id} (não encontrado em meta_campaign_status)`}>
                              {u.is_orphan ? (
                                <>
                                  <span className="text-amber-500">⚠</span>
                                  <span className="italic text-amber-500/80">órfã ({u.meta_campaign_id})</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground/60">→ {u.meta_campaign_name}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {u.meta_spend_brl > 0
                            ? formatBRL(u.meta_spend_brl)
                            : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{u.views.toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {u.plays.toLocaleString("pt-BR")}
                          <span className="text-muted-foreground/70 text-[9px] ml-1">({playRate.toFixed(0)}%)</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{u.cta_clicks.toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{u.conversions.toLocaleString("pt-BR")}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${convColor}`}>
                          {u.conv_rate > 0 ? `${u.conv_rate.toFixed(2)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 italic">
              ✅ Cruzamento <strong>1:1 exato</strong> via <span className="font-mono">meta_campaign_id</span> (Vturb <span className="font-mono">grouped_field</span> ↔ <span className="font-mono">meta_campaign_status.campaign_id</span>). Sem fuzzy match. <span className="text-amber-500">⚠ órfã</span> = UTM rastreou ID mas a campanha sumiu do Meta (deletada ou fora do tenant atual).
            </p>
          </div>
        )}

        <div className="mt-4">
          <div className="text-xs font-semibold text-foreground mb-2">Curva de retenção (segundo a segundo)</div>
          {retentionCurve.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={retentionCurve}>
                <defs>
                  <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                <XAxis dataKey="second" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(s) => `${s}s`} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <ReTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: any) => [`${Number(value).toFixed(1)}%`, "Retenção"]}
                  labelFormatter={(s) => `Segundo ${s}`}
                />
                <Area type="monotone" dataKey="pct" stroke="hsl(var(--primary))" fill="url(#retGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-muted-foreground italic px-3 py-8 text-center border border-dashed border-border/40 rounded-lg">
              Curva de retenção indisponível para esta VSL no período.
            </div>
          )}
        </div>

        {/* Daily breakdown */}
        <div className="mt-4">
          <div className="text-xs font-semibold text-foreground mb-2">Breakdown diário</div>
          {dailyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <ReTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Views" />
                <Line type="monotone" dataKey="conversions" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} name="Conv" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-muted-foreground italic">Sem dados diários.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
