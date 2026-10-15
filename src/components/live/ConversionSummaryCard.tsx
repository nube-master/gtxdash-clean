import { Card, CardContent } from "@/components/ui/card";
import { Activity, Target, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConversionSummary = {
  total: number;
  pitch: number;
  cta: number;
  pitch_rate: number;
  cta_rate: number;
};

type Props = {
  summary?: ConversionSummary | null;
};

function rateClass(rate: number, kind: "pitch" | "cta") {
  const good = kind === "pitch" ? 30 : 5;
  const ok = kind === "pitch" ? 15 : 2;
  if (rate >= good) return "text-emerald-600";
  if (rate >= ok) return "text-amber-600";
  if (rate > 0) return "text-foreground";
  return "text-muted-foreground";
}

export function ConversionSummaryCard({ summary }: Props) {
  const s = summary ?? { total: 0, pitch: 0, cta: 0, pitch_rate: 0, cta_rate: 0 };
  return (
    <Card>
      <CardContent className="py-3 px-3 sm:py-4 sm:px-5 grid grid-cols-3 gap-2 sm:gap-4">
        <Item
          icon={<Activity className="h-3.5 w-3.5 text-primary" />}
          label="Sessões"
          fullLabel="Sessões 24h"
          value={s.total.toLocaleString("pt-BR")}
          sub="leads únicos"
        />
        <Item
          icon={<Target className="h-3.5 w-3.5 text-amber-500" />}
          label="Pitch"
          fullLabel="Chegou no Pitch"
          value={`${s.pitch_rate}%`}
          sub={`${s.pitch.toLocaleString("pt-BR")} sessões`}
          valueClass={rateClass(s.pitch_rate, "pitch")}
        />
        <Item
          icon={<MousePointerClick className="h-3.5 w-3.5 text-emerald-500" />}
          label="CTA"
          fullLabel="Clicou no CTA"
          value={`${s.cta_rate}%`}
          sub={`${s.cta.toLocaleString("pt-BR")} cliques`}
          valueClass={rateClass(s.cta_rate, "cta")}
        />
      </CardContent>
    </Card>
  );
}

function Item({
  icon,
  label,
  fullLabel,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  fullLabel?: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
      <div className="flex items-center gap-1 text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate sm:hidden">{label}</span>
        <span className="hidden sm:inline truncate">{fullLabel ?? label}</span>
      </div>
      <div className={cn("text-lg sm:text-2xl font-bold tabular-nums leading-tight truncate", valueClass)}>{value}</div>
      <div className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}
