import { useState } from "react";
import { RedTrackCard } from "./RedTrackCard";
import { IntegrationWizard, WizardStep } from "./IntegrationWizard";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOperation } from "@/contexts/OperationContext";

const REDTRACK_WIZARD_STEPS: WizardStep[] = [
  {
    title: "Onde encontrar sua API Key do RedTrack",
    instructions: [
      { text: "Acesse", bold: "app.redtrack.io" },
      { text: "Vá em", bold: "Settings → API Access" },
      { text: "Copie a", bold: "API Key" },
      { text: "Se não tiver uma key, clique em \"Generate API Key\"" },
    ],
    fieldLabel: "API Key",
    fieldPlaceholder: "Cole sua API Key do RedTrack aqui",
    helpLink: { url: "https://app.redtrack.io/", label: "Abrir RedTrack" },
  },
];

export function IntegrationRedTrackPanel() {
  const [showWizard, setShowWizard] = useState(false);
  const { operationId } = useOperation();

  const handleTest = async (values: string[]) => {
    const apiKey = values[0]?.trim();
    if (!apiKey) {
      return { ok: false, message: "API Key ausente." };
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/save-redtrack-token?operation_id=${operationId}&api_key=${encodeURIComponent(apiKey)}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const json = await res.json();
      if (json.success || json.status === "ok" || json.connected) {
        return { ok: true, message: "Conexão com RedTrack bem-sucedida!" };
      }
      return { ok: false, message: "Falha ao conectar com RedTrack.", details: json.message || json.error || "Verifique sua API Key." };
    } catch (e: any) {
      return { ok: false, message: "Erro de rede.", details: e.message };
    }
  };

  const handleFinish = async (values: string[]) => {
    setShowWizard(false);
  };

  return (
    <div className="space-y-6">
      {showWizard ? (
        <IntegrationWizard
          steps={REDTRACK_WIZARD_STEPS}
          onTest={handleTest}
          onFinish={handleFinish}
          platformName="RedTrack"
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
          <RedTrackCard />
        </>
      )}
    </div>
  );
}
