import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NbAccount {
  id: string;
  account_id: string;
  account_name: string;
  access_token: string;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

export function IntegrationNewsbreakPanel() {
  const { operationId } = useOperation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    account_id: "",
    account_name: "",
    access_token: "",
  });
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["newsbreak-accounts", operationId],
    queryFn: async () => {
      if (!operationId) return [];
      const { data, error } = await supabase
        .from("newsbreak_ad_accounts")
        .select("*")
        .eq("operation_id", operationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as NbAccount[];
    },
    enabled: !!operationId,
  });

  const handleAdd = async () => {
    if (!operationId) return toast.error("Operação não selecionada");
    if (!form.account_id.trim() || !form.access_token.trim()) {
      return toast.error("Preencha Account ID e Access Token");
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("newsbreak_ad_accounts").insert({
        account_id: form.account_id.trim(),
        account_name: form.account_name.trim() || `Conta ${form.account_id}`,
        access_token: form.access_token.trim(),
        operation_id: operationId,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Conta Newsbreak adicionada");
      setForm({ account_id: "", account_name: "", access_token: "" });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["newsbreak-accounts"] });
    } catch (e: any) {
      toast.error("Falha ao adicionar conta", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (acc: NbAccount) => {
    const { error } = await supabase
      .from("newsbreak_ad_accounts")
      .update({ is_active: !acc.is_active })
      .eq("id", acc.id);
    if (error) return toast.error("Falha ao alternar status");
    queryClient.invalidateQueries({ queryKey: ["newsbreak-accounts"] });
  };

  const handleDelete = async (acc: NbAccount) => {
    if (!confirm(`Remover a conta "${acc.account_name}"?`)) return;
    const { error } = await supabase
      .from("newsbreak_ad_accounts")
      .delete()
      .eq("id", acc.id);
    if (error) return toast.error("Falha ao remover conta");
    toast.success("Conta removida");
    queryClient.invalidateQueries({ queryKey: ["newsbreak-accounts"] });
  };

  const handleSync = async (acc?: NbAccount) => {
    setSyncingId(acc?.id || "all");
    try {
      const { data, error } = await supabase.functions.invoke("sync-newsbreak", {
        body: acc
          ? { account_id: acc.account_id, operation_id: operationId, days: 7 }
          : { operation_id: operationId, days: 7 },
      });
      if (error) throw error;
      const results = (data as any)?.results || [];
      const totalRows = results.reduce(
        (sum: number, r: any) => sum + (r.rows_upserted || 0),
        0,
      );
      const errors = results.filter((r: any) => r.error);
      if (errors.length > 0) {
        toast.warning(
          `Sync parcial: ${totalRows} linhas — ${errors.length} erro(s)`,
          { description: errors[0].error },
        );
      } else {
        toast.success(`Sync concluída: ${totalRows} linhas atualizadas`);
      }
      queryClient.invalidateQueries({ queryKey: ["newsbreak-accounts"] });
    } catch (e: any) {
      toast.error("Falha na sincronização", { description: e.message });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Instruções */}
      <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/50">
        <h4 className="text-sm font-semibold text-foreground">
          Como obter o Access Token do Newsbreak:
        </h4>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>
            Acesse o <strong>Newsbreak Ad Manager</strong> →{" "}
            <strong>Resources → API Access Tokens</strong>
          </li>
          <li>
            Clique em <strong>"Generate Token"</strong>
          </li>
          <li>Copie o token e cole abaixo (ele dá acesso às contas vinculadas)</li>
          <li>
            Localize o <strong>Ad Account ID</strong> nas configurações da conta
            de anúncio
          </li>
        </ol>
        <a
          href="https://help.newsbreak.com/hc/en-us/articles/27680147056397-API-Integration-Guide"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          Abrir guia oficial →
        </a>
      </div>

      {/* Lista de contas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            Contas Newsbreak ({accounts?.length || 0})
          </h4>
          <div className="flex gap-2">
            {(accounts?.length || 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSync()}
                disabled={syncingId !== null}
                className="gap-2"
              >
                {syncingId === "all" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Sincronizar todas
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setShowForm((s) => !s)}
              className="gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova conta
            </Button>
          </div>
        </div>

        {/* Form add */}
        {showForm && (
          <Card className="p-4 space-y-3 border-primary/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Account ID *</Label>
                <Input
                  placeholder="Ex: 12345"
                  value={form.account_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, account_id: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome (opcional)</Label>
                <Input
                  placeholder="Ex: Newsbreak NDM Principal"
                  value={form.account_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, account_name: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Access Token *</Label>
              <Input
                type="password"
                placeholder="Cole o token gerado no Ad Manager"
                value={form.access_token}
                onChange={(e) =>
                  setForm((f) => ({ ...f, access_token: e.target.value }))
                }
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                ) : null}
                Adicionar
              </Button>
            </div>
          </Card>
        )}

        {/* Accounts list */}
        {isLoading ? (
          <div className="text-xs text-muted-foreground text-center py-6">
            Carregando contas...
          </div>
        ) : (accounts?.length || 0) === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border/50 rounded-lg">
            Nenhuma conta Newsbreak configurada ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {accounts!.map((acc) => (
              <Card key={acc.id} className="p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {acc.account_name}
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {acc.account_id}
                      </Badge>
                      {acc.last_sync_status === "success" && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-1 bg-[hsl(var(--warroom-positive))]/10 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          OK
                        </Badge>
                      )}
                      {acc.last_sync_status === "error" && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-1 bg-destructive/10 text-destructive border-destructive/30"
                        >
                          <AlertCircle className="h-2.5 w-2.5" />
                          Erro
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {acc.last_sync_at
                        ? `Última sync: ${formatDistanceToNow(
                            new Date(acc.last_sync_at),
                            { addSuffix: true, locale: ptBR },
                          )}`
                        : "Nunca sincronizado"}
                    </div>
                    {acc.last_sync_error && (
                      <div className="text-[11px] text-destructive mt-1 line-clamp-2">
                        {acc.last_sync_error}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={acc.is_active}
                      onCheckedChange={() => handleToggleActive(acc)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleSync(acc)}
                      disabled={syncingId !== null}
                      title="Sincronizar"
                    >
                      {syncingId === acc.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(acc)}
                      title="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
