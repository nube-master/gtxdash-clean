import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Loader2 } from "lucide-react";
import { bucketize, type BucketDef, type BucketCounts } from "@/components/live/durationBuckets";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;


type HourPoint = {
  hour: number;
  t: string;
  viewers: number;
  avg_secs: number;
  median_secs: number;
  p90_secs: number;
  session_seconds: number[];
};

function fmtSecs(s?: number) {
  if (!s || s <= 0) return "0s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function bucketColor(i: number, n: number): string {
  if (n <= 1) return "hsl(var(--primary))";
  if (i === 0) return "hsl(var(--muted-foreground))";
  if (i === n - 1) return "hsl(var(--destructive))";
  const t = i / (n - 1);
  return `hsl(var(--primary) / ${(0.4 + t * 0.6).toFixed(2)})`;
}

export function PlayerHistoryDialog({
  open,
  onOpenChange,
  playerId,
  playerName,
  bucketDefs,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  playerId: string | null;
  playerName: string | null;
  bucketDefs: BucketDef[];
}) {
  const { operationId } = useOperation();
  const [series, setSeries] = useState<HourPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !playerId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const buildUrl = () => {
      const p = new URLSearchParams({ mode: "player_history", player_id: playerId });
      if (operationId) p.set("operation_id", operationId);
      return `${SUPABASE_URL}/functions/v1/live-viewers?${p.toString()}`;
    };
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token ?? ANON_KEY;
        const r = await fetch(buildUrl(), { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } });
        if (!r.ok) throw new Error(`history ${r.status}`);
        const j = await r.json();
        if (!cancelled) setSeries(j.series ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Erro ao carregar histórico");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const interval = setInterval(async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token ?? ANON_KEY;
        const r = await fetch(buildUrl(), { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setSeries(j.series ?? []);
      } catch { /* ignore */ }
    }, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [open, playerId, operationId]);


  // Constrói linhas para gráfico: viewers + buckets dinâmicos por hora
  const chartData = useMemo(() => {
    if (!series) return [];
    return series.map((h) => {
      const buckets: BucketCounts[] = bucketize(h.session_seconds, bucketDefs);
      const total = buckets.reduce((s, b) => s + b.count, 0) || 1;
      const row: Record<string, number | string> = {
        hourLabel: `${String(h.hour).padStart(2, "0")}h`,
        viewers: h.viewers,
        avg: h.avg_secs,
        median: h.median_secs,
        p90: h.p90_secs,
      };
      for (const b of buckets) {
        row[b.key] = Math.round((b.count / total) * 1000) / 10;
        row[`${b.key}_count`] = b.count;
        row[`${b.key}_label`] = b.label;
      }
      return row;
    });
  }, [series, bucketDefs]);

  const totalViewers = series?.reduce((s, h) => s + h.viewers, 0) ?? 0;
  const allSessions = useMemo(() => series?.flatMap((h) => h.session_seconds) ?? [], [series]);
  const overallAvg = allSessions.length ? Math.round(allSessions.reduce((a, b) => a + b, 0) / allSessions.length) : 0;
  const overallMedian = useMemo(() => {
    if (!allSessions.length) return 0;
    const s = [...allSessions].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }, [allSessions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-1">
            <span className="text-base">Evolução do tempo na sessão · hoje</span>
            <span className="text-xs font-mono text-muted-foreground truncate">{playerName ?? playerId}</span>
          </DialogTitle>
        </DialogHeader>

        {/* KPIs do dia */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <KPI label="Sessões hoje" value={String(totalViewers)} />
          <KPI label="Média" value={fmtSecs(overallAvg)} />
          <KPI label="Mediana" value={fmtSecs(overallMedian)} />
        </div>

        {loading && !series ? (
          <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando histórico…
          </div>
        ) : error ? (
          <div className="h-[200px] flex items-center justify-center text-destructive text-sm">{error}</div>
        ) : !chartData.length ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            Sem sessões registradas hoje para esta VSL.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tempo médio / mediana / p90 por hora */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Tempo médio · mediana · p90 por hora (BRT)
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hourLabel" tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="secs"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => fmtSecs(v as number)}
                    />
                    <YAxis
                      yAxisId="viewers"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number, name: string) => {
                        if (name === "viewers") return [`${value} sessões`, "Viewers"];
                        return [fmtSecs(value), name === "avg" ? "Média" : name === "median" ? "Mediana" : "p90"];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "avg" ? "Média" : v === "median" ? "Mediana" : v === "p90" ? "p90" : "Viewers"} />
                    <Bar yAxisId="viewers" dataKey="viewers" fill="hsl(var(--muted-foreground) / 0.25)" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="secs" type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="secs" type="monotone" dataKey="median" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 3" />
                    <Line yAxisId="secs" type="monotone" dataKey="p90" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} strokeDasharray="2 4" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Distribuição % de buckets por hora (stacked) */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Distribuição de faixas por hora (% de sessões)
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }} stackOffset="expand">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hourLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round((v as number) * 100)}%`} domain={[0, 1]} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number, name: string, item: any) => {
                        const label = item?.payload?.[`${name}_label`] as string | undefined;
                        const count = item?.payload?.[`${name}_count`] as number | undefined;
                        return [`${value}%${count != null ? ` · ${count}` : ""}`, label ?? name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => bucketDefs.find((b) => b.key === v)?.label ?? v} />
                    {bucketDefs.map((b, i) => (
                      <Bar key={b.key} dataKey={b.key} stackId="dur" fill={bucketColor(i, bucketDefs.length)} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
