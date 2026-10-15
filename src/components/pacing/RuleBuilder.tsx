import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Play } from "lucide-react";
import { toast } from "sonner";

const METRICS = ["cpa_3d", "cpa_1d", "spend_dia", "spend_3d", "roas_3d", "ctr", "frequency", "pace_pct"];
const OPS = [">", "<", ">=", "<=", "="];
const ACTIONS = ["PAUSAR campanha", "PAUSAR adset", "AUMENTAR budget +20%", "REDUZIR budget -50%", "ALERTAR Sofia"];
const SCOPES = ["todas", "ABO Baiano", "CBO USA", "campanha específica"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RuleBuilder({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState(METRICS[0]);
  const [op, setOp] = useState(OPS[0]);
  const [value, setValue] = useState("");
  const [action, setAction] = useState(ACTIONS[0]);
  const [scope, setScope] = useState(SCOPES[0]);
  const [cooldown, setCooldown] = useState("4");
  const [showJson, setShowJson] = useState(false);

  const json = {
    name: name || "(sem nome)",
    if: { metric, op, value: Number(value) || 0 },
    then: action,
    scope,
    cooldown_h: Number(cooldown) || 0,
  };

  const save = () => {
    if (!name || !value) {
      toast.error("Preencha nome e valor da condição");
      return;
    }
    toast.success(`Regra "${name}" criada`, { description: "Disponível em modo dry-run por padrão." });
    onOpenChange(false);
    setName(""); setValue("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nova Regra</SheetTitle>
          <SheetDescription>Construa uma condição SE / ENTÃO. A regra entra como dry-run até ser ativada.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nome da regra</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: CPA Cap R$750" className="mt-1" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">SE</Label>
            <div className="grid grid-cols-3 gap-2">
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METRICS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={op} onValueChange={setOp}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="valor" className="tabular-nums" />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">ENTÃO</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Escopo</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{SCOPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cooldown (h)</Label>
              <Input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)} className="mt-1 tabular-nums" />
            </div>
          </div>

          <Collapsible open={showJson} onOpenChange={setShowJson}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`size-3 transition-transform ${showJson ? "rotate-0" : "-rotate-90"}`} />
              Preview JSON
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 p-3 rounded bg-muted text-xs tabular-nums overflow-x-auto border border-border/60">
                {JSON.stringify(json, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center justify-between pt-4 border-t border-border/40">
            <Button variant="outline" size="sm" onClick={() => toast.info("Simulação: regra teria disparado 7x nos últimos 7 dias")}>
              <Play className="size-3 mr-1.5" /> Simular 7 dias
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={save}>Criar regra</Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
