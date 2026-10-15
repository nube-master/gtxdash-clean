import { useState } from "react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, RefreshCw, Banknote, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CashflowSettingsPanel } from "@/components/cashflow/CashflowSettingsPanel";
import { CalibrateBalanceDialog } from "@/components/cashflow/CalibrateBalanceDialog";
import { CashflowTodayCards } from "@/components/cashflow/CashflowTodayCards";
import { CashflowReceiptsTimeline } from "@/components/cashflow/CashflowReceiptsTimeline";
import { CashflowTable } from "@/components/cashflow/CashflowTable";
import { CashflowBalanceChart } from "@/components/cashflow/CashflowBalanceChart";
import { useCashflowProjection } from "@/hooks/useCashflowData";

export default function CashFlow() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const monthKey = format(currentMonth, "yyyy-MM");

  const { rows, summary, settings, models, isLoading, refetch } = useCashflowProjection(monthKey);

  const selectedModel = settings?.payment_model ?? "ClickBank Real";

  return (
    <div className="full-width-page space-y-4 sm:space-y-6 w-full">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,30,30,0.12)", boxShadow: "0 0 12px rgba(255,30,30,0.25)" }}
          >
            <Banknote className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Fluxo de Caixa</h1>
            <p className="text-xs text-muted-foreground">Projeção diária de liquidez da operação</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-card/60 border border-border/40 rounded-lg px-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {models && (
          <Select value={selectedModel} disabled>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <CashflowSettingsPanel month={monthKey} settings={settings as any} models={models ?? null} />

        <CalibrateBalanceDialog
          month={monthKey}
          currentTodayBalance={summary?.cashToday ?? 0}
          currentInitialCash={settings?.initial_cash ?? 0}
          settings={settings as any ?? null}
        />

        <Button variant="outline" size="sm" className="gap-2" onClick={refetch}>
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>

        {rows && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              const header = "Dia,Data,Saldo Inicial,Invest. Ads,Fat. Real,Recebimento,Ajuste Manual,Origem,Lucro Dia,Saldo Final";
              const csvRows = rows.map((r) =>
                [r.weekday, r.date, r.openingBalance.toFixed(2), r.adInvestment.toFixed(2), r.actualRevenue.toFixed(2), r.expectedReceipt.toFixed(2), r.manualAdjustment.toFixed(2), `"${r.receiptSource}"`, r.dayProfit.toFixed(2), r.closingBalance.toFixed(2)].join(",")
              );
              const blob = new Blob([header + "\n" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `fluxo-caixa-${monthKey}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[80px] rounded-lg" />
          ))}
        </div>
      ) : summary ? (
        <CashflowTodayCards
          cashToday={summary.cashToday}
          investmentToday={summary.investmentToday}
          nextReceiptAmount={summary.nextReceiptAmount}
          nextReceiptDate={summary.nextReceiptDate}
          coverageDays={summary.coverageDays}
          burnRate={summary.burnRate}
          daysUntilCashBreak={summary.daysUntilCashBreak}
          projectedFinalBalance={summary.projectedFinalBalance}
          totalInvestment={summary.totalInvestment}
          totalReceipts={summary.totalReceipts}
        />
      ) : null}

      {/* Charts + Receipts Timeline */}
      {!isLoading && rows && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <CashflowBalanceChart rows={rows} />
          </div>
          <div className="lg:col-span-1">
            <CashflowReceiptsTimeline upcomingReceipts={summary.upcomingReceipts} />
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <Skeleton className="h-[400px] rounded-lg" />
      ) : rows ? (
        <CashflowTable rows={rows} month={monthKey} />
      ) : (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Configure o fluxo de caixa para visualizar a projeção.
        </div>
      )}
    </div>
  );
}
