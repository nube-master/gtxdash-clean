import { Card, CardContent } from "@/components/ui/card";
import { Wallet, ArrowDownToLine, TrendingUp, Landmark } from "lucide-react";

interface Props {
  openingBalance: number;
  totalReceipts: number;
  projectedInvestment: number;
  projectedFinalBalance: number;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function CashflowSummaryCards({ openingBalance, totalReceipts, projectedInvestment, projectedFinalBalance }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Caixa Inicial */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Caixa Inicial</span>
          </div>
          <p className="text-lg font-bold tabular-nums text-foreground">{fmt(openingBalance)}</p>
        </CardContent>
      </Card>

      {/* Recebimentos Proj. */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownToLine className="h-4 w-4 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recebimentos Proj.</span>
          </div>
          <p className="text-lg font-bold tabular-nums text-foreground">{fmt(totalReceipts)}</p>
        </CardContent>
      </Card>

      {/* Investimento Proj. */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-red" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Investimento Proj.</span>
          </div>
          <p className="text-lg font-bold tabular-nums text-foreground">{fmt(projectedInvestment)}</p>
        </CardContent>
      </Card>

      {/* Saldo Final Proj. */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Landmark className="h-4 w-4 text-red" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Saldo Final Proj.</span>
          </div>
          <p className={`text-lg font-bold tabular-nums ${projectedFinalBalance < 0 ? "text-red" : "text-foreground"}`}>
            {fmt(projectedFinalBalance)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
