import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Copy, Pencil, History } from "lucide-react";
import { StatusDot } from "./StatusDot";
import type { PacingRule } from "./mockData";

export function RuleRow({ rule, onToggle }: { rule: PacingRule; onToggle?: (id: string, next: boolean) => void }) {
  return (
    <Card className="p-4 border-border/60 bg-card">
      <div className="flex items-start gap-3">
        <ChevronRight className="size-4 mt-1 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{rule.name}</h3>
            {rule.active ? (
              <Badge variant="outline" className="gap-1.5 text-[10px] uppercase tracking-wider border-[hsl(var(--wr-positive))]/40 text-[hsl(var(--wr-positive))]">
                <StatusDot status="ok" /> Ativa
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <StatusDot status="paused" /> Inativa
              </Badge>
            )}
            {rule.inCooldown && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-[hsl(var(--wr-warning))] border-[hsl(var(--wr-warning))]/40">
                Cooldown
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm tabular-nums">
            <span className="text-muted-foreground">SE</span>{" "}
            <span className="font-medium">{rule.condition}</span>{" "}
            <span className="text-muted-foreground">→</span>{" "}
            <span className="font-semibold text-primary">{rule.action}</span>
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
            <span>Escopo: <span className="text-foreground">{rule.scope}</span></span>
            <span>Disparou hoje: <span className="text-foreground font-semibold">{rule.firedToday}x</span></span>
            {rule.cooldownH > 0 && <span>Cooldown: <span className="text-foreground">{rule.cooldownH}h</span></span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={rule.active} onCheckedChange={(v) => onToggle?.(rule.id, v)} />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/40">
        <Button variant="ghost" size="sm" className="h-7 text-xs"><Pencil className="size-3 mr-1" /> Editar</Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs"><Copy className="size-3 mr-1" /> Duplicar</Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs"><History className="size-3 mr-1" /> Histórico</Button>
      </div>
    </Card>
  );
}
