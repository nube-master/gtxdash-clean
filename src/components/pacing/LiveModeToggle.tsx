import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Radio } from "lucide-react";
import { usePacingLiveMode } from "@/contexts/PacingLiveModeContext";

export function LiveModeToggle() {
  const { liveMode, toggle } = usePacingLiveMode();
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggle}
            className={`flex items-center gap-2 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors ${
              liveMode
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-500"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="relative flex items-center justify-center">
              <Radio className={`size-3.5 ${liveMode ? "animate-pulse" : ""}`} />
              {liveMode && (
                <span className="absolute inset-0 rounded-full bg-emerald-500/40 animate-ping" />
              )}
            </span>
            <span className="tabular-nums">{liveMode ? "LIVE" : "Live"}</span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors ${
                liveMode ? "border-emerald-500/60 bg-emerald-500/40" : "border-border bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-background shadow transition-transform ${
                  liveMode ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-xs">
          {liveMode
            ? "Modo Live ativo: polling 10s + refetch imediato ao detectar nova venda, novo spend Meta ou mudança de status."
            : "Ativar modo Live: refetch reativo via Realtime + polling de 10s. Custa mais conexões mas mostra spend quase em tempo real."}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
