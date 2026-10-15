import { CodWebhookPanel } from "@/components/integrations/cod/CodWebhookPanel";

export function FahtoIntegrationPanel() {
  return (
    <CodWebhookPanel
      platform="fahto"
      label="Fahto"
      functionName="cod-webhook-fahto"
      signatureHeader="X-Signature"
      externalSecret
      eventsHint="Eventos aceitos: Pedido criado, Pedido entregue, Pedido recusado/expirado, Comissão aprovada, Comissão paga."
    />
  );
}
