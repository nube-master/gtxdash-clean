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
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MgidAccount {
  id: string;
  account_id: string;
  account_name: string;
  api_token: string;
  is_active: boolean;
  currency: string | null;
  wallet_balance: number | null;
  timezone: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

export function IntegrationMgidPanel() {
  const { operationId } = useOperation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    account_id: "",
    account_name: "",
    api_token: "",
  });
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["mgid-accounts", operationId],
    queryFn: async () => {
      if (!operationId) return [];
      const { data, error } = await supabase
        .from("mgid_ad_accounts")
        .select("*")
        .eq("operation_id", operationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as MgidAccount[];
    },
    enabled: !!operationId,
  });

  const handleAdd = async () => {
    if (!operationId) return toast.error("Operação não selecionada");
    if (!form.account_id.trim() || !form.api_token.trim()) {
      return toast.error("Preencha Client ID e API Token");
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("mgid_ad_accounts").insert({
        account_id: form.account_id.trim(),
        account_name: form.account_name.trim() || `Conta ${form.account_id}`,
        api_token: form.api_token.trim(),
        operation_id: operationId,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Conta MGID adicionada");
      setForm({ account_id: "", account_name: "", api_token: "" });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["mgid-accounts"] });
    } catch (e: any) {
      toast.error("Falha ao adicionar conta", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (acc: MgidAccount) => {
    const { error } = await supabase
      .from("mgid_ad_accounts")
      .update({ is_active: !acc.is_active })
      .eq("id", acc.id);
    if (error) return toast.error("Falha ao alternar status");
    queryClient.invalidateQueries({ queryKey: ["mgid-accounts"] });
  };

  const handleDelete = async (acc: MgidAccount) => {
    if (!confirm(`Remover a conta "${acc.account_name}"?`)) return;
    const { error } = await supabase
      .from("mgid_ad_accounts")
      .delete()
      .eq("id", acc.id);
    if (error) return toast.error("Falha ao remover conta");
    toast.success("Conta removida");
    queryClient.invalidateQueries({ queryKey: ["mgid-accounts"] });
  };

  const handleSync = async (acc?: MgidAccount) => {
    setSyncingId(acc?.id || "all");
    try {
      const { data, error } = await supabase.functions.invoke("sync-mgid", {
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
      queryClient.invalidateQueries({ queryKey: ["mgid-accounts"] });
    } catch (e: any) {
      toast.error("Falha na sincronização", { description: e.message });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/50">
        <h4 className="text-sm font-semibold text-foreground">
          Como obter as credenciais MGID:
        </h4>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>
            Acesse o painel MGID → <strong>Settings → API</strong>
          </li>
          <li>
            Copie o <strong>Client API ID</strong> (número, ex: 865227) e cole em
            "Client ID"
          </li>
          <li>
            Copie o <strong>Client API token</strong> e cole em "API Token"
          </li>
          <li>
            A conta será validada automaticamente na primeira sincronização
            (saldo + campanhas)
          </li>
        </ol>
        <a
          href="https://help.mgid.com/api-advertisers"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          Abrir documentação MGID API →
        </a>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            Contas MGID ({accounts?.length || 0})
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

        {showForm && (
          <Card className="p-4 space-y-3 border-primary/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Client ID *</Label>
                <Input
                  placeholder="Ex: 865227"
                  value={form.account_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, account_id: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome (opcional)</Label>
                <Input
                  placeholder="Ex: MGID Principal"
                  value={form.account_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, account_name: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">API Token *</Label>
              <Input
                type="password"
                placeholder="Cole o Client API token"
                value={form.api_token}
                onChange={(e) =>
                  setForm((f) => ({ ...f, api_token: e.target.value }))
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

        {isLoading ? (
          <div className="text-xs text-muted-foreground text-center py-6">
            Carregando contas...
          </div>
        ) : (accounts?.length || 0) === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border/50 rounded-lg">
            Nenhuma conta MGID configurada ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {accounts!.map((acc) => (
              <Card key={acc.id} className="p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {acc.wallet_balance != null && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-1 font-mono"
                        >
                          <Wallet className="h-2.5 w-2.5" />
                          {(acc.currency || "usd").toUpperCase()}{" "}
                          {Number(acc.wallet_balance).toFixed(2)}
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
                      {acc.timezone ? ` • ${acc.timezone}` : ""}
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
