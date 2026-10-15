import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, RotateCcw, Eye, Volume2, VolumeX, Info, Save } from "lucide-react";
import { useToastPreferences, playToastSound, resolveTemplate, type ToastPreferences, type ToastLogo, type ToastSound, type ToastAnimation } from "@/hooks/useToastPreferences";
import { SaleToastContent, LogoIcon } from "@/components/live/LiveSalesToast";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

const POSITIONS: { value: ToastPreferences["position"]; label: string }[] = [
  { value: "top-right", label: "Superior Direito" },
  { value: "top-left", label: "Superior Esquerdo" },
  { value: "top-center", label: "Superior Centro" },
  { value: "bottom-right", label: "Inferior Direito" },
  { value: "bottom-left", label: "Inferior Esquerdo" },
  { value: "bottom-center", label: "Inferior Centro" },
];

const LOGOS: { value: ToastLogo; label: string }[] = [
  { value: "gtx", label: "GTX" },
  { value: "fire", label: "Fogo" },
  { value: "dollar", label: "Dólar" },
  { value: "rocket", label: "Foguete" },
  { value: "check", label: "Check" },
  { value: "bolt", label: "Raio" },
];

const SOUNDS: { value: ToastSound; label: string }[] = [
  { value: "none", label: "Sem som" },
  { value: "cash-register", label: "Caixa Registradora" },
  { value: "coin", label: "Moeda" },
  { value: "bell", label: "Sino" },
  { value: "success", label: "Sucesso" },
  { value: "chime", label: "Chime" },
];

const ANIMATIONS: { value: ToastAnimation; label: string; desc: string }[] = [
  { value: "default", label: "Padrão", desc: "Animação nativa do Sonner" },
  { value: "slide-up", label: "Slide Up", desc: "Desliza de baixo para cima" },
  { value: "slide-right", label: "Slide Right", desc: "Desliza da esquerda" },
  { value: "fade", label: "Fade", desc: "Aparece suavemente" },
  { value: "bounce", label: "Bounce", desc: "Efeito elástico" },
  { value: "scale", label: "Scale", desc: "Cresce do centro" },
];

const BG_COLORS = [
  { value: "#1c1c1e", label: "Escuro" },
  { value: "#2d2d30", label: "Cinza" },
  { value: "#1a2332", label: "Azul Escuro" },
  { value: "#1a2e1a", label: "Verde Escuro" },
  { value: "#2e1a1a", label: "Vermelho Escuro" },
  { value: "#2e2a1a", label: "Dourado Escuro" },
  { value: "#ffffff", label: "Branco" },
  { value: "#f5f5f5", label: "Claro" },
];

const AVAILABLE_VARS = [
  { tag: "{{projeto}}", desc: "Nome do projeto (ex: Neurodyne)" },
  { tag: "{{sigla}}", desc: "Sigla do produto (ex: NDM, LDR)" },
  { tag: "{{produto}}", desc: "Nome do produto original" },
  { tag: "{{valor}}", desc: "Valor formatado (ex: R$ 500,00)" },
  { tag: "{{contador}}", desc: "Nº da venda do dia (ex: 07)" },
  { tag: "{{flag}}", desc: "Bandeira do país (🇧🇷 ou 🇺🇸)" },
];

const PREVIEW_VARS: Record<string, string> = {
  projeto: "GTX Mídia",
  sigla: "NDM",
  produto: "Neurodyne Max",
  valor: "R$ 500,00",
  contador: "07",
  flag: "🇧🇷",
};

export function LiveToastSettings() {
  const { prefs, update, reset } = useToastPreferences();
  const [previewProject, setPreviewProject] = useState(prefs.previewProject || "GTX Mídia");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewVars = { ...PREVIEW_VARS, projeto: previewProject };
  const previewTitle = resolveTemplate(prefs.titleTemplate, previewVars);
  const previewSubtitle = resolveTemplate(prefs.subtitleTemplate, previewVars);

  const handlePreview = () => {
    if (prefs.soundEnabled) {
      playToastSound(prefs.sound);
    }
    toast.custom(
      () => (
        <SaleToastContent
          titleLine={previewTitle}
          subtitleLine={previewSubtitle}
          logo={prefs.logo}
          bgColor={prefs.bgColor}
          textColor={prefs.textColor}
          customLogoUrl={prefs.customLogoUrl}
          animation={prefs.animation}
        />
      ),
      {
        duration: prefs.duration * 1000,
        position: prefs.position,
        unstyled: true,
        style: {
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          borderRadius: "14px",
          overflow: "hidden",
        },
      }
    );
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (PNG, SVG, JPG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 2MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `custom-logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("toast-logos").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("toast-logos").getPublicUrl(fileName);
      update({ logo: "custom", customLogoUrl: urlData.publicUrl });
      toast.success("Logo enviado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao enviar logo: " + (err.message || "erro desconhecido"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notificação Live de Vendas</h2>
          <p className="text-sm text-muted-foreground">
            Configure o visual e som da notificação que aparece no dashboard quando uma venda é aprovada
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            Resetar
          </Button>
          <Button size="sm" variant="outline" onClick={handlePreview} className="gap-1.5 text-xs">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </Button>
          <Button
            size="sm"
            onClick={() => {
              update({});
              toast.success("Preferências salvas com sucesso!");
            }}
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="h-3.5 w-3.5" />
            Salvar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Col 1: Template & Layout */}
        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Template & Layout
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Title template */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Título (template)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-xs space-y-1">
                    <p className="font-semibold mb-1">Variáveis disponíveis:</p>
                    {AVAILABLE_VARS.map((v) => (
                      <p key={v.tag}>
                        <code className="text-primary">{v.tag}</code> — {v.desc}
                      </p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                value={prefs.titleTemplate}
                onChange={(e) => update({ titleTemplate: e.target.value })}
                className="h-9 text-sm bg-secondary/30 border-border/30 font-mono"
                placeholder="Venda Aprovada! | {{projeto}}"
              />
            </div>

            {/* Subtitle template */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Subtítulo (template)</Label>
              <Input
                value={prefs.subtitleTemplate}
                onChange={(e) => update({ subtitleTemplate: e.target.value })}
                className="h-9 text-sm bg-secondary/30 border-border/30 font-mono"
                placeholder="Valor: {{valor}}"
              />
            </div>

            {/* Variables chips */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Variáveis (clique para inserir no título)</Label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_VARS.map((v) => (
                  <button
                    key={v.tag}
                    onClick={() => {
                      const current = prefs.titleTemplate;
                      if (!current.includes(v.tag)) {
                        update({ titleTemplate: current + ` ${v.tag}` });
                      }
                    }}
                    className="px-2 py-1 rounded-md text-[10px] font-mono border border-border/30 bg-secondary/20 hover:bg-primary/10 hover:border-primary/40 transition-all"
                    title={v.desc}
                  >
                    {v.tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview project name */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome do Projeto (preview)</Label>
              <Input
                value={previewProject}
                onChange={(e) => {
                  setPreviewProject(e.target.value);
                  update({ previewProject: e.target.value });
                }}
                className="h-9 text-sm bg-secondary/30 border-border/30"
                placeholder="GTX Mídia"
              />
            </div>

            {/* Position */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Posição</Label>
              <Select value={prefs.position} onValueChange={(v) => update({ position: v as ToastPreferences["position"] })}>
                <SelectTrigger className="h-9 text-sm bg-secondary/30 border-border/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Animation */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Animação de Entrada</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {ANIMATIONS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => update({ animation: a.value })}
                    className={`px-2 py-2 rounded-lg border text-[11px] transition-all ${
                      prefs.animation === a.value
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border/30 bg-secondary/20 hover:bg-secondary/40"
                    }`}
                    title={a.desc}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Duração</Label>
                <Badge variant="outline" className="text-[10px] font-mono">{prefs.duration}s</Badge>
              </div>
              <Slider
                value={[prefs.duration]}
                onValueChange={([v]) => update({ duration: v })}
                min={3}
                max={20}
                step={1}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* Col 2: Som & Preview (moved up since Aparência was removed) */}

        {/* Col 3: Som & Preview */}
        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {prefs.soundEnabled ? (
                <Volume2 className="h-4 w-4 text-primary" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
              Som
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Sound toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Ativar Som</p>
                <p className="text-[11px] text-muted-foreground">Toca quando uma venda chega</p>
              </div>
              <Switch
                checked={prefs.soundEnabled}
                onCheckedChange={(v) => update({ soundEnabled: v })}
              />
            </div>

            {/* Sound selector */}
            {prefs.soundEnabled && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tipo de Som</Label>
                <div className="space-y-1.5">
                  {SOUNDS.filter((s) => s.value !== "none").map((s) => (
                    <button
                      key={s.value}
                      onClick={() => {
                        update({ sound: s.value });
                        playToastSound(s.value);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${
                        prefs.sound === s.value
                          ? "border-primary bg-primary/10"
                          : "border-border/30 bg-secondary/20 hover:bg-secondary/40"
                      }`}
                    >
                      <span>{s.label}</span>
                      <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live Preview */}
            <div className="space-y-2 pt-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Preview</p>
              <div
                className="rounded-xl overflow-hidden"
                style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
              >
                <SaleToastContent
                  titleLine={previewTitle}
                  subtitleLine={previewSubtitle}
                  logo={prefs.logo}
                  bgColor={prefs.bgColor}
                  textColor={prefs.textColor}
                  customLogoUrl={prefs.customLogoUrl}
                  animation={prefs.animation}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}
