import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import {
  useProductMargins,
  computeRoasColor,
  roasColorClass,
  FALLBACK_BE,
  FALLBACK_GREEN_AT,
  type ProductMarginRow,
} from "@/hooks/useProductMargins";
import { ALL_PROJECTS, getDynamicProjects } from "@/lib/projectUtils";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Draft = ProductMarginRow & { _new?: boolean };

export function ProductMarginsDialog({ open, onOpenChange }: Props) {
  const { margins, upsert, remove, isLoading } = useProductMargins();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [newKey, setNewKey] = useState("");

  // Build draft list from persisted + known projects (so user sees all options even if not yet saved)
  useEffect(() => {
    if (!open) return;
    const known = new Set<string>();
    const arr: Draft[] = [];
    for (const k of Object.keys(margins)) {
      known.add(k);
      arr.push({ ...margins[k] });
    }
    const allProjects = [...ALL_PROJECTS, ...getDynamicProjects()];
    for (const p of allProjects) {
      const k = p.code.toUpperCase();
      if (!known.has(k)) {
        arr.push({ product_key: k, margin_pct: 0.7, be_buffer_pct: 0.1, _new: true });
      }
    }
    arr.sort((a, b) => a.product_key.localeCompare(b.product_key));
    setDrafts(arr);
  }, [open, margins]);

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.product_key === key ? { ...d, ...patch } : d)));
  };

  const addProduct = () => {
    const k = newKey.trim().toUpperCase();
    if (!k) return;
    if (drafts.some((d) => d.product_key === k)) {
      toast.error("Produto já existe na lista");
      return;
    }
    setDrafts((p) => [...p, { product_key: k, margin_pct: 0.7, be_buffer_pct: 0.1, _new: true }]);
    setNewKey("");
  };

  const saveOne = async (d: Draft) => {
    if (d.margin_pct <= 0 || d.margin_pct > 1) {
      toast.error("Margem deve estar entre 1% e 100%");
      return;
    }
    try {
      await upsert.mutateAsync({
        product_key: d.product_key,
        margin_pct: d.margin_pct,
        be_buffer_pct: d.be_buffer_pct ?? 0.1,
      });
      toast.success(`Margem de ${d.product_key} salva`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    }
  };

  const removeOne = async (key: string) => {
    try {
      await remove.mutateAsync(key);
      toast.success(`${key} removido`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao remover");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Margens por Produto · Semáforo ROAS</DialogTitle>
          <DialogDescription>
            <span className="block">
              Break Even ROAS = 1 / Margem. Verde quando ROAS ≥ BE × (1 + buffer); Amarelo entre BE e
              BE × buffer; Vermelho quando ROAS &lt; BE (prejuízo real).
            </span>
            <span className="block mt-1 text-xs">
              Fallback global (sem margem cadastrada): Verde ≥ {FALLBACK_GREEN_AT.toFixed(2)} · BE {FALLBACK_BE.toFixed(2)}.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}

          <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground px-1 pb-1 border-b">
            <div className="col-span-2">Produto</div>
            <div className="col-span-2">Margem %</div>
            <div className="col-span-2">Buffer %</div>
            <div className="col-span-4">Faixas</div>
            <div className="col-span-2 text-right">Ações</div>
          </div>

          {drafts.map((d) => {
            const map = { [d.product_key]: { ...d, be_buffer_pct: d.be_buffer_pct ?? 0.1 } };
            const previewRoas = [0.8, 1.2, 1.6, 2.0];
            return (
              <div key={d.product_key} className="grid grid-cols-12 gap-2 items-center py-1.5 border-b border-border/40">
                <div className="col-span-2 font-mono text-sm font-semibold flex items-center gap-2">
                  {d.product_key}
                  {d._new && <Badge variant="outline" className="text-[9px]">novo</Badge>}
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={Math.round((d.margin_pct || 0) * 100)}
                    onChange={(e) => updateDraft(d.product_key, { margin_pct: Number(e.target.value) / 100 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round((d.be_buffer_pct ?? 0.1) * 100)}
                    onChange={(e) => updateDraft(d.product_key, { be_buffer_pct: Number(e.target.value) / 100 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-4 flex items-center gap-1.5 text-[11px]">
                  {previewRoas.map((r) => {
                    const rc = computeRoasColor(r, d.product_key, map);
                    return (
                      <span
                        key={r}
                        className={cn("font-semibold tabular-nums px-1.5 py-0.5 rounded border border-border/40", roasColorClass(rc.color))}
                      >
                        {r.toFixed(2)}
                      </span>
                    );
                  })}
                  <span className="ml-auto text-muted-foreground">
                    BE {(1 / (d.margin_pct || 1)).toFixed(2)}
                  </span>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <Button size="sm" variant="default" onClick={() => saveOne(d)} disabled={upsert.isPending}>
                    Salvar
                  </Button>
                  {!d._new && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeOne(d.product_key)} disabled={remove.isPending}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-2 pt-3">
            <Label className="text-xs">Adicionar produto:</Label>
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="ex.: MMP"
              className="h-8 w-32 text-sm"
            />
            <Button size="sm" variant="outline" onClick={addProduct}>
              <Plus className="size-3.5 mr-1" /> Adicionar
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
