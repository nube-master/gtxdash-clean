import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTeamMembers, useUpsertTeamMember, useDeleteTeamMember } from "@/hooks/useFinancialData";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";

const typeLabels: Record<string, string> = {
  pct_gross_profit: "% sobre Lucro Bruto",
  pct_profit: "% sobre Lucro Líquido",
  pct_revenue: "% sobre Receita",
  pct_spend: "% sobre Spend",
  pct_creative_revenue: "% sobre Receita de Criativos",
  fixed_salary: "Salário Fixo Mensal",
  fixed_period: "Valor Fixo por Período",
};

const scopeLabels: Record<string, string> = {
  all: "Toda operação",
  specific_creative: "Criativos específicos",
  specific_campaign: "Campanhas específicas",
  specific_account: "Contas específicas",
};

const emptyForm = {
  name: "",
  role_title: "",
  commission_type: "pct_profit",
  percentage: 0,
  fixed_value: 0,
  scope: "all",
  scope_ref: "",
  is_active: true,
};

export function TeamMembersModule() {
  const { data: members = [] } = useTeamMembers();
  const upsert = useUpsertTeamMember();
  const remove = useDeleteTeamMember();
  const [form, setForm] = useState<any>(null);

  const handleSave = async () => {
    if (!form?.name) { toast.error("Nome é obrigatório"); return; }
    try {
      await upsert.mutateAsync(form);
      setForm(null);
      toast.success("Membro salvo");
    } catch { toast.error("Erro ao salvar"); }
  };

  const isFixed = form?.commission_type === "fixed_salary" || form?.commission_type === "fixed_period";

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
          Comissões por Membro
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setForm({ ...emptyForm })} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Novo Membro
        </Button>
      </CardHeader>
      <CardContent>
        {form && (
          <div className="border border-border rounded-lg p-4 mb-4 space-y-3 bg-secondary/30">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Nome</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Cargo</Label>
                <Input value={form.role_title} onChange={e => setForm({ ...form, role_title: e.target.value })} className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Tipo de Remuneração</Label>
                <Select value={form.commission_type} onValueChange={v => setForm({ ...form, commission_type: v })}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!isFixed ? (
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">Percentual (%)</Label>
                  <Input type="number" value={form.percentage} onChange={e => setForm({ ...form, percentage: Number(e.target.value) })} className="h-8 text-xs font-mono" />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">Valor (R$)</Label>
                  <Input type="number" value={form.fixed_value} onChange={e => setForm({ ...form, fixed_value: Number(e.target.value) })} className="h-8 text-xs font-mono" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Aplicação</Label>
                <Select value={form.scope} onValueChange={v => setForm({ ...form, scope: v })}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(scopeLabels).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.scope !== "all" && (
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">Referência</Label>
                  <Input value={form.scope_ref || ""} onChange={e => setForm({ ...form, scope_ref: e.target.value })} placeholder="ID ou nome" className="h-8 text-xs font-mono" />
                </div>
              )}
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
              <TableHead className="text-[10px] font-mono">Cargo</TableHead>
              <TableHead className="text-[10px] font-mono">Tipo</TableHead>
              <TableHead className="text-[10px] font-mono">Valor</TableHead>
              <TableHead className="text-[10px] font-mono">Aplicação</TableHead>
              <TableHead className="text-[10px] font-mono">Status</TableHead>
              <TableHead className="text-[10px] font-mono w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m: any) => {
              const isFixedType = m.commission_type === "fixed_salary" || m.commission_type === "fixed_period";
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-xs font-mono">{m.name}</TableCell>
                  <TableCell className="text-xs font-mono">{m.role_title}</TableCell>
                  <TableCell className="text-xs font-mono">{typeLabels[m.commission_type] || m.commission_type}</TableCell>
                  <TableCell className="text-xs font-mono">{isFixedType ? `R$ ${Number(m.fixed_value).toLocaleString("pt-BR")}` : `${m.percentage}%`}</TableCell>
                  <TableCell className="text-xs font-mono">{scopeLabels[m.scope] || m.scope}{m.scope_ref ? ` (${m.scope_ref})` : ""}</TableCell>
                  <TableCell>
                    <Badge variant={m.is_active ? "default" : "secondary"} className="text-[10px]">{m.is_active ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...m })}><Pencil className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { remove.mutate(m.id); toast.success("Removido"); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {members.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">Nenhum membro cadastrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
