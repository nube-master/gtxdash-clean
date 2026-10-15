import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Zap, Eye, EyeOff, Activity, AlertTriangle, Save, ChevronDown, FileWarning } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type WebhookDelivery = {
  id: string;
  status_code: number;
  outcome: string;
  reason: string | null;
  detail: { message?: string | null; signature_header?: string | null; raw_body_preview?: string | null } | null;
  headers: Record<string, string> | null;
  created_at: string;
};

const FUNCTIONS_ROOT = "https://taeduxiandktefcwgspx.supabase.co/functions/v1";

function randomToken(length: number) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export interface CodWebhookPanelProps {
  /** valor gravado em operation_webhooks.platform */
  platform: string;
  /** nome exibido na UI */
  label: string;
  /** nome da edge function (ex: cod-webhook-shphere) */
  functionName: string;
  /** descrição dos eventos aceitos */
  eventsHint?: string;
  /** nome do header usado para a chave secreta */
  signatureHeader?: string;
  /** true quando a própria plataforma gera o secret (usuário cola no Traffic OS) */
  externalSecret?: boolean;
}

export function CodWebhookPanel({ platform, label, functionName, eventsHint, signatureHeader = "X-Signature", externalSecret = false }: CodWebhookPanelProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [secretDraft, setSecretDraft] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const { operationId, operation } = useOperation();
  const queryClient = useQueryClient();
  const opSlug = operation?.slug ?? "op";

  const { data: hook, isLoading } = useQuery({
    queryKey: ["operation-webhook", operationId, platform],
    queryFn: async () => {
      if (!operationId) return null;
      const { data, error } = await supabase
        .from("operation_webhooks")
        .select("id, endpoint_slug, secret_token, active, created_at")
        .eq("operation_id", operationId)
        .eq("platform", platform)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!operationId,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["cod-recent-orders", operationId, platform, hook?.endpoint_slug],
    queryFn: async () => {
      if (!operationId) return 0;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      if (!hook?.endpoint_slug) return 0;
      const { count } = await supabase
        .from("cod_orders")
        .select("id", { count: "exact", head: true })
        .eq("operation_id", operationId)
        .eq("received_via", "webhook")
        .eq("webhook_endpoint_slug", hook.endpoint_slug)
        .gte("created_at", since);
      return count ?? 0;
    },
    enabled: !!operationId && !!hook?.endpoint_slug,
  });

  const { data: deliveries = [], isLoading: logsLoading } = useQuery({
    queryKey: ["webhook-deliveries", operationId, platform, hook?.endpoint_slug],
    queryFn: async () => {
      if (!operationId || !hook?.endpoint_slug) return [];
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("id, status_code, outcome, reason, detail, headers, created_at")
        .eq("operation_id", operationId)
        .eq("platform", platform)
        .eq("endpoint_slug", hook.endpoint_slug)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as WebhookDelivery[];
    },
    enabled: logsOpen && !!operationId && !!hook?.endpoint_slug,
  });

  const activateMutation = useMutation({
    mutationFn: async (regenerate: boolean) => {
      if (!operationId) throw new Error("Operação não selecionada");
      const payload = {
        operation_id: operationId,
        platform,
        endpoint_slug: `w_${randomToken(12)}`,
        secret_token: externalSecret ? "" : randomToken(40),
        active: true,
      };
      if (regenerate && hook?.id) {
        const { error } = await supabase
          .from("operation_webhooks")
          .update(
            externalSecret
              ? { endpoint_slug: payload.endpoint_slug }
              : { endpoint_slug: payload.endpoint_slug, secret_token: payload.secret_token },
          )
          .eq("id", hook.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("operation_webhooks").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, regenerate) => {
      queryClient.invalidateQueries({ queryKey: ["operation-webhook", operationId, platform] });
      toast.success(regenerate ? "Novas credenciais geradas" : `Integração ${label} ativada`);
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const saveSecretMutation = useMutation({
    mutationFn: async (value: string) => {
      if (!hook?.id) throw new Error("Integração não ativada");
      const { error } = await supabase
        .from("operation_webhooks")
        .update({ secret_token: value.trim() })
        .eq("id", hook.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operation-webhook", operationId, platform] });
      setSecretDraft(null);
      toast.success("Chave secreta salva");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const webhookUrl = hook ? `${FUNCTIONS_ROOT}/${functionName}/${opSlug}/${platform}/${hook.endpoint_slug}` : "";

  const copy = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success("Copiado!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Carregando integração…</div>;
  }

  if (!hook) {
    return (
      <div className="space-y-6">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{label} · não ativada</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ative para gerar uma URL de webhook e uma chave secreta exclusivas da operação{" "}
            <strong>{operation?.name ?? "atual"}</strong>. Os pedidos recebidos nessa URL entram sempre nesta operação.
          </p>
          <Button
            className="w-full gap-2"
            disabled={!operationId || activateMutation.isPending}
            onClick={() => activateMutation.mutate(false)}
          >
            <Zap className="h-4 w-4" />
            Ativar integração {label}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Status da Conexão</h3>
          <div className="h-2 w-2 rounded-full bg-[hsl(var(--warroom-positive))] animate-pulse" />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Integração ativa para <strong>{operation?.name}</strong>.{" "}
          {eventsHint ?? "Eventos aceitos: Pedido criado, Pedido expirado, Comissão aprovada, Comissão paga."}
        </p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          {recentOrders ?? 0} pedidos recebidos por esta URL nas últimas 24h
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">
          URL do Webhook (exclusiva desta operação)
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-[#0A0A0E] border border-white/5 rounded-lg px-4 py-3 text-[11px] font-mono text-foreground break-all shadow-inner">
            {webhookUrl}
          </code>
          <Button
            size="icon"
            variant="outline"
            onClick={() => copy(webhookUrl, "url")}
            className="shrink-0 h-10 w-10 border-white/5 bg-[#0A0A0E] hover:bg-white/5"
          >
            {copiedField === "url" ? <Check className="h-4 w-4 text-[hsl(var(--warroom-positive))]" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {externalSecret ? (
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">
            Chave secreta (cole aqui a que a {label} gerou · header {signatureHeader})
          </label>
          {!hook.secret_token && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-500 leading-normal">
                Integração incompleta — nenhum webhook será aceito até você colar o secret gerado pela {label}.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              type={showSecret ? "text" : "password"}
              value={secretDraft ?? hook.secret_token ?? ""}
              placeholder={`Cole aqui o secret que a ${label} gerou (ex: whsec_...)`}
              onChange={(e) => setSecretDraft(e.target.value)}
              className="flex-1 bg-[#0A0A0E] border-white/5 font-mono text-[11px] h-10"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={() => setShowSecret((v) => !v)}
              className="shrink-0 h-10 w-10 border-white/5 bg-[#0A0A0E] hover:bg-white/5"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              className="shrink-0 h-10 gap-2"
              disabled={saveSecretMutation.isPending || secretDraft === null || secretDraft.trim() === (hook.secret_token ?? "")}
              onClick={() => saveSecretMutation.mutate(secretDraft ?? "")}
            >
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-normal">
            Aceita o secret em texto puro no header ou assinatura HMAC-SHA256 do corpo com esse mesmo secret.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-dashed"
            disabled={activateMutation.isPending}
            onClick={() => {
              if (confirm(`Gerar nova URL? A configuração atual na ${label} para de funcionar.`)) {
                activateMutation.mutate(true);
              }
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Regenerar URL
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">
            Chave secreta (header {signatureHeader})
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[#0A0A0E] border border-white/5 rounded-lg px-4 py-3 text-[11px] font-mono text-foreground break-all shadow-inner">
              {showSecret ? hook.secret_token : "•".repeat(40)}
            </code>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setShowSecret((s) => !s)}
              className="shrink-0 h-10 w-10 border-white/5 bg-[#0A0A0E] hover:bg-white/5"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={() => copy(hook.secret_token, "secret")}
              className="shrink-0 h-10 w-10 border-white/5 bg-[#0A0A0E] hover:bg-white/5"
            >
              {copiedField === "secret" ? <Check className="h-4 w-4 text-[hsl(var(--warroom-positive))]" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-dashed"
            disabled={activateMutation.isPending}
            onClick={() => {
              if (confirm(`Gerar nova URL e nova chave? A configuração atual na ${label} para de funcionar.`)) {
                activateMutation.mutate(true);
              }
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Regenerar URL e chave
          </Button>
        </div>
      )}

      {externalSecret && (
        <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2"><FileWarning className="h-4 w-4" />Ver log</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${logsOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-2">
            {logsLoading && <p className="text-xs text-muted-foreground">Carregando histórico…</p>}
            {!logsLoading && deliveries.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma entrega registrada.</p>}
            {deliveries.map((delivery) => {
              const expanded = expandedLog === delivery.id;
              return (
                <div key={delivery.id} className="border border-border rounded-md overflow-hidden">
                  <Button
                    variant="ghost"
                    className="w-full h-auto min-h-10 justify-between rounded-none px-3 py-2 text-left"
                    onClick={() => setExpandedLog(expanded ? null : delivery.id)}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">HTTP {delivery.status_code} · {delivery.reason ?? delivery.outcome}</span>
                      <span className="block text-[10px] text-muted-foreground">{new Date(delivery.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </Button>
                  {expanded && (
                    <div className="border-t border-border bg-muted/30 p-3 space-y-3 text-[11px]">
                      <div><span className="font-semibold">Header encontrado:</span> {delivery.detail?.signature_header ?? "nenhum"}</div>
                      {delivery.detail?.message && <div><span className="font-semibold">Motivo:</span> {delivery.detail.message}</div>}
                      <div>
                        <div className="font-semibold mb-1">Headers recebidos</div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 text-[10px]">{JSON.stringify(delivery.headers ?? {}, null, 2)}</pre>
                      </div>
                      <div>
                        <div className="font-semibold mb-1">Início do body</div>
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 text-[10px]">{(delivery.detail?.raw_body_preview ?? "").slice(0, 200) || "—"}</pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}


      <div className="p-4 rounded-lg bg-red/5 border border-red/10 space-y-2">
        <p className="text-[11px] font-bold text-red uppercase tracking-wider">Atenção</p>
        <p className="text-[11px] text-muted-foreground leading-normal">
          Cada operação tem URL e chave próprias — nunca reutilize a URL de outra operação. A operação do pedido é
          definida pela URL, e nunca pelo conteúdo enviado pela plataforma.
        </p>
      </div>
    </div>
  );
}
