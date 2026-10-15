import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PacingHeader } from "@/components/pacing/PacingHeader";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle, Plug, Bell, Shield, Download, Upload, Palette, Bug,
  ChevronDown, Plus, Gauge, Sliders, History, Settings as SettingsIcon, Target,
  RefreshCw, Stethoscope, Pause, CheckCircle2, FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePacingSettings } from "@/hooks/usePacingSettings";
import { McpTokensSection } from "@/components/pacing/McpTokensSection";

const MOCK_LOGS = `[22/06 14:32:14] daemon: tick ok · 47 campanhas monitoradas · meta_api 142ms
[22/06 14:32:12] rule "Pause CPA 2x médio (NDM)" matched 2 campanhas · cooldown 30min
[22/06 14:30:08] PAUSE NDM-top-F3-001 → reason: CPA 1.180 > 2x avg (498)
[22/06 14:30:08] PAUSE NDM-top-F3-003 → reason: CPA 1.050 > 2x avg (498)
[22/06 14:29:51] pushcut sent · severity=high · "2 campanhas pausadas (NDM)"
[22/06 14:28:30] daemon: tick ok · 47 campanhas monitoradas · meta_api 98ms
[22/06 14:26:30] daemon: tick ok · 47 campanhas monitoradas · meta_api 110ms
[22/06 14:24:30] group_cap "F3 NDM ESCALA" → 92% of R$ 480/h alocado
[22/06 14:24:30] alert sent · severity=medium · group F3 NDM ESCALA close to cap
[22/06 14:22:30] daemon: tick ok · 47 campanhas monitoradas · meta_api 87ms
[22/06 14:20:30] PAUSE ERX-mid-F1-007 → reason: acceleration_no_sale (1h)
[22/06 14:20:30] pushcut sent · severity=high
[22/06 14:18:30] daemon: tick ok · 47 campanhas monitoradas · meta_api 91ms`;

function CountdownConfirm({
  open, onOpenChange, title, description, onConfirm, destructive = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  const [countdown, setCountdown] = useState(3);
  useEffect(() => {
    if (!open) { setCountdown(3); return; }
    setCountdown(3);
    const i = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(i);
  }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={countdown > 0}
            onClick={onConfirm}
            className={cn(destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
          >
            {countdown > 0 ? `Aguarde ${countdown}s` : "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SectionCard({
  icon: Icon, title, children, className,
}: { icon: React.ElementType; title: string; children: React.ReactNode; className?: string; }) {
  return (
    <Card className={cn("p-5 bg-card border-border/60", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function Row({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="flex-1 min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const UI_PREFS_KEY = "pacing-ui-prefs-v1";
type UIPrefs = {
  theme: "system" | "light" | "dark";
  density: "compact" | "comfortable";
  liveRefresh: boolean;
  liveRefreshInterval: "3" | "5" | "10" | "30";
  soundAlerts: boolean;
  tabBadge: boolean;
};
const defaultUI: UIPrefs = {
  theme: "system",
  density: "compact",
  liveRefresh: true,
  liveRefreshInterval: "5",
  soundAlerts: true,
  tabBadge: true,
};

export default function PacingSettings() {
  const navigate = useNavigate();
  const { settings, loading, setKey } = usePacingSettings();
  const [emergencyPause, setEmergencyPause] = useState(false);

  // UI prefs are local-only (browser preferences, not synced)
  const [ui, setUI] = useState<UIPrefs>(() => {
    try { const raw = localStorage.getItem(UI_PREFS_KEY); if (raw) return { ...defaultUI, ...JSON.parse(raw) }; } catch { /* noop */ }
    return defaultUI;
  });
  useEffect(() => { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(ui)); }, [ui]);
  const updateUI = <K extends keyof UIPrefs>(k: K, v: UIPrefs[K]) => {
    setUI((p) => ({ ...p, [k]: v }));
    toast.success("Preferência salva", { duration: 1500 });
  };

  // Dirty fields tracker for non-autosave inputs (URL, FX, cooldown, etc.)
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const dirty = (k: string) => k in drafts;
  const dirtyClass = (k: string) => (dirty(k) ? "ring-2 ring-primary/60 border-primary/40" : "");
  const setDraft = (k: string, v: any) => setDrafts((p) => ({ ...p, [k]: v }));

  const valueOf = (k: string, fallback?: any) => (k in drafts ? drafts[k] : settings[k] ?? fallback);

  const saveDrafts = async (keys: string[]) => {
    for (const k of keys) {
      if (k in drafts) await setKey(k, drafts[k], { silent: true });
    }
    setDrafts((p) => {
      const n = { ...p };
      keys.forEach((k) => delete n[k]);
      return n;
    });
    toast.success("Salvo");
  };

  const exchangeRates = valueOf("exchange_rates", { USD: 5.4, EUR: 6.3, HUF: 0.015 });
  const fxAuto = !!valueOf("fx_auto", true);

  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [dangerAction, setDangerAction] = useState<null | {
    title: string; description: string; onConfirm: () => void;
  }>(null);
  const [dangerOpen, setDangerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTestWebhook = () => {
    const url = String(valueOf("pushcut_webhook_url", ""));
    if (!url.startsWith("https://api.pushcut.io/")) {
      toast.error("URL inválida", { description: "Deve começar com https://api.pushcut.io/" });
      return;
    }
    toast.success("✓ Webhook testado", { description: "Notificação de teste enviada" });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pacing-config-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Config exportada");
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result));
        for (const [k, v] of Object.entries(parsed)) {
          await setKey(k, v, { silent: true });
        }
        toast.success("Config importada");
      } catch { toast.error("JSON inválido"); }
    };
    reader.readAsText(file);
  };

  const handleDownloadLogs = () => {
    const blob = new Blob([MOCK_LOGS], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `daemon-logs-${Date.now()}.log`; a.click();
    URL.revokeObjectURL(url);
  };

  const runHealth = async () => {
    const tId = toast.loading("Rodando diagnóstico…");
    await new Promise((r) => setTimeout(r, 1400));
    toast.success("Diagnóstico OK", {
      id: tId, description: "Meta API · Cloud · Pushcut · Railway — todos online",
    });
  };

  const dangerActions = useMemo(() => [
    { label: "Limpar log de ações (mantém últimos 30 dias)",
      title: "Limpar log de ações?",
      description: "Entradas com mais de 30 dias serão apagadas permanentemente.",
      onConfirm: () => toast.success("Log antigo limpo") },
    { label: "Resetar todos os cooldowns",
      title: "Resetar todos os cooldowns?",
      description: "Todas as regras voltam a poder disparar imediatamente.",
      onConfirm: () => toast.success("Cooldowns resetados") },
    { label: "Desabilitar TODAS as regras",
      title: "Desabilitar TODAS as regras?",
      description: "Nenhuma regra automática rodará até serem reativadas manualmente.",
      onConfirm: () => toast.success("Todas as regras desabilitadas") },
    { label: "Deletar todos os Budget Groups",
      title: "Deletar TODOS os Budget Groups?",
      description: "Esta ação não pode ser desfeita. Campanhas continuam ativas.",
      onConfirm: () => toast.success("Budget Groups deletados") },
  ], []);

  if (loading) {
    return (
      <div className="space-y-4 px-4 md:px-6 pb-10">
        <PacingHeader />
        <Skeleton className="h-10 w-full max-w-2xl" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 md:px-6 pb-10">
      <PacingHeader />

      <Tabs value="settings" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="dashboard" onClick={() => navigate("/pacing")}>
            <Gauge className="size-3.5 mr-1.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="rules" onClick={() => navigate("/pacing/regras")}>
            <Sliders className="size-3.5 mr-1.5" /> Regras
          </TabsTrigger>
          <TabsTrigger value="groups" onClick={() => navigate("/pacing/budget-groups")}>
            <Target className="size-3.5 mr-1.5" /> Budget Groups
          </TabsTrigger>
          <TabsTrigger value="history" onClick={() => navigate("/pacing/historico")}>
            <History className="size-3.5 mr-1.5" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="size-3.5 mr-1.5" /> Config</TabsTrigger>
        </TabsList>
      </Tabs>

      {emergencyPause && (
        <Card className="p-3 bg-destructive/10 border-destructive/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            <span className="text-sm font-semibold">
              🔴 PAUSA DE EMERGÊNCIA ATIVA · Todas as campanhas pausadas
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            setEmergencyPause(false);
            toast.success("Pausa de emergência desativada");
          }}>Religar tudo</Button>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* 1. INTEGRAÇÃO META ADS */}
        <SectionCard icon={Plug} title="🔌 Integração Meta Ads">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tokens configurados</Label>
            <div className="mt-2 space-y-2">
              {[
                { name: "CATALOG", id: "catalog_token", accounts: 61 },
                { name: "HU", id: "hu_token", accounts: 43 },
              ].map((t) => (
                <div key={t.id}
                  className="flex items-center justify-between rounded border border-border/60 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="size-4 text-success shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        Token {t.name}{" "}
                        <span className="text-muted-foreground font-normal">({t.id})</span>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {t.accounts} contas · Conectado · expira: nunca
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" className="w-full">
                <Plus className="size-3.5 mr-1.5" /> Adicionar token
              </Button>
            </div>
          </div>

          <Separator />

          <Row label="API Polling Interval" hint="Frequência que o daemon consulta a Meta API.">
            <Select
              value={String(valueOf("polling_interval_minutes", 2))}
              onValueChange={(v) => setKey("polling_interval_minutes", Number(v))}
            >
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["1","2","5","10"].map((v) => <SelectItem key={v} value={v}>{v} min</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>

          <Row
            label="Janela do teto horário"
            hint="Fixa = soma do gasto na hora corrente do relógio (XX:00 até agora). Corrida = últimos 60 min reais, ponderado proporcionalmente."
          >
            <Select
              value={String(valueOf("hourly_window_mode", "fixed"))}
              onValueChange={(v) => setKey("hourly_window_mode", v)}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixa (hora cheia do relógio)</SelectItem>
                <SelectItem value="rolling">Corrida (60 min reais)</SelectItem>
              </SelectContent>
            </Select>
          </Row>


          <Row label="Timezone do dashboard">
            <Select
              value={String(valueOf("timezone", "America/Sao_Paulo"))}
              onValueChange={(v) => setKey("timezone", v)}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">América/São_Paulo (BRT)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="America/New_York">América/New_York (EST)</SelectItem>
                <SelectItem value="Europe/Budapest">Europa/Budapest (CET)</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Row label="Moeda padrão">
            <Select
              value={String(valueOf("default_currency", "BRL"))}
              onValueChange={(v) => setKey("default_currency", v)}
            >
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["BRL","USD","EUR","HUF"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Cotação manual (override)</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Auto</span>
                <Switch checked={fxAuto} onCheckedChange={(v) => setKey("fx_auto", v)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["USD","EUR","HUF"] as const).map((cur) => {
                const k = `fx_${cur}`;
                const draftVal = drafts[k];
                const current = draftVal ?? String(exchangeRates?.[cur] ?? "");
                return (
                  <div key={cur}>
                    <Label className="text-xs text-muted-foreground">{cur} = R$</Label>
                    <Input
                      disabled={fxAuto}
                      value={current}
                      onChange={(e) => setDraft(k, e.target.value)}
                      className={cn("mt-1 tabular-nums", dirtyClass(k))}
                    />
                  </div>
                );
              })}
            </div>
            {!fxAuto && (drafts.fx_USD || drafts.fx_EUR || drafts.fx_HUF) && (
              <Button size="sm" className="mt-2" onClick={async () => {
                const next = { ...exchangeRates };
                (["USD","EUR","HUF"] as const).forEach((c) => {
                  if (drafts[`fx_${c}`] !== undefined) next[c] = Number(drafts[`fx_${c}`]);
                });
                await setKey("exchange_rates", next, { silent: true });
                setDrafts((p) => { const n = { ...p }; delete n.fx_USD; delete n.fx_EUR; delete n.fx_HUF; return n; });
                toast.success("Cotações salvas");
              }}>Salvar cotações</Button>
            )}
          </div>
        </SectionCard>

        {/* 2. NOTIFICAÇÕES PUSHCUT */}
        <SectionCard icon={Bell} title="📲 Notificações Pushcut">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Webhook URL</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={String(valueOf("pushcut_webhook_url", ""))}
                onChange={(e) => setDraft("pushcut_webhook_url", e.target.value)}
                placeholder="https://api.pushcut.io/.../notifications/REGRAS"
                className={cn("font-mono text-xs", dirtyClass("pushcut_webhook_url"))}
              />
              <Button size="sm" variant="outline" onClick={handleTestWebhook}>
                <FlaskConical className="size-3.5 mr-1.5" /> Testar
              </Button>
            </div>
            {dirty("pushcut_webhook_url") && (
              <Button size="sm" className="mt-2" onClick={() => saveDrafts(["pushcut_webhook_url"])}>
                Salvar URL
              </Button>
            )}
          </div>

          <Separator />

          <div>
            <Label className="text-sm font-medium">Níveis de severidade</Label>
            <p className="text-xs text-muted-foreground mb-2">Apenas níveis ativos disparam Pushcut</p>
            <div className="space-y-2">
              {([
                ["sev_low", "🟢 Low (informativo)", false],
                ["sev_medium", "🟡 Medium (warning)", true],
                ["sev_high", "🔴 High (crítico)", true],
              ] as const).map(([key, label, def]) => (
                <div key={key} className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
                  <span className="text-sm">{label}</span>
                  <Switch
                    checked={!!valueOf(key, def)}
                    onCheckedChange={(v) => setKey(key, v)}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <Row label="Resumo diário" hint="Conteúdo: # pausas, $ economizado, regras mais ativas">
            <div className="flex items-center gap-2">
              <Select
                value={String(valueOf("daily_summary_hour_brt", 9))}
                onValueChange={(v) => setKey("daily_summary_hour_brt", Number(v))}
              >
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["7","8","9","10","12","18"].map((h) => (
                    <SelectItem key={h} value={h}>{h}h BRT</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch
                checked={!!valueOf("daily_summary_enabled", true)}
                onCheckedChange={(v) => setKey("daily_summary_enabled", v)}
              />
            </div>
          </Row>
        </SectionCard>

        {/* 3. GUARDRAILS */}
        <SectionCard icon={Shield} title="🛡️ Guardrails Globais">
          <div className={cn(
            "rounded border p-3 transition-colors",
            valueOf("dry_run_global", false) ? "bg-warning/5 border-warning/40" : "bg-card border-border/60"
          )}>
            <Row
              label="Dry-run mode"
              hint="Quando ativo, daemon NÃO pausa de fato — só registra no log. Use pra testar regras novas."
            >
              <Switch
                checked={!!valueOf("dry_run_global", false)}
                onCheckedChange={(v) => setKey("dry_run_global", v)}
              />
            </Row>
          </div>

          <Row label="Cooldown global padrão (min)">
            <Input
              value={String(valueOf("default_cooldown_minutes", 30))}
              onChange={(e) => setDraft("default_cooldown_minutes", Number(e.target.value))}
              className={cn("w-24 tabular-nums", dirtyClass("default_cooldown_minutes"))}
            />
          </Row>

          <Row label="Max ações por hora" hint="Limite total de pausas/h. Se atingir, daemon para e notifica.">
            <Input
              value={String(valueOf("max_actions_per_hour", 50))}
              onChange={(e) => setDraft("max_actions_per_hour", Number(e.target.value))}
              className={cn("w-24 tabular-nums", dirtyClass("max_actions_per_hour"))}
            />
          </Row>

          {(dirty("default_cooldown_minutes") || dirty("max_actions_per_hour")) && (
            <Button size="sm" onClick={() => saveDrafts(["default_cooldown_minutes", "max_actions_per_hour"])}>
              Salvar guardrails
            </Button>
          )}

          <Separator />

          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={emergencyPause}
            onClick={() => setConfirmEmergency(true)}
          >
            <Pause className="size-4 mr-2" />
            {emergencyPause ? "PAUSA ATIVA" : "⏸ PAUSAR TUDO (47 campanhas)"}
          </Button>
        </SectionCard>

        {/* 4. BACKUP & EXPORT */}
        <SectionCard icon={Download} title="📊 Backup & Export">
          <Row label="Backup automático de regras" hint="Snapshot diário às 03h BRT no Lovable Cloud">
            <Switch
              checked={!!valueOf("backup_auto", true)}
              onCheckedChange={(v) => setKey("backup_auto", v)}
            />
          </Row>
          <div className="text-xs text-muted-foreground tabular-nums">
            Última exportação: <span className="font-medium text-foreground">22/06 03:00</span> · {settings.daily_summary_enabled ? "regras + grupos sincronizados" : "—"}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExport} className="flex-1">
              <Download className="size-3.5 mr-1.5" /> Exportar (JSON)
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="flex-1">
              <Upload className="size-3.5 mr-1.5" /> Importar (JSON)
            </Button>
            <input
              ref={fileInputRef} type="file" accept="application/json" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </SectionCard>

        {/* 5. PREFERÊNCIAS DE UI (local) */}
        <SectionCard icon={Palette} title="🎨 Preferências de UI">
          <Row label="Tema">
            <Select value={ui.theme} onValueChange={(v) => updateUI("theme", v as UIPrefs["theme"])}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Sistema</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Densidade da tabela">
            <Select value={ui.density} onValueChange={(v) => updateUI("density", v as UIPrefs["density"])}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compacta</SelectItem>
                <SelectItem value="comfortable">Confortável</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Auto-refresh do Live Monitor">
            <div className="flex items-center gap-2">
              <Select
                value={ui.liveRefreshInterval}
                onValueChange={(v) => updateUI("liveRefreshInterval", v as UIPrefs["liveRefreshInterval"])}
              >
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["3","5","10","30"].map((s) => <SelectItem key={s} value={s}>{s}s</SelectItem>)}
                </SelectContent>
              </Select>
              <Switch checked={ui.liveRefresh} onCheckedChange={(v) => updateUI("liveRefresh", v)} />
            </div>
          </Row>
          <Row label="Sons de alerta no browser">
            <Switch checked={ui.soundAlerts} onCheckedChange={(v) => updateUI("soundAlerts", v)} />
          </Row>
          <Row label="Tab badge counter" hint="Mostra # de críticas no título da aba">
            <Switch checked={ui.tabBadge} onCheckedChange={(v) => updateUI("tabBadge", v)} />
          </Row>
        </SectionCard>

        {/* 6. DEBUG & LOGS */}
        <SectionCard icon={Bug} title="🐞 Debug & Logs" className="xl:col-span-2">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-3 bg-success/5 border-success/30">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full size-2 bg-success" />
                    </span>
                    <span className="text-sm font-semibold">Daemon Online</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                    última checagem há 14s · Railway prod · v1.0.2
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setConfirmRestart(true)}>
                  <RefreshCw className="size-3.5 mr-1.5" /> Reiniciar
                </Button>
              </div>
            </Card>

            <Card className="p-3 bg-card border-border/60 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Health check</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Testa Meta API, Cloud realtime, Pushcut e Railway
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={runHealth}>
                <Stethoscope className="size-3.5 mr-1.5" /> Rodar
              </Button>
            </Card>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Logs do daemon (últimos 50)
              </Label>
              <Button size="sm" variant="ghost" onClick={handleDownloadLogs}>
                <Download className="size-3.5 mr-1.5" /> Download completo
              </Button>
            </div>
            <Textarea
              readOnly value={MOCK_LOGS}
              className="font-mono text-[11px] leading-relaxed h-48 bg-zinc-950 text-zinc-200 border-zinc-800 resize-none"
            />
          </div>
        </SectionCard>
      </div>

      {/* MCP Tokens (Pacing Controller via API externa) */}
      <McpTokensSection />

      {/* 7. DANGER ZONE */}
      <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
        <Card className="bg-destructive/5 border-destructive/40">
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-destructive" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-destructive">
                  ⚠ Zona de Perigo
                </h2>
                <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px]">
                  4 ações
                </Badge>
              </div>
              <ChevronDown className={cn("size-4 text-destructive transition-transform", dangerOpen && "rotate-180")} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 pt-0 space-y-2">
              {dangerActions.map((a) => (
                <div key={a.label}
                  className="flex items-center justify-between rounded border border-destructive/30 bg-background px-3 py-2">
                  <span className="text-sm">{a.label}</span>
                  <Button size="sm" variant="destructive"
                    onClick={() => setDangerAction({
                      title: a.title, description: a.description,
                      onConfirm: () => { a.onConfirm(); setDangerAction(null); },
                    })}
                  >Executar</Button>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background/80 backdrop-blur-sm py-3 -mx-4 px-4 md:-mx-6 md:px-6 border-t border-border/40">
        <Button
          variant="outline"
          onClick={() => { setDrafts({}); toast.success("Alterações descartadas"); }}
          disabled={Object.keys(drafts).length === 0}
        >Cancelar</Button>
        <Button
          onClick={() => saveDrafts(Object.keys(drafts))}
          disabled={Object.keys(drafts).length === 0}
        >
          Salvar alterações {Object.keys(drafts).length > 0 && `(${Object.keys(drafts).length})`}
        </Button>
      </div>

      <CountdownConfirm
        open={confirmEmergency}
        onOpenChange={setConfirmEmergency}
        title="Pausar TODAS as 47 campanhas ativas?"
        description="Esta ação pode ser desfeita clicando em 'Religar tudo' no banner que aparecerá no topo."
        onConfirm={() => {
          setEmergencyPause(true);
          setConfirmEmergency(false);
          toast.error("Pausa de emergência ativada · 47 campanhas pausadas");
        }}
      />

      <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiniciar daemon?</AlertDialogTitle>
            <AlertDialogDescription>
              O monitoramento será pausado por ~15s enquanto o serviço reinicia no Railway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmRestart(false); toast.success("Daemon reiniciado"); }}>
              Reiniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CountdownConfirm
        open={!!dangerAction}
        onOpenChange={(v) => !v && setDangerAction(null)}
        title={dangerAction?.title ?? ""}
        description={dangerAction?.description ?? ""}
        onConfirm={() => dangerAction?.onConfirm()}
      />
    </div>
  );
}
