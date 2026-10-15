import { Badge } from "@/components/ui/badge";
import { StatusDot } from "./StatusDot";
import type { PacingStatus } from "./mockData";
import { cn } from "@/lib/utils";

const LABEL: Record<PacingStatus, string> = {
  ok: "OK",
  warning: "REVISAR",
  critical: "PAUSAR",
  paused: "PAUSED",
  warming: "WARM",
};

const TEXT: Record<PacingStatus, string> = {
  ok: "text-[hsl(var(--wr-positive))]",
  warning: "text-[hsl(var(--wr-warning))]",
  critical: "text-destructive",
  paused: "text-muted-foreground",
  warming: "text-primary",
};

export function LiveBadge({ status, className }: { status: PacingStatus; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-semibold uppercase tracking-wider text-[10px] border-border/60 bg-card/40 px-2 py-0.5",
        TEXT[status],
        className
      )}
    >
      <StatusDot status={status} glow={status === "critical"} />
      {LABEL[status]}
    </Badge>
  );
}
