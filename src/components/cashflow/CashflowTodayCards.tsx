import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Wallet, CalendarClock, Zap, ShieldCheck, Info, Flame, TrendingUp, Landmark, DollarSign, Trophy } from "lucide-react";

interface Props {
  cashToday: number;
  investmentToday: number;
  nextReceiptAmount: number;
  nextReceiptDate: string;
  coverageDays: number;
  burnRate: number;
  daysUntilCashBreak: number;
  projectedFinalBalance?: number;
  totalInvestment?: number;
  totalReceipts?: number;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function fmtDate(dateStr: string) {
  if (!dateStr) return "—";
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

export function CashflowTodayCards({
  cashToday,
  investmentToday,
  nextReceiptAmount,
  nextReceiptDate,
  coverageDays,
  burnRate,
  daysUntilCashBreak,
  projectedFinalBalance = 0,
  totalInvestment = 0,
  totalReceipts = 0,
}: Props) {
  const coverageColor =
    coverageDays <= 0 ? "text-red" :
    coverageDays <= 2 ? "text-red" :
    coverageDays <= 5 ? "text-orange-400" :
    coverageDays <= 10 ? "text-yellow-400" :
    "text-success";

  return (
    <div className="space-y-3">
      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Caixa Disponível */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Caixa Disponível
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                    Saldo real disponível para investir em anúncios hoje, considerando recebimentos já creditados e gastos realizados.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-xl font-semibold font-data ${cashToday < 0 ? "text-red" : "text-foreground"}`}>
              {fmt(cashToday)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Saldo real para investir
            </p>
          </CardContent>
        </Card>

        {/* Investimento Hoje */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-orange-400" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Investimento Hoje
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                    Total gasto em anúncios no dia de hoje, somando todas as contas de mídia ativas.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-xl font-semibold font-data ${investmentToday > 0 ? "text-orange-400" : "text-muted-foreground/50"}`}>
              {investmentToday > 0 ? fmt(investmentToday) : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Próximo Recebimento */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock className="h-4 w-4 text-success" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Próximo Recebimento
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                    Valor do próximo recebimento programado com base nas vendas já realizadas e o modelo de pagamento configurado.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-xl font-semibold font-data ${nextReceiptAmount > 0 ? "text-success" : "text-muted-foreground/50"}`}>
              {nextReceiptAmount > 0 ? fmt(nextReceiptAmount) : "—"}
            </p>
            {nextReceiptDate && (
              <p className="text-[10px] text-muted-foreground mt-1">
                em {fmtDate(nextReceiptDate)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Cobertura de Caixa */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className={`h-4 w-4 ${coverageColor}`} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Cobertura de Caixa
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                   <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                     Quantidade de dias que o caixa atual consegue sustentar o investimento no ritmo atual.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-xl font-semibold font-data ${coverageColor}`}>
              {coverageDays <= 0 ? "0 dias" : coverageDays >= 999 ? "∞" : `${Math.round(coverageDays)} dias`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs — Projected + Burn Rate + Lucro */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Investimento Projetado (mês) */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Invest. Projetado
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    Investimento total projetado do mês (real + projeção com burn rate).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-lg font-semibold font-data text-foreground">
              {totalInvestment > 0 ? fmt(totalInvestment) : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Caixa Projetado (final do mês) */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Landmark className={`h-3.5 w-3.5 ${projectedFinalBalance < 0 ? "text-red" : "text-blue-400"}`} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Caixa Projetado
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                    Saldo projetado no final do mês com base no burn rate e recebimentos programados.
                    {projectedFinalBalance < 0
                      ? ` ⚠ O caixa ficará negativo em ${fmt(Math.abs(projectedFinalBalance))} — considere reduzir o investimento ou antecipar recebíveis.`
                      : " O saldo se mantém positivo até o final do mês."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-lg font-semibold font-data ${projectedFinalBalance < 0 ? "text-red" : "text-foreground"}`}>
              {fmt(projectedFinalBalance)}
            </p>
          </CardContent>
        </Card>

        {/* Faturamento Projetado (mês) */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <DollarSign className="h-3.5 w-3.5 text-success" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Fatur. Projetado
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                    Total de recebimentos projetados para o mês (reais + projeção com ROAS médio e burn rate).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-lg font-semibold font-data text-success">
              {totalReceipts > 0 ? fmt(totalReceipts) : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Burn Rate */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Burn Rate (7d)
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    Média de investimento diário em anúncios nos últimos 7 dias. Mostra quanto caixa a operação consome por dia.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-lg font-semibold font-data text-orange-400">
              {burnRate > 0 ? `${fmt(burnRate)}/dia` : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Lucro Projetado (mês) */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Trophy className={`h-3.5 w-3.5 ${(totalReceipts - totalInvestment) < 0 ? "text-red" : "text-success"}`} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Lucro Projetado
              </span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                    Lucro bruto projetado do mês: Faturamento Projetado − Investimento Projetado. Não inclui custos fixos ou operacionais.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {(() => {
              const projectedProfit = totalReceipts - totalInvestment;
              const margin = totalReceipts > 0 ? (projectedProfit / totalReceipts) * 100 : 0;
              return (
                <>
                  <p className={`text-lg font-semibold font-data ${projectedProfit < 0 ? "text-red" : "text-success"}`}>
                    {totalReceipts > 0 || totalInvestment > 0 ? fmt(projectedProfit) : "—"}
                  </p>
                  {(totalReceipts > 0 || totalInvestment > 0) && (
                    <p className={`text-[10px] font-mono mt-0.5 ${margin < 20 ? "text-red" : margin < 35 ? "text-orange-400" : "text-success"}`}>
                      Margem {margin.toFixed(1)}%
                    </p>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Cash Break Alert */}
      {daysUntilCashBreak > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-red font-semibold">
                ⚠ Alerta de Quebra
              </span>
            </div>
            <p className="text-lg font-semibold font-data text-red">
              Caixa negativo em {daysUntilCashBreak} dia{daysUntilCashBreak !== 1 ? "s" : ""}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Projeção com burn rate atual + recebimentos programados
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
