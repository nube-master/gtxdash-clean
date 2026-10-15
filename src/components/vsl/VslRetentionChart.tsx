import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Loader2, TrendingDown } from "lucide-react";
import { useVslRetention } from "@/hooks/useVslRetention";

interface VslRetentionChartProps {
  playerId: string | null;
  playerName: string;
  startDate?: string;
  endDate?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VslRetentionChart({ playerId, playerName, startDate, endDate }: VslRetentionChartProps) {
  const { data, isLoading, error } = useVslRetention(playerId, startDate, endDate);

  if (!playerId) {
    return (
      <Card className="wr-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Curva de Retenção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground text-center py-8">
            Selecione uma VSL específica para ver a curva de retenção.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="wr-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Curva de Retenção
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.curve?.length) {
    return (
      <Card className="wr-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Curva de Retenção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground text-center py-8">
            {error ? "Erro ao carregar dados de retenção." : "Sem dados de retenção disponíveis."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sample the curve to max ~100 points for performance
  const curve = data.curve;
  const step = Math.max(1, Math.floor(curve.length / 100));
  const sampled = curve.filter((_: any, i: number) => i % step === 0 || i === curve.length - 1);

  // Find biggest drop-off point
  let maxDrop = 0;
  let dropSecond = 0;
  for (let i = 1; i < curve.length; i++) {
    const drop = curve[i - 1].retention - curve[i].retention;
    if (drop > maxDrop) {
      maxDrop = drop;
      dropSecond = curve[i].seconds;
    }
  }

  // 50% retention point
  const halfPoint = curve.find((p: any) => p.retention <= 50);

  return (
    <Card className="wr-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Curva de Retenção — {playerName}
          </CardTitle>
          <div className="flex items-center gap-4">
            {halfPoint && (
              <span className="text-[10px] font-data text-muted-foreground">
                50% em {formatTime(halfPoint.seconds)}
              </span>
            )}
            <span className="text-[10px] font-data text-muted-foreground">
              Engajamento: {data.engagement_rate.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sampled} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="retentionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                dataKey="seconds"
                tickFormatter={formatTime}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                labelFormatter={(v) => formatTime(Number(v))}
                formatter={(value: number) => [`${value.toFixed(1)}%`, "Retenção"]}
              />
              {halfPoint && (
                <ReferenceLine
                  y={50}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  opacity={0.5}
                />
              )}
              {dropSecond > 0 && (
                <ReferenceLine
                  x={dropSecond}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="4 4"
                  opacity={0.6}
                  label={{
                    value: "Maior queda",
                    position: "top",
                    fontSize: 9,
                    fill: "hsl(var(--destructive))",
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="retention"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#retentionGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-6 mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-destructive" />
            <span className="text-[10px] text-muted-foreground">
              Maior queda: <strong className="text-foreground">{formatTime(dropSecond)}</strong> ({maxDrop.toFixed(1)}%)
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            Tempo médio: <strong className="text-foreground">{formatTime(data.average_watched_time)}</strong>
          </span>
          <span className="text-[10px] text-muted-foreground">
            Duração: <strong className="text-foreground">{formatTime(data.video_duration)}</strong>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
