import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, ExternalLink, Store, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const WEBHOOK_URL = `https://taeduxiandktefcwgspx.supabase.co/functions/v1/clickbank-ipn`;

interface VendorConfig {
  id: string;
  label: string;
  nickname: string;
  secret_env: string;
  vendor_name?: string;
}

export function IntegrationClickBankPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ label: "", nickname: "", secret_env: "", vendor_name: "" });

  const { data: vendors = [] } = useQuery({
    queryKey: ["clickbank-vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "clickbank_vendors")
        .single();
      if (error) return [];
      return (data?.value as unknown as VendorConfig[]) || [];
    },
  });

  const saveVendors = useMutation({
    mutationFn: async (newVendors: VendorConfig[]) => {
      const { error } = await supabase
        .from("app_settings")
        .update({ value: JSON.parse(JSON.stringify(newVendors)), updated_at: new Date().toISOString() })
        .eq("key", "clickbank_vendors");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clickbank-vendors"] });
    },
  });

  const copyUrl = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    toast({ title: "URL copiada!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const startEdit = (vendor: VendorConfig) => {
    setEditingId(vendor.id);
    setForm({ label: vendor.label, nickname: vendor.nickname, secret_env: vendor.secret_env, vendor_name: vendor.vendor_name || "" });
    setShowNew(false);
  };

  const startNew = () => {
    setShowNew(true);
    setEditingId(null);
    setForm({ label: "", nickname: "", secret_env: "", vendor_name: "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowNew(false);
    setForm({ label: "", nickname: "", secret_env: "", vendor_name: "" });
  };

  const handleSaveEdit = () => {
    if (!form.label.trim() || !form.nickname.trim() || !form.secret_env.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    const updated = vendors.map((v) =>
      v.id === editingId ? { ...v, label: form.label.trim(), nickname: form.nickname.trim(), secret_env: form.secret_env.trim().toUpperCase(), ...(form.vendor_name.trim() ? { vendor_name: form.vendor_name.trim().toLowerCase() } : { vendor_name: undefined }) } : v
    );
    saveVendors.mutate(updated, {
      onSuccess: () => {
        toast({ title: "Loja atualizada!" });
        cancelEdit();
      },
    });
  };

  const handleSaveNew = () => {
    if (!form.label.trim() || !form.nickname.trim() || !form.secret_env.trim()) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    const newId = form.label.trim().toLowerCase().replace(/\s+/g, "_");
    const newVendor: VendorConfig = {
      id: newId,
      label: form.label.trim(),
      nickname: form.nickname.trim(),
      secret_env: form.secret_env.trim().toUpperCase(),
      ...(form.vendor_name.trim() ? { vendor_name: form.vendor_name.trim().toLowerCase() } : {}),
    };
    saveVendors.mutate([...vendors, newVendor], {
      onSuccess: () => {
        toast({ title: `Loja "${newVendor.label}" adicionada!` });
        cancelEdit();
      },
    });
  };

  const handleDelete = (vendor: VendorConfig) => {
    if (!confirm(`Remover a loja "${vendor.label}" (${vendor.nickname})?`)) return;
    saveVendors.mutate(vendors.filter((v) => v.id !== vendor.id), {
      onSuccess: () => toast({ title: `Loja "${vendor.label}" removida` }),
    });
  };

  const renderForm = (onSave: () => void) => (
    <div className="space-y-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Label (ex: NDM)</label>
          <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="text-xs h-8" placeholder="MO" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Nickname do Afiliado</label>
          <Input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} className="text-xs h-8" placeholder="gtxndr" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Nome da Secret Key</label>
          <Input value={form.secret_env} onChange={(e) => setForm((f) => ({ ...f, secret_env: e.target.value }))} className="text-xs h-8 font-mono" placeholder="CLICKBANK_SECRET_KEY_XXX" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Vendor (opcional)</label>
          <Input value={form.vendor_name} onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))} className="text-xs h-8" placeholder="memoryon" />
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">Preencha se o mesmo afiliado vende para múltiplos vendors</p>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end pt-1">
        <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs gap-1">
          <X className="h-3 w-3" /> Cancelar
        </Button>
        <Button size="sm" onClick={onSave} disabled={saveVendors.isPending} className="h-7 text-xs gap-1">
          <Save className="h-3 w-3" /> Salvar
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Instructions */}
      <div className="bg-[hsl(var(--warroom-positive))]/5 rounded-lg p-4 space-y-3 border border-[hsl(var(--warroom-positive))]/20">
        <h4 className="text-sm font-semibold text-[hsl(var(--warroom-positive))]">Como configurar uma nova loja na ClickBank</h4>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Acesse <a href="https://clickbank.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">ClickBank</a> e faça login na conta do vendor.</li>
          <li>Anote o <strong>Nickname do Afiliado</strong> dessa loja (ex: <code className="text-[10px] bg-muted px-1 py-0.5 rounded">nrptgtx</code>).</li>
          <li>Vá em <strong>Settings → My Site → Advanced Tools</strong>.</li>
          <li>No campo <strong>"Chave secreta"</strong>, defina uma senha e salve (ex: <code className="text-[10px] bg-muted px-1 py-0.5 rounded">MINHASENHA123</code>).</li>
          <li>Informe o nickname e a chave secreta ao administrador para que ele configure no backend.</li>
          <li>Marque <strong>"Criptografar os URLs das transações"</strong>.</li>
          <li>Cole a <strong>URL do Webhook</strong> abaixo no campo "URL de Notificação Instantânea".</li>
          <li>Selecione <strong>versão 8.0</strong> e clique em <strong>"Teste"</strong> para verificar.</li>
          <li>Se o teste retornar sucesso, clique em <strong>"Save Changes"</strong>.</li>
        </ol>
        <p className="text-[11px] text-muted-foreground/70 italic">
          ⚠️ A URL é a mesma para todas as lojas. Cada loja usa sua própria Secret Key para decriptar o payload.
        </p>
      </div>

      {/* Webhook URL */}
      <div>
        <label className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <ExternalLink className="h-3.5 w-3.5 text-primary" />
          URL do Webhook (única para todas as lojas)
        </label>
        <p className="text-[11px] text-muted-foreground mb-2">
          Cole esta mesma URL na configuração de webhook de <strong>cada loja</strong>.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-[11px] font-mono text-foreground break-all">
            {WEBHOOK_URL}
          </code>
          <Button size="sm" variant="outline" onClick={copyUrl} className="shrink-0">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Vendor list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-primary" />
            Lojas / Vendors
          </label>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono">
              {vendors.length} {vendors.length === 1 ? "loja" : "lojas"}
            </Badge>
            <Button size="sm" variant="outline" onClick={startNew} disabled={showNew} className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Nova Loja
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {vendors.map((vendor) =>
            editingId === vendor.id ? (
              <div key={vendor.id}>{renderForm(handleSaveEdit)}</div>
            ) : (
              <div key={vendor.id} className="rounded-lg border border-border bg-muted/20 p-3 flex items-center justify-between group">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{vendor.label}</span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0">
                      {vendor.nickname}
                    </Badge>
                    {vendor.vendor_name && (
                      <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0">
                        vendor: {vendor.vendor_name}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Secret: {vendor.secret_env}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(vendor)} className="h-7 w-7">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(vendor)} className="h-7 w-7 text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )
          )}

          {/* New vendor form */}
          {showNew && renderForm(handleSaveNew)}
        </div>
      </div>

      {/* Help note */}
      <div className="bg-muted/30 rounded-lg border border-dashed border-border p-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          💡 Após adicionar uma nova loja aqui, é necessário também configurar a <strong>Secret Key</strong> como secret no backend 
          com o mesmo nome definido acima (ex: <code className="text-[10px] bg-muted px-1 py-0.5 rounded">CLICKBANK_SECRET_KEY_NOVOLOJA</code>).
        </p>
      </div>
    </div>
  );
}
