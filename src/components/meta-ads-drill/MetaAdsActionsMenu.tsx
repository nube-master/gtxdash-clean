import React from "react";
import { 
  Zap, 
  TrendingUp, 
  TrendingDown, 
  Pause, 
  Trash2, 
  Play, 
  Copy, 
  UserPlus, 
  Tag, 
  Download, 
  Clipboard, 
  ExternalLink,
  ChevronDown,
  DollarSign,
  Edit
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MetaAdsActionsMenuProps {
  selectionCount: number;
  onAction: (action: string) => void;
  disabled?: boolean;
}

export function MetaAdsActionsMenu({ selectionCount, onAction, disabled }: MetaAdsActionsMenuProps) {
  const hasSelection = selectionCount > 0;

  const handleAction = (action: string) => {
    if (hasSelection) {
      onAction(action);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant={hasSelection ? "default" : "secondary"}
                  size="sm"
                  className={cn(
                    "h-8 gap-2 font-bold uppercase tracking-widest text-[10px]",
                    hasSelection ? "bg-violet-600 hover:bg-violet-700 text-white" : "text-muted-foreground opacity-50"
                  )}
                  disabled={!hasSelection || disabled}
                >
                  <Zap className="h-3.5 w-3.5 fill-current" />
                  AÇÕES {hasSelection && `(${selectionCount})`}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-[#0C0C0E] border-white/10 text-xs font-geist">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground py-2 px-3">
                  Orçamento
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleAction("increase_budget")} className="gap-2 py-2 cursor-pointer">
                  <DollarSign className="h-3.5 w-3.5 text-wr-positive" />
                  <span>Aumentar orçamento</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAction("decrease_budget")} className="gap-2 py-2 cursor-pointer">
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                  <span>Diminuir orçamento</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAction("set_bid_cap")} className="gap-2 py-2 cursor-pointer">
                  <Edit className="h-3.5 w-3.5 text-primary" />
                  <span>Alterar bid cap</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground py-2 px-3">
                  Status
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleAction("deactivate")} className="gap-2 py-2 cursor-pointer">
                  <Pause className="h-3.5 w-3.5 text-amber-500" />
                  <span>Desligar campanha</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAction("kill")} className="gap-2 py-2 cursor-pointer text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Matar campanha</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAction("activate")} className="gap-2 py-2 cursor-pointer">
                  <Play className="h-3.5 w-3.5 text-wr-positive" />
                  <span>Reativar campanha</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground py-2 px-3">
                  Ações
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleAction("duplicate")} className="gap-2 py-2 cursor-pointer">
                  <Copy className="h-3.5 w-3.5 text-blue-400" />
                  <span>Duplicar campanha</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAction("delegate")} className="gap-2 py-2 cursor-pointer">
                  <UserPlus className="h-3.5 w-3.5 text-purple-400" />
                  <span>Delegar campanha</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAction("add_tag")} className="gap-2 py-2 cursor-pointer">
                  <Tag className="h-3.5 w-3.5 text-amber-400" />
                  <span>Adicionar tag</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground py-2 px-3">
                  Utilidades
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleAction("export_csv")} className="gap-2 py-2 cursor-pointer">
                  <Download className="h-3.5 w-3.5" />
                  <span>Exportar CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAction("copy_ids")} className="gap-2 py-2 cursor-pointer">
                  <Clipboard className="h-3.5 w-3.5" />
                  <span>Copiar IDs</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAction("open_ads_manager")} className="gap-2 py-2 cursor-pointer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir no Ads Manager</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TooltipTrigger>
        {!hasSelection && (
          <TooltipContent className="bg-[#0C0C0E] border-white/10 text-[10px] text-muted-foreground">
            Selecione 1+ campanhas pra aplicar ações
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper function locally since utils might be different
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
