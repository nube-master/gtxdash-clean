import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { X, MoveRight, CheckCircle2, Flame, Hourglass, AlertCircle, Moon, Download, Megaphone } from "lucide-react";
import type { Stage } from "./farmHelpers";

const STAGE_OPTIONS: { value: Stage; label: string; icon: any }[] = [
  { value: "no_ads", label: "Sem anúncios", icon: Moon },
  { value: "warming", label: "Aquecendo", icon: Flame },
  { value: "almost", label: "Quase Pronta", icon: Hourglass },
  { value: "ready", label: "Pronta", icon: CheckCircle2 },
  { value: "advertising", label: "Anunciando", icon: Megaphone },
  { value: "inactive", label: "Inativa / Caída", icon: AlertCircle },
];

export function BulkActionBar({
  count, selectedIds, onMove, onClear, onExportCsv,
}: {
  count: number;
  selectedIds: string[];
  onMove: (stage: Stage) => void;
  onClear: () => void;
  onExportCsv: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-full border border-orange-500/40 bg-background/95 backdrop-blur-xl shadow-[0_8px_30px_-4px_rgba(251,146,60,0.4)]">
      <div className="flex items-center gap-2 pl-2 pr-3 border-r border-border/40">
        <div className="h-6 w-6 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
          <span className="font-mono text-[11px] font-bold text-orange-400">{count}</span>
        </div>
        <span className="text-xs text-muted-foreground">selecionada(s)</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
            <MoveRight className="h-3.5 w-3.5" />
            Mover para…
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48">
          {STAGE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <DropdownMenuItem key={opt.value} onClick={() => onMove(opt.value)} className="text-xs gap-2">
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" variant="ghost" onClick={onExportCsv} className="h-7 gap-1.5 text-xs">
        <Download className="h-3.5 w-3.5" />
        Exportar CSV
      </Button>

      <Button size="sm" variant="ghost" onClick={onClear} className="h-7 w-7 p-0">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
