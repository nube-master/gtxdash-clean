import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOperationId } from "@/contexts/OperationContext";

function parseLocalizedNumber(value: string): number {
  if (!value || value === "") return 0;

  let str = String(value).trim();

  // Remove currency symbols (R$, dollar, euro, etc.)
  str = str.replace(/[¤$\u20AC£¥R\s]/g, "");

  // Auto-detect format based on last comma/dot position
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");

  const isCommaDecimal = lastComma > lastDot;

  if (isCommaDecimal) {
    // Comma as decimal: 1.234,56 → 1234.56
    str = str.replace(/\./g, ""); // Remove thousand separators
    str = str.replace(",", "."); // Convert decimal separator
  } else {
    // Dot as decimal: 1,234.56 → 1234.56
    str = str.replace(/,/g, ""); // Remove thousand separators
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  month: string;
  currentAutoReceipt?: number; // automatic receipt for this day (before adjustments)
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export function CashflowAdjustmentDialog({ open, onOpenChange, defaultDate, month, currentAutoReceipt = 0 }: Props) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const opId = useOperationId();

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setAmount("");
      setDescription("");
    }
  }, [open, defaultDate]);

  const enteredValue = parseLocalizedNumber(amount);

  const handleSave = async () => {
    if (enteredValue === 0 && currentAutoReceipt === 0) {
      toast.error("Informe o valor do recebimento.");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Delete any previous correction adjustments for this date
      await supabase
        .from("cashflow_adjustments")
        .delete()
        .eq("date", date)
        .eq("type", "correcao");

      // Store ABSOLUTE value - the exact amount user wants as final receipt
      const { error } = await supabase.from("cashflow_adjustments").insert({
        date,
        type: "correcao",
        amount: enteredValue, // ABSOLUTE value, not delta
        description: description.trim() || `Recebimento fixado: ${fmt(enteredValue)}`,
        created_by: user?.id ?? null,
        operation_id: opId!,
      });

      if (error) throw error;

      toast.success("Recebimento atualizado!");
      qc.invalidateQueries({ queryKey: ["cashflow-adjustments"] });
      qc.invalidateQueries({ queryKey: ["cashflow-projection"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Ajustar Recebimento</DialogTitle>
          <DialogDescription>
            Informe o valor correto do recebimento. O sistema calculará automaticamente a diferença.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Show current automatic receipt */}
          {currentAutoReceipt !== 0 && (
            <div className="rounded-md bg-muted/50 border border-border/40 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Recebimento automático
              </p>
              <p className="text-base font-semibold font-data text-emerald-400">
                {fmt(currentAutoReceipt)}
              </p>
            </div>
          )}

          {/* Amount input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Valor real do recebimento</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                className="pl-9 text-lg font-semibold font-data"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Digite o valor total que você recebeu. Use vírgula para decimais (ex: 1.234,56)
            </p>
          </div>

          {/* Preview */}
          {enteredValue !== 0 && (
            <div className="rounded-md bg-muted/50 border border-border/40 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Valor final</p>
              <div className="flex items-center justify-between text-sm font-bold">
                <span>Recebimento</span>
                <span className="font-data text-emerald-400">{fmt(enteredValue)}</span>
              </div>
              {currentAutoReceipt > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Substitui o valor automático de {fmt(currentAutoReceipt)}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Valor confirmado no extrato bancário..."
              className="resize-none h-16"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Data</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Salvar Ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
