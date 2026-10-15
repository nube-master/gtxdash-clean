import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CashflowAdjustmentDialog } from "./CashflowAdjustmentDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CashflowRow } from "@/lib/cashflowEngine";

interface Props {
  rows: CashflowRow[];
  month: string;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function fmtDate(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

const TYPE_LABELS: Record<string, string> = {
  recebimento_extra: "receb.",
  correcao: "correção",
  emprestimo: "empréstimo",
  taxa: "taxa",
  outro: "ajuste",
};

export function CashflowTable({ rows, month }: Props) {
  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [adjDate, setAdjDate] = useState("");
  const [adjAutoReceipt, setAdjAutoReceipt] = useState(0);
  const qc = useQueryClient();

  const openAdjDialog = (date: string, totalReceipt: number) => {
    setAdjDate(date);
    setAdjAutoReceipt(totalReceipt);
    setAdjDialogOpen(true);
  };

  const deleteAdjustment = async (id: string) => {
    const { error } = await supabase.from("cashflow_adjustments").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover ajuste");
      return;
    }
    toast.success("Ajuste removido");
    qc.invalidateQueries({ queryKey: ["cashflow-adjustments"] });
  };

  return (
    <>
      <div className="rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/30 hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground w-12">Dia</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground w-16">Data</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Saldo Inicial</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Invest. Ads</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Fat. Real</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Recebimento</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Origem</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Lucro Dia</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Saldo Final</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isWeekend = row.weekdayNum === 0 || row.weekdayNum === 6;
              const isToday = row.date === new Date().toISOString().slice(0, 10);
              const isProj = row.isProjected;
              const hasAdj = row.manualAdjustment !== 0;
              const totalReceipt = row.expectedReceipt + row.manualAdjustment;

              return (
                <TableRow
                  key={row.date}
                  className={`border-border/20 transition-colors ${isToday ? "bg-primary/5 border-l-2 border-l-primary" : ""} ${isWeekend ? "bg-muted/20" : ""} ${isProj ? "opacity-70 bg-accent/5 border-l-2 border-l-blue-400/50 border-dashed" : ""}`}
                >
                  <TableCell className="text-xs font-medium text-muted-foreground py-2.5">
                    {row.weekday}
                  </TableCell>
                  <TableCell className="text-xs font-data py-2.5">
                    <span className="flex items-center gap-1">
                      {fmtDate(row.date)}
                      {isProj && <span className="text-[9px] text-blue-400 font-medium">EST</span>}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-data text-right py-2.5">
                    {fmt(row.openingBalance)}
                  </TableCell>
                  <TableCell className={`text-xs font-data text-right py-2.5 ${row.adInvestment > 0 ? (isProj ? "text-red/60" : "text-red") : "text-muted-foreground/50"}`}>
                    {row.adInvestment > 0 ? `-${fmt(row.adInvestment)}` : "—"}
                  </TableCell>
                  <TableCell className={`text-xs font-data text-right py-2.5 ${row.actualRevenue > 0 ? (isProj ? "text-blue-400/80 italic" : "text-foreground") : "text-muted-foreground/50"}`}>
                    {row.actualRevenue > 0 ? fmt(row.actualRevenue) : "—"}
                  </TableCell>
                  {/* Receipt column with edit icon and adjustment breakdown */}
                  <TableCell className="text-xs font-data text-right py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <div className="flex flex-col items-end">
                        <span className={`font-medium flex items-center gap-1 ${totalReceipt > 0 ? (isProj && !row.isReceiptConfirmed ? "text-success/60" : "text-success") : totalReceipt < 0 ? "text-red" : "text-muted-foreground/50"}`}>
                          {row.isReceiptConfirmed && <CheckCircle2 className="h-3 w-3 text-success shrink-0" />}
                          {totalReceipt !== 0 ? `${totalReceipt > 0 ? "+" : ""}${fmt(totalReceipt)}` : "—"}
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => openAdjDialog(row.date, totalReceipt)}
                            className="text-muted-foreground/40 hover:text-foreground transition-colors p-0.5 rounded"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          {row.isReceiptConfirmed ? "Editar ajuste" : "Confirmar ou ajustar recebimento"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground py-2.5 max-w-[180px]">
                    {row.receiptSource !== "—" ? (
                      <div className="flex flex-col leading-tight">
                        {row.receiptSource.split("\n").map((line, i) => (
                          <span key={i} className={i === 0 ? "font-medium text-foreground/70" : ""}>
                            {line}
                          </span>
                        ))}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell className={`text-xs font-data text-right py-2.5 ${row.dayProfit > 0 ? "text-success" : row.dayProfit < 0 ? "text-red" : "text-muted-foreground/50"}`}>
                    {row.dayProfit !== 0 ? fmt(row.dayProfit) : "—"}
                  </TableCell>
                  <TableCell className={`text-xs font-data text-right py-2.5 font-bold ${row.closingBalance < 0 ? "text-red" : "text-foreground"}`}>
                    {fmt(row.closingBalance)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CashflowAdjustmentDialog
        open={adjDialogOpen}
        onOpenChange={setAdjDialogOpen}
        defaultDate={adjDate}
        month={month}
        currentAutoReceipt={adjAutoReceipt}
      />
    </>
  );
}
