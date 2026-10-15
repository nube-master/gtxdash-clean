import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KEYBOARD_SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

const PRIMARY_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/pacing": "Pacing",
  "/war-room": "War Room",
  "/analytics": "Analytics",
  "/vendas": "Vendas",
  "/creatives": "Criativos",
  "/offers": "Offers",
  "/spy": "Spy",
  "/planning": "Planejamento",
  "/cashflow": "Fluxo de Caixa",
};

const G_LABELS: Record<string, string> = {
  "/assets": "Contingência",
  "/meta-ads": "Meta Ads",
  "/vsls": "VSLs",
  "/performance-vsl": "Performance VSL",
  "/unit-economics": "Central Financeira",
  "/financial/reconciliation": "Reconciliação",
  "/gtx-meta-ia": "Meta IA",
  "/jarvis": "Jarvis",
  "/pacing/historico": "Histórico Pacing",
  "/pacing/score-rules": "Score Rules",
  "/pacing/budget-groups": "Budget Groups",
  "/campaigns": "Campanhas",
  "/talent-bank": "Talent Bank",
  "/academy": "Academy",
  "/ao-vivo": "Ao Vivo",
  "/media-channels": "Media Channels",
  "/profile": "Perfil",
};

const ACTIONS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "K"], label: "Paleta de comandos" },
  { keys: ["?"], label: "Mostrar atalhos" },
  { keys: ["R"], label: "Atualizar dados" },
  { keys: ["T"], label: "Trocar tema" },
  { keys: ["."], label: "Focar busca" },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded border border-border bg-muted/60 font-mono text-[11px] text-foreground/90">
      {children}
    </kbd>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/40">
      <span className="text-xs text-foreground/90">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
            <Kbd>{k}</Kbd>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    document.addEventListener("shortcuts:toggle", onToggle as EventListener);
    return () => document.removeEventListener("shortcuts:toggle", onToggle as EventListener);
  }, []);

  const primaryEntries = Object.entries(KEYBOARD_SHORTCUTS.PRIMARY_MAP);
  const gEntries = Object.entries(KEYBOARD_SHORTCUTS.G_MAP);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold uppercase tracking-wider">
            Atalhos de teclado
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 px-2">
              Navegação primária
            </h3>
            <div className="space-y-0.5">
              {primaryEntries.map(([key, path]) => (
                <Row key={key} keys={[key]} label={PRIMARY_LABELS[path] || path} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 px-2">
              Secundárias (G + letra)
            </h3>
            <div className="space-y-0.5">
              {gEntries.map(([key, path]) => (
                <Row key={key} keys={["G", key.toUpperCase()]} label={G_LABELS[path] || path} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 px-2">
            Ações
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0.5">
            {ACTIONS.map((a) => (
              <Row key={a.label} keys={a.keys} label={a.label} />
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground mt-4 px-2">
          Atalhos ignorados em campos de texto. Sequência <Kbd>G</Kbd> tem 1.5s para a segunda tecla.
        </p>
      </DialogContent>
    </Dialog>
  );
}
