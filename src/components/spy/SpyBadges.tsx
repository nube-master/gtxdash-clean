import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SpyTraffic, SpyStatus } from "@/types/spy";

export function TrafficBadge({ traffic, className }: { traffic: SpyTraffic | string; className?: string }) {
  const styles: Record<string, string> = {
    Facebook: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    Instagram: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    Google: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    TikTok: "bg-zinc-900 text-zinc-100 border-zinc-700",
    YouTube: "bg-red-500/15 text-red-300 border-red-500/30",
    "Native Ads": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  };
  const cls = styles[traffic] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5 font-medium", cls, className)}>
      {traffic}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: SpyStatus }) {
  const map: Record<SpyStatus, { label: string; cls: string }> = {
    hot: { label: "🔥 Escalando", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
    qualified: { label: "Promissora", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
    watching: { label: "Acompanhando", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    dismissed: { label: "Descartada", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  };
  const v = map[status];
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5 font-medium", v.cls)}>
      {v.label}
    </Badge>
  );
}

export function AttributeChip({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary/90 border border-primary/20", className)}>
      {label}
    </span>
  );
}
