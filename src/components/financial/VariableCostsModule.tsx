import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useVariableCosts, useUpsertVariableCost, useDeleteVariableCost } from "@/hooks/useFinancialData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Pencil, X, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const calcBaseLabels: Record<string, string> = {
  pct_spend: "% sobre Spend",
  pct_revenue: "% sobre Receita",
  pct_profit: "% sobre Lucro",
  fixed_value: "Valor Fixo",
};

const scopeLabels: Record<string, string> = {
  all: "Todas as contas",
  brl_only: "Apenas BRL",
  usd_only: "Apenas USD",
  specific_account: "Contas específicas",
  specific_campaign: "Campanha específica",
  specific_creative: "Criativo específico",
};

const emptyForm = {
  name: "",
  calc_base: "pct_spend",
  percentage: 0,
  fixed_value: 0,
  scope: "all",
  scope_ref: "",
  is_active: true,
};

/** Parse scope_ref which can be a single ID or JSON array of IDs */
function parseScopeRefs(scopeRef: string | null): string[] {
  if (!scopeRef) return [];
  try {
    const parsed = JSON.parse(scopeRef);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return scopeRef ? [scopeRef] : [];
}

export function VariableCostsModule() {
  const [accountSearch, setAccountSearch] = useState("");
  const { data: costs = [] } = useVariableCosts();
  const { data: accounts = [] } = useQuery({
    queryKey: ["meta-accounts-for-costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meta_ad_accounts").select("account_id, account_name, currency").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });
  const upsert = useUpsertVariableCost();
  const remove = useDeleteVariableCost();
  const [form, setForm] = useState<any>(null);

  const getAccountLabel = (accountId: string) => {
    const acc = accounts.find((a: any) => a.account_id === accountId);
    return acc ? `${acc.account_name} (${acc.currency})` : accountId;
  };

  const getSelectedAccountLabels = (scopeRef: string | null) => {
    const ids = parseScopeRefs(scopeRef);
    if (ids.length === 0) return "Selecione contas";
    if (ids.length <= 2) return ids.map(id => getAccountLabel(id)).join(", ");
    return `${ids.length} contas selecionadas`;
  };

  const toggleAccount = (accountId: string) => {
    const current = parseScopeRefs(form.scope_ref);
    const updated = current.includes(accountId)
      ? current.filter((id: string) => id !== accountId)
      : [...current, accountId];
    setForm({ ...form, scope_ref: JSON.stringify(updated) });
  };

  const handleSave = async () => {
    if (!form?.name) { toast.error("Nome é obrigatório"); return; }
    try {
      await upsert.mutateAsync(form);
      setForm(null);
      toast.success("Custo salvo");
    } catch { toast.error("Erro ao salvar"); }
  };

  return (
    <Card className="bg-card border border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
          Custos Variáveis Configuráveis
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setForm({ ...emptyForm })} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Novo
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
                <Label className="text-xs font-mono text-muted-foreground">Base de Cálculo</Label>
                <Select value={form.calc_base} onValueChange={v => setForm({ ...form, calc_base: v })}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(calcBaseLabels).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.calc_base !== "fixed_value" ? (
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">Percentual (%)</Label>
                  <Input type="number" value={form.percentage} onChange={e => setForm({ ...form, percentage: Number(e.target.value) })} className="h-8 text-xs font-mono" />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">Valor Fixo Mensal (R$)</Label>
                  <Input type="number" value={form.fixed_value} onChange={e => setForm({ ...form, fixed_value: Number(e.target.value) })} className="h-8 text-xs font-mono" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">Aplicação</Label>
                <Select value={form.scope} onValueChange={v => setForm({ ...form, scope: v, scope_ref: "" })}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(scopeLabels).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.scope === "specific_account" && (
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs font-mono text-muted-foreground">Contas</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-8 text-xs font-mono justify-between">
                        <span className="truncate">{getSelectedAccountLabels(form.scope_ref)}</span>
                        <ChevronDown className="h-3 w-3 ml-2 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <div className="p-2 border-b border-border">
                        <Input
                          placeholder="Buscar conta..."
                          value={accountSearch}
                          onChange={e => setAccountSearch(e.target.value)}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div className="p-2 max-h-52 overflow-y-auto">
                        {accounts
                          .filter((a: any) =>
                            `${a.account_name} ${a.account_id} ${a.currency}`
                              .toLowerCase()
                              .includes(accountSearch.toLowerCase())
                          )
                          .map((a: any) => {
                            const selected = parseScopeRefs(form.scope_ref).includes(a.account_id);
                            return (
                              <div
                                key={a.account_id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 cursor-pointer"
                                onClick={() => toggleAccount(a.account_id)}
                              >
                                <Checkbox checked={selected} className="h-3.5 w-3.5" />
                                <span className="text-xs font-mono">{a.account_name} ({a.currency})</span>
                              </div>
                            );
                          })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {["specific_campaign", "specific_creative"].includes(form.scope) && (
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
              <TableHead className="text-[10px] font-mono">Base</TableHead>
              <TableHead className="text-[10px] font-mono">Valor</TableHead>
              <TableHead className="text-[10px] font-mono">Aplicação</TableHead>
              <TableHead className="text-[10px] font-mono">Status</TableHead>
              <TableHead className="text-[10px] font-mono w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {costs.map((c: any) => {
              const scopeDisplay = c.scope === "specific_account"
                ? `Contas: ${parseScopeRefs(c.scope_ref).map((id: string) => getAccountLabel(id)).join(", ")}`
                : `${scopeLabels[c.scope] || c.scope}${c.scope_ref && !["specific_account"].includes(c.scope) ? ` (${c.scope_ref})` : ""}`;
              return (
                <TableRow key={c.id}>
                  <TableCell className="text-xs font-mono">{c.name}</TableCell>
                  <TableCell className="text-xs font-mono">{calcBaseLabels[c.calc_base] || c.calc_base}</TableCell>
                  <TableCell className="text-xs font-mono">{c.calc_base === "fixed_value" ? `R$ ${Number(c.fixed_value).toLocaleString("pt-BR")}` : `${c.percentage}%`}</TableCell>
                  <TableCell className="text-xs font-mono max-w-[200px] truncate" title={scopeDisplay}>{scopeDisplay}</TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px]">{c.is_active ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...c })}><Pencil className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { remove.mutate(c.id); toast.success("Removido"); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {costs.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">Nenhum custo variável cadastrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
