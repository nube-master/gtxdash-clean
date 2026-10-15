import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, Building2, Plug, CheckCircle2, ArrowRight, ArrowLeft, Loader2, Check, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";

const STEPS = ["Boas-vindas", "Operação", "Integrações", "Finalização"];

const INTEGRATIONS = [
  { key: "meta", label: "Meta Ads", desc: "Conecte suas contas de anúncios", icon: "📊" },
  { key: "clickbank", label: "ClickBank", desc: "Rastreie vendas e comissões", icon: "💳" },
  { key: "digistore", label: "Digistore24", desc: "Vendas e afiliados internacionais", icon: "🌐" },
  { key: "vturb", label: "Vturb", desc: "Métricas de VSL e retenção", icon: "🎬" },
  { key: "redtrack", label: "RedTrack", desc: "Tracking avançado de conversões", icon: "🎯" },
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function Onboarding() {
  const { user, refetchMeta } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 2 form
  const [opName, setOpName] = useState("");
  const [opSlug, setOpSlug] = useState("");
  const [dailyGoal, setDailyGoal] = useState("10000");
  const [minRoas, setMinRoas] = useState("2.0");
  const [maxCpa, setMaxCpa] = useState("936");
  const [slugError, setSlugError] = useState("");

  // Step 3 state
  const [configuredIntegrations, setConfiguredIntegrations] = useState<Set<string>>(new Set());

  // Created operation id
  const [createdOpId, setCreatedOpId] = useState<string | null>(null);

  const handleNameChange = useCallback((val: string) => {
    setOpName(val);
    setOpSlug(slugify(val));
    setSlugError("");
  }, []);

  const validateSlug = useCallback(async (slug: string) => {
    if (!slug) { setSlugError("Slug é obrigatório"); return false; }
    const { data } = await supabase
      .from("operations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (data) { setSlugError("Este slug já está em uso"); return false; }
    setSlugError("");
    return true;
  }, []);

  const handleCreateOperation = useCallback(async () => {
    if (!opName.trim()) { toast.error("Nome da operação é obrigatório"); return; }
    const valid = await validateSlug(opSlug);
    if (!valid) return;
    if (!user?.id) return;

    setSaving(true);
    try {
      const { data: op, error: opError } = await supabase
        .from("operations")
        .insert({
          name: opName.trim(),
          slug: opSlug,
          owner_user_id: user.id,
          daily_revenue_goal: parseFloat(dailyGoal) || 0,
          min_roas: parseFloat(minRoas) || 0,
          max_cpa: parseFloat(maxCpa) || 0,
        })
        .select("id")
        .single();

      if (opError) throw opError;

      const { error: memberError } = await supabase
        .from("operation_members")
        .insert({
          operation_id: op.id,
          user_id: user.id,
          role: "owner",
        });

      if (memberError) throw memberError;

      setCreatedOpId(op.id);
      setStep(2);
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar operação");
    } finally {
      setSaving(false);
    }
  }, [opName, opSlug, dailyGoal, minRoas, user?.id, validateSlug]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["needs-onboarding"] });
      await queryClient.invalidateQueries({ queryKey: ["current-operation"] });
      await refetchMeta();
      navigate("/", { replace: true });
    } finally {
      setSaving(false);
    }
  }, [queryClient, navigate, refetchMeta]);

  const handleSkipIntegration = (key: string) => {
    // Just mark as skipped visually
  };

  const handleConfigureIntegration = (key: string) => {
    setConfiguredIntegrations(prev => new Set(prev).add(key));
    toast.success(`${key} será configurado em Integrações`);
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 200 : -200, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir < 0 ? 200 : -200, opacity: 0 }),
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8" style={{ background: "hsl(var(--background))" }}>
      {/* Progress */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`hidden sm:block h-0.5 w-12 md:w-20 ${i < step ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">Passo {step + 1} de {STEPS.length} — {STEPS[step]}</p>
      </div>

      {/* Content */}
      <div className="w-full max-w-2xl">
        <AnimatePresence mode="wait" custom={1}>
          {step === 0 && (
            <motion.div
              key="step0"
              variants={slideVariants}
              custom={1}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="text-center space-y-6"
            >
              <div className="mx-auto h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Rocket className="h-10 w-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Bem-vindo ao Traffic OS</h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Vamos configurar sua operação em menos de 5 minutos. Você terá um painel completo
                para gerenciar tráfego, vendas e criativos.
              </p>
              <Button size="lg" className="gap-2" onClick={() => setStep(1)}>
                Começar configuração <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              variants={slideVariants}
              custom={1}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              <Card className="p-6 md:p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Criar sua operação</h2>
                    <p className="text-sm text-muted-foreground">Defina o nome e as metas iniciais</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Nome da operação</Label>
                    <Input
                      value={opName}
                      onChange={e => handleNameChange(e.target.value)}
                      placeholder='Ex: "Minha Agência", "GTX Media"'
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Slug (URL única)</Label>
                    <Input
                      value={opSlug}
                      onChange={e => { setOpSlug(e.target.value); setSlugError(""); }}
                      onBlur={() => opSlug && validateSlug(opSlug)}
                      placeholder="minha-agencia"
                      className={`mt-1 font-mono text-sm ${slugError ? "border-destructive" : ""}`}
                    />
                    {slugError && <p className="text-xs text-destructive mt-1">{slugError}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Meta diária de receita (R$)</Label>
                      <Input
                        type="number"
                        value={dailyGoal}
                        onChange={e => setDailyGoal(e.target.value)}
                        placeholder="10000"
                        className="mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Sugerido: R$ 10.000/dia</p>
                    </div>
                    <div>
                      <Label>ROAS mínimo aceitável</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={minRoas}
                        onChange={e => setMinRoas(e.target.value)}
                        placeholder="2.0"
                        className="mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Sugerido: 2.0x</p>
                    </div>
                  </div>
                  <div>
                    <Label>CPA máximo (R$)</Label>
                    <Input
                      type="number"
                      value={maxCpa}
                      onChange={e => setMaxCpa(e.target.value)}
                      placeholder="936"
                      className="mt-1"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Sugerido: R$ 936</p>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(0)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button onClick={handleCreateOperation} disabled={saving || !opName.trim()} className="gap-1">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continuar <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              variants={slideVariants}
              custom={1}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              <Card className="p-6 md:p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Plug className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Configurar integrações</h2>
                    <p className="text-sm text-muted-foreground">
                      {configuredIntegrations.size} de {INTEGRATIONS.length} integrações configuradas
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${(configuredIntegrations.size / INTEGRATIONS.length) * 100}%` }}
                  />
                </div>

                <div className="space-y-3">
                  {INTEGRATIONS.map(int => {
                    const done = configuredIntegrations.has(int.key);
                    return (
                      <div
                        key={int.key}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                          done ? "border-primary/30 bg-primary/5" : "border-border/50 bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{int.icon}</span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{int.label}</p>
                            <p className="text-[11px] text-muted-foreground">{int.desc}</p>
                          </div>
                        </div>
                        {done ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Marcado
                          </Badge>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              onClick={() => handleConfigureIntegration(int.key)}
                            >
                              Configurar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px] text-muted-foreground"
                              onClick={() => handleSkipIntegration(int.key)}
                            >
                              <SkipForward className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] text-muted-foreground text-center">
                  💡 Você pode configurar isso depois em Configurações → Integrações
                </p>

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" disabled className="gap-1 opacity-50">
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button onClick={() => setStep(3)} className="gap-1">
                    Continuar <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              variants={slideVariants}
              custom={1}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="text-center space-y-6"
            >
              <div className="mx-auto h-20 w-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Tudo pronto!</h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Sua operação <strong className="text-foreground">{opName}</strong> foi criada com sucesso.
              </p>

              {/* Summary */}
              <Card className="p-5 text-left max-w-md mx-auto space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Resumo da configuração</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-muted-foreground">Operação criada: <strong className="text-foreground">{opName}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-muted-foreground">Meta diária: <strong className="text-foreground">R$ {Number(dailyGoal).toLocaleString("pt-BR")}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-muted-foreground">ROAS mínimo: <strong className="text-foreground">{minRoas}x</strong></span>
                  </div>
                </div>

                {/* Pending integrations */}
                {INTEGRATIONS.filter(i => !configuredIntegrations.has(i.key)).length > 0 && (
                  <>
                    <div className="border-t border-border/50 pt-3 mt-3">
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">Integrações pendentes</h4>
                      {INTEGRATIONS.filter(i => !configuredIntegrations.has(i.key)).map(i => (
                        <div key={i.key} className="flex items-center gap-2 text-sm text-muted-foreground py-0.5">
                          <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />
                          <span>{i.label}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>

              <Button size="lg" className="gap-2" onClick={handleFinish} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Ir para o Dashboard <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
