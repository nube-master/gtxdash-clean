import { cn } from "@/lib/utils";
import type { PacingStatus } from "./mockData";

const COLOR: Record<PacingStatus, string> = {
  ok: "bg-[hsl(var(--wr-positive))]",
  warning: "bg-[hsl(var(--wr-warning))]",
  critical: "bg-destructive",
  paused: "bg-muted-foreground",
  warming: "bg-primary",
};

interface Props {
  status: PacingStatus;
  size?: "sm" | "md";
  glow?: boolean;
  className?: string;
}

export function StatusDot({ status, size = "sm", glow, className }: Props) {
  const pulse = status === "critical" || status === "warming";
  return (
    <span
      className={cn(
        "inline-block rounded-full",
        size === "sm" ? "size-2" : "size-2.5",
        COLOR[status],
        pulse && "animate-pulse",
        glow && status === "critical" && "shadow-[0_0_8px_hsl(var(--destructive))]",
        glow && status === "ok" && "shadow-[0_0_6px_hsl(var(--wr-positive)/0.6)]",
        className
      )}
    />
  );
}
