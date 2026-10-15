import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, KeyRound, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOperationId } from "@/contexts/OperationContext";

type MetaAcc = {
  account_id: string;
  name: string;
  account_status?: number;
  currency?: string | null;
  timezone_name?: string | null;
  business_name?: string | null;
};

type Step = "form" | "select" | "done";

interface Props {
  onDone?: () => void;
  onCancel?: () => void;
}

export function MetaTokenSetupFlow({ onDone, onCancel }: Props) {
  const opId = useOperationId();
  const [step, setStep] = useState<Step>("form");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<MetaAcc[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<{ id?: string; name?: string } | null>(null);

  const normalizedLabel = label.trim().replace(/\s+/g, "_").toLowerCase();
  const validLabel = /^[a-z0-9_\-]{2,40}$/.test(normalizedLabel);

  async function handlePreview() {
    setError(null);
    if (!validLabel) {
      setError("Nome do token deve ter 2-40 caracteres (letras, números, espaços, _ ou -).");
      return;
    }
    if (!token.trim() || token.trim().length < 40) {
      setError("Token parece inválido (curto demais).");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("save-meta-token", {
        body: { mode: "preview", token: token.trim() },
      });
      // Extrai detalhes do body mesmo em erro HTTP (FunctionsHttpError)
      let payload: any = data;
      if (error && (error as any).context?.json) {
        try { payload = await (error as any).context.json(); } catch {}
      }
      if (payload?.error === "meta_rejected_token") {
        throw new Error("A Meta rejeitou o token. Verifique se você copiou um Access Token válido (Graph API Explorer ou System User) — não um texto qualquer.");
      }
      if (payload?.error) throw new Error(payload.details || payload.error);
      if (error) throw new Error(error.message);
      setAccounts(payload.accounts || []);
      setMe(payload.me || null);
      const initial = new Set<string>((payload.accounts || []).map((a: MetaAcc) => a.account_id));
      setSelected(initial);
      setStep("select");
    } catch (e: any) {
      setError(e.message || "Erro ao validar token");
    } finally {
      setLoading(false);
    }
  }


  async function handleSave() {
    setError(null);
    if (selected.size === 0) {
      setError("Selecione pelo menos uma conta.");
      return;
    }
    if (!opId) {
      setError("Operação ativa não identificada.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("save-meta-token", {
        body: {
          mode: "save",
          operation_id: opId,
          token: token.trim(),
          label: normalizedLabel,
          account_ids: Array.from(selected),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.details || data.error);
      toast.success(`Token "${label}" salvo com ${selected.size} conta(s).`);
      setStep("done");
      onDone?.();
    } catch (e: any) {
      setError(e.message || "Erro ao salvar token");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === accounts.length ? new Set() : new Set(accounts.map((a) => a.account_id)),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <KeyRound className="h-4 w-4 text-primary" />
        Configurar novo token Meta Ads
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === "form" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label">Nome do token</Label>
            <Input
              id="label"
              placeholder="ex: perfil_principal, conta_bruno"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Identificador amigável (letras, números, <code>_</code> ou <code>-</code>). Ex: <em>perfil_hu</em>, <em>catalog</em>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="token">Access Token</Label>
            <Input
              id="token"
              type="password"
              placeholder="EAAG... (Meta Business token)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Cole o token — vamos validar contra a Meta e listar as contas acessíveis pra você escolher.
            </p>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel} disabled={loading}>
                Cancelar
              </Button>
            )}
            <Button onClick={handlePreview} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Validar & Buscar Contas
            </Button>
          </div>
        </div>
      )}

      {step === "select" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Token válido — <strong>{me?.name}</strong> (id {me?.id})</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {accounts.length} conta(s) acessível(is). Selecione as que quer vincular a esta operação.
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep("form")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Trocar token
            </Button>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selected.size === accounts.length ? "Desmarcar todas" : "Selecionar todas"}
            </Button>
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-md border border-border/50 divide-y divide-border/40">
            {accounts.map((a) => (
              <label
                key={a.account_id}
                className="flex items-start gap-3 p-3 hover:bg-muted/40 cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(a.account_id)}
                  onCheckedChange={() => toggle(a.account_id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{a.name}</span>
                    {a.currency && <Badge variant="outline" className="text-[10px]">{a.currency}</Badge>}
                    {a.account_status !== 1 && (
                      <Badge variant="secondary" className="text-[10px]">status {a.account_status}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                    <span>act_{a.account_id}</span>
                    {a.business_name && <span>• {a.business_name}</span>}
                    {a.timezone_name && <span>• {a.timezone_name}</span>}
                  </div>
                </div>
              </label>
            ))}
            {accounts.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma conta encontrada nesse token.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel} disabled={loading}>
                Cancelar
              </Button>
            )}
            <Button onClick={handleSave} disabled={loading || selected.size === 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar {selected.size} conta(s)
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Token <strong>{label}</strong> salvo com sucesso.
        </div>
      )}
    </div>
  );
}
