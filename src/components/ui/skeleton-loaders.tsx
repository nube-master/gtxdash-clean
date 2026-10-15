import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ── KPI Card Skeleton ── */
export function KpiCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("bg-card border border-border/50 h-full", className)}>
      <CardContent className="px-5 py-4 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <Skeleton className="h-8 w-28 mb-2" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ── KPI Grid Skeleton ── */
export function KpiGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ── Table Skeleton ── */
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Card className="bg-card border border-border/50">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex gap-4 pb-3 border-b border-border/30">
            {Array.from({ length: cols }).map((_, i) => (
              <Skeleton key={i} className="h-3 flex-1" />
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex gap-4 py-2">
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} className="h-4 flex-1" style={{ opacity: 1 - r * 0.12 }} />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Chart Skeleton ── */
export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <Card className="bg-card border border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
        <div className="relative" style={{ height }}>
          {/* Fake chart bars */}
          <div className="absolute inset-0 flex items-end gap-1 px-4 pb-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-muted rounded-t animate-pulse"
                style={{
                  height: `${30 + Math.sin(i * 0.8) * 25 + Math.random() * 20}%`,
                  animationDelay: `${i * 100}ms`,
                }}
              />
            ))}
          </div>
          {/* Fake axis */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-border/50" />
          <div className="absolute top-0 bottom-0 left-0 w-px bg-border/50" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Market Pulse Skeleton ── */
export function MarketPulseSkeleton() {
  return (
    <div>
      <Skeleton className="h-3 w-40 mb-3" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="bg-card border border-border/50">
            <CardContent className="p-4">
              <Skeleton className="h-2.5 w-16 mb-2" />
              <Skeleton className="h-6 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── Section Skeleton ── */
export function SectionSkeleton({ title = true }: { title?: boolean }) {
  return (
    <div className="space-y-3">
      {title && <Skeleton className="h-4 w-44" />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartSkeleton height={180} />
        <ChartSkeleton height={180} />
      </div>
    </div>
  );
}
