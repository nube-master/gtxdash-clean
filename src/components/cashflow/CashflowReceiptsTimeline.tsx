import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, CheckCircle2 } from "lucide-react";

interface Receipt {
  date: string;
  amount: number;
  isProjected?: boolean;
  isConfirmed?: boolean;
}

interface Props {
  upcomingReceipts: Receipt[];
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function fmtDate(dateStr: string) {
  if (!dateStr) return "—";
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

export function CashflowReceiptsTimeline({ upcomingReceipts }: Props) {
  // All entries here are already real (filtered in engine), just display them
  const confirmedReceipts = upcomingReceipts.filter(r => r.isConfirmed);
  const realReceipts = upcomingReceipts.filter(r => !r.isConfirmed);

  if (upcomingReceipts.length === 0) return null;

  const total = upcomingReceipts.reduce((s, r) => s + r.amount, 0);

  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5 text-emerald-400" />
          Próximos Recebimentos
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1.5">
        {upcomingReceipts.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic py-2">
            Nenhum recebimento programado nos próximos 7 dias.
          </p>
        ) : (
          upcomingReceipts.map((r) => (
            <div key={r.date} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
              <div className="flex items-center gap-2">
                {r.isConfirmed ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
                <span className="text-xs font-medium text-muted-foreground">
                  {fmtDate(r.date)}
                </span>
                {r.isConfirmed && (
                  <span className="text-[8px] uppercase tracking-wider font-bold text-emerald-400/80 bg-emerald-400/10 px-1 py-0.5 rounded">
                    confirmado
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold font-data text-emerald-400">
                {fmt(r.amount)}
              </span>
            </div>
          ))
        )}

        {/* Total */}
        {upcomingReceipts.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Total próximos 7 dias
            </span>
            <span className="text-sm font-semibold font-data text-foreground">
              {fmt(total)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
