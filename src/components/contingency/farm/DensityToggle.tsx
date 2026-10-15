import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Maximize2, Minimize2, Rows3 } from "lucide-react";

export type Density = "compact" | "comfortable" | "detailed";

const KEY = "farm_pipeline_density";

export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>("comfortable");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) as Density | null;
      if (v === "compact" || v === "comfortable" || v === "detailed") setDensity(v);
    } catch {}
  }, []);
  const update = (d: Density) => {
    setDensity(d);
    try { localStorage.setItem(KEY, d); } catch {}
  };
  return [density, update];
}

export function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  const options: { value: Density; icon: typeof Minimize2; label: string }[] = [
    { value: "compact", icon: Minimize2, label: "Compacto" },
    { value: "comfortable", icon: Rows3, label: "Confortável" },
    { value: "detailed", icon: Maximize2, label: "Detalhado" },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/20 p-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <Tooltip key={opt.value}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={active ? "default" : "ghost"}
                className="h-6 w-6 p-0"
                onClick={() => onChange(opt.value)}
              >
                <Icon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{opt.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
