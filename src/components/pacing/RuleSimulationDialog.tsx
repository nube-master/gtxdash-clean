import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, AlertTriangle, Ban } from "lucide-react";
import type { SimulationResult } from "@/hooks/useSimulateRule";

interface Props {
  open: boolean;
  onClose: () => void;
  ruleName: string;
  loading: boolean;
  result: SimulationResult | null;
}

export function RuleSimulationDialog({ open, onClose, ruleName, loading, result }: Props) {
  const stat = result?.rule_stats?.[0];
  const fires = result?.would_fire ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Simulação · {ruleName}</DialogTitle>
          <DialogDescription className="text-xs">
            Avalia a regra contra todas as campanhas agora, sem disparar nenhuma ação na Meta.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
            <p className="text-xs text-center text-muted-foreground">
              Rodando contra todas as contas Meta... pode levar até 30s
            </p>
          </div>
        ) : !result ? null : stat?.skip_reason ? (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-amber-500">
              <Ban className="size-4" /> Regra pulada antes de avaliar campanhas
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Motivo: <code className="text-foreground">{stat.skip_reason}</code>
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-2">
              <div className="grid grid-cols-4 gap-2 text-center">
                <Metric label="Avaliadas" value={result.campaigns_evaluated} />
                <Metric label="Casaram" value={stat?.campaigns_matched ?? 0} />
                <Metric
                  label="Dispararão"
                  value={stat?.campaigns_fired ?? 0}
                  color={(stat?.campaigns_fired ?? 0) > 0 ? "text-[hsl(var(--wr-positive))]" : ""}
                />
                <Metric
                  label="Bloqueadas"
                  value={stat?.campaigns_blocked ?? 0}
                  color={(stat?.campaigns_blocked ?? 0) > 0 ? "text-amber-500" : ""}
                />
              </div>

              <Section
                icon={<CheckCircle2 className="size-3.5 text-[hsl(var(--wr-positive))]" />}
                title={`Dispararia agora (${fires.length})`}
                empty="Nenhuma campanha bateria a regra agora."
              >
                {fires.map((f) => (
                  <Row
                    key={f.campaign_id}
                    title={f.campaign_name}
                    badge={f.kind}
                    badgeColor="bg-[hsl(var(--wr-positive))]/15 text-[hsl(var(--wr-positive))] border-[hsl(var(--wr-positive))]/30"
                    detail={f.reason}
                    sub={`spend hoje R$ ${f.spend_today.toFixed(2)} · budget R$ ${f.daily_budget.toFixed(2)}`}
                  />
                ))}
              </Section>

              <Section
                icon={<XCircle className="size-3.5 text-amber-500" />}
                title={`Bloqueadas (${stat?.blocked?.length ?? 0})`}
                empty="Nenhum bloqueio — toda campanha que casou disparou."
              >
                {(stat?.blocked ?? []).map((b) => (
                  <Row
                    key={b.campaignId}
                    title={b.campaignName}
                    badge="bloqueada"
                    badgeColor="bg-amber-500/15 text-amber-500 border-amber-500/30"
                    detail={b.reason}
                  />
                ))}
              </Section>

              {(stat?.campaigns_matched ?? 0) === 0 && (
                <div className="rounded border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                  <span>
                    Nenhuma campanha bateu no <strong>filtro</strong> (projeto, name contains, status, min budget).
                    Confere o escopo da regra — se nada casa, ela nunca vai disparar.
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded border border-border/60 bg-card p-2.5">
      <div className={`text-lg font-semibold tabular-nums ${color ?? ""}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function Section({
  icon,
  title,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.filter(Boolean).length === 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </div>
      {isEmpty ? (
        <p className="text-xs text-muted-foreground italic px-1">{empty}</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}

function Row({
  title,
  badge,
  badgeColor,
  detail,
  sub,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  detail: string;
  sub?: string;
}) {
  return (
    <div className="rounded border border-border/40 bg-card/50 p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${badgeColor}`}>
          {badge}
        </Badge>
        <span className="text-xs font-medium truncate">{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">{detail}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5 tabular-nums">{sub}</p>}
    </div>
  );
}
