import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, ExternalLink, Loader2, Save, Package, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { HotmartStatusPanel } from "./HotmartStatusPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FUNNEL_ROLE_LABEL, type FunnelRole, type FunnelRoleOrIgnore } from "@/hooks/useHotmartCategories";

type CategoryMap = Record<string, FunnelRoleOrIgnore>;
const ROLE_OPTIONS: FunnelRoleOrIgnore[] = ["frontend", "order_bump", "upsell", "downsell", "ignore"];
const ROLE_LABEL_FULL: Record<FunnelRoleOrIgnore, string> = {
  ...FUNNEL_ROLE_LABEL,
  ignore: "Ignorar (fora do funil)",
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://taeduxiandktefcwgspx.supabase.co";

type ProductRow = {
  key: string;           // product_name normalizado (lowercase, trim) — chave canônica
  display: string;       // product_name como veio (para exibir)
  sales: number;
  revenueBrl: number;
  lastSeen: string | null;
};

const norm = (s: string | null | undefined) => (s || "").toString().trim().toLowerCase();
const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

export function IntegrationHotmartPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { operation } = useOperation();
  const [copied, setCopied] = useState(false);
  const [hottok, setHottok] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [allowAll, setAllowAll] = useState(true);
  const [allowed, setAllowed] = useState<Set<string>>(new Set()); // set de product_name normalizados
  const [manualName, setManualName] = useState("");
  const [categories, setCategories] = useState<CategoryMap>({});


  const webhookUrl = `${SUPABASE_URL}/functions/v1/hotmart-webhook${operation?.slug ? `?op=${operation.slug}` : ""}`;

  // Config salva
  const { data: savedConfig } = useQuery({
    queryKey: ["hotmart-config", operation?.id],
    enabled: !!operation?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "hotmart_config")
        .eq("operation_id", operation!.id)
        .maybeSingle();
      return (data?.value as any) || null;
    },
  });

  useEffect(() => {
    if (!savedConfig) return;
    if (typeof savedConfig.hottok === "string") setHottok(savedConfig.hottok);
    if (typeof savedConfig.client_id === "string") setClientId(savedConfig.client_id);
    if (typeof savedConfig.client_secret === "string") setClientSecret(savedConfig.client_secret);
    const list: string[] = Array.isArray(savedConfig.allowed_products) ? savedConfig.allowed_products : [];
    if (list.length > 0) {
      setAllowAll(false);
      setAllowed(new Set(list.map(norm)));
    } else {
      setAllowAll(true);
      setAllowed(new Set());
    }
    const rawCats = (savedConfig as any).product_categories || {};
    const cats: CategoryMap = {};
    Object.entries(rawCats).forEach(([k, v]) => {
      if (ROLE_OPTIONS.includes(v as FunnelRoleOrIgnore)) cats[norm(k)] = v as FunnelRoleOrIgnore;
    });
    setCategories(cats);
  }, [savedConfig]);

  const setCategory = (key: string, role: FunnelRoleOrIgnore) => {
    setCategories((prev) => ({ ...prev, [key]: role }));
  };


  // Produtos Hotmart vistos (últimos 30 dias) — chave = product_name
  const { data: products = [], isLoading: loadingProducts, refetch: refetchProducts } = useQuery({
    queryKey: ["hotmart-products-by-name", operation?.id],
    enabled: !!operation?.id,
    queryFn: async (): Promise<ProductRow[]> => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("clickbank_audit")
        .select("product_name, item_name, amount_brl, created_at, date")
        .eq("operation_id", operation!.id)
        .eq("vendor", "hotmart")
        .eq("transaction_type", "SALE")
        .gte("date", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      const map = new Map<string, ProductRow>();
      (data || []).forEach((r: any) => {
        const display = (r.product_name || r.item_name || "").toString().trim();
        if (!display) return;
        const key = norm(display);
        const cur = map.get(key);
        const created = r.created_at || null;
        if (cur) {
          cur.sales++;
          cur.revenueBrl += Number(r.amount_brl || 0);
          if (created && (!cur.lastSeen || created > cur.lastSeen)) cur.lastSeen = created;
        } else {
          map.set(key, { key, display, sales: 1, revenueBrl: Number(r.amount_brl || 0), lastSeen: created });
        }
      });
      return Array.from(map.values()).sort((a, b) => b.revenueBrl - a.revenueBrl);
    },
  });

  // Produtos DETECTADOS mas ignorados pelo webhook (não entram em clickbank_audit)
  const { data: ignoredProducts = [], isLoading: loadingIgnored } = useQuery({
    queryKey: ["hotmart-ignored-products", operation?.id],
    enabled: !!operation?.id,
    queryFn: async (): Promise<{ key: string; display: string; events: number; lastSeen: string | null }[]> => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("integration_logs")
        .select("message, created_at")
        .eq("integration", "hotmart")
        .eq("operation_id", operation!.id)
        .like("message", "Produto fora da allowlist:%")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      const map = new Map<string, { key: string; display: string; events: number; lastSeen: string | null }>();
      (data || []).forEach((r: any) => {
        const display = String(r.message || "").replace("Produto fora da allowlist:", "").replace(/&nbsp;/g, " ").trim();
        if (!display) return;
        const key = norm(display);
        const cur = map.get(key);
        if (cur) {
          cur.events++;
          if (r.created_at && (!cur.lastSeen || r.created_at > cur.lastSeen)) cur.lastSeen = r.created_at;
        } else {
          map.set(key, { key, display, events: 1, lastSeen: r.created_at || null });
        }
      });
      return Array.from(map.values()).sort((a, b) => b.events - a.events);
    },
  });

  const undiscovered = useMemo(
    () => ignoredProducts.filter((p) => !allowed.has(p.key)),
    [ignoredProducts, allowed],
  );

  const backfillMutation = useMutation({
    mutationFn: async () => {
      if (!operation?.id) throw new Error("Nenhuma operação selecionada");
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase.functions.invoke("hotmart-backfill-manual", {
        body: { operation_id: operation.id, start_date: start, end_date: end },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Backfill disparado", description: "Recuperando vendas dos últimos 30 dias na API da Hotmart." });
      refetchProducts();
      queryClient.invalidateQueries({ queryKey: ["dashboard-totals"] });
      queryClient.invalidateQueries({ queryKey: ["live-sales"] });
    },
    onError: (e: any) => toast({ title: "Erro no backfill", description: e.message, variant: "destructive" }),
  });

  const copyUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({ title: "URL copiada!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const toggle = (key: string) => {
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addManual = () => {
    const v = manualName.trim();
    if (!v) return;
    setAllowed((prev) => new Set(prev).add(norm(v)));
    setManualName("");
    setAllowAll(false);
  };

  const selectedCount = allowed.size;

  // Preview de verificação: quantas vendas dos últimos 30d seriam mantidas vs ignoradas
  const verification = useMemo(() => {
    if (allowAll) {
      const total = products.reduce((s, p) => s + p.sales, 0);
      const rev = products.reduce((s, p) => s + p.revenueBrl, 0);
      return { keptSales: total, keptRev: rev, dropSales: 0, dropRev: 0, kept: products, dropped: [] as ProductRow[] };
    }
    let keptSales = 0, keptRev = 0, dropSales = 0, dropRev = 0;
    const kept: ProductRow[] = [];
    const dropped: ProductRow[] = [];
    for (const p of products) {
      if (allowed.has(p.key)) {
        keptSales += p.sales; keptRev += p.revenueBrl; kept.push(p);
      } else {
        dropSales += p.sales; dropRev += p.revenueBrl; dropped.push(p);
      }
    }
    return { keptSales, keptRev, dropSales, dropRev, kept, dropped };
  }, [products, allowed, allowAll]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!operation?.id) throw new Error("Nenhuma operação selecionada");
      const allowedList = allowAll ? [] : Array.from(allowed);
      const existingHottok = (savedConfig as any)?.hottok || "";
      const existingClientId = (savedConfig as any)?.client_id || "";
      const existingClientSecret = (savedConfig as any)?.client_secret || "";
      
      const finalHottok = hottok.trim() || existingHottok;
      const finalClientId = clientId.trim() || existingClientId;
      const finalClientSecret = clientSecret.trim() || existingClientSecret;

      if (!finalHottok) throw new Error("Informe o HOTTOK antes de salvar");
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          {
            key: "hotmart_config",
            operation_id: operation.id,
            value: JSON.parse(
              JSON.stringify({
                hottok: finalHottok,
                client_id: finalClientId,
                client_secret: finalClientSecret,
                allowed_products: allowedList,
                product_categories: categories,
                configured_at: new Date().toISOString(),
              }),
            ),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key,operation_id" },
        );
      if (error) throw error;
      await supabase.from("integration_logs").insert({
        integration: "hotmart",
        status: "success",
        message: `Hotmart config salva — ${allowAll ? "todos" : `${allowedList.length} produto(s)`}`,
        operation_id: operation.id,
      });
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-logs"] });
      queryClient.invalidateQueries({ queryKey: ["hotmart-config", operation?.id] });
      queryClient.invalidateQueries({ queryKey: ["hotmart-allowlist", operation?.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-totals"] });
      queryClient.invalidateQueries({ queryKey: ["live-sales"] });
      queryClient.invalidateQueries({ queryKey: ["hotmart-products-by-name", operation?.id] });
      queryClient.invalidateQueries({ queryKey: ["hotmart-categories", operation?.id] });
      queryClient.invalidateQueries({ queryKey: ["funnel-conversion-sales", operation?.id] });
      toast({ title: "Configuração salva!" });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    },
  });


  // Purge: remove do banco vendas Hotmart de produtos fora da allowlist (últimos 90d)
  const purgeMutation = useMutation({
    mutationFn: async () => {
      if (!operation?.id) throw new Error("Nenhuma operação selecionada");
      if (allowAll) throw new Error("Ative uma lista específica antes de limpar");
      const droppedDisplays = verification.dropped.map((p) => p.display);
      if (droppedDisplays.length === 0) return { deleted: 0 };
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("clickbank_audit")
        .delete()
        .eq("operation_id", operation.id)
        .eq("vendor", "hotmart")
        .gte("date", since)
        .in("product_name", droppedDisplays)
        .select("id");
      if (error) throw error;
      return { deleted: (data || []).length };
    },
    onSuccess: ({ deleted }) => {
      toast({ title: `Limpeza concluída`, description: `${deleted} venda(s) removida(s) do histórico.` });
      refetchProducts();
      queryClient.invalidateQueries({ queryKey: ["dashboard-totals"] });
      queryClient.invalidateQueries({ queryKey: ["live-sales"] });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao limpar", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Configurar Postback 2.0</h3>
        <p className="text-xs text-muted-foreground">
          Cole esta URL no painel da Hotmart em{" "}
          <span className="font-medium text-foreground">Ferramentas → Webhook/Postback</span> e ative os eventos{" "}
          <span className="font-medium text-foreground">Compra Aprovada</span> e{" "}
          <span className="font-medium text-foreground">Reembolso/Chargeback</span>.
        </p>
      </div>

      <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2">
        <p className="text-xs font-medium text-foreground">Onde configurar:</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Acesse <span className="font-medium text-foreground">app.hotmart.com</span></li>
          <li>Vá em <span className="font-medium text-foreground">Ferramentas → Webhook (Postback)</span></li>
          <li>Clique em <span className="font-medium text-foreground">Cadastrar novo Postback</span></li>
          <li>Cole a URL abaixo no campo "URL"</li>
          <li>Selecione: <span className="font-medium text-foreground">Compra Aprovada</span>,{" "}
            <span className="font-medium text-foreground">Compra Reembolsada</span> e{" "}
            <span className="font-medium text-foreground">Chargeback</span>
          </li>
          <li>Copie o <span className="font-medium text-foreground">HOTTOK</span> gerado e cole no campo abaixo</li>
          <li>Escolha quais produtos alimentam o dash (por <span className="font-medium">nome</span>) e clique em "Salvar e ativar"</li>
        </ol>
      </div>

      <div>
        <Label className="text-xs">Webhook URL (cole na Hotmart)</Label>
        <div className="flex gap-2 mt-1">
          <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted/30" />
          <Button variant="outline" size="sm" onClick={copyUrl} className="shrink-0 gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">HOTTOK (token de segurança)</Label>
          <Input
            value={hottok}
            onChange={(e) => setHottok(e.target.value)}
            placeholder="Cole o HOTTOK da Hotmart"
            className="mt-1 text-sm"
            type="password"
          />
        </div>
        <div>
          <Label className="text-xs">Client ID (API Hotmart)</Label>
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Cole o Client ID da Hotmart"
            className="mt-1 text-sm"
            type="password"
          />
        </div>
        <div>
          <Label className="text-xs">Client Secret (API Hotmart)</Label>
          <Input
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Cole o Client Secret da Hotmart"
            className="mt-1 text-sm"
            type="password"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        O HOTTOK valida os webhooks. O Client ID/Secret permite que o sistema recupere vendas perdidas automaticamente via API.
      </p>

      {/* === Status de sincronização === */}
      <HotmartStatusPanel />

      {/* === Seletor de produtos POR NOME === */}
      <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" /> Produtos que alimentam o dash
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Filtro por <span className="font-medium">nome do produto</span> (case-insensitive). A Hotmart envia
              todos os produtos da conta; só os selecionados entram em vendas, faturamento e Vendas Live.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer shrink-0">
            <Checkbox
              checked={allowAll}
              onCheckedChange={(v) => {
                const on = v === true;
                setAllowAll(on);
                if (on) setAllowed(new Set());
              }}
            />
            <span className="font-medium">Aceitar todos</span>
          </label>
        </div>

        {!allowAll && (
          <>
            <div className="max-h-72 overflow-y-auto rounded border border-border/50 divide-y divide-border/50 bg-background/40">
              {loadingProducts && (
                <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando produtos vistos (últimos 30d)...
                </div>
              )}
              {!loadingProducts && products.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">
                  Nenhum produto Hotmart recebido ainda. Adicione manualmente pelo nome abaixo.
                </div>
              )}
              {products.map((p) => {
                const checked = allowed.has(p.key);
                const role = categories[p.key];
                return (
                  <div
                    key={p.key}
                    className="flex items-center gap-3 p-2.5 text-xs hover:bg-muted/30"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(p.key)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.display}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {p.sales} venda{p.sales > 1 ? "s" : ""} · {fmtBRL(p.revenueBrl)} nos últimos 30d
                      </div>
                    </div>
                    {checked && (
                      <Select value={role || ""} onValueChange={(v) => setCategory(p.key, v as FunnelRoleOrIgnore)}>
                        <SelectTrigger className="h-7 w-[130px] text-[11px] shrink-0">
                          <SelectValue placeholder="Categoria…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                              {ROLE_LABEL_FULL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {checked ? (
                      <Badge className="text-[10px] shrink-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                        permitido
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
                        ignorado
                      </Badge>
                    )}
                  </div>
                );
              })}
              {Array.from(allowed)
                .filter((k) => !products.some((p) => p.key === k))
                .map((k) => {
                  const role = categories[k];
                  return (
                    <div key={k} className="flex items-center gap-3 p-2.5 text-xs">
                      <Checkbox checked onCheckedChange={() => toggle(k)} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{k}</div>
                        <div className="text-[10px] text-muted-foreground truncate">adicionado manualmente</div>
                      </div>
                      <Select value={role || ""} onValueChange={(v) => setCategory(k, v as FunnelRoleOrIgnore)}>
                        <SelectTrigger className="h-7 w-[130px] text-[11px] shrink-0">
                          <SelectValue placeholder="Categoria…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                              {ROLE_LABEL_FULL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Badge variant="outline" className="text-[10px] shrink-0">manual</Badge>
                    </div>
                  );
                })}
            </div>

            <div className="flex gap-2">
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Adicionar nome de produto manualmente (ex: Escola do Dólar)"
                className="text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManual();
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={addManual} disabled={!manualName.trim()}>
                Adicionar
              </Button>
            </div>

            {/* === Descoberta: produtos recebidos mas NÃO configurados === */}
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Detectados fora da lista (30d) — {undiscovered.length} produto(s)
                </div>
                {undiscovered.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() =>
                      setAllowed((prev) => {
                        const next = new Set(prev);
                        undiscovered.forEach((p) => next.add(p.key));
                        return next;
                      })
                    }
                  >
                    Selecionar todos
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Eventos que chegaram no webhook e foram ignorados por não estarem configurados. Marque os que devem
                alimentar o dash, salve e use "Recuperar vendas" para puxar o faturamento retroativo.
              </p>
              {loadingIgnored && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Procurando produtos ignorados...
                </div>
              )}
              {!loadingIgnored && undiscovered.length === 0 && (
                <div className="text-[11px] text-emerald-600 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Nenhum produto ignorado nos últimos 30 dias.
                </div>
              )}
              <div className="max-h-56 overflow-y-auto divide-y divide-border/40">
                {undiscovered.map((p) => (
                  <div key={p.key} className="flex items-center gap-3 p-2 text-xs">
                    <Checkbox checked={false} onCheckedChange={() => toggle(p.key)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.display}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.events} evento{p.events > 1 ? "s" : ""} ignorado{p.events > 1 ? "s" : ""}
                        {p.lastSeen ? ` · último em ${new Date(p.lastSeen).toLocaleDateString("pt-BR")}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 text-amber-500 border-amber-500/40">
                      não configurado
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">
                {selectedCount} produto(s) selecionado(s). Vendas fora da lista são ignoradas no webhook e ocultadas em
                Vendas Live automaticamente.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1.5 shrink-0"
                onClick={() => backfillMutation.mutate()}
                disabled={backfillMutation.isPending}
              >
                {backfillMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Package className="h-3 w-3" />
                )}
                Recuperar vendas (30d)
              </Button>
            </div>
          </>
        )}
      </div>

      {/* === Verificação (últimos 30 dias) === */}
      <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <p className="text-sm font-semibold text-foreground">Verificação — últimos 30 dias</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2.5">
            <div className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider">Permitidos</div>
            <div className="text-lg font-bold">{verification.keptSales}</div>
            <div className="text-[10px] text-muted-foreground">{fmtBRL(verification.keptRev)}</div>
          </div>
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5">
            <div className="text-[10px] text-amber-500 font-semibold uppercase tracking-wider">Ignorados</div>
            <div className="text-lg font-bold">{verification.dropSales}</div>
            <div className="text-[10px] text-muted-foreground">{fmtBRL(verification.dropRev)}</div>
          </div>
        </div>

        {verification.dropped.length > 0 && (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
              <ShieldAlert className="h-3.5 w-3.5" />
              {verification.dropped.length} produto(s) fora da lista ainda no histórico
            </div>
            <ul className="text-[11px] space-y-1 max-h-40 overflow-y-auto">
              {verification.dropped.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.display}</span>
                  <span className="text-muted-foreground shrink-0 font-mono">
                    {p.sales} · {fmtBRL(p.revenueBrl)}
                  </span>
                </li>
              ))}
            </ul>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                  disabled={allowAll}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover {verification.dropped.length} produto(s) fora da lista (90d)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover vendas fora da lista?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Vou apagar do histórico (últimos 90 dias) todas as vendas Hotmart cujo{" "}
                    <span className="font-medium">nome do produto</span> não está na sua lista permitida. Isso corrige
                    faturamento, Vendas Live e dashboards imediatamente. Ação irreversível.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => purgeMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {purgeMutation.isPending ? "Removendo..." : "Sim, limpar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {verification.dropped.length === 0 && !allowAll && (
          <div className="text-[11px] text-emerald-600 flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> Histórico limpo — nenhum produto fora da lista nos últimos 30d.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <a
          href="https://app.hotmart.com/tools/webhook"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary flex items-center gap-1 hover:underline"
        >
          Abrir Hotmart <ExternalLink className="h-3 w-3" />
        </a>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={
            saveMutation.isPending ||
            (!hottok.trim() && !(savedConfig as any)?.hottok) ||
            (!allowAll && allowed.size === 0)
          }
          className="gap-1.5"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4" /> Salvar e ativar
            </>
          )}
        </Button>
      </div>

      {saveMutation.isSuccess && (
        <Badge className="bg-[hsl(var(--warroom-positive))]/10 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30 text-xs gap-1">
          <Check className="h-3 w-3" /> Hotmart configurado com sucesso
        </Badge>
      )}
    </div>
  );
}
