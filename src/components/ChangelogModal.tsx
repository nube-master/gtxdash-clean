import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Palette, Keyboard, Eye, ArrowUp, Clock, Search } from "lucide-react";

const CHANGELOG_VERSION = "2026.03.26";

interface ChangelogEntry {
  icon: React.ReactNode;
  title: string;
  description: string;
  tag: "novo" | "melhoria" | "fix";
}

const entries: ChangelogEntry[] = [
  {
    icon: <Search className="h-4 w-4" />,
    title: "Command Palette (⌘K)",
    description: "Busca rápida global para navegar entre páginas e executar ações.",
    tag: "novo",
  },
  {
    icon: <Eye className="h-4 w-4" />,
    title: "Modo Foco (F)",
    description: "Esconde sidebar e alertas para análise sem distrações.",
    tag: "novo",
  },
  {
    icon: <Sparkles className="h-4 w-4" />,
    title: "Sparklines nos KPIs",
    description: "Mini gráficos de tendência de 7 dias direto nos cards de métricas.",
    tag: "novo",
  },
  {
    icon: <Zap className="h-4 w-4" />,
    title: "Sticky KPI Bar",
    description: "Barra fixa com métricas principais ao scrollar para baixo.",
    tag: "melhoria",
  },
  {
    icon: <Keyboard className="h-4 w-4" />,
    title: "Atalhos de Teclado",
    description: "1-9 para navegar, R para refresh, L para tema, F para foco.",
    tag: "novo",
  },
  {
    icon: <Palette className="h-4 w-4" />,
    title: "Transições de Página",
    description: "Animações suaves ao navegar entre as seções do dashboard.",
    tag: "melhoria",
  },
  {
    icon: <ArrowUp className="h-4 w-4" />,
    title: "Scroll-to-Top",
    description: "Botão flutuante para voltar ao topo rapidamente.",
    tag: "novo",
  },
  {
    icon: <Clock className="h-4 w-4" />,
    title: "Indicador de Dados Stale",
    description: "O botão Sky fica âmbar quando os dados estão desatualizados (+5min).",
    tag: "melhoria",
  },
];

const tagColors: Record<string, string> = {
  novo: "bg-primary/15 text-primary border-primary/20",
  melhoria: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
  fix: "bg-amber-500/15 text-amber-500 border-amber-500/20",
};

export function ChangelogModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("wr-changelog-seen");
    if (seen !== CHANGELOG_VERSION) {
      // Delay to not compete with initial load
      const t = setTimeout(() => setOpen(true), 2000);
      return () => clearTimeout(t);
    }
  }, []);

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      localStorage.setItem("wr-changelog-seen", CHANGELOG_VERSION);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            O que há de novo
            <Badge variant="outline" className="text-[9px] font-mono ml-1">
              v{CHANGELOG_VERSION}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 overflow-y-auto pr-1 -mr-1 flex-1">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="mt-0.5 text-muted-foreground shrink-0">{entry.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold">{entry.title}</span>
                  <Badge
                    variant="outline"
                    className={`text-[8px] uppercase tracking-wider px-1.5 py-0 ${tagColors[entry.tag]}`}
                  >
                    {entry.tag}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{entry.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-border">
          <button
            onClick={() => handleClose(false)}
            className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Entendido 🚀
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
