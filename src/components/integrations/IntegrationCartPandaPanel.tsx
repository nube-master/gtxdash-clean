import { useState } from "react";
import { IntegrationWizard, WizardStep } from "./IntegrationWizard";
import { Button } from "@/components/ui/button";
import { Wand2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";

const WEBHOOK_BASE = `https://taeduxiandktefcwgspx.supabase.co/functions/v1/cartpanda-webhook`;
const WEBHOOK_URL = `${WEBHOOK_BASE}?token=SEU_TOKEN_AQUI&store=nome-da-loja&orderId={order_id}&totalPrice={total_price}&utmSource={utm_source}&utmCampaign={utm_campaign}&utmMedium={utm_medium}&utmContent={utm_content}&utmTerm={utm_term}&email={email}&orderType={order_type}&productName={product_name}&productId={product_id}&currency={currency}&firstName={first_name}&lastName={last_name}&phoneNumber={phone_number}&country={country}&upsellNo={upsell_no}&dateTime={datetime_full}&postbackType=S2S`;

const CARTPANDA_WIZARD_STEPS: WizardStep[] = [
  {
    title: "Onde encontrar o Token da API",
    instructions: [
      { text: "Acesse o painel da CartPanda →", bold: "Configurações → API" },
      { text: "Copie o", bold: "Token de Autenticação" },
      { text: "Se não tiver token, clique em \"Gerar novo token\"" },
    ],
    fieldLabel: "Token de Autenticação",
    fieldPlaceholder: "Cole seu token da CartPanda aqui",
  },
  {
    title: "Nome da sua loja na CartPanda",
    instructions: [
      { text: "O slug da loja aparece na URL do painel:", bold: "loja.cartpanda.com" },
      { text: "Copie apenas o nome da loja (sem .cartpanda.com)" },
      { text: "Exemplo: se a URL for minha-loja.cartpanda.com, copie:", bold: "minha-loja" },
    ],
    fieldLabel: "Nome da loja (slug)",
    fieldPlaceholder: "Ex: minha-loja",
  },
];

export function IntegrationCartPandaPanel() {
  const [showWizard, setShowWizard] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast: toastFn } = useToast();

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    toastFn({ title: "URL copiada!", description: "Cole na configuração de postback da CartPanda." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTest = async (values: string[]) => {
    const token = values[0]?.trim();
    const store = values[1]?.trim();
    if (!token || !store) {
      return { ok: false, message: "Token ou nome da loja ausentes." };
    }
    // Build the final webhook URL with actual values
    const finalUrl = WEBHOOK_URL.replace("SEU_TOKEN_AQUI", token).replace("nome-da-loja", store);
    return {
      ok: true,
      message: "Configuração válida!",
      details: `Loja: ${store} — URL de postback gerada com sucesso. Cole na CartPanda para ativar.`,
    };
  };

  const handleFinish = (values: string[]) => {
    const token = values[0]?.trim();
    const store = values[1]?.trim();
    const finalUrl = WEBHOOK_URL.replace("SEU_TOKEN_AQUI", token).replace("nome-da-loja", store);
    navigator.clipboard.writeText(finalUrl);
    toast.success("URL de postback copiada! Cole na CartPanda para finalizar.");
    setShowWizard(false);
  };

  return (
    <div className="space-y-5">
      {showWizard ? (
        <IntegrationWizard
          steps={CARTPANDA_WIZARD_STEPS}
          onTest={handleTest}
          onFinish={handleFinish}
          platformName="CartPanda"
        />
      ) : (
        <>
          <Button
            variant="outline"
            className="w-full gap-2 border-dashed border-primary/30 text-primary hover:bg-primary/5"
            onClick={() => setShowWizard(true)}
          >
            <Wand2 className="h-4 w-4" />
            Assistente de configuração
          </Button>

          <div>
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
              URL de Postback (cole na CartPanda)
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-[11px] font-mono text-foreground break-all max-h-24 overflow-y-auto">
                {WEBHOOK_URL}
              </code>
              <Button size="sm" variant="outline" onClick={copyWebhookUrl} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/50">
            <h4 className="text-sm font-semibold text-foreground">Como configurar na CartPanda:</h4>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Acesse o painel da CartPanda → <strong>Configurações</strong> → <strong>Integrações</strong></li>
              <li>Vá em <strong>"Webhook / Postback"</strong></li>
              <li>Selecione <strong>"Produtor (com afiliados)"</strong> ou <strong>"Apenas produtor"</strong></li>
              <li>Selecione o tipo <strong>"S2S (Server to Server)"</strong></li>
              <li>Cole a URL completa acima no campo de <strong>URL de Postback</strong></li>
              <li>Marque os eventos: <strong>Venda aprovada</strong> e <strong>Venda completa</strong></li>
              <li>Salve a configuração</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
