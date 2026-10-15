import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Plus, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { DurationBucketsConfig } from "./durationBuckets";

const PRESETS: { name: string; boundaries: number[] }[] = [
  { name: "Padrão (5/15/30/60)", boundaries: [5, 15, 30, 60] },
  { name: "Curto (3/10/25)", boundaries: [3, 10, 25] },
  { name: "VSL longa (10/30/60/90)", boundaries: [10, 30, 60, 90] },
  { name: "Granular (2/5/10/20/40)", boundaries: [2, 5, 10, 20, 40] },
];

export function DurationBucketsConfigDialog({
  config,
  onChange,
  onReset,
}: {
  config: DurationBucketsConfig;
  onChange: (cfg: DurationBucketsConfig) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number[]>(config.boundaries);

  const start = () => {
    setDraft(config.boundaries);
    setOpen(true);
  };

  const updateAt = (i: number, v: string) => {
    const num = Number(v);
    setDraft((d) => d.map((x, idx) => (idx === i ? (Number.isFinite(num) ? num : 0) : x)));
  };

  const removeAt = (i: number) => {
    setDraft((d) => (d.length > 1 ? d.filter((_, idx) => idx !== i) : d));
  };

  const add = () => {
    setDraft((d) => {
      if (d.length >= 6) return d;
      const last = d[d.length - 1] ?? 0;
      return [...d, last + 10];
    });
  };

  const validate = (b: number[]): string | null => {
    if (b.length < 1) return "Adicione ao menos 1 limite.";
    if (b.length > 6) return "Máximo de 6 limites.";
    if (!b.every((n) => n > 0)) return "Todos os limites devem ser > 0.";
    for (let i = 1; i < b.length; i++) if (b[i] <= b[i - 1]) return "Limites devem estar em ordem crescente.";
    return null;
  };

  const save = () => {
    const err = validate(draft);
    if (err) {
      toast.error(err);
      return;
    }
    onChange({ boundaries: draft });
    setOpen(false);
    toast.success("Faixas atualizadas");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={start} title="Configurar faixas de tempo">
          <Settings2 className="h-3.5 w-3.5" />
          Faixas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar faixas de tempo na sessão</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Presets</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.name}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setDraft(p.boundaries)}
                >
                  {p.name}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Limites em minutos</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cada número fecha uma faixa. Ex.: <code>3, 10, 25</code> gera <code>0–3, 3–10, 10–25, 25+</code>.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {draft.map((v, i) => (
                <div key={i} className="flex items-center gap-1 rounded-md border bg-muted/30 px-1.5 py-1">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    className="h-7 w-16 text-xs"
                    value={v}
                    onChange={(e) => updateAt(i, e.target.value)}
                  />
                  <span className="text-[10px] text-muted-foreground">min</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => removeAt(i)}
                    disabled={draft.length <= 1}
                    title="Remover"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1" onClick={add} disabled={draft.length >= 6}>
                <Plus className="h-3 w-3" /> Limite
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {previewLabels(draft).map((lbl) => (
                <span key={lbl} className="text-[10px] rounded-full border px-2 py-0.5 text-muted-foreground bg-background">
                  {lbl}
                </span>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => {
              onReset();
              setDraft([5, 15, 30, 60]);
              toast.success("Faixas restauradas para o padrão");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Padrão
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function previewLabels(b: number[]): string[] {
  if (b.length === 0) return [];
  const out: string[] = [];
  let prev = 0;
  for (const x of b) {
    out.push(`${prev}–${x}min`);
    prev = x;
  }
  out.push(`${prev}+min`);
  return out;
}
