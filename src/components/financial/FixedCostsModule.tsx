import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFixedCosts, useUpsertFixedCost, useDeleteFixedCost } from "@/hooks/useFinancialData";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";

/* ── Options ── */
const COST_TYPES = [
  "Salários", "Ferramentas", "Infraestrutura", "Educação", "Operacional", "Serviços", "Outros",
] as const;

const CATEGORIES_BY_TYPE: Record<string, string[]> = {
  "Salários": ["Gestor", "Editor", "Copy", "Tráfego", "Dev", "Assistente", "Financeiro"],
  "Ferramentas": ["Software", "IA", "Design", "Automação", "Tracking", "Analytics", "Gestão"],
  "Educação": ["Curso", "Mentoria", "Treinamento", "Evento"],
  "Infraestrutura": ["Geral"],
  "Operacional": ["Geral"],
  "Serviços": ["Geral"],
  "Outros": ["Geral"],
};

const SECTORS = [
  "Tráfego", "Copy", "Edição", "Gestão", "Operacional", "Financeiro", "Dev", "Empresa",
] as const;

const RECURRENCES = [
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
  { value: "unico", label: "Único" },
] as const;

const RECURRENCE_LABELS: Record<string, string> = {
  mensal: "Mensal",
  anual: "Anual",
  unico: "Único",
};

const emptyForm = {
  name: "",
  category: "geral",
  cost_type: "Outros",
  sector: "Empresa",
  recurrence: "mensal",
  monthly_value: 0,
  is_active: true,
};

export function FixedCostsModule() {
  const { data: costs = [] } = useFixedCosts();
  const upsert = useUpsertFixedCost();
  const remove = useDeleteFixedCost();
  const [form, setForm] = useState<any>(null);

  // Dynamic categories based on selected cost_type
  const dynamicCategories = useMemo(() => {
    if (!form) return [];
    return CATEGORIES_BY_TYPE[form.cost_type] || ["Geral"];
  }, [form?.cost_type]);

  const handleCostTypeChange = (val: string) => {
    const cats = CATEGORIES_BY_TYPE[val] || ["Geral"];
    setForm({ ...form, cost_type: val, category: cats[0] });
  };

  const handleSave = async () => {
    if (!form?.name) { toast.error("Nome é obrigatório"); return; }
    try {
      await upsert.mutateAsync(form);
      setForm(null);
      toast.success("Custo fixo salvo");
    } catch { toast.error("Erro ao salvar"); }
  };

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
          Custos Fixos Operacionais
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setForm({ ...emptyForm })} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Novo
        </Button>
      </CardHeader>
      <CardContent>
        {form && (
          <div className="border border-border rounded-lg p-4 mb-4 space-y-3 bg-secondary/30">
            {/* Row 1: Nome + Valor */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Nome</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-8 text-xs font-mono" placeholder="Ex: AdSpy" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Valor Mensal (R$)</Label>
                <Input type="number" value={form.monthly_value} onChange={e => setForm({ ...form, monthly_value: Number(e.target.value) })} className="h-8 text-xs font-mono" />
              </div>
            </div>

            {/* Row 2: Tipo + Categoria (dinâmica) + Setor + Recorrência */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Tipo de Custo</Label>
                <Select value={form.cost_type} onValueChange={handleCostTypeChange}>
                  <SelectTrigger className="h-8 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="h-8 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dynamicCategories.map((c: string) => (
                      <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Setor</Label>
                <Select value={form.sector} onValueChange={(v) => setForm({ ...form, sector: v })}>
                  <SelectTrigger className="h-8 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTORS.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Recorrência</Label>
                <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                  <SelectTrigger className="h-8 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCES.map((r) => (
                      <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setForm(null)} className="h-7 text-xs"><X className="h-3 w-3 mr-1" /> Cancelar</Button>
              <Button size="sm" onClick={handleSave} className="h-7 text-xs" disabled={upsert.isPending}><Check className="h-3 w-3 mr-1" /> Salvar</Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] font-mono">Nome</TableHead>
              <TableHead className="text-[10px] font-mono">Tipo</TableHead>
              <TableHead className="text-[10px] font-mono">Categoria</TableHead>
              <TableHead className="text-[10px] font-mono">Setor</TableHead>
              <TableHead className="text-[10px] font-mono">Recorrência</TableHead>
              <TableHead className="text-[10px] font-mono">Valor Mensal</TableHead>
              <TableHead className="text-[10px] font-mono">Status</TableHead>
              <TableHead className="text-[10px] font-mono w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {costs.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs font-mono font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[9px] font-mono">
                    {c.cost_type || "—"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-mono">{c.category || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[9px] font-mono">
                    {c.sector || "—"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-mono">{RECURRENCE_LABELS[c.recurrence] || c.recurrence || "—"}</TableCell>
                <TableCell className="text-xs font-mono">R$ {Number(c.monthly_value).toLocaleString("pt-BR")}</TableCell>
                <TableCell>
                  <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px]">{c.is_active ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({
                      ...c,
                      cost_type: c.cost_type || "Outros",
                      sector: c.sector || "Empresa",
                      recurrence: c.recurrence || "mensal",
                    })}><Pencil className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { remove.mutate(c.id); toast.success("Removido"); }}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {costs.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">Nenhum custo fixo cadastrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
