import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SPY_IDIOMAS,
  SPY_NICHOS,
  SPY_STATUS,
  SPY_SUBNICHOS,
  SPY_TRAFFIC,
  type SpyOffer,
} from "@/types/spy";
import { useSpyUpdateOffer } from "@/hooks/useSpyOffers";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offer: SpyOffer;
}

const STATUS_LABEL: Record<(typeof SPY_STATUS)[number], string> = {
  hot: "Escalando",
  qualified: "Promissora",
  watching: "Acompanhando",
  dismissed: "Descartada",
};

export function SpyOfferEditDialog({ open, onOpenChange, offer }: Props) {
  const update = useSpyUpdateOffer();
  const [form, setForm] = useState(() => init(offer));

  useEffect(() => {
    if (open) setForm(init(offer));
  }, [open, offer]);

  const set = (k: keyof ReturnType<typeof init>, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.offer_name.trim()) {
      toast.error("Nome da oferta é obrigatório");
      return;
    }
    try {
      await update.mutateAsync({
        id: offer.id,
        patch: {
          offer_name: form.offer_name.trim(),
          product_name: form.product_name.trim() || null,
          primary_advertiser: form.primary_advertiser.trim() || null,
          domain: form.domain.trim() || null,
          nicho: form.nicho || null,
          subnicho: form.subnicho || null,
          idioma: form.idioma || null,
          geo_main: form.geo_main.trim() || null,
          trafego: form.trafego,
          status: form.status,
          score: form.score === "" ? null : Number(form.score),
          payout_estimated_usd:
            form.payout_estimated_usd === "" ? null : Number(form.payout_estimated_usd),
          notes: form.notes.trim() || null,
        } as Partial<SpyOffer>,
      });
      toast.success("Oferta atualizada");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Editar oferta</DialogTitle>
          <DialogDescription>
            Atualize as informações de mapeamento — mesmas opções dos filtros do Swipe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <Field label="Nome da Oferta *">
            <Input value={form.offer_name} onChange={(e) => set("offer_name", e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Produto">
              <Input value={form.product_name} onChange={(e) => set("product_name", e.target.value)} />
            </Field>
            <Field label="Anunciante principal">
              <Input
                value={form.primary_advertiser}
                onChange={(e) => set("primary_advertiser", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Domínio da LP (sem https)">
            <Input value={form.domain} onChange={(e) => set("domain", e.target.value)} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Nicho">
              <Select
                value={form.nicho || "__none__"}
                onValueChange={(v) => set("nicho", v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {SPY_NICHOS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subnicho">
              <Select
                value={form.subnicho || "__none__"}
                onValueChange={(v) => set("subnicho", v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {SPY_SUBNICHOS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Idioma">
              <Select
                value={form.idioma || "__none__"}
                onValueChange={(v) => set("idioma", v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {SPY_IDIOMAS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Plataforma / Tráfego">
              <Select value={form.trafego} onValueChange={(v) => set("trafego", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPY_TRAFFIC.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPY_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="GEO principal">
              <Input
                value={form.geo_main}
                onChange={(e) => set("geo_main", e.target.value.toUpperCase())}
                placeholder="US, BR, …"
                maxLength={6}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Score (0–100)">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.score}
                onChange={(e) => set("score", e.target.value)}
              />
            </Field>
            <Field label="Payout estimado (USD)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.payout_estimated_usd}
                onChange={(e) => set("payout_estimated_usd", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Insights, ângulos, observações…"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function init(offer: SpyOffer) {
  return {
    offer_name: offer.offer_name ?? "",
    product_name: offer.product_name ?? "",
    primary_advertiser: offer.primary_advertiser ?? "",
    domain: offer.domain ?? "",
    nicho: offer.nicho ?? "",
    subnicho: offer.subnicho ?? "",
    idioma: offer.idioma ?? "",
    geo_main: offer.geo_main ?? "",
    trafego: (offer.trafego ?? "Facebook") as (typeof SPY_TRAFFIC)[number],
    status: (offer.status ?? "watching") as (typeof SPY_STATUS)[number],
    score: offer.score == null ? "" : String(offer.score),
    payout_estimated_usd:
      offer.payout_estimated_usd == null ? "" : String(offer.payout_estimated_usd),
    notes: offer.notes ?? "",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
