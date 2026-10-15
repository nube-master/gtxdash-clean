import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crosshair, Info } from "lucide-react";
import { useUpsertCashflowSettings } from "@/hooks/useCashflowData";
import { toast } from "sonner";

interface Props {
  month: string;
  currentTodayBalance: number; // closing balance today with current initial_cash
  currentInitialCash: number;
  settings: {
    margin_percent: number;
    payment_model: string;
    timezone_venda: string;
    notes: string;
  } | null;
}

export function CalibrateBalanceDialog({ month, currentTodayBalance, currentInitialCash, settings }: Props) {
  const [open, setOpen] = useState(false);
  const [realBalance, setRealBalance] = useState("");
  const upsert = useUpsertCashflowSettings();

  const realValue = Number(realBalance.replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
  const delta = realValue - currentTodayBalance;
  const newInitialCash = Math.round(currentInitialCash + delta);

  const handleCalibrate = () => {
    upsert.mutate(
      {
        month,
        initial_cash: newInitialCash,
        margin_percent: settings?.margin_percent ?? 0,
        payment_model: settings?.payment_model ?? "ClickBank Real",
        timezone_venda: settings?.timezone_venda ?? "America/Sao_Paulo",
        notes: settings?.notes ?? "",
      },
      {
        onSuccess: () => {
          toast.success(`Caixa inicial calibrado para R$ ${newInitialCash.toLocaleString("pt-BR")}`);
          setOpen(false);
          setRealBalance("");
        },
        onError: () => toast.error("Erro ao calibrar"),
      }
    );
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Crosshair className="h-3.5 w-3.5" />
          Calibrar Caixa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Calibrar Caixa</DialogTitle>
          <DialogDescription>
            Informe seu saldo real de hoje e o sistema ajusta automaticamente o caixa inicial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Qual seu saldo real disponível hoje?</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                className="pl-9 text-lg font-semibold font-data"
                value={realBalance}
                onChange={(e) => setRealBalance(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
          </div>

          {realBalance && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo atual no sistema</span>
                <span className="font-medium font-data">{fmt(currentTodayBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo real informado</span>
                <span className="font-medium font-data">{fmt(realValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ajuste necessário</span>
                <span className={`font-medium font-data ${delta >= 0 ? "text-success" : "text-red"}`}>
                  {delta >= 0 ? "+" : ""}{fmt(delta)}
                </span>
              </div>
              <div className="border-t border-border/40 pt-2 flex justify-between">
                <span className="text-muted-foreground font-medium">Novo caixa inicial</span>
                <span className="font-bold font-data">{fmt(newInitialCash)}</span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>O caixa inicial do dia 1 será recalculado para que o saldo de hoje bata com o valor informado.</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleCalibrate}
            disabled={!realBalance || upsert.isPending}
          >
            {upsert.isPending ? "Calibrando..." : "Aplicar Calibração"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
