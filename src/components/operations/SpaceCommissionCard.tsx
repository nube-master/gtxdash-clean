import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCommissionConfig, useCommissionHistory, useSaveCommissionConfig,
  type CommissionConfig,
} from "@/hooks/useCommissionCalc";
import { calcCommission } from "@/lib/spaceCommission";

interface Props {
  opId: string;
  start: string;
  end: string;
  currency: "BRL" | "USD";
  /** Faturamento do período — MESMA fonte do card Lucro Bruto (já na moeda exibida) */
  revenue: number;
  /** Investimento do período — MESMA fonte do card Lucro Bruto (já na moeda exibida) */
  spend: number;
  /** Custo de estrutura de tráfego do período (já na moeda exibida) */
  trafficInfraCost?: number;
  enabled?: boolean;
}

const DEFAULTS: Omit<CommissionConfig, "id" | "operation_id"> = {
  commission_pct: 10,
  base_formula: "net_profit",
  includes_taxes: true,
  includes_account_rental: true,
  includes_other_costs: false,
  includes_traffic_infra: true,
  other_costs_brl: 0,
  is_cod_operation: false,
  delivery_rate_pct: 60,
};

export function SpaceCommissionCard({ opId, start, end, currency, revenue, spend, trafficInfraCost = 0, enabled = true }: Props) {
  const [open, setOpen] = useState(false);
  const { data: config, isLoading } = useCommissionConfig(opId, enabled);
  const { data: history } = useCommissionHistory(opId, enabled && open);
  const save = useSaveCommissionConfig(opId);
  const [form, setForm] = useState(DEFAULTS);

  useEffect(() => {
    if (config) {
      const { id: _id, operation_id: _op, ...rest } = config;
      setForm(rest);
    }
  }, [config]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(currency === "USD" ? "en-US" : "pt-BR", {
      style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);

  const configured = !!config;
  const calc = calcCommission(config, revenue, spend, trafficInfraCost);
  const { base, pct, valor } = calc;
  const baseLabel = config?.base_formula === "gross_profit" ? "LUCRO BRUTO" : "LUCRO LÍQUIDO";
  const preview = calcCommission(
    { ...form, commission_pct: Number(form.commission_pct) || 0 },
    revenue,
    spend,
    trafficInfraCost,
  );
  const noDeduction =
    form.base_formula === "net_profit" &&
    !form.includes_traffic_infra &&
    !form.includes_taxes &&
    !form.includes_account_rental &&
    !form.includes_other_costs;
  const codNote = calc.isCod
    ? ` considerando taxa de entrega ${calc.deliveryRate}% (${fmt(calc.effectiveRevenue)} de ${fmt(calc.grossRevenue)} em pedidos)`
    : "";

  const handleSave = async () => {
    if (noDeduction) {
      toast.error("Marque pelo menos uma dedução para usar base Lucro Líquido");
      return;
    }
    try {
      await save.mutateAsync({
        ...form,
        includes_traffic_infra: !!form.includes_traffic_infra,
        commission_pct: Number(form.commission_pct) || 0,
        other_costs_brl: Number(form.other_costs_brl) || 0,
        delivery_rate_pct: Number(form.delivery_rate_pct) || 0,
      });
      toast.success("Comissão SPACE atualizada");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar comissão");
    }
  };

  return (
    <>
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm relative">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Comissão SPACE
            </p>
            <Button size="icon" variant="ghost" className="h-6 w-6 -mt-1 -mr-1" onClick={() => setOpen(true)}>
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
          {isLoading ? (
            <div className="text-2xl font-bold text-muted-foreground">—</div>
          ) : configured ? (
            <>
              <div className="text-2xl sm:text-[26px] font-bold tracking-tight text-foreground">{fmt(valor)}</div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {base > 0
                  ? `${pct}% sobre ${baseLabel} de ${fmt(base)}${codNote}`
                  : `Sem comissão em período negativo · ${baseLabel} de ${fmt(base)}${codNote}`}
              </p>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold text-muted-foreground">Não configurada</div>
              <button onClick={() => setOpen(true)} className="text-[10px] text-primary hover:underline mt-1">
                Configurar comissão
              </button>
            </>
          )}
        </CardContent>
      </Card>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              Comissão SPACE
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
                    <History className="h-3.5 w-3.5" /> Histórico
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 max-h-64 overflow-auto">
                  {!history?.length ? (
                    <p className="text-xs text-muted-foreground">Sem alterações registradas.</p>
                  ) : (
                    <ul className="space-y-2">
                      {history.map((h: any) => (
                        <li key={h.id} className="text-xs border-b border-border/40 pb-1.5 last:border-0">
                          <span className="font-mono">
                            {new Date(h.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}· {h.old_values?.commission_pct ?? "—"}% → {h.new_values?.commission_pct ?? "—"}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Percentual da agência sobre o resultado da operação no período consultado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">% de comissão</Label>
              <Input
                type="number" min={0} max={100} step="0.1"
                value={form.commission_pct}
                onChange={(e) => setForm((f) => ({ ...f, commission_pct: Number(e.target.value) }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Base de cálculo</Label>
              <Select
                value={form.base_formula}
                onValueChange={(v) => setForm((f) => ({ ...f, base_formula: v as CommissionConfig["base_formula"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="net_profit">Lucro líquido (fat − invest − deduções)</SelectItem>
                  <SelectItem value="gross_profit">Lucro bruto (fat − invest)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border border-border/40 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-normal">Operação COD (aplicar taxa de entrega)</Label>
                <Switch
                  checked={form.is_cod_operation}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_cod_operation: v }))}
                />
              </div>
              {form.is_cod_operation ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Taxa de entrega (%)</Label>
                  <Input
                    type="number" min={0} max={100} step="0.1"
                    value={form.delivery_rate_pct}
                    onChange={(e) => setForm((f) => ({ ...f, delivery_rate_pct: Number(e.target.value) }))}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Só a parcela entregue do faturamento entra na base de cálculo.
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">Taxa de entrega 100% (operação digital).</p>
              )}
            </div>

            {form.base_formula === "net_profit" && (
              <div className="space-y-3 rounded-md border border-border/40 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deduções incluídas</p>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal">Custo estrutura tráfego (aluguel + imposto BR)</Label>
                  <Switch
                    checked={form.includes_traffic_infra}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, includes_traffic_infra: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal">Incluir impostos (12,15%)</Label>
                  <Switch
                    checked={form.includes_taxes}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, includes_taxes: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal">Incluir aluguel de conta (5,5%)</Label>
                  <Switch
                    checked={form.includes_account_rental}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, includes_account_rental: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal">Incluir outros custos</Label>
                  <Switch
                    checked={form.includes_other_costs}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, includes_other_costs: v }))}
                  />
                </div>
                {form.includes_other_costs && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Outros custos (R$ no período)</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={form.other_costs_brl}
                      onChange={(e) => setForm((f) => ({ ...f, other_costs_brl: Number(e.target.value) }))}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="rounded-md border border-border/40 bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Preview</p>
              <p className="text-sm font-semibold">
                {fmt(preview.valor)} de comissão sobre {fmt(preview.base)}{" "}
                {form.base_formula === "gross_profit" ? "bruto" : "líquido"}
              </p>
              {form.base_formula === "net_profit" && form.includes_traffic_infra && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Inclui custo estrutura tráfego de {fmt(trafficInfraCost)}
                </p>
              )}
              {noDeduction && (
                <p className="text-[10px] text-destructive mt-1">
                  Selecione ao menos uma dedução para usar base Lucro Líquido.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={save.isPending || noDeduction}>
              {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
