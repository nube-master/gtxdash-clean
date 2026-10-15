import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCODSource } from "@/hooks/useCODSourceFilter";

const OPTIONS: { key: string; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "sphere", label: "Sphere" },
  { key: "fahto", label: "Fahto" },
  { key: "manual", label: "Manual" },
];

/** Filtro de origem dos pedidos COD (webhook Sphere, FAHTO ou import manual). */
export function CODSourceFilter() {
  const { source, setSource } = useCODSource();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {OPTIONS.map((o) => (
        <Button
          key={o.key}
          size="sm"
          variant="ghost"
          onClick={() => setSource(o.key)}
          className={cn(
            "h-7 px-3 text-xs",
            source === o.key && "bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
