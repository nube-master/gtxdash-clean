import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Settings2, Compass, ArrowRight, Zap, ShoppingCart, Play, LayoutDashboard, Palette, DollarSign, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

const TOUR_SECTIONS = [
  { icon: LayoutDashboard, title: "Dashboard", description: "Painel executivo com KPIs financeiros, funil de conversão e métricas de performance em tempo real." },
  { icon: BarChart3, title: "Analytics", description: "Análise histórica com snapshots diários, comparação entre projetos e diagnóstico de gargalos no funil." },
  { icon: Zap, title: "Campanhas", description: "Gestão de anúncios com classificação de saúde, radar de decisão e métricas por estrutura (Teste, Pré-Escala, Escala)." },
  { icon: ShoppingCart, title: "Vendas", description: "Feed de vendas em tempo real com conciliação automática entre CartPanda, ClickBank e RedTrack." },
  { icon: Play, title: "VSLs", description: "Monitoramento de retenção e conversão dos vídeos de vendas via integração com Vturb." },
  { icon: Palette, title: "Criativos", description: "Inteligência de criativos com leaderboard, comparação de performance e atribuição de equipe." },
  { icon: DollarSign, title: "Central Financeira", description: "P&L completo com custos fixos, variáveis, comissões de equipe e margem líquida real." },
  { icon: Crosshair, title: "Planejamento", description: "Gestão de metas mensais com projeções, simulações e acompanhamento de progresso." },
];

interface DataEmptyStateProps {
  className?: string;
}

export function DataEmptyState({ className }: DataEmptyStateProps) {
  const navigate = useNavigate();
  const [tourOpen, setTourOpen] = useState(false);

  return (
    <>
      <div className={`flex flex-col items-center justify-center py-20 px-6 text-center ${className || ""}`}>
        <div className="relative mb-6">
          <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-10 w-10 text-primary" />
          </div>
          <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-amber-500/20 flex items-center justify-center">
            <span className="text-amber-500 text-xs">!</span>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-2">
          Sua operação está pronta. Falta conectar os dados.
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mb-8">
          Configure suas integrações para começar a ver métricas em tempo real.
        </p>

        <div className="flex items-center gap-3">
          <Button onClick={() => navigate("/integrations")} className="gap-2">
            <Settings2 className="h-4 w-4" />
            Configurar integrações
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setTourOpen(true)} className="gap-2">
            <Compass className="h-4 w-4" />
            Ver tour do sistema
          </Button>
        </div>
      </div>

      <Dialog open={tourOpen} onOpenChange={setTourOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Tour do Sistema</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Conheça as principais seções do seu dashboard de performance.
            </p>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {TOUR_SECTIONS.map((section) => (
              <div key={section.title} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-secondary/30">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <section.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground">{section.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{section.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <Button onClick={() => { setTourOpen(false); navigate("/integrations"); }} className="w-full gap-2">
              <Settings2 className="h-4 w-4" />
              Começar configurando integrações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Hook that checks if the operation has ANY integrations configured.
 * Returns true only when the operation truly has no integrations set up.
 * Zero data on a configured operation = NOT empty (just no data yet).
 */
export function useHasIntegrations(): { hasIntegrations: boolean; isLoading: boolean } {
  const opId = useOperationId();

  const { data, isLoading } = useQuery({
    queryKey: ["has-integrations", opId],
    queryFn: async () => {
      // Check if there are any active Meta ad accounts
      let q = supabase.from("meta_ad_accounts").select("id", { count: "exact", head: true }).eq("is_active", true);
      if (opId) q = q.eq("operation_id", opId);
      const { count: metaCount } = await q;

      // Check if there are any sales records (authoritative for data presence)
      let q2 = supabase.from("sales_data").select("id", { count: "exact", head: true }).limit(1);
      if (opId) q2 = q2.eq("operation_id", opId);
      const { count: salesCount } = await q2;

      return (metaCount ?? 0) > 0 || (salesCount ?? 0) > 0;

    },
    staleTime: 5 * 60_000,
  });

  return { hasIntegrations: data ?? false, isLoading };
}

/**
 * Check if operation should show the "connect integrations" empty state.
 * Only shows when there are NO integrations configured at all.
 * If integrations exist but data is zero (e.g. midnight), returns false.
 */
export function useIsOperationEmpty(spend: number, revenue: number, conversions: number): boolean {
  const { hasIntegrations, isLoading } = useHasIntegrations();

  // If still loading, don't show empty state
  if (isLoading) return false;

  // If integrations are configured, NEVER show "connect data" empty state
  if (hasIntegrations) return false;

  // No integrations AND no data = truly empty
  return spend === 0 && revenue === 0 && conversions === 0;
}
