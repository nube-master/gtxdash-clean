import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Pencil, Trash2, Search, Loader2, Settings2,
} from "lucide-react";
import { toast } from "sonner";

interface MappingRule {
  id: string;
  pattern: string;
  pattern_type: string;
  display_name: string;
  bm_id: string | null;
  account_id: string | null;
  account_type: string;
  currency: string;
  is_active: boolean;
  created_at: string;
}

type FormData = Omit<MappingRule, "id" | "created_at">;

const EMPTY_FORM: FormData = {
  pattern: "",
  pattern_type: "contains",
  display_name: "",
  bm_id: "",
  account_id: "",
  account_type: "own",
  currency: "BRL",
  is_active: true,
};

export default function MappingRulesPanel() {
  const queryClient = useQueryClient();
  const opId = useOperationId();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["campaign-mapping-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_mapping_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MappingRule[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: FormData & { id?: string }) => {
      const row = {
        pattern: payload.pattern.trim(),
        pattern_type: payload.pattern_type,
        display_name: payload.display_name.trim(),
        bm_id: payload.bm_id?.trim() || null,
        account_id: payload.account_id?.trim() || null,
        account_type: payload.account_type,
        currency: payload.currency,
        is_active: payload.is_active,
      };

      if (payload.id) {
        const { error } = await supabase
          .from("campaign_mapping_rules")
          .update(row)
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("campaign_mapping_rules")
          .insert({ ...row, operation_id: opId! });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-mapping-rules"] });
      toast.success(editingId ? "Regra atualizada" : "Regra criada");
      closeDialog();
    },
    onError: () => toast.error("Erro ao salvar regra"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("campaign_mapping_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-mapping-rules"] });
      toast.success("Regra removida");
      setDeleteConfirm(null);
    },
    onError: () => toast.error("Erro ao remover regra"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("campaign_mapping_rules")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-mapping-rules"] });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(rule: MappingRule) {
    setEditingId(rule.id);
    setForm({
      pattern: rule.pattern,
      pattern_type: rule.pattern_type,
      display_name: rule.display_name,
      bm_id: rule.bm_id || "",
      account_id: rule.account_id || "",
      account_type: rule.account_type,
      currency: rule.currency,
      is_active: rule.is_active,
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.pattern.trim()) {
      toast.error("Padrão é obrigatório");
      return;
    }
    if (!form.display_name.trim()) {
      toast.error("Nome visual é obrigatório");
      return;
    }
    upsertMutation.mutate({ ...form, id: editingId || undefined });
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rules;
    const q = search.toLowerCase();
    return rules.filter(
      (r) =>
        r.pattern.toLowerCase().includes(q) ||
        r.display_name.toLowerCase().includes(q) ||
        (r.account_id || "").toLowerCase().includes(q) ||
        (r.bm_id || "").toLowerCase().includes(q)
    );
  }, [rules, search]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Buscar regra..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[200px] pl-8 text-xs border-border bg-secondary/50"
            />
          </div>
          <Badge variant="outline" className="text-[10px]">
            {rules.length} regra{rules.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => {
            setForm({ ...EMPTY_FORM });
            setEditingId(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-3 w-3" />
          Nova Regra
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-card border border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Padrão</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Tipo Match</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Nome Visual</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">BM ID</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Account ID</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Moeda</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Tipo</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-center">Ativo</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                        Nenhuma regra encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((rule) => (
                      <TableRow key={rule.id} className="border-border">
                        <TableCell className="text-xs font-mono font-medium max-w-[200px] truncate" title={rule.pattern}>
                          {rule.pattern}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[8px]">
                            {rule.pattern_type === "regex" ? "Regex" : rule.pattern_type === "exact" ? "Exato" : "Contém"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{rule.display_name}</TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground">{rule.bm_id || "—"}</TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground">{rule.account_id || "—"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[9px] ${rule.currency === "USD" ? "border-destructive/30 text-destructive" : ""}`}>
                            {rule.currency}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[8px] ${rule.account_type === "rented" ? "border-amber-400/30 text-amber-400" : ""}`}>
                            {rule.account_type === "own" ? "Própria" : "Alugada"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({ id: rule.id, is_active: checked })
                            }
                            className="scale-75"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEdit(rule)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirm(rule.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {editingId ? "Editar Regra" : "Nova Regra de Mapeamento"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Pattern + Type */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-[10px] uppercase text-muted-foreground">Padrão (regex / palavra-chave)</Label>
                <Input
                  value={form.pattern}
                  onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                  placeholder="ex: GTX.*ESCALA|test_campaign"
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-muted-foreground">Tipo Match</Label>
                <Select value={form.pattern_type} onValueChange={(v) => setForm({ ...form, pattern_type: v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains" className="text-xs">Contém</SelectItem>
                    <SelectItem value="regex" className="text-xs">Regex</SelectItem>
                    <SelectItem value="exact" className="text-xs">Exato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Display Name */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase text-muted-foreground">Nome Visual</Label>
              <Input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="ex: GTX Escala BR"
                className="h-9 text-xs"
              />
            </div>

            {/* BM ID + Account ID */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-muted-foreground">BM ID</Label>
                <Input
                  value={form.bm_id || ""}
                  onChange={(e) => setForm({ ...form, bm_id: e.target.value })}
                  placeholder="ex: 123456789"
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-muted-foreground">Account ID</Label>
                <Input
                  value={form.account_id || ""}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                  placeholder="ex: act_987654321"
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            {/* Currency + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-muted-foreground">Moeda</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL" className="text-xs">BRL</SelectItem>
                    <SelectItem value="USD" className="text-xs">USD</SelectItem>
                    <SelectItem value="EUR" className="text-xs">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-muted-foreground">Tipo de Conta</Label>
                <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="own" className="text-xs">Própria</SelectItem>
                    <SelectItem value="rented" className="text-xs">Alugada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between py-1">
              <Label className="text-xs">Regra ativa</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeDialog} className="text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1.5"
              onClick={handleSubmit}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Remover regra?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Essa ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)} className="text-xs">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
