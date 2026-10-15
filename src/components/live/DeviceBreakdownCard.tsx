import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Monitor, Tablet, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type DeviceFunnel = { count: number; pitch: number; cta: number };
export type DeviceFunnelAgg = {
  mobile: DeviceFunnel;
  desktop: DeviceFunnel;
  tablet: DeviceFunnel;
  unknown: DeviceFunnel;
};

interface Props {
  funnel?: DeviceFunnelAgg | null;
  total: number;
}

const ROWS: { key: keyof DeviceFunnelAgg; label: string; icon: any }[] = [
  { key: "mobile", label: "Mobile", icon: Smartphone },
  { key: "desktop", label: "Desktop", icon: Monitor },
  { key: "tablet", label: "Tablet", icon: Tablet },
  { key: "unknown", label: "Outro", icon: HelpCircle },
];

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 10;
}

export function DeviceBreakdownCard({ funnel, total }: Props) {
  if (!funnel || total === 0) return null;

  const maxCount = Math.max(
    funnel.mobile.count,
    funnel.desktop.count,
    funnel.tablet.count,
    funnel.unknown.count,
    1,
  );

  // Filtra linhas com 0
  const visibleRows = ROWS.filter((r) => funnel[r.key].count > 0);
  if (!visibleRows.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Conversão por device (ao vivo)</span>
          <span className="text-xs text-muted-foreground font-normal">
            {total} viewers
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Header */}
        <div className="grid grid-cols-[1fr_60px_60px_60px] md:grid-cols-[1.4fr_80px_80px_80px_80px] items-center text-[10px] uppercase tracking-wider text-muted-foreground px-1">
          <div>Device</div>
          <div className="text-right">Viewers</div>
          <div className="hidden md:block text-right">Share</div>
          <div className="text-right">Pitch%</div>
          <div className="text-right">CTA%</div>
        </div>
        {visibleRows.map((r) => {
          const d = funnel[r.key];
          const Icon = r.icon;
          const share = pct(d.count, total);
          const pitchRate = pct(d.pitch, d.count);
          const ctaRate = pct(d.cta, d.count);
          const widthPct = (d.count / maxCount) * 100;
          return (
            <div key={r.key} className="space-y-1.5">
              <div className="grid grid-cols-[1fr_60px_60px_60px] md:grid-cols-[1.4fr_80px_80px_80px_80px] items-center gap-2 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{r.label}</span>
                </div>
                <div className="text-right tabular-nums font-semibold">{d.count}</div>
                <div className="hidden md:block text-right tabular-nums text-muted-foreground">{share}%</div>
                <div className={cn(
                  "text-right tabular-nums",
                  pitchRate >= 30 ? "text-emerald-500" : pitchRate >= 15 ? "text-amber-500" : "text-muted-foreground",
                )}>
                  {pitchRate}%
                </div>
                <div className={cn(
                  "text-right tabular-nums font-semibold",
                  ctaRate >= 5 ? "text-emerald-500" : ctaRate >= 2 ? "text-amber-500" : "text-muted-foreground",
                )}>
                  {ctaRate}%
                </div>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
