import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useOfferBenchmarks,
  useUpsertBenchmark,
  useDeleteBenchmark,
  NICHO_LABELS,
  type OfferBenchmark,
} from "@/hooks/useOfferBenchmarks";
import type { OfferNicho } from "@/types/offers";

interface Props {
  open: boolean;
  onClose: () => void;
  operationId: string | null;
}

const NICHOS = Object.keys(NICHO_LABELS) as OfferNicho[];

const EMPTY = {
  cpc_brl: "" as string,
  cpm_brl: "",
  ctr_pct: "",
  cpi_brl: "",
  conversion_pct: "",
  pitch_retention_pct: "",
  notes: "",
};

export function OfferBenchmarksDialog({ open, onClose, operationId }: Props) {
  const { data: bMap, isLoading } = useOfferBenchmarks(operationId);
  const upsert = useUpsertBenchmark(operationId);
  const del = useDeleteBenchmark();

  const [nicho, setNicho] = useState<OfferNicho>("blood_sugar_glp1");
  const [form, setForm] = useState({ ...EMPTY });

  useEffect(() => {
    const b = bMap?.get(nicho);
    setForm({
      cpc_brl: b?.cpc_brl?.toString() ?? "",
      cpm_brl: b?.cpm_brl?.toString() ?? "",
      ctr_pct: b?.ctr_pct?.toString() ?? "",
      cpi_brl: b?.cpi_brl?.toString() ?? "",
      conversion_pct: b?.conversion_pct?.toString() ?? "",
      pitch_retention_pct: b?.pitch_retention_pct?.toString() ?? "",
      notes: b?.notes ?? "",
    });
  }, [nicho, bMap]);

  const parseNum = (v: string): number | null => {
    const t = v.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return isNaN(n) ? null : n;
  };

  const handleSave = async () => {
    if (!operationId) return toast.error("Selecione uma operação");
    try {
      await upsert.mutateAsync({
        nicho,
        cpc_brl: parseNum(form.cpc_brl),
        cpm_brl: parseNum(form.cpm_brl),
        ctr_pct: parseNum(form.ctr_pct),
        cpi_brl: parseNum(form.cpi_brl),
        conversion_pct: parseNum(form.conversion_pct),
        pitch_retention_pct: parseNum(form.pitch_retention_pct),
        notes: form.notes.trim() || null,
      });
      toast.success(`Benchmark de ${NICHO_LABELS[nicho]} salvo`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar benchmark");
    }
  };

  const handleDelete = async () => {
    const existing = bMap?.get(nicho);
    if (!existing) return;
    if (!confirm(`Remover benchmark de ${NICHO_LABELS[nicho]}?`)) return;
    try {
      await del.mutateAsync(existing.id);
      toast.success("Benchmark removido");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  };

  const existing = bMap?.get(nicho);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Benchmarks por Nicho</DialogTitle>
          <DialogDescription>
            Defina as metas-padrão de KPI por nicho. Cada oferta será comparada automaticamente com o benchmark do seu nicho na lista e no detalhe.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nicho</Label>
              <Select value={nicho} onValueChange={(v) => setNicho(v as OfferNicho)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NICHOS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {NICHO_LABELS[n]} {bMap?.get(n) ? "✓" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="CPC alvo (R$)" value={form.cpc_brl} onChange={(v) => setForm({ ...form, cpc_brl: v })} />
              <Field label="CPM alvo (R$)" value={form.cpm_brl} onChange={(v) => setForm({ ...form, cpm_brl: v })} />
              <Field label="CTR alvo (%)" value={form.ctr_pct} onChange={(v) => setForm({ ...form, ctr_pct: v })} />
              <Field label="CPI alvo (R$)" value={form.cpi_brl} onChange={(v) => setForm({ ...form, cpi_brl: v })} />
              <Field label="Tx. conversão alvo (%)" value={form.conversion_pct} onChange={(v) => setForm({ ...form, conversion_pct: v })} />
              <Field label="Retenção do Pitch (%)" value={form.pitch_retention_pct} onChange={(v) => setForm({ ...form, pitch_retention_pct: v })} />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notas</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Contexto, fonte ou observações..."
                className="mt-1"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {existing && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
        inputMode="decimal"
        placeholder="—"
      />
    </div>
  );
}
