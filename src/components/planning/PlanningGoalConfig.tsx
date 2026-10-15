import { Target, Calendar, Save, Loader2, DollarSign, Percent } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fmt, diffDays, remainingDays, type GoalConfig, type ProfitTargets } from "@/lib/planningUtils";

interface Props {
  config: GoalConfig;
  onChange: (key: keyof GoalConfig, value: string) => void;
  onSave: () => void;
  saving: boolean;
  profitTargets: ProfitTargets;
}

export function PlanningGoalConfig({ config, onChange, onSave, saving, profitTargets }: Props) {
  const totalDays = diffDays(config.startDate, config.endDate);
  const remaining = remainingDays(config.endDate);
  const profitPerDay = totalDays > 0 ? config.profitGoal / totalDays : 0;

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Configuração de Meta
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Row 1: PRIMARY — Profit & Margin */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Meta de Lucro (período)" value={String(config.profitGoal || "")} onChange={(v) => onChange("profitGoal", v)} placeholder="R$ 500.000" icon={<DollarSign className="h-3 w-3" />} />
          <Field label="Margem Meta (% s/ Invest.)" value={String(config.marginGoal || "")} onChange={(v) => onChange("marginGoal", v)} placeholder="30" icon={<Percent className="h-3 w-3" />} />
          <Field label="Meta de CPA" value={String(config.cpaGoal || "")} onChange={(v) => onChange("cpaGoal", v)} placeholder="R$ 50" />
          <Field label="Preço Médio" value={String(config.avgPrice || "")} onChange={(v) => onChange("avgPrice", v)} placeholder="R$ 197" />
        </div>

        {/* Row 2: Secondary — Revenue, Sales, Unit Economics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Meta de Faturamento" value={String(config.revenueGoal || "")} onChange={(v) => onChange("revenueGoal", v)} placeholder="R$ 100.000" />
          <Field label="Meta de Vendas" value={String(config.salesGoal || "")} onChange={(v) => onChange("salesGoal", v)} placeholder="500" />
          <Field label="Custo Produto (COGS)" value={String(config.cogs || "")} onChange={(v) => onChange("cogs", v)} placeholder="R$ 15" />
          <Field label="Taxas (%)" value={String(config.feeRate || "")} onChange={(v) => onChange("feeRate", v)} placeholder="5" />
        </div>

        {/* Row 3: Tax + Dates */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Impostos (%)" value={String(config.taxRate || "")} onChange={(v) => onChange("taxRate", v)} placeholder="6" />
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Data Início</Label>
            <Input type="date" value={config.startDate} onChange={(e) => onChange("startDate", e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Data Final</Label>
            <Input type="date" value={config.endDate} onChange={(e) => onChange("endDate", e.target.value)} className="h-9 text-sm" />
          </div>
        </div>

        {/* Calculated summary — Profit first */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{totalDays} dias totais</span>
            <span className="text-[10px] text-primary font-medium">{remaining} restantes</span>
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{fmt(profitPerDay, "currency")}</span> lucro/dia
          </div>
          <div className="text-xs text-muted-foreground">
            Margem alvo: <span className="font-medium text-foreground">{fmt(config.marginGoal, "percent")}</span> sobre investimento
          </div>
        </div>

        {/* Profit targets */}
        {config.profitGoal > 0 && (
          <div className="flex flex-wrap gap-4 pt-2 border-t border-border">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Para atingir a meta de lucro:</span>
            <div className="text-xs text-muted-foreground">Fat. necessário: <span className="font-medium text-foreground">{fmt(profitTargets.revenueNeeded, "currency")}</span></div>
            <div className="text-xs text-muted-foreground">Vendas: <span className="font-medium text-foreground">{fmt(profitTargets.salesNeeded, "number")}</span></div>
            <div className="text-xs text-muted-foreground">Invest.: <span className="font-medium text-foreground">{fmt(profitTargets.investNeeded, "currency")}</span></div>
            <div className="text-xs text-muted-foreground">CPA máx.: <span className="font-medium text-foreground">{fmt(profitTargets.cpaMax, "currency")}</span></div>
            <div className="text-xs text-muted-foreground">ROAS mín.: <span className="font-medium text-foreground">{fmt(profitTargets.roasMin, "roas")}</span></div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving} size="sm" className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar Meta
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, placeholder, icon }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </Label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm font-data" />
    </div>
  );
}
