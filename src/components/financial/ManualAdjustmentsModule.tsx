import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useManualAdjustments, useUpsertManualAdjustment, useDeleteManualAdjustment } from "@/hooks/useFinancialData";
import { Plus, Trash2, Pencil, X, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const emptyForm = {
  description: "",
  amount: 0,
  is_active: true,
};

export function ManualAdjustmentsModule() {
  const { data: adjustments = [] } = useManualAdjustments();
  const upsert = useUpsertManualAdjustment();
  const remove = useDeleteManualAdjustment();
  const [form, setForm] = useState<any>(null);

  const handleSave = async () => {
    if (!form?.description) { toast.error("Descrição é obrigatória"); return; }
    if (!form?.amount || form.amount <= 0) { toast.error("Valor deve ser maior que zero"); return; }
    try {
      await upsert.mutateAsync(form);
      setForm(null);
      toast.success("Reajuste salvo");
    } catch { toast.error("Erro ao salvar"); }
  };

  const totalActive = adjustments.filter((a: any) => a.is_active).reduce((sum: number, a: any) => sum + Number(a.amount), 0);

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Tráfego Pago — Reajuste Manual
          </CardTitle>
          <p className="text-[10px] text-muted-foreground font-mono mt-1">
            Gastos de contas perdidas/banidas que devem ser somados ao investimento total
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setForm({ ...emptyForm })} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Novo
        </Button>
      </CardHeader>
      <CardContent>
        {/* Info banner */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/50 border border-border mb-4">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
            Valores inseridos aqui serão <strong>somados diretamente ao Investimento em Tráfego</strong> no P&L.
            Use para compensar gastos de contas que perderam acesso e cujo histórico não aparece mais na sincronização.
          </p>
        </div>

        {totalActive > 0 && (
          <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg border border-border bg-destructive/5">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Total ativo:</span>
            <span className="text-sm font-bold font-mono text-destructive">
              R$ {totalActive.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {form && (
          <div className="border border-border rounded-lg p-4 mb-4 space-y-3 bg-secondary/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Descrição (ex: Conta BM banida Jan/26)</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="h-8 text-xs font-mono" placeholder="Ex: Conta act_123 banida" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Valor Total (R$)</Label>
                <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className="h-8 text-xs font-mono" placeholder="0.00" />
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
              <TableHead className="text-[10px] font-mono">Descrição</TableHead>
              <TableHead className="text-[10px] font-mono">Valor</TableHead>
              <TableHead className="text-[10px] font-mono">Status</TableHead>
              <TableHead className="text-[10px] font-mono w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="text-xs font-mono">{a.description}</TableCell>
                <TableCell className="text-xs font-mono">R$ {Number(a.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                <TableCell>
                  <Badge variant={a.is_active ? "default" : "secondary"} className="text-[10px]">{a.is_active ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...a })}><Pencil className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { remove.mutate(a.id); toast.success("Removido"); }}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {adjustments.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">Nenhum reajuste manual cadastrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
