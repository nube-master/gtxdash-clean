import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PacingHeader } from "@/components/pacing/PacingHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Gauge, Sliders, History, Settings as SettingsIcon, Target,
  Trophy, RotateCcw, Save,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePacingSettings } from "@/hooks/usePacingSettings";
import {
  DEFAULT_SCORE, DEFAULT_DECISION, GTX_THRESHOLDS_KEYS,
  type GtxScoreThresholds, type GtxDecisionThresholds,
} from "@/hooks/useGtxThresholds";
import { GTX_DECISION_CONFIG } from "@/hooks/useGtxMetaData";

function SectionCard({
  icon: Icon, title, subtitle, children,
}: { icon: React.ElementType; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 bg-card border-border/60">
      <div className="flex items-start gap-2 mb-4">
        <Icon className="size-4 text-muted-foreground mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function NumRow({
  label, hint, value, onChange, suffix, step = 1, min, max,
}: {
  label: string; hint?: string; value: number;
  onChange: (n: number) => void; suffix?: string; step?: number;
  min?: number; max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex-1 min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Input
          type="number" step={step} min={min} max={max}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 tabular-nums text-right"
        />
        {suffix && <span className="text-xs text-muted-foreground w-8">{suffix}</span>}
      </div>
    </div>
  );
}

export default function PacingScoreRules() {
  const navigate = useNavigate();
  const { settings, loading, setMany } = usePacingSettings();
  const [score, setScore] = useState<GtxScoreThresholds>(DEFAULT_SCORE);
  const [decision, setDecision] = useState<GtxDecisionThresholds>(DEFAULT_DECISION);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    setScore({ ...DEFAULT_SCORE, ...(settings[GTX_THRESHOLDS_KEYS.SCORE_KEY] ?? {}) });
    setDecision({ ...DEFAULT_DECISION, ...(settings[GTX_THRESHOLDS_KEYS.DECISION_KEY] ?? {}) });
    setDirty(false);
  }, [loading, settings]);

  const updScore = <K extends keyof GtxScoreThresholds>(k: K, v: number) => {
    setScore((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };
  const updDec = <K extends keyof GtxDecisionThresholds>(k: K, v: number) => {
    setDecision((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (score.green <= score.yellow) {
      toast.error("Faixa inválida", { description: "Verde deve ser maior que Amarelo." });
      return;
    }
    const wSum = score.roasWeight + score.consistWeight + score.profitWeight + score.volWeight;
    if (Math.abs(wSum - 100) > 0.1) {
      toast.error("Pesos do Score devem somar 100", { description: `Atual: ${wSum}` });
      return;
    }
    setSaving(true);
    const ok = await setMany({
      [GTX_THRESHOLDS_KEYS.SCORE_KEY]: score,
      [GTX_THRESHOLDS_KEYS.DECISION_KEY]: decision,
    });
    setSaving(false);
    if (ok) setDirty(false);
  };

  const handleReset = () => {
    setScore(DEFAULT_SCORE);
    setDecision(DEFAULT_DECISION);
    setDirty(true);
    toast.info("Valores padrão restaurados (lembre-se de salvar)");
  };

  const wSum = score.roasWeight + score.consistWeight + score.profitWeight + score.volWeight;

  if (loading) {
    return (
      <div className="space-y-4 px-4 md:px-6 pb-10">
        <PacingHeader />
        <Skeleton className="h-10 w-full max-w-2xl" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-72 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 md:px-6 pb-10">
      <PacingHeader />

      <Tabs value="score-rules" className="w-full">
        <TabsList className="grid grid-cols-6 w-full max-w-3xl">
          <TabsTrigger value="dashboard" onClick={() => navigate("/pacing")}>
            <Gauge className="size-3.5 mr-1.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="rules" onClick={() => navigate("/pacing/regras")}>
            <Sliders className="size-3.5 mr-1.5" /> Regras
          </TabsTrigger>
          <TabsTrigger value="groups" onClick={() => navigate("/pacing/budget-groups")}>
            <Target className="size-3.5 mr-1.5" /> Groups
          </TabsTrigger>
          <TabsTrigger value="score-rules">
            <Trophy className="size-3.5 mr-1.5" /> Score
          </TabsTrigger>
          <TabsTrigger value="history" onClick={() => navigate("/pacing/historico")}>
            <History className="size-3.5 mr-1.5" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="settings" onClick={() => navigate("/pacing/settings")}>
            <SettingsIcon className="size-3.5 mr-1.5" /> Config
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* SCORE BANDS */}
        <SectionCard icon={Trophy} title="🎯 Faixas do Score" subtitle="Cores aplicadas na coluna Score (0-100)">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-[hsl(var(--wr-positive))]">Verde ≥</Label>
              <Input
                type="number" min={0} max={100}
                value={score.green}
                onChange={(e) => updScore("green", Number(e.target.value))}
                className="mt-1 tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-[hsl(var(--wr-warning))]">Amarelo ≥</Label>
              <Input
                type="number" min={0} max={100}
                value={score.yellow}
                onChange={(e) => updScore("yellow", Number(e.target.value))}
                className="mt-1 tabular-nums"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center px-2 py-1 rounded bg-[hsl(var(--wr-positive))]/10 text-[hsl(var(--wr-positive))]">≥ {score.green}</span>
            <span className="inline-flex items-center px-2 py-1 rounded bg-[hsl(var(--wr-warning))]/10 text-[hsl(var(--wr-warning))]">{score.yellow}-{score.green - 1}</span>
            <span className="inline-flex items-center px-2 py-1 rounded bg-destructive/10 text-destructive">&lt; {score.yellow}</span>
          </div>

          <Separator />

          <div>
            <Label className="text-sm font-medium">Pesos do Score</Label>
            <p className="text-xs text-muted-foreground mb-3">Soma deve ser 100. Atual: <span className={cn("font-semibold tabular-nums", Math.abs(wSum - 100) > 0.1 ? "text-destructive" : "text-[hsl(var(--wr-positive))]")}>{wSum}</span></p>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>ROAS (alvo {score.roasTarget}×)</span>
                  <span className="tabular-nums font-semibold">{score.roasWeight}%</span>
                </div>
                <Slider value={[score.roasWeight]} min={0} max={100} step={5} onValueChange={(v) => updScore("roasWeight", v[0])} />
                <Input type="number" step={0.1} className="mt-1 h-7 text-xs w-24 tabular-nums"
                  value={score.roasTarget}
                  onChange={(e) => updScore("roasTarget", Number(e.target.value))} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Constância (dias com venda / 3)</span>
                  <span className="tabular-nums font-semibold">{score.consistWeight}%</span>
                </div>
                <Slider value={[score.consistWeight]} min={0} max={100} step={5} onValueChange={(v) => updScore("consistWeight", v[0])} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Lucro (alvo R$ {score.profitTarget})</span>
                  <span className="tabular-nums font-semibold">{score.profitWeight}%</span>
                </div>
                <Slider value={[score.profitWeight]} min={0} max={100} step={5} onValueChange={(v) => updScore("profitWeight", v[0])} />
                <Input type="number" step={50} className="mt-1 h-7 text-xs w-28 tabular-nums"
                  value={score.profitTarget}
                  onChange={(e) => updScore("profitTarget", Number(e.target.value))} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Volume (alvo {score.volTarget} vendas)</span>
                  <span className="tabular-nums font-semibold">{score.volWeight}%</span>
                </div>
                <Slider value={[score.volWeight]} min={0} max={100} step={5} onValueChange={(v) => updScore("volWeight", v[0])} />
                <Input type="number" step={1} className="mt-1 h-7 text-xs w-24 tabular-nums"
                  value={score.volTarget}
                  onChange={(e) => updScore("volTarget", Number(e.target.value))} />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* DECISION ENGINE */}
        <SectionCard icon={Sliders} title="⚙️ Regras de Decisão" subtitle="Thresholds que alimentam a coluna Decisão">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Globais</Label>
            <div className="space-y-1 mt-2">
              <NumRow label="CPA padrão (fallback)" hint="Usado quando a campanha não tem CPA histórico" suffix="R$" step={10} min={0}
                value={decision.defaultCpaThreshold} onChange={(v) => updDec("defaultCpaThreshold", v)} />
              <NumRow label="Pain Index para CORTAR" hint="Gasto sem venda / CPA esperado" step={0.1} min={0.5}
                value={decision.painCortarIndex} onChange={(v) => updDec("painCortarIndex", v)} />
            </div>
          </div>

          <Separator />

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fase TESTE → PROMOVER</Label>
            <div className="space-y-1 mt-2">
              <NumRow label="ROI mínimo" suffix="×" step={0.05} value={decision.testePromoverRoi}
                onChange={(v) => updDec("testePromoverRoi", v)} />
              <NumRow label="Vendas mínimas (3D)" suffix="vd" min={1}
                value={decision.testePromoverMinSales} onChange={(v) => updDec("testePromoverMinSales", v)} />
            </div>
          </div>

          <Separator />

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fase PRÉ-ESCALA</Label>
            <div className="space-y-1 mt-2">
              <NumRow label="ROI mínimo p/ PROMOVER" suffix="×" step={0.05}
                value={decision.preEscalaPromoverRoi} onChange={(v) => updDec("preEscalaPromoverRoi", v)} />
              <NumRow label="Vendas mínimas p/ PROMOVER" suffix="vd" min={1}
                value={decision.preEscalaPromoverMinSales} onChange={(v) => updDec("preEscalaPromoverMinSales", v)} />
              <NumRow label="ROI p/ CORTAR (negativo)" hint="Ex.: -0.50 = -50%" step={0.05}
                value={decision.preEscalaCortarRoiNeg} onChange={(v) => updDec("preEscalaCortarRoiNeg", v)} />
            </div>
          </div>

          <Separator />

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fase ESCALA</Label>
            <div className="space-y-1 mt-2">
              <NumRow label="ROI mínimo p/ ESCALAR" suffix="×" step={0.05}
                value={decision.escalaEscalarRoi} onChange={(v) => updDec("escalaEscalarRoi", v)} />
              <NumRow label="Dias lucrativos mínimos (3D)" suffix="d" min={1} max={3}
                value={decision.escalaEscalarMinDays} onChange={(v) => updDec("escalaEscalarMinDays", v)} />
              <NumRow label="ROI p/ CORTAR (negativo)" step={0.05}
                value={decision.escalaCortarRoiNeg} onChange={(v) => updDec("escalaCortarRoiNeg", v)} />
            </div>
          </div>

          <Separator />

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Oportunidade de Escala</Label>
            <div className="space-y-1 mt-2">
              <NumRow label="ROI mínimo" suffix="×" step={0.05}
                value={decision.scaleOpportunityRoi} onChange={(v) => updDec("scaleOpportunityRoi", v)} />
              <NumRow label="Gasto 3D mínimo" suffix="R$" step={50}
                value={decision.scaleOpportunitySpend} onChange={(v) => updDec("scaleOpportunitySpend", v)} />
            </div>
          </div>
        </SectionCard>

        {/* PREVIEW DECISÕES */}
        <SectionCard icon={Trophy} title="👁 Preview de Decisões">
          <p className="text-xs text-muted-foreground">
            Estes são os badges aplicados na coluna <strong>Decisão</strong> em <code className="text-[10px]">/pacing</code>.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(GTX_DECISION_CONFIG).map(([k, cfg]) => (
              <div key={k}
                className={cn("flex items-center gap-2 px-3 py-2 rounded border text-xs", cfg.bg)}>
                <span>{cfg.emoji}</span>
                <span className={cn("font-semibold uppercase tracking-wider", cfg.color)}>{cfg.label}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background/80 backdrop-blur-sm py-3 -mx-4 px-4 md:-mx-6 md:px-6 border-t border-border/40">
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="size-3.5 mr-1.5" /> Restaurar padrão
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          <Save className="size-3.5 mr-1.5" />
          {saving ? "Salvando..." : dirty ? "Salvar alterações" : "Salvo"}
        </Button>
      </div>
    </div>
  );
}
