import { CodWebhookPanel } from "@/components/integrations/cod/CodWebhookPanel";

export function SphereIntegrationPanel() {
  return (
    <CodWebhookPanel
      platform="sphere"
      label="Shphere"
      functionName="cod-webhook-shphere"
      signatureHeader="X-Shphere-Signature"
      eventsHint="Eventos aceitos: Pedido criado, Pedido expirado, Comissão aprovada, Comissão paga."
    />
  );
}
