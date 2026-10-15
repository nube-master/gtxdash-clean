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
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TaboolaAccount {
  id: string;
  account_id: string;
  account_name: string;
  client_id: string;
  client_secret: string;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

export function IntegrationTaboolaPanel() {
  const { operationId } = useOperation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    account_id: "",
    account_name: "",
    client_id: "",
    client_secret: "",
  });
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["taboola-accounts", operationId],
    queryFn: async () => {
      if (!operationId) return [];
      const { data, error } = await supabase
        .from("taboola_ad_accounts")
        .select("*")
        .eq("operation_id", operationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as TaboolaAccount[];
    },
    enabled: !!operationId,
  });

  const handleValidate = async () => {
    if (!form.account_id.trim() || !form.client_id.trim() || !form.client_secret.trim()) {
      return toast.error("Preencha Account ID, Client ID e Client Secret para validar");
    }
    setValidating(true);
    setIsValidated(false);
    try {
      const { data, error } = await supabase.functions.invoke("sync-taboola", {
        body: {
          account_id: form.account_id.trim(),
          client_id: form.client_id.trim(),
          client_secret: form.client_secret.trim(),
          mode: "validate",
        },
      });
      if (error) throw error;
      if (data?.success) {
        setIsValidated(true);
        toast.success("Credenciais validadas com sucesso!");
      } else {
        throw new Error(data?.error || "Erro desconhecido na validação");
      }
    } catch (e: any) {
      console.error("Validation error:", e);
      toast.error("Falha na validação das credenciais", {
        description: e.message || "Verifique se o Account ID, Client ID e Client Secret estão corretos.",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleAdd = async () => {
    if (!operationId) return toast.error("Operação não selecionada");
    if (!isValidated) {
      return toast.error("Por favor, valide as credenciais antes de salvar.");
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("taboola_ad_accounts").insert({
        account_id: form.account_id.trim(),
        account_name: form.account_name.trim() || `Taboola ${form.account_id}`,
        client_id: form.client_id.trim(),
        client_secret: form.client_secret.trim(),
        operation_id: operationId,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Conta Taboola adicionada");
      setForm({ account_id: "", account_name: "", client_id: "", client_secret: "" });
      setShowForm(false);
      setIsValidated(false);
      queryClient.invalidateQueries({ queryKey: ["taboola-accounts"] });
    } catch (e: any) {
      toast.error("Falha ao adicionar conta", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (acc: TaboolaAccount) => {
    const { error } = await supabase
      .from("taboola_ad_accounts")
      .update({ is_active: !acc.is_active })
      .eq("id", acc.id);
    if (error) return toast.error("Falha ao alternar status");
    queryClient.invalidateQueries({ queryKey: ["taboola-accounts"] });
  };

  const handleDelete = async (acc: TaboolaAccount) => {
    if (!confirm(`Remover a conta "${acc.account_name}"?`)) return;
    const { error } = await supabase
      .from("taboola_ad_accounts")
      .delete()
      .eq("id", acc.id);
    if (error) return toast.error("Falha ao remover conta");
    toast.success("Conta removida");
    queryClient.invalidateQueries({ queryKey: ["taboola-accounts"] });
  };

  const handleSync = async (acc?: TaboolaAccount) => {
    setSyncingId(acc?.id || "all");
    try {
      const { data, error } = await supabase.functions.invoke("sync-taboola", {
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
      toast.success(`Sync concluída: ${totalRows} linhas atualizadas`);
      queryClient.invalidateQueries({ queryKey: ["taboola-accounts"] });
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
          Configuração da API Taboola:
        </h4>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Acesse o <strong>Taboola Backstage</strong></li>
          <li>Localize o seu <strong>Account ID</strong> (slug na URL ou configurações)</li>
          <li>O <strong>Client ID</strong> e <strong>Client Secret</strong> devem ser solicitados ao suporte/AM do Taboola</li>
        </ol>
        <a
          href="https://api.taboola.com/backstage-api/v1.0/index.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          Documentação da API Taboola <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            Contas Taboola ({accounts?.length || 0})
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
                <Label className="text-xs">Account ID *</Label>
                <Input
                  placeholder="Ex: ndm-principal"
                  value={form.account_id}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, account_id: e.target.value }));
                    setIsValidated(false);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome amigável</Label>
                <Input
                  placeholder="Ex: Taboola Principal"
                  value={form.account_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, account_name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client ID *</Label>
                <Input
                  value={form.client_id}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, client_id: e.target.value }));
                    setIsValidated(false);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client Secret *</Label>
                <Input
                  type="password"
                  value={form.client_secret}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, client_secret: e.target.value }));
                    setIsValidated(false);
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleValidate} 
                disabled={validating || saving}
                className={isValidated ? "border-wr-positive text-wr-positive" : ""}
              >
                {validating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                {isValidated ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                    Validado
                  </>
                ) : (
                  "Validar"
                )}
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={saving || validating}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                Salvar
              </Button>
            </div>
          </Card>
        )}

        <div className="space-y-2">
          {accounts?.map((acc) => (
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
                      <Badge className="text-[10px] bg-wr-positive/10 text-wr-positive border-wr-positive/30">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                        OK
                      </Badge>
                    )}
                    {acc.last_sync_status === "error" && (
                      <Badge className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                        <AlertCircle className="h-2.5 w-2.5 mr-1" />
                        Erro
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {acc.last_sync_at
                      ? `Última sync: ${formatDistanceToNow(new Date(acc.last_sync_at), { addSuffix: true, locale: ptBR })}`
                      : "Nunca sincronizado"}
                  </div>
                  {acc.last_sync_error && (
                    <div className="text-[11px] text-destructive mt-1 truncate">
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
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleSync(acc)}
                    disabled={syncingId !== null}
                  >
                    {syncingId === acc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(acc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
