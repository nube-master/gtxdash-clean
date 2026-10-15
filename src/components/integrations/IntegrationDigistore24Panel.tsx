import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, ExternalLink, Loader2, ArrowRight, ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://taeduxiandktefcwgspx.supabase.co";

export function IntegrationDigistore24Panel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { operation } = useOperation();
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [secretKey, setSecretKey] = useState("");
  const [productId, setProductId] = useState("");

  const webhookUrl = `${SUPABASE_URL}/functions/v1/digistore24-ipn${operation?.slug ? `?op=${operation.slug}` : ""}`;

  const copyUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({ title: "URL copiada!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!operation?.id) throw new Error("Nenhuma operação selecionada");

      // Save config to app_settings
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: "digistore24_config",
          operation_id: operation.id,
          value: JSON.parse(JSON.stringify({
            secret_key: secretKey,
            product_id: productId,
            configured_at: new Date().toISOString(),
          })),
          updated_at: new Date().toISOString(),
        }, { onConflict: "key,operation_id" });

      if (error) throw error;

      // Log the integration
      await supabase.from("integration_logs").insert({
        integration: "digistore24",
        status: "success",
        message: `Digistore24 configurado. Produto: ${productId}`,
        operation_id: operation.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-logs"] });
      toast({ title: "Digistore24 configurado com sucesso!" });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {[0, 1].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              s < step ? "bg-primary text-primary-foreground" : s === step ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : "bg-muted text-muted-foreground"
            }`}>
              {s < step ? <Check className="h-3.5 w-3.5" /> : s + 1}
            </div>
            {s < 1 && <div className={`h-0.5 w-8 ${s < step ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
        <span className="text-xs text-muted-foreground ml-2">
          {step === 0 ? "Webhook URL" : "Produtos"}
        </span>
      </div>

      {step === 0 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Configurar Webhook URL</h3>
            <p className="text-xs text-muted-foreground">
              Cole esta URL no campo IPN URL dentro do seu painel Digistore24.
            </p>
          </div>

          {/* Instructions */}
          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2">
            <p className="text-xs font-medium text-foreground">Onde configurar:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Acesse <span className="font-medium text-foreground">digistore24.com</span></li>
              <li>Vá em <span className="font-medium text-foreground">Conta → Configurações → IPN</span></li>
              <li>Cole a URL abaixo no campo "IPN URL"</li>
              <li>Selecione os eventos: <span className="font-medium text-foreground">on_payment, on_refund</span></li>
              <li>Salve as configurações</li>
            </ol>
          </div>

          {/* Webhook URL */}
          <div>
            <Label className="text-xs">Webhook URL (copie e cole no Digistore24)</Label>
            <div className="flex gap-2 mt-1">
              <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted/30" />
              <Button variant="outline" size="sm" onClick={copyUrl} className="shrink-0 gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>

          {/* Secret Key */}
          <div>
            <Label className="text-xs">IPN Passphrase / Secret Key</Label>
            <Input
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="Cole sua passphrase do Digistore24"
              className="mt-1 text-sm"
              type="password"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Encontre em: Digistore24 → Conta → API / IPN → IPN Passphrase
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <a
              href="https://www.digistore24.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              Abrir Digistore24 <ExternalLink className="h-3 w-3" />
            </a>
            <Button onClick={() => setStep(1)} disabled={!secretKey.trim()} className="gap-1.5">
              Continuar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Configurar Produtos</h3>
            <p className="text-xs text-muted-foreground">
              Informe o ID do produto principal para identificar as vendas.
            </p>
          </div>

          <div>
            <Label className="text-xs">ID do produto principal</Label>
            <Input
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="Ex: 12345"
              className="mt-1 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Encontre em: Digistore24 → Meus Produtos → clique no produto → copie o número da URL
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(0)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !productId.trim()}
              className="gap-1.5"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4" /> Salvar e ativar
                </>
              )}
            </Button>
          </div>

          {saveMutation.isSuccess && (
            <Badge className="bg-[hsl(var(--warroom-positive))]/10 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30 text-xs gap-1">
              <Check className="h-3 w-3" /> Digistore24 configurado com sucesso
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
