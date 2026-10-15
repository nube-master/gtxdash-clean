import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingDown } from "lucide-react";

export type SecondsCurvePoint = { sec: number; viewers: number };

export type LivePlayerCurve = {
  player_id: string;
  player_name: string | null;
  count: number;
  seconds_curve?: SecondsCurvePoint[];
};

interface Props {
  players: LivePlayerCurve[];
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Curva de retenção live: para cada VSL ativa, plota
 * % de viewers que estão nesse segundo OU além ("retention curve" cumulativa).
 * Usa current_second_in_video do snapshot ao vivo (bucket 30s) → foto instantânea.
 */
export function LiveRetentionCurveCard({ players }: Props) {
  const charts = useMemo(() => {
    return players
      .filter((p) => p.seconds_curve && p.seconds_curve.length > 1)
      .map((p) => {
        const curve = [...(p.seconds_curve ?? [])].sort((a, b) => a.sec - b.sec);
        const total = curve.reduce((s, c) => s + c.viewers, 0);
        // Cumulativa: % com current_second >= sec
        let cum = total;
        const data = curve.map((c) => {
          const pct = total ? Math.round((cum / total) * 1000) / 10 : 0;
          const point = { sec: c.sec, viewers: c.viewers, retention: pct };
          cum -= c.viewers;
          return point;
        });
        // maior queda
        let maxDrop = 0;
        let dropAt = 0;
        for (let i = 1; i < data.length; i++) {
          const d = data[i - 1].retention - data[i].retention;
          if (d > maxDrop) { maxDrop = d; dropAt = data[i].sec; }
        }
        const half = data.find((p) => p.retention <= 50);
        return { player: p, data, maxDrop, dropAt, half };
      })
      .sort((a, b) => b.player.count - a.player.count);
  }, [players]);

  if (!charts.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Curva de retenção ao vivo</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            posição no vídeo · snapshot atual
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {charts.map(({ player, data, maxDrop, dropAt, half }) => (
            <div key={player.player_id} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold truncate" title={player.player_name || player.player_id}>
                  {player.player_name || player.player_id}
                </span>
                <span className="text-muted-foreground tabular-nums">{player.count} viewers</span>
              </div>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`g-${player.player_id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.4} />
                    <XAxis
                      dataKey="sec"
                      tickFormatter={fmt}
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      labelFormatter={(v) => `Em ${fmt(Number(v))}`}
                      formatter={(value: number, name: string) =>
                        name === "retention"
                          ? [`${value}%`, "Retenção"]
                          : [`${value}`, "Viewers"]
                      }
                    />
                    {half && (
                      <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" opacity={0.5} />
                    )}
                    {dropAt > 0 && (
                      <ReferenceLine x={dropAt} stroke="hsl(var(--destructive))" strokeDasharray="4 4" opacity={0.6} />
                    )}
                    <Area
                      type="monotone"
                      dataKey="retention"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill={`url(#g-${player.player_id})`}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                {half ? (
                  <span>50% em <strong className="text-foreground">{fmt(half.sec)}</strong></span>
                ) : (
                  <span>50% &gt; vídeo todo</span>
                )}
                {maxDrop > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-destructive" />
                    queda em <strong className="text-foreground">{fmt(dropAt)}</strong> ({maxDrop.toFixed(1)}pp)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
