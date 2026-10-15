import CountUp from "react-countup";
import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Sparkline } from "./Sparkline";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delta?: number;
  deltaSuffix?: string;
  sparkline?: number[];
  footer?: React.ReactNode;
  sparkColor?: string;
  hero?: boolean;
}

export function PacingCard({
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  delta,
  deltaSuffix = "%",
  sparkline,
  footer,
  sparkColor,
  hero,
}: Props) {
  const positive = delta !== undefined && delta >= 0;
  return (
    <Card className="p-4 flex flex-col gap-2 bg-card border-border/60">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-bold tabular-nums leading-none", hero ? "text-3xl" : "text-2xl")}>
        <CountUp end={value} duration={1.2} separator="." decimal="," decimals={decimals} prefix={prefix} suffix={suffix} preserveValue />
      </div>
      <div className="flex items-end justify-between gap-3 mt-1">
        {delta !== undefined && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-semibold tabular-nums",
              positive ? "text-[hsl(var(--wr-positive))]" : "text-destructive"
            )}
          >
            {positive ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {Math.abs(delta).toFixed(2)}{deltaSuffix}
          </div>
        )}
        {sparkline && (
          <div className="ml-auto opacity-80">
            <Sparkline data={sparkline} color={sparkColor} width={88} height={28} />
          </div>
        )}
      </div>
      {footer && <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">{footer}</div>}
    </Card>
  );
}
