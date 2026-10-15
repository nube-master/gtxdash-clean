import { useState } from "react";
import { Check, Copy, Inbox, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";

const GTX_OPERATION_ID = "0b758a2b-1b92-4769-b47b-416c567e320d";
const WEBHOOK_URL = `https://taeduxiandktefcwgspx.functions.supabase.co/webhook-hw?operation_id=${GTX_OPERATION_ID}`;

export function HwIntegrationPanel() {
  const { operationId } = useOperation();
  const [copied, setCopied] = useState(false);
  const isGtx = operationId === GTX_OPERATION_ID;

  const copyUrl = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    toast.success("URL copiada");
    window.setTimeout(() => setCopied(false), 2000);
  };

  return <div className="space-y-6">
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><h3 className="text-sm font-semibold">Coletor H&amp;W ativo</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Nesta primeira fase, cada chamada fica preservada para confirmar o formato real. Vendas e notificações ainda não são geradas.</p></div></div>
    </div>
    {!isGtx && <div className="rounded-lg border border-[hsl(var(--warroom-warning))]/30 bg-[hsl(var(--warroom-warning))]/10 p-4 text-xs text-[hsl(var(--warroom-warning))]">Esta integração está restrita à operação GTX.</div>}
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase text-muted-foreground">URL do webhook</label>
      <div className="flex gap-2"><code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-3 py-3 text-xs">{WEBHOOK_URL}</code><Button size="icon" variant="outline" aria-label="Copiar URL" onClick={copyUrl}>{copied ? <Check className="h-4 w-4 text-[hsl(var(--warroom-positive))]" /> : <Copy className="h-4 w-4" />}</Button></div>
    </div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Inbox className="h-4 w-4" />Os recebimentos aparecem em “Webhook Logs” nesta página.</div>
  </div>;
}
