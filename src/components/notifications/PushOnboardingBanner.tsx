import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, BellOff, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushOnboardingState } from "@/hooks/usePushOnboardingState";
import { isPushSupported } from "@/lib/pushServiceWorker";
import { isIOS, isStandalone } from "@/hooks/useWebPush";
import { PushWelcomeDialog } from "./PushWelcomeDialog";

const DISMISS_KEY = "push_onboarding_banner_dismissed";
const WELCOME_KEY = "push_welcome_seen";

export function PushOnboardingBanner() {
  const { state } = usePushOnboardingState();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    if (state !== "no_device") return;
    if (!isPushSupported()) return;
    if (localStorage.getItem(WELCOME_KEY) === "1") return;
    setWelcomeOpen(true);
    localStorage.setItem(WELCOME_KEY, "1");
  }, [state]);

  const needsIOSInstall = isIOS() && !isStandalone();
  if (!isPushSupported() && !needsIOSInstall) return null;
  if (state === "loading" || state === "ready") return null;
  if (dismissed) return <PushWelcomeDialog open={welcomeOpen} onOpenChange={setWelcomeOpen} />;

  const noDevice = state === "no_device";

  return (
    <>
      <PushWelcomeDialog open={welcomeOpen} onOpenChange={setWelcomeOpen} />
      <div
        className={`mb-3 rounded-lg border p-3 flex items-center gap-3 ${
          noDevice
            ? "border-primary/30 bg-primary/5"
            : "border-amber-500/30 bg-amber-500/10"
        }`}
      >
        {noDevice ? (
          <BellRing className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <BellOff className="h-4 w-4 text-amber-500 shrink-0" />
        )}
        <div className="text-xs sm:text-sm min-w-0 flex-1">
          {noDevice ? (
            <>
              <span className="font-medium">
                {needsIOSInstall
                  ? "Instale o app na tela inicial para receber avisos"
                  : "Ative as notificações no seu dispositivo"}
              </span>
              <span className="text-muted-foreground">
                {needsIOSInstall
                  ? " — no iPhone, notificações só funcionam pelo ícone na tela de início."
                  : " — vendas, quedas de conta e relatórios chegam direto no celular."}
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">Dispositivo pronto.</span>
              <span className="text-muted-foreground">
                {" "}
                Aguardando o administrador liberar quais alertas você recebe.
              </span>
            </>
          )}
        </div>
        {noDevice && (
          <Button asChild size="sm" className="shrink-0">
            <Link to="/notifications">
              {needsIOSInstall ? "Ver como" : "Ativar"} <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        )}
        <button
          type="button"
          aria-label="Fechar aviso"
          className="text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
