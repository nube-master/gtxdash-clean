import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function LivenessIndicator({ healthy = true }: { healthy?: boolean }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s + 1) % 30), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
      <span
        className={cn(
          "size-2 rounded-full",
          healthy ? "bg-primary animate-pulse shadow-[0_0_8px_hsl(var(--primary))]" : "bg-destructive"
        )}
      />
      <span className="font-semibold uppercase tracking-wider text-foreground/80">
        {healthy ? "LIVE" : "OFFLINE"}
      </span>
      <span className="text-muted-foreground/70">· Last sync {secs}s</span>
    </div>
  );
}
