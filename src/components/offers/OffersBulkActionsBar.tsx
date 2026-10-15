import { Button } from "@/components/ui/button";
import { Archive, X, GitCompare, Download, Trash2 } from "lucide-react";

interface Props {
  count: number;
  onCompare: () => void;
  onArchive: () => void;
  onExport: () => void;
  onDelete?: () => void;
  onClear: () => void;
}

export function OffersBulkActionsBar({ count, onCompare, onArchive, onExport, onDelete, onClear }: Props) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-lg backdrop-blur-md">
      <span className="text-sm font-medium text-foreground px-2 tabular-nums">
        {count} selecionada{count > 1 ? "s" : ""}
      </span>
      <div className="h-5 w-px bg-border" />
      <Button
        size="sm"
        variant="ghost"
        onClick={onCompare}
        disabled={count < 2 || count > 4}
        className="h-8 gap-1.5"
        title={count < 2 ? "Selecione 2-4 offers" : count > 4 ? "Máx 4 offers" : ""}
      >
        <GitCompare className="h-3.5 w-3.5" />
        Comparar
      </Button>
      <Button size="sm" variant="ghost" onClick={onExport} className="h-8 gap-1.5">
        <Download className="h-3.5 w-3.5" />
        Exportar
      </Button>
      <Button size="sm" variant="ghost" onClick={onArchive} className="h-8 gap-1.5 text-amber-500 hover:text-amber-400">
        <Archive className="h-3.5 w-3.5" />
        Arquivar
      </Button>
      {onDelete && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </Button>
      )}
      <div className="h-5 w-px bg-border" />
      <Button size="sm" variant="ghost" onClick={onClear} className="h-8 w-8 p-0">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
