import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, Search, Loader2, Tv } from "lucide-react";
import type { Offer, OfferStatus, OfferTipo, OfferNicho, OfferGeo, OfferVendor } from "@/types/offers";

interface Props {
  open: boolean;
  onClose: () => void;
  editing: Offer | null;
  onSaved: () => void;
  prefill?: Partial<FormState> | null;
}

interface FormState {
  apelido_interno: string;
  produto_real: string;
  tipo: OfferTipo;
  nicho: OfferNicho;
  geo: OfferGeo;
  vendor: OfferVendor;
  vendor_id: string;
  producer_id: string;
  nickname_afiliado: string;
  link_checkout: string;
  sales_page_url: string;
  pixel_id: string;
  vsl_player: string;
  vsl_url: string;
  ticket_front_brl: string;
  ticket_front_usd: string;
  cpa_target_brl: string;
  teto_validacao_brl: string;
  margem_pct: string;
  comissao_pct: string;
  comissao_usd: string;
  media_channels: string[];
  status: OfferStatus;
  data_inicio: string;
  notas: string;
  tags: string[];
  vendors_clickbank: string;
}

const EMPTY: FormState = {
  apelido_interno: "", produto_real: "",
  tipo: "afiliacao", nicho: "outro", geo: "BR", vendor: "clickbank",
  vendor_id: "", producer_id: "", nickname_afiliado: "", link_checkout: "", sales_page_url: "", pixel_id: "",
  vsl_player: "", vsl_url: "",
  ticket_front_brl: "", ticket_front_usd: "", cpa_target_brl: "", teto_validacao_brl: "",
  margem_pct: "", comissao_pct: "", comissao_usd: "", media_channels: [],
  status: "em_teste", data_inicio: format(new Date(), "yyyy-MM-dd"),
  notas: "", tags: [], vendors_clickbank: "",
};

const MEDIA_CHANNELS = [
  "Facebook Ads",
  "Native Ads",
  "YouTube Ads",
  "Bing Ads",
  "Google Ads",
  "TikTok Ads",
  "Newsbreak",
  "Taboola",
  "Outbrain",
  "Pinterest Ads",
  "Twitter/X Ads",
];

interface Producer { id: string; name: string; }

export function OfferWizardDialog({ open, onClose, editing, onSaved, prefill }: Props) {
  const operationId = useOperationId();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [newProducerName, setNewProducerName] = useState("");
  const [creatingProducer, setCreatingProducer] = useState(false);

  const loadProducers = async () => {
    const { data } = await supabase.from("producers" as any).select("id, name").order("name");
    setProducers((data as any) || []);
  };

  useEffect(() => { if (open) loadProducers(); }, [open]);

  const createProducer = async () => {
    const name = newProducerName.trim();
    if (!name) return;
    setCreatingProducer(true);
    const { data, error } = await supabase.from("producers" as any).insert({ name }).select("id, name").single();
    setCreatingProducer(false);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    await loadProducers();
    upd("producer_id", (data as any).id);
    setNewProducerName("");
    toast.success(`Produtor "${name}" criado`);
  };

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setTagInput("");
    if (editing) {
      setForm({
        apelido_interno: editing.apelido_interno,
        produto_real: editing.produto_real,
        tipo: editing.tipo,
        nicho: editing.nicho,
        geo: editing.geo,
        vendor: editing.vendor,
        vendor_id: editing.vendor_id ?? "",
        producer_id: (editing as any).producer_id ?? "",
        nickname_afiliado: editing.nickname_afiliado ?? "",
        link_checkout: editing.link_checkout ?? "",
        sales_page_url: (editing as any).sales_page_url ?? "",
        pixel_id: editing.pixel_id ?? "",
        vsl_player: editing.vsl_player ?? "",
        vsl_url: editing.vsl_url ?? "",
        ticket_front_brl: editing.ticket_front_brl?.toString() ?? "",
        ticket_front_usd: editing.ticket_front_usd?.toString() ?? "",
        cpa_target_brl: editing.cpa_target_brl?.toString() ?? "",
        teto_validacao_brl: (editing as any).teto_validacao_brl?.toString() ?? "",
        margem_pct: editing.margem_pct?.toString() ?? "",
        comissao_pct: editing.comissao_pct?.toString() ?? "",
        comissao_usd: (editing as any).comissao_usd?.toString() ?? "",
        media_channels: (editing as any).media_channels ?? [],
        status: editing.status,
        data_inicio: editing.data_inicio ?? format(new Date(), "yyyy-MM-dd"),
        notas: editing.notas ?? "",
        tags: editing.tags ?? [],
        vendors_clickbank: ((editing as any).vendors_clickbank ?? []).join(", "),
      });
    } else {
      setForm({ ...EMPTY, ...(prefill ?? {}) });
    }
  }, [open, editing, prefill]);

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const validateStep1 = () => {
    if (!form.apelido_interno.trim()) { toast.error("Apelido interno é obrigatório"); return false; }
    if (!form.produto_real.trim()) { toast.error("Produto real é obrigatório"); return false; }
    return true;
  };

  const next = async () => {
    if (step === 1) {
      if (!validateStep1()) return;
      // checar unicidade só se novo ou se mudou apelido
      if (!editing || editing.apelido_interno !== form.apelido_interno) {
        const { data } = await supabase
          .from("offers")
          .select("id")
          .eq("apelido_interno", form.apelido_interno)
          .maybeSingle();
        if (data) { toast.error("Apelido interno já existe"); return; }
      }
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const prev = () => setStep((s) => Math.max(1, s - 1));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || form.tags.includes(t)) return;
    upd("tags", [...form.tags, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => upd("tags", form.tags.filter((x) => x !== t));

  const handleSave = async () => {
    if (!editing && !operationId) {
      toast.error("Selecione uma operação antes de criar a offer");
      return;
    }
    setSaving(true);
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    const payload: any = {
      apelido_interno: form.apelido_interno,
      produto_real: form.produto_real,
      tipo: form.tipo,
      nicho: form.nicho,
      geo: form.geo,
      vendor: form.vendor,
      vendor_id: form.vendor_id || null,
      producer_id: form.producer_id || null,
      nickname_afiliado: form.nickname_afiliado || null,
      link_checkout: form.link_checkout || null,
      sales_page_url: form.sales_page_url || null,
      pixel_id: form.pixel_id || null,
      vsl_player: form.vsl_player || null,
      vsl_url: form.vsl_url || null,
      ticket_front_brl: num(form.ticket_front_brl),
      ticket_front_usd: num(form.ticket_front_usd),
      cpa_target_brl: num(form.cpa_target_brl),
      teto_validacao_brl: num(form.teto_validacao_brl),
      margem_pct: num(form.margem_pct),
      comissao_pct: num(form.comissao_pct),
      comissao_usd: num(form.comissao_usd),
      media_channels: form.media_channels.length > 0 ? form.media_channels : null,
      status: form.status,
      data_inicio: form.data_inicio || null,
      notas: form.notas || null,
      tags: form.tags.length > 0 ? form.tags : null,
      vendors_clickbank: form.vendors_clickbank.trim()
        ? form.vendors_clickbank.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
        : [],
    };

    const { error } = editing
      ? await supabase.from("offers").update(payload as any).eq("id", editing.id)
      : await supabase.from("offers").insert({ ...payload, operation_id: operationId } as any);

    setSaving(false);
    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }
    toast.success(editing ? "Oferta atualizada" : "Oferta criada");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar offer: ${editing.apelido_interno}` : "Nova offer"}</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 py-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium border ${
                  step === n
                    ? "bg-primary text-primary-foreground border-primary"
                    : step > n
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-card text-muted-foreground border-border"
                }`}
              >
                {step > n ? <Check className="h-3.5 w-3.5" /> : n}
              </div>
              {n < 4 && <div className={`flex-1 h-px ${step > n ? "bg-primary/40" : "bg-border"}`} />}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          {step === 1 && "Step 1 — Identificação"}
          {step === 2 && "Step 2 — Vendor & Tracking"}
          {step === 3 && "Step 3 — Economia"}
          {step === 4 && "Step 4 — Status"}
        </p>

        <div className="space-y-4 py-3">
          {step === 1 && (
            <>
              <Field label="Apelido interno *">
                <Input value={form.apelido_interno} onChange={(e) => upd("apelido_interno", e.target.value)} placeholder="Ex: NDM" />
              </Field>
              <Field label="Produto real *">
                <Input value={form.produto_real} onChange={(e) => upd("produto_real", e.target.value)} placeholder="Ex: NDM (Neuro)" />
              </Field>
              <Field label="Tipo">
                <RadioGroup value={form.tipo} onValueChange={(v) => upd("tipo", v as OfferTipo)} className="flex gap-4">
                  {[
                    { v: "propria", l: "Própria" },
                    { v: "afiliacao", l: "Afiliação" },
                    { v: "spy_capturada", l: "Spy capturada" },
                  ].map((o) => (
                    <div key={o.v} className="flex items-center gap-2">
                      <RadioGroupItem id={`tipo-${o.v}`} value={o.v} />
                      <Label htmlFor={`tipo-${o.v}`} className="font-normal cursor-pointer">{o.l}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nicho">
                  <Select value={form.nicho} onValueChange={(v) => upd("nicho", v as OfferNicho)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-80">
                      <SelectItem value="brain_memory">Cérebro & Memória</SelectItem>
                      <SelectItem value="vision">Visão</SelectItem>
                      <SelectItem value="hearing">Audição</SelectItem>
                      <SelectItem value="tinnitus">Zumbido</SelectItem>
                      <SelectItem value="blood_sugar">Blood Sugar / Diabetes</SelectItem>
                      <SelectItem value="glp1">GLP-1</SelectItem>
                      <SelectItem value="weight_loss">Emagrecimento</SelectItem>
                      <SelectItem value="mens_health_ed">Saúde do Homem / ED</SelectItem>
                      <SelectItem value="womens_health">Saúde da Mulher</SelectItem>
                      <SelectItem value="prostate">Próstata</SelectItem>
                      <SelectItem value="heart_bp">Coração & Pressão</SelectItem>
                      <SelectItem value="joint_pain">Dor articular</SelectItem>
                      <SelectItem value="skin_beauty">Pele & Beleza</SelectItem>
                      <SelectItem value="hair_loss">Queda de cabelo</SelectItem>
                      <SelectItem value="dental">Dental</SelectItem>
                      <SelectItem value="sleep">Sono</SelectItem>
                      <SelectItem value="energy">Energia</SelectItem>
                      <SelectItem value="immunity">Imunidade</SelectItem>
                      <SelectItem value="digestive">Digestivo</SelectItem>
                      <SelectItem value="kidney_liver">Rim & Fígado</SelectItem>
                      <SelectItem value="anti_aging">Anti-Aging</SelectItem>
                      <SelectItem value="muscle">Ganho de massa</SelectItem>
                      <SelectItem value="detox">Detox</SelectItem>
                      <SelectItem value="thyroid">Tireoide</SelectItem>
                      <SelectItem value="spiritual">Espiritual</SelectItem>
                      <SelectItem value="survival">Survival / Prepper</SelectItem>
                      <SelectItem value="pet">Pet</SelectItem>
                      <SelectItem value="financial">Financeiro</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Geo">
                  <Select value={form.geo} onValueChange={(v) => upd("geo", v as OfferGeo)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-80">
                      {([
                        ["BR","🇧🇷 Brasil"],["US","🇺🇸 EUA"],["UK","🇬🇧 Reino Unido"],
                        ["PT","🇵🇹 Portugal"],["ES","🇪🇸 Espanha"],["IT","🇮🇹 Itália"],
                        ["FR","🇫🇷 França"],["DE","🇩🇪 Alemanha"],["NL","🇳🇱 Holanda"],
                        ["BE","🇧🇪 Bélgica"],["LU","🇱🇺 Luxemburgo"],["IE","🇮🇪 Irlanda"],
                        ["AT","🇦🇹 Áustria"],["CH","🇨🇭 Suíça"],
                        ["PL","🇵🇱 Polônia"],["CZ","🇨🇿 República Tcheca"],["SK","🇸🇰 Eslováquia"],
                        ["HU","🇭🇺 Hungria"],["RO","🇷🇴 Romênia"],["BG","🇧🇬 Bulgária"],
                        ["HR","🇭🇷 Croácia"],["SI","🇸🇮 Eslovênia"],["GR","🇬🇷 Grécia"],
                        ["SE","🇸🇪 Suécia"],["NO","🇳🇴 Noruega"],["DK","🇩🇰 Dinamarca"],["FI","🇫🇮 Finlândia"],
                        ["LT","🇱🇹 Lituânia"],["LV","🇱🇻 Letônia"],["EE","🇪🇪 Estônia"],
                        ["CA","🇨🇦 Canadá"],["MX","🇲🇽 México"],
                        ["AR","🇦🇷 Argentina"],["CL","🇨🇱 Chile"],["CO","🇨🇴 Colômbia"],["PE","🇵🇪 Peru"],
                        ["UY","🇺🇾 Uruguai"],["PY","🇵🇾 Paraguai"],["BO","🇧🇴 Bolívia"],["EC","🇪🇨 Equador"],
                        ["VE","🇻🇪 Venezuela"],["CR","🇨🇷 Costa Rica"],["PA","🇵🇦 Panamá"],
                        ["DO","🇩🇴 Rep. Dominicana"],["GT","🇬🇹 Guatemala"],
                        ["AU","🇦🇺 Austrália"],["NZ","🇳🇿 Nova Zelândia"],["ZA","🇿🇦 África do Sul"],
                        ["IN","🇮🇳 Índia"],["JP","🇯🇵 Japão"],["KR","🇰🇷 Coreia do Sul"],
                        ["SG","🇸🇬 Singapura"],["MY","🇲🇾 Malásia"],["PH","🇵🇭 Filipinas"],
                        ["TH","🇹🇭 Tailândia"],["ID","🇮🇩 Indonésia"],["VN","🇻🇳 Vietnã"],
                        ["TR","🇹🇷 Turquia"],["IL","🇮🇱 Israel"],["AE","🇦🇪 Emirados Árabes"],["SA","🇸🇦 Arábia Saudita"],
                      ] as [OfferGeo, string][]).map(([g, label]) => (
                        <SelectItem key={g} value={g}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Checkout">
                <Select value={form.vendor} onValueChange={(v) => upd("vendor", v as OfferVendor)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clickbank">ClickBank</SelectItem>
                    <SelectItem value="buygoods">BuyGoods</SelectItem>
                    <SelectItem value="cartpanda">Cartpanda</SelectItem>
                    <SelectItem value="hotmart">Hotmart</SelectItem>
                    <SelectItem value="kiwify">Kiwify</SelectItem>
                    <SelectItem value="monetizze">Monetizze</SelectItem>
                    <SelectItem value="cod_europa">COD Europa (Cash on Delivery)</SelectItem>
                    <SelectItem value="outro">Digistore / Outro</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Produtor">
                  <div className="space-y-2">
                    <Select value={form.producer_id || "none"} onValueChange={(v) => upd("producer_id", v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione o produtor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nenhum —</SelectItem>
                        {producers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1.5">
                      <Input
                        value={newProducerName}
                        onChange={(e) => setNewProducerName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createProducer(); } }}
                        placeholder="+ Criar novo produtor"
                        className="h-8 text-xs"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={createProducer} disabled={creatingProducer || !newProducerName.trim()}>
                        Criar
                      </Button>
                    </div>
                  </div>
                </Field>
                <Field label="Nickname afiliado">
                  <Input value={form.nickname_afiliado} onChange={(e) => upd("nickname_afiliado", e.target.value)} placeholder="Opcional" />
                </Field>
              </div>
              <Field label="Vendor ID (opcional)">
                <Input value={form.vendor_id} onChange={(e) => upd("vendor_id", e.target.value)} placeholder="ID interno do produto no checkout" />
              </Field>
              <Field label="Link checkout">
                <Input value={form.link_checkout} onChange={(e) => upd("link_checkout", e.target.value)} placeholder="https://..." />
              </Field>
              <Field label="Página de vendas (usada no preview do card)">
                <Input value={form.sales_page_url} onChange={(e) => upd("sales_page_url", e.target.value)} placeholder="https://..." />
              </Field>
              <Field label="Pixel ID">
                <Input value={form.pixel_id} onChange={(e) => upd("pixel_id", e.target.value)} placeholder="Ex: 801891042714498" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="VSL Player">
                  <Input value={form.vsl_player} onChange={(e) => upd("vsl_player", e.target.value)} placeholder="Ex: VTurb" />
                </Field>
                <Field label="VSL URL (opcional)">
                  <Input value={form.vsl_url} onChange={(e) => upd("vsl_url", e.target.value)} placeholder="https://..." />
                </Field>
              </div>
              <VturbSyncBlock apelido={form.apelido_interno} tags={form.tags} />
            </>
          )}

          {step === 3 && (
            <>
              <Field label="CPA / Comissão (USD)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.comissao_usd}
                  onChange={(e) => {
                    upd("comissao_usd", e.target.value);
                    upd("cpa_target_brl", e.target.value);
                  }}
                  placeholder="Ex: 235.00"
                />
              </Field>

              <Field label="Teto de validação (BRL)">
                <Input type="number" step="0.01" value={form.teto_validacao_brl} onChange={(e) => upd("teto_validacao_brl", e.target.value)} placeholder="Ex: 15000.00 — alerta em 80% e 100%" />
              </Field>

              <Field label="Vendors ClickBank (separados por vírgula)">
                <Input value={form.vendors_clickbank} onChange={(e) => upd("vendors_clickbank", e.target.value)} placeholder="Ex: memopryl, neurodyne — atribui vendas mesmo sem [TAG] na campanha" />
              </Field>

              <Field label="Canais de mídia">
                <div className="flex flex-wrap gap-2">
                  {MEDIA_CHANNELS.map((ch) => {
                    const active = form.media_channels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() =>
                          upd(
                            "media_channels",
                            active
                              ? form.media_channels.filter((c) => c !== ch)
                              : [...form.media_channels, ch]
                          )
                        }
                        className={`px-3 py-1.5 rounded-full text-xs border transition ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Selecione todas as fontes de tráfego onde essa oferta será testada.
                </p>
              </Field>
            </>
          )}

          {step === 4 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <Select value={form.status} onValueChange={(v) => upd("status", v as OfferStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="em_teste">Em teste</SelectItem>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="pausada">Pausada</SelectItem>
                      <SelectItem value="morta">Morta</SelectItem>
                      <SelectItem value="arquivada">Arquivada</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Data início">
                  <Input type="date" value={form.data_inicio} onChange={(e) => upd("data_inicio", e.target.value)} />
                </Field>
              </div>
              <Field label="Notas">
                <Textarea rows={4} value={form.notas} onChange={(e) => upd("notas", e.target.value)} placeholder="Notas livres sobre a offer..." />
              </Field>
              <Field label="Tags">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      placeholder="Digite e Enter"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addTag}>Adicionar</Button>
                  </div>
                  {form.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs gap-1">
                          {t}
                          <button onClick={() => removeTag(t)} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          {step > 1 && <Button variant="outline" onClick={prev} disabled={saving}>Anterior</Button>}
          {step < 4 ? (
            <Button onClick={next} disabled={saving}>Próximo</Button>
          ) : (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function VturbSyncBlock({ apelido, tags }: { apelido: string; tags: string[] }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ video_id: string; video_name: string; total_views: number }> | null>(null);
  const [searched, setSearched] = useState<string[]>([]);

  const search = async () => {
    // Extrai TODOS os segmentos entre colchetes do apelido (ex: "[VIT-RRT] [SVK]" → ["VIT-RRT","SVK"])
    // Se o apelido não tiver colchetes, usa o texto inteiro como um único termo.
    const bracketSegs = (apelido.match(/\[([^\]]+)\]/g) || []).map((s) => s.slice(1, -1).trim()).filter(Boolean);
    const baseTerms = bracketSegs.length > 0 ? bracketSegs : (apelido.trim() ? [apelido.trim()] : []);
    const terms = Array.from(new Set([...baseTerms, ...tags.map((t) => t.trim())].filter(Boolean)));
    if (terms.length === 0) {
      toast.error("Defina o apelido interno (Step 1) ou adicione tags antes de sincronizar");
      return;
    }
    setLoading(true);
    setSearched(terms);
    try {
      // Match por sigla entre colchetes OU substring livre (mesma lógica do drawer)
      const orFilter = terms
        .map((t) => `video_name.ilike.%[${t}]%,video_name.ilike.%${t}%`)
        .join(",");
      const { data, error } = await supabase
        .from("vsl_data")
        .select("video_id, video_name, total_views")
        .or(orFilter)
        .order("total_views", { ascending: false })
        .limit(50);
      if (error) throw error;

      // Dedup por video_id e prioriza match exato com [APELIDO]
      const seen = new Map<string, { video_id: string; video_name: string; total_views: number }>();
      for (const row of (data as any[]) || []) {
        const id = row.video_id as string;
        if (!seen.has(id)) seen.set(id, { ...row, total_views: Number(row.total_views || 0) });
        else seen.get(id)!.total_views += Number(row.total_views || 0);
      }
      setResults(Array.from(seen.values()).slice(0, 30));
    } catch (e: any) {
      toast.error(`Erro ao buscar VSLs: ${e.message}`);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tv className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Sincronizar VSLs do Vturb</span>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={search} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          <span className="ml-1.5">Buscar</span>
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Busca automática por <code>[{apelido || "APELIDO"}]</code>{tags.length > 0 ? ` e tags (${tags.join(", ")})` : ""} no nome dos vídeos. As VSLs encontradas serão vinculadas automaticamente nos relatórios.
      </p>
      {results !== null && (
        <div className="space-y-1 max-h-48 overflow-y-auto pt-1">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhuma VSL encontrada para: {searched.map((s) => `[${s}]`).join(", ")}. Verifique se o nome do vídeo no Vturb contém a sigla entre colchetes.</p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">{results.length} VSL{results.length > 1 ? "s" : ""} vinculada{results.length > 1 ? "s" : ""}:</p>
              {results.map((r) => (
                <div key={r.video_id} className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded bg-background/50">
                  <span className="truncate flex-1" title={r.video_name}>{r.video_name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{r.total_views.toLocaleString("pt-BR")} views</Badge>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
