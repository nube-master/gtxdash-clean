import * as React from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * FilterSheet
 * -----------
 * Em desktop: renderiza os filhos inline (sidebar/painel lateral).
 * Em mobile (<768px): vira um botão "Filtros" fixo + bottom sheet acionável.
 *
 * Uso:
 *   <FilterSheet activeCount={3}>
 *     <FiltrosCampanha ... />
 *   </FilterSheet>
 */
interface FilterSheetProps {
  children: React.ReactNode;
  /** Mostrado no botão (badge com nº de filtros ativos). */
  activeCount?: number;
  /** Texto do botão em mobile. */
  triggerLabel?: string;
  /** Título do bottom sheet. */
  title?: string;
  /** Classe do wrapper desktop (passa-through). */
  desktopClassName?: string;
  /** Botão "Aplicar" no rodapé do sheet (mobile). */
  onApply?: () => void;
  applyLabel?: string;
  /** Botão "Limpar" (mobile). */
  onClear?: () => void;
  clearLabel?: string;
}

export function FilterSheet({
  children,
  activeCount = 0,
  triggerLabel = "Filtros",
  title = "Filtros",
  desktopClassName,
  onApply,
  applyLabel = "Aplicar",
  onClear,
  clearLabel = "Limpar",
}: FilterSheetProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  if (!isMobile) {
    return <div className={desktopClassName}>{children}</div>;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative gap-2 min-h-[44px]"
          aria-label={triggerLabel}
        >
          <Filter className="h-4 w-4" />
          {triggerLabel}
          {activeCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {activeCount > 9 ? "9+" : activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className={cn(
          "h-[85vh] overflow-hidden rounded-t-2xl border-t border-border p-0",
        )}
      >
        <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="px-4 pt-2 pb-3 border-b border-border/40">
          <SheetTitle className="flex items-center justify-between">
            <span>{title}</span>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1 hover:bg-muted"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-4 py-4 h-[calc(85vh-120px)]">
          {children}
        </div>
        {(onApply || onClear) && (
          <div className="sticky bottom-0 flex gap-2 border-t border-border/40 bg-background px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
            {onClear && (
              <Button
                variant="outline"
                className="flex-1 min-h-[44px]"
                onClick={() => {
                  onClear();
                }}
              >
                {clearLabel}
              </Button>
            )}
            {onApply && (
              <Button
                className="flex-1 min-h-[44px]"
                onClick={() => {
                  onApply();
                  setOpen(false);
                }}
              >
                {applyLabel}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
