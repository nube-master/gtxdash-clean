import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KPI_TOOLTIPS } from "@/lib/kpiTooltips";

interface Props {
  term: string;
  className?: string;
}

export function KpiHelpIcon({ term, className }: Props) {
  const text = KPI_TOOLTIPS[term];
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setOpen((v) => !v);
            }}
            onPointerEnter={() => setOpen(true)}
            onPointerLeave={(e) => {
              // keep open on touch; close on mouse leave
              if (e.pointerType === "mouse") setOpen(false);
            }}
            onBlur={() => setOpen(false)}
            aria-label={`Ajuda: ${term}`}
            className="inline-flex items-center justify-center p-1 -m-1 touch-manipulation"
          >
            <HelpCircle className={`h-3 w-3 text-muted-foreground/30 hover:text-muted-foreground/70 cursor-help transition-colors ${className || ""}`} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-[11px] leading-relaxed" onPointerDownOutside={() => setOpen(false)}>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
