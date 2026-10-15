import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExternalLink, Library, Link2, Pencil, Plus, ShoppingCart, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export interface ExtraLink {
  label: string;
  url: string;
}

interface Props {
  offerId: string;
  adLibraryUrl: string | null;
  funnelUrls: string[];
  checkoutUrls: string[];
  extraLinks: ExtraLink[];
}

const clean = (arr: string[]) => arr.map((s) => s.trim()).filter(Boolean);

function shortUrl(raw: string): string {
  if (!raw) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const path = u.pathname && u.pathname !== "/" ? u.pathname : "";
    const short = path.length > 24 ? `${path.slice(0, 24)}…` : path;
    return `${u.hostname}${short}`;
  } catch {
    return raw.length > 48 ? `${raw.slice(0, 48)}…` : raw;
  }
}

export function SpyImportantLinks({ offerId, adLibraryUrl, funnelUrls, checkoutUrls, extraLinks }: Props) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    ad_library_url: adLibraryUrl ?? "",
    funnel_urls: funnelUrls?.length ? [...funnelUrls] : [""],
    checkout_urls: checkoutUrls?.length ? [...checkoutUrls] : [""],
    extras: extraLinks?.length ? [...extraLinks] : ([] as ExtraLink[]),
  });
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setForm({
      ad_library_url: adLibraryUrl ?? "",
      funnel_urls: funnelUrls?.length ? [...funnelUrls] : [""],
      checkout_urls: checkoutUrls?.length ? [...checkoutUrls] : [""],
      extras: extraLinks?.length ? [...extraLinks] : [],
    });
    setOpen(true);
  }

  function updateArr(key: "funnel_urls" | "checkout_urls", i: number, v: string) {
    setForm((f) => ({ ...f, [key]: f[key].map((u, idx) => (idx === i ? v : u)) }));
  }
  function addArr(key: "funnel_urls" | "checkout_urls") {
    setForm((f) => ({ ...f, [key]: [...f[key], ""] }));
  }
  function removeArr(key: "funnel_urls" | "checkout_urls", i: number) {
    setForm((f) => ({ ...f, [key]: f[key].filter((_, idx) => idx !== i) }));
  }

  async function save() {
    setSaving(true);
    const funnels = clean(form.funnel_urls);
    const checkouts = clean(form.checkout_urls);
    const cleanExtras = form.extras.filter((e) => e.label.trim() && e.url.trim());
    const { error } = await supabase
      .from("spy_offers")
      .update({
        ad_library_url: form.ad_library_url.trim() || null,
        funnel_urls: funnels,
        checkout_urls: checkouts,
        // mantém o singular sincronizado com o primeiro item, para compat. com outras leituras
        funnel_url: funnels[0] ?? null,
        checkout_url: checkouts[0] ?? null,
        extra_links: cleanExtras as any,
      })
      .eq("id", offerId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Links atualizados");
    qc.invalidateQueries({ queryKey: ["spy-offer-detail", offerId] });
    setOpen(false);
  }

  const hasFunnel = funnelUrls.length > 0;
  const hasCheckout = checkoutUrls.length > 0;

  return (
    <Card className="p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Links Importantes</h3>
        </div>
        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={openEdit}>
          <Pencil className="h-3 w-3 mr-1" /> Editar
        </Button>
      </div>

      <div className="space-y-1.5">
        <LinkRow
          icon={<Library className="h-3.5 w-3.5 text-blue-400" />}
          iconBg="bg-blue-500/10"
          label="Biblioteca de Anúncios"
          subtitle="Criativos e anúncios da campanha"
          href={adLibraryUrl}
        />

        {hasFunnel ? (
          funnelUrls.map((u, i) => (
            <LinkRow
              key={`f-${i}`}
              icon={<Target className="h-3.5 w-3.5 text-emerald-400" />}
              iconBg="bg-emerald-500/10"
              label={funnelUrls.length > 1 ? `Funil de Vendas #${i + 1}` : "Funil de Vendas"}
              subtitle={shortUrl(u)}
              href={u}
              truncateSubtitle
            />
          ))
        ) : (
          <LinkRow
            icon={<Target className="h-3.5 w-3.5 text-emerald-400" />}
            iconBg="bg-emerald-500/10"
            label="Funil de Vendas"
            subtitle="Adicione um link no botão Editar"
            href={null}
          />
        )}

        {hasCheckout ? (
          checkoutUrls.map((u, i) => (
            <LinkRow
              key={`c-${i}`}
              icon={<ShoppingCart className="h-3.5 w-3.5 text-rose-400" />}
              iconBg="bg-rose-500/10"
              label={checkoutUrls.length > 1 ? `Checkout #${i + 1}` : "Checkout"}
              subtitle={shortUrl(u)}
              href={u}
              truncateSubtitle
            />
          ))
        ) : (
          <LinkRow
            icon={<ShoppingCart className="h-3.5 w-3.5 text-rose-400" />}
            iconBg="bg-rose-500/10"
            label="Checkout"
            subtitle="Adicione um link no botão Editar"
            href={null}
          />
        )}
      </div>

      {extraLinks?.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">Links Extras</p>
          <div className="space-y-1.5">
            {extraLinks.map((e, i) => (
              <LinkRow
                key={i}
                icon={<Link2 className="h-3.5 w-3.5 text-muted-foreground" />}
                iconBg="bg-muted"
                label={e.label}
                subtitle={shortUrl(e.url)}
                href={e.url}
                truncateSubtitle
              />
            ))}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Links Importantes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Biblioteca de Anúncios</Label>
              <Input
                value={form.ad_library_url}
                onChange={(e) => setForm({ ...form, ad_library_url: e.target.value })}
                placeholder="https://facebook.com/ads/library/..."
              />
            </div>

            <MultiUrlField
              label="Funil de Vendas"
              urls={form.funnel_urls}
              onChange={(i, v) => updateArr("funnel_urls", i, v)}
              onAdd={() => addArr("funnel_urls")}
              onRemove={(i) => removeArr("funnel_urls", i)}
            />

            <MultiUrlField
              label="Checkout"
              urls={form.checkout_urls}
              onChange={(i, v) => updateArr("checkout_urls", i, v)}
              onAdd={() => addArr("checkout_urls")}
              onRemove={(i) => removeArr("checkout_urls", i)}
            />

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Links Extras</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setForm((f) => ({ ...f, extras: [...f.extras, { label: "", url: "" }] }))}
                >
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              {form.extras.length === 0 && <p className="text-xs text-muted-foreground">Nenhum link extra.</p>}
              {form.extras.map((e, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    className="w-32"
                    placeholder="Rótulo"
                    value={e.label}
                    onChange={(ev) => setForm((f) => ({ ...f, extras: f.extras.map((x, idx) => (idx === i ? { ...x, label: ev.target.value } : x)) }))}
                  />
                  <Input
                    className="flex-1"
                    placeholder="https://..."
                    value={e.url}
                    onChange={(ev) => setForm((f) => ({ ...f, extras: f.extras.map((x, idx) => (idx === i ? { ...x, url: ev.target.value } : x)) }))}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-destructive"
                    onClick={() => setForm((f) => ({ ...f, extras: f.extras.filter((_, idx) => idx !== i) }))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MultiUrlField({
  label, urls, onChange, onAdd, onRemove,
}: {
  label: string;
  urls: string[];
  onChange: (i: number, v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <Button size="sm" variant="outline" className="h-7" onClick={onAdd}>
          <Plus className="h-3 w-3 mr-1" /> Adicionar
        </Button>
      </div>
      {urls.length === 0 && <p className="text-xs text-muted-foreground">Nenhum link.</p>}
      {urls.map((u, i) => (
        <div key={i} className="flex gap-2 items-start">
          <Input
            className="flex-1"
            placeholder="https://..."
            value={u}
            onChange={(e) => onChange(i, e.target.value)}
          />
          <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => onRemove(i)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function LinkRow({ icon, iconBg, label, subtitle, href, truncateSubtitle }: { icon: React.ReactNode; iconBg: string; label: string; subtitle: string; href: string | null; truncateSubtitle?: boolean }) {
  const disabled = !href;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Evita que o clique borbulhe para containers que possam capturar e navegar (router/cards).
    e.stopPropagation();
    if (!href) {
      e.preventDefault();
      return;
    }
    // Deixa o comportamento nativo do <a target="_blank" rel="noopener"> abrir uma nova aba.
    // NÃO chamamos window.open aqui — isso causava DUAS abas (uma em branco/travada).
  };

  return (
    <div className={`flex items-center gap-2.5 p-2 rounded-md border border-border ${disabled ? "opacity-50" : "hover:bg-muted/30"}`}>
      <div className={`h-7 w-7 rounded-md flex items-center justify-center ${iconBg}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{label}</p>
        <p className={`text-[10px] text-muted-foreground ${truncateSubtitle ? "truncate" : ""}`}>{subtitle || "—"}</p>
      </div>
      <a
        href={href ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        onAuxClick={(e) => e.stopPropagation()}
        aria-disabled={disabled}
        className={`inline-flex items-center justify-center gap-1 h-7 px-2.5 text-[11px] rounded-md border border-border bg-background hover:bg-muted transition-colors ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <ExternalLink className="h-3 w-3" /> Acessar
      </a>
    </div>
  );
}
