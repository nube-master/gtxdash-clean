import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { usePlanningGoals } from "@/hooks/usePlanningGoals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, ChevronUp, X, Rocket, Settings, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const LS_KEY = "setup-guide-dismissed";
const LS_MIN_KEY = "setup-guide-minimized";

function useIntegrationChecks(operationId: string | null) {
  const meta = useQuery({
    queryKey: ["setup-check-meta", operationId],
    queryFn: async () => {
      if (!operationId) return false;
      const { count } = await supabase
        .from("meta_ad_accounts")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("operation_id", operationId);
      return (count ?? 0) > 0;
    },
    staleTime: 60_000,
    enabled: !!operationId,
  });

  const clickbank = useQuery({
    queryKey: ["setup-check-clickbank", operationId],
    queryFn: async () => {
      if (!operationId) return false;
      const { count } = await supabase
        .from("clickbank_audit")
        .select("id", { count: "exact", head: true })
        .eq("operation_id", operationId)
        .limit(1);
      return (count ?? 0) > 0;
    },
    staleTime: 60_000,
    enabled: !!operationId,
  });

  const redtrack = useQuery({
    queryKey: ["setup-check-redtrack", operationId],
    queryFn: async () => {
      if (!operationId) return false;
      const { count } = await supabase
        .from("redtrack_events")
        .select("id", { count: "exact", head: true })
        .eq("operation_id", operationId)
        .limit(1);
      return (count ?? 0) > 0;
    },
    staleTime: 60_000,
    enabled: !!operationId,
  });

  const vturb = useQuery({
    queryKey: ["setup-check-vturb", operationId],
    queryFn: async () => {
      if (!operationId) return false;
      const { count } = await supabase
        .from("vsl_data")
        .select("id", { count: "exact", head: true })
        .eq("operation_id", operationId)
        .limit(1);
      return (count ?? 0) > 0;
    },
    staleTime: 60_000,
    enabled: !!operationId,
  });

  const goals = usePlanningGoals();
  const hasGoals = !!(goals.data && goals.data.revenue_goal > 0);

  return {
    meta: meta.data ?? false,
    clickbank: clickbank.data ?? false,
    redtrack: redtrack.data ?? false,
    vturb: vturb.data ?? false,
    goals: hasGoals,
    isLoading: meta.isLoading || clickbank.isLoading || redtrack.isLoading || vturb.isLoading || goals.isLoading,
  };
}

interface GoalsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function GoalsModal({ open, onOpenChange }: GoalsModalProps) {
  const { data: existing } = usePlanningGoals();
  const [dailyGoal, setDailyGoal] = useState("");
  const [minRoas, setMinRoas] = useState("");
  const [maxCpa, setMaxCpa] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (existing) {
      setDailyGoal(existing.revenue_goal > 0 ? String(existing.revenue_goal) : "");
      setMinRoas(existing.margin_goal > 0 ? String(existing.margin_goal) : "");
      setMaxCpa(existing.cpa_goal > 0 ? String(existing.cpa_goal) : "");
    }
  }, [existing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Definir metas financeiras
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Meta diária de faturamento (R$)</Label>
            <Input type="number" placeholder="Ex: 50000" value={dailyGoal} onChange={e => setDailyGoal(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>ROAS mínimo</Label>
            <Input type="number" step="0.1" placeholder="Ex: 2.0" value={minRoas} onChange={e => setMinRoas(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>CPA máximo (R$)</Label>
            <Input type="number" placeholder="Ex: 150" value={maxCpa} onChange={e => setMaxCpa(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => {
            onOpenChange(false);
            navigate("/planning");
            toast.success("Acesse o Planejamento para salvar suas metas completas");
          }}>
            Ir para Planejamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SetupGuide() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(LS_KEY) === "true");
  const [minimized, setMinimized] = useState(() => localStorage.getItem(LS_MIN_KEY) === "true");
  const [goalsOpen, setGoalsOpen] = useState(false);
  const navigate = useNavigate();
  const { operationId, userRole } = useOperation();
  const checks = useIntegrationChecks(operationId ?? null);

  const items = [
    { key: "meta", label: "Conectar Meta Ads", done: checks.meta, action: () => navigate("/integrations"), actionLabel: "Configurar" },
    { key: "clickbank", label: "Conectar plataforma de vendas", done: checks.clickbank, action: () => navigate("/integrations"), actionLabel: "Configurar" },
    { key: "redtrack", label: "Conectar RedTrack", done: checks.redtrack, action: () => navigate("/integrations"), actionLabel: "Configurar" },
    { key: "vturb", label: "Conectar Vturb", done: checks.vturb, action: () => navigate("/integrations"), actionLabel: "Configurar" },
    { key: "goals", label: "Definir metas financeiras", done: checks.goals, action: () => setGoalsOpen(true), actionLabel: "Definir" },
  ];

  const completedCount = items.filter(i => i.done).length;
  const progress = (completedCount / items.length) * 100;
  const allDone = completedCount === items.length;

  // Apenas owners/admins podem configurar a operação — esconder para membros comuns
  const canConfigure = userRole === "owner" || userRole === "admin" || userRole === "super_admin";
  if (!canConfigure) return null;
  if (dismissed || allDone || checks.isLoading) return null;

  const handleDismiss = () => {
    localStorage.setItem(LS_KEY, "true");
    setDismissed(true);
  };

  const toggleMinimize = () => {
    const next = !minimized;
    setMinimized(next);
    localStorage.setItem(LS_MIN_KEY, String(next));
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[60] w-[340px] max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-4 fade-in duration-500">
        <Card className="border-primary/20 bg-card/95 backdrop-blur-lg shadow-xl">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2 min-w-0">
              <Rocket className="h-4 w-4 text-primary shrink-0" />
              <CardTitle className="text-sm font-semibold truncate">Configuração da operação</CardTitle>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-mono text-muted-foreground mr-1">{completedCount}/{items.length}</span>
              <button onClick={toggleMinimize} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                {minimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <button onClick={handleDismiss} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </CardHeader>

          {!minimized && (
            <CardContent className="p-4 pt-1 space-y-3">
              <Progress value={progress} className="h-1.5" />

              <ul className="space-y-2">
                {items.map(item => (
                  <li key={item.key} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        "h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                        item.done ? "bg-primary border-primary" : "border-muted-foreground/30"
                      )}>
                        {item.done && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </div>
                      <span className={cn(
                        "text-xs truncate",
                        item.done ? "text-muted-foreground line-through" : "text-foreground"
                      )}>
                        {item.label}
                      </span>
                    </div>
                    {!item.done && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0" onClick={item.action}>
                        <Settings className="h-3 w-3 mr-1" />
                        {item.actionLabel}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      </div>

      <GoalsModal open={goalsOpen} onOpenChange={setGoalsOpen} />
    </>
  );
}
