import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  offerId: string;
  width?: number;
  height?: number;
}

/**
 * Mini sparkline 7d com spend + delta numérico ao lado.
 * Receita não vem aqui pra evitar 100+ queries — fica pro drawer detalhado.
 */
export function OfferSparkline({ offerId, width = 60, height = 20 }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["offer-sparkline-7d", offerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_offer_traffic_daily", {
        p_offer_id: offerId,
      } as any);
      if (error) return [];
      const arr = (data as { date: string; spend_brl: number }[] | null) ?? [];
      return arr.slice(-7);
    },
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  if (isLoading)
    return (
      <span
        className="inline-block h-2 rounded-full bg-muted/40 animate-pulse align-middle"
        style={{ width }}
      />
    );

  if (!data || data.length === 0)
    return <span className="text-muted-foreground/30 text-xs">—</span>;

  const values = data.map((d) => Number(d.spend_brl ?? 0));
  const max = Math.max(...values, 1);
  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  });

  const last = values[values.length - 1];
  const prevAvg =
    values.slice(0, -1).reduce((a, b) => a + b, 0) /
    Math.max(values.length - 1, 1);
  const deltaPct = prevAvg > 0 ? ((last - prevAvg) / prevAvg) * 100 : 0;
  const trend =
    deltaPct > 10 ? "up" : deltaPct < -10 ? "down" : "flat";

  const stroke =
    trend === "up"
      ? "hsl(var(--primary))"
      : trend === "down"
      ? "hsl(0 84% 60%)"
      : "hsl(var(--muted-foreground))";

  const deltaCls =
    trend === "up"
      ? "text-primary"
      : trend === "down"
      ? "text-red-500"
      : "text-muted-foreground/60";

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const tooltip = `7d spend · último ${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(last)} · média anterior ${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(prevAvg)}`;

  return (
    <span
      className="inline-flex items-center gap-1.5 align-middle"
      title={tooltip}
    >
      <svg width={width} height={height} className="inline-block shrink-0">
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points.join(" ")}
          opacity={0.85}
        />
      </svg>
      {prevAvg > 0 && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums leading-none",
            deltaCls,
          )}
        >
          <TrendIcon className="h-2.5 w-2.5" />
          {deltaPct > 0 ? "+" : ""}
          {deltaPct.toFixed(0)}%
        </span>
      )}
    </span>
  );
}
