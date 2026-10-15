import { Pause, Play, TrendingUp, Flame, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { PacingEvent } from "./mockData";

const ICON = {
  pause: { Icon: Pause, color: "text-destructive" },
  resume: { Icon: Play, color: "text-[hsl(var(--wr-positive))]" },
  scale: { Icon: TrendingUp, color: "text-primary" },
  warm: { Icon: Flame, color: "text-[hsl(var(--wr-warning))]" },
  alert: { Icon: AlertTriangle, color: "text-[hsl(var(--wr-warning))]" },
} as const;

export function EventTimeline({ events, max }: { events: PacingEvent[]; max?: number }) {
  const list = max ? events.slice(0, max) : events;
  if (list.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        Nenhum evento ainda. As ações executadas pelas regras vão aparecer aqui.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/40">
      {list.map((e) => {
        const { Icon, color } = ICON[e.type];
        return (
          <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
            <span className="text-xs text-muted-foreground tabular-nums w-20 shrink-0 pt-0.5">
              {formatDistanceToNow(new Date(e.ts), { locale: ptBR, addSuffix: false })}
            </span>
            <Icon className={cn("size-4 shrink-0 mt-0.5", color)} />
            <span className="flex-1 leading-snug">
              {e.campaign ? <span className="font-semibold text-foreground">{e.campaign}</span> : <span className="italic text-muted-foreground/60">[Campanha não identificada]</span>}{" "}
              <span className="text-muted-foreground">{e.message}</span>
              {e.rule && <span className="text-xs text-muted-foreground/70"> · {e.rule}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
