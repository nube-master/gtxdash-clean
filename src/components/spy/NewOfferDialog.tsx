import { useState } from "react";
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
  SPY_CATEGORY_LABELS,
  SPY_IDIOMAS,
  SPY_NICHOS,
  SPY_SUBNICHOS,
  SPY_TRAFFIC,
} from "@/types/spy";
import { useSpyCreateOffer } from "@/hooks/useSpyOffers";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}



export function NewOfferDialog({ open, onOpenChange }: Props) {
  const create = useSpyCreateOffer();
  const [form, setForm] = useState({
    offer_name: "",
    product_name: "",
    domain: "",
    sales_page_url: "",
    ad_library_url: "",
    primary_advertiser: "",
    hero_thumbnail_url: "",
    nicho: "" as string,
    subnicho: "" as string,
    idioma: "Inglês" as string,
    trafego: "Facebook" as (typeof SPY_TRAFFIC)[number],
    notes: "",
  });

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.offer_name.trim()) {
      toast.error("Nome da oferta é obrigatório");
      return;
    }
    try {
      const created = await create.mutateAsync({
        offer_name: form.offer_name.trim(),
        product_name: form.product_name.trim() || null,
        domain: form.domain.trim() || null,
        sales_page_url: form.sales_page_url.trim() || null,
        ad_library_url: form.ad_library_url.trim() || null,
        primary_advertiser: form.primary_advertiser.trim() || null,
        hero_thumbnail_url: form.hero_thumbnail_url.trim() || null,
        nicho: form.nicho || null,
        subnicho: form.subnicho || null,
        idioma: form.idioma || null,
        trafego: form.trafego,
        notes: form.notes.trim() || null,
        source: form.ad_library_url.trim() ? "apify" : "manual",
      } as any);
      toast.success("Oferta adicionada ao Swipe");
      // Trigger first sync immediately if URL provided
      if (form.ad_library_url.trim() && created?.id) {
        toast.loading("Sincronizando criativos…", { id: "spy-sync" });
        const { supabase } = await import("@/integrations/supabase/client");
        supabase.functions
          .invoke("spy-sync-offer", { body: { offer_id: created.id } })
          .then(({ error }) => {
            if (error) toast.error("Falha na sincronização inicial", { id: "spy-sync" });
            else toast.success("Criativos sincronizados", { id: "spy-sync" });
          });
      }
      onOpenChange(false);
      setForm({
        offer_name: "",
        product_name: "",
        domain: "",
        sales_page_url: "",
        ad_library_url: "",
        primary_advertiser: "",
        hero_thumbnail_url: "",
        
        nicho: "",
        subnicho: "",
        idioma: "Inglês",
        trafego: "Facebook",
        notes: "",
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar Oferta</DialogTitle>
          <DialogDescription>
            Cole a URL da página na Meta Ad Library para sincronizar ads e LPs automaticamente todo dia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <Field label="Nome da Oferta *">
            <Input value={form.offer_name} onChange={(e) => set("offer_name", e.target.value)} placeholder="Ex.: Quietum Plus" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Produto">
              <Input value={form.product_name} onChange={(e) => set("product_name", e.target.value)} />
            </Field>
            <Field label="Anunciante principal">
              <Input value={form.primary_advertiser} onChange={(e) => set("primary_advertiser", e.target.value)} />
            </Field>
          </div>
          <Field label="Domínio da LP (sem https)">
            <Input value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="getquietum.com" />
          </Field>
          <Field label="URL da Página de Vendas (opcional)">
            <Input value={form.sales_page_url} onChange={(e) => set("sales_page_url", e.target.value)} placeholder="https://offer.com/checkout" />
          </Field>
          <Field label="URL da Meta Ad Library (auto-sync diário)">
            <Input
              value={form.ad_library_url}
              onChange={(e) => set("ad_library_url", e.target.value)}
              placeholder="https://www.facebook.com/ads/library/?…&view_all_page_id=…"
            />
          </Field>
          <Field label="Thumb (URL da imagem) — opcional se houver Ad Library">
            <Input value={form.hero_thumbnail_url} onChange={(e) => set("hero_thumbnail_url", e.target.value)} placeholder="https://…/preview.jpg" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tráfego">
              <Select value={form.trafego} onValueChange={(v) => set("trafego", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPY_TRAFFIC.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>


          <div className="grid grid-cols-3 gap-3">
            <Field label="Nicho">
              <Select value={form.nicho || "__none__"} onValueChange={(v) => set("nicho", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {SPY_NICHOS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subnicho">
              <Select value={form.subnicho || "__none__"} onValueChange={(v) => set("subnicho", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {SPY_SUBNICHOS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Idioma">
              <Select value={form.idioma} onValueChange={(v) => set("idioma", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPY_IDIOMAS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Notas">
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Insights, ângulos, observações…" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={create.isPending}>
            {create.isPending ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
