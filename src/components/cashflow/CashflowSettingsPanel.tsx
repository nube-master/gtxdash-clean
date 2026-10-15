import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Settings2, Save, Info } from "lucide-react";
import { useUpsertCashflowSettings } from "@/hooks/useCashflowData";
import { toast } from "sonner";
import type { PaymentModel } from "@/lib/cashflowEngine";

interface Props {
  month: string;
  settings: {
    initial_cash: number;
    margin_percent: number;
    payment_model: string;
    timezone_venda: string;
    notes: string;
    projection_roi?: number;
  } | null;
  models: PaymentModel[] | null;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function parseCurrency(raw: string): number {
  const cleaned = raw.replace(/[^\d,-]/g, "").replace(",", ".");
  return Number(cleaned) || 0;
}

export function CashflowSettingsPanel({ month, settings, models }: Props) {
  const upsert = useUpsertCashflowSettings();

  const [initialCash, setInitialCash] = useState(settings?.initial_cash ?? 0);
  const [initialCashDisplay, setInitialCashDisplay] = useState(formatCurrency(settings?.initial_cash ?? 0));
  const [margin, setMargin] = useState(settings?.margin_percent ?? 0);
  const [projectionRoi, setProjectionRoi] = useState(settings?.projection_roi ?? 1.2);
  const [paymentModel, setPaymentModel] = useState(settings?.payment_model ?? "ClickBank Real");
  const [tz, setTz] = useState(settings?.timezone_venda ?? "America/Sao_Paulo");
  const [notes, setNotes] = useState(settings?.notes ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setInitialCash(settings?.initial_cash ?? 0);
    setInitialCashDisplay(formatCurrency(settings?.initial_cash ?? 0));
    setMargin(settings?.margin_percent ?? 0);
    setProjectionRoi(settings?.projection_roi ?? 1.2);
    setPaymentModel(settings?.payment_model ?? "ClickBank Real");
    setTz(settings?.timezone_venda ?? "America/Sao_Paulo");
    setNotes(settings?.notes ?? "");
  }, [settings]);

  const handleCashChange = (raw: string) => {
    setInitialCashDisplay(raw);
    setInitialCash(parseCurrency(raw));
  };

  const handleCashBlur = () => {
    setInitialCashDisplay(formatCurrency(initialCash));
  };

  const handleCashFocus = () => {
    setInitialCashDisplay(initialCash === 0 ? "" : String(initialCash));
  };

  const handleSave = () => {
    upsert.mutate(
      {
        month,
        initial_cash: initialCash,
        margin_percent: margin,
        projection_roi: projectionRoi,
        payment_model: paymentModel,
        timezone_venda: tz,
        notes,
      },
      {
        onSuccess: () => {
          toast.success("Configurações salvas");
          setOpen(false);
        },
        onError: () => toast.error("Erro ao salvar"),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Configurações
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Configurações do Fluxo de Caixa</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 mt-6">
          {/* Caixa Inicial - campo principal */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Caixa Inicial (R$)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                className="pl-9 text-lg font-bold tabular-nums"
                value={initialCashDisplay}
                onChange={(e) => handleCashChange(e.target.value)}
                onBlur={handleCashBlur}
                onFocus={handleCashFocus}
                placeholder="0"
              />
            </div>
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Saldo disponível no dia 1 do mês. Ajuste para que o saldo de "hoje" reflita sua realidade (ex: se hoje você tem R$0, calibre até o saldo bater).</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>ROI de Projeção (ex: 1.2 = 120%)</Label>
            <Input
              type="number"
              value={projectionRoi}
              onChange={(e) => setProjectionRoi(Number(e.target.value))}
              min={0}
              step={0.1}
            />
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Faturamento projetado = Gasto médio × ROI. Ex: R$10k gasto × 1.2 ROI = R$12k faturamento.</span>
            </div>
          </div>


          <div className="space-y-2">
            <Label>Modelo de Pagamento</Label>
            <Select value={paymentModel} onValueChange={setPaymentModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models?.map((m) => (
                  <SelectItem key={m.id} value={m.name}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Timezone da Venda</Label>
            <Select value={tz} onValueChange={setTz}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">America/Sao_Paulo (BRT)</SelectItem>
                <SelectItem value="America/Los_Angeles">ClickBank / US Pacific</SelectItem>
                <SelectItem value="America/New_York">US Eastern</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Observações Operacionais</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notas sobre o fluxo deste mês..."
            />
          </div>

          <Button onClick={handleSave} disabled={upsert.isPending} className="w-full gap-2">
            <Save className="h-4 w-4" />
            {upsert.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
