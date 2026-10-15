import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Zap, Crown, Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    icon: Zap,
    description: "Para operações iniciantes que estão validando ofertas.",
    color: "from-blue-500/20 to-cyan-500/20",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
    limits: {
      metaAccounts: "5",
      members: "3",
    },
    features: [
      { text: "Dashboard em tempo real", included: true },
      { text: "Analytics & Campanhas", included: true },
      { text: "Meta IA (GTX)", included: true },
      { text: "Criativos & VSLs", included: true },
      { text: "Vendas & Central Financeira", included: true },
      { text: "Planejamento & Fluxo de Caixa", included: true },
      { text: "Contingência", included: true },
      { text: "War Room & Integrações", included: true },
      { text: "Academy", included: false },
      { text: "Jarvis IA", included: false },
      { text: "Banco de Talentos", included: false },
    ],
    cta: "Começar Agora",
    popular: false,
  },
  {
    key: "pro",
    name: "Pro",
    icon: Crown,
    description: "Para operações em escala que precisam de inteligência avançada.",
    color: "from-primary/20 to-purple-500/20",
    borderColor: "border-primary/50",
    iconColor: "text-primary",
    limits: {
      metaAccounts: "20",
      members: "10",
    },
    features: [
      { text: "Tudo do Starter", included: true },
      { text: "Até 20 contas Meta", included: true },
      { text: "Até 10 membros", included: true },
      { text: "Academy completa", included: true },
      { text: "Jarvis IA (Analista Virtual)", included: true },
      { text: "Relatórios avançados", included: true },
      { text: "Notificações customizadas", included: true },
      { text: "Suporte prioritário", included: true },
      { text: "Banco de Talentos", included: false },
    ],
    cta: "Escolher Pro",
    popular: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    icon: Building2,
    description: "Para grandes operações com múltiplas equipes e necessidades customizadas.",
    color: "from-amber-500/20 to-orange-500/20",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
    limits: {
      metaAccounts: "Ilimitado",
      members: "Ilimitado",
    },
    features: [
      { text: "Tudo do Pro", included: true },
      { text: "Contas Meta ilimitadas", included: true },
      { text: "Membros ilimitados", included: true },
      { text: "Banco de Talentos", included: true },
      { text: "Onboarding dedicado", included: true },
      { text: "SLA de suporte", included: true },
      { text: "API personalizada", included: true },
      { text: "Consultoria estratégica", included: true },
    ],
    cta: "Falar com Vendas",
    popular: false,
  },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
        <div className="relative max-w-6xl mx-auto px-4 pt-20 pb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="outline" className="mb-6 px-4 py-1.5 text-xs font-medium border-primary/30 text-primary">
              Planos & Preços
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
              Escale sua operação com
              <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent"> controle total</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
              Dashboard inteligente para operações de tráfego pago. Monitore, otimize e escale com dados em tempo real.
            </p>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mb-12">
              <span className={`text-sm font-medium transition-colors ${!annual ? "text-foreground" : "text-muted-foreground"}`}>
                Mensal
              </span>
              <Switch checked={annual} onCheckedChange={setAnnual} />
              <span className={`text-sm font-medium transition-colors ${annual ? "text-foreground" : "text-muted-foreground"}`}>
                Anual
              </span>
              {annual && (
                <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">
                  Economize 20%
                </Badge>
              )}
            </div>
          </motion.div>

          {/* Plans grid */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className={`relative rounded-2xl border ${plan.popular ? plan.borderColor + " shadow-xl shadow-primary/10" : "border-border"} bg-card overflow-hidden`}
              >
                {plan.popular && (
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-purple-500" />
                )}

                {/* Header */}
                <div className={`p-6 pb-4 bg-gradient-to-br ${plan.color}`}>
                  {plan.popular && (
                    <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground text-[10px]">
                      Mais Popular
                    </Badge>
                  )}
                  <div className={`h-10 w-10 rounded-xl bg-background/80 flex items-center justify-center mb-4 ${plan.iconColor}`}>
                    <plan.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{plan.description}</p>
                </div>

                {/* Limits */}
                <div className="px-6 py-4 border-b border-border/50">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{plan.limits.metaAccounts}</p>
                      <p className="text-[10px] text-muted-foreground">Contas Meta</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{plan.limits.members}</p>
                      <p className="text-[10px] text-muted-foreground">Membros</p>
                    </div>
                  </div>
                </div>

                {/* Features */}
                <div className="px-6 py-4 space-y-2.5">
                  {plan.features.map((feat, fi) => (
                    <div key={fi} className="flex items-center gap-2.5 text-sm">
                      {feat.included ? (
                        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                      )}
                      <span className={feat.included ? "text-foreground" : "text-muted-foreground/50"}>
                        {feat.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="p-6 pt-2">
                  <Button
                    className={`w-full gap-2 ${plan.popular ? "" : "variant-outline"}`}
                    variant={plan.popular ? "default" : "outline"}
                    size="lg"
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ / Footer area */}
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-foreground mb-4">Dúvidas frequentes</h2>
        <div className="space-y-4 text-left">
          {[
            { q: "Posso mudar de plano a qualquer momento?", a: "Sim! Você pode fazer upgrade ou downgrade a qualquer momento. A diferença será calculada proporcionalmente." },
            { q: "O que acontece se eu atingir o limite?", a: "Você será notificado e poderá fazer upgrade para desbloquear mais capacidade. Seus dados nunca são perdidos." },
            { q: "Existe período de teste?", a: "Sim, todas as novas operações começam com um período de avaliação para você testar a plataforma." },
            { q: "Como funciona o Enterprise?", a: "O plano Enterprise é customizado para cada operação. Entre em contato para discutirmos suas necessidades específicas." },
          ].map((faq, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">{faq.q}</p>
              <p className="text-sm text-muted-foreground mt-1">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
