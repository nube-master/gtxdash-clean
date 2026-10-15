import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Reprocessa a normalização de gasto por fuso horário:
 * 1. Re-sincroniza Meta (hourly + today) para a operação atual
 * 2. Invalida todos os caches que dependem de spend normalizado
 *    (Criativos, Dashboard, Analytics, Tráfego, Pacing)
 */
export function ReprocessSpendButton({ className }: { className?: string }) {
  const [running, setRunning] = useState(false);
  const queryClient = useQueryClient();
  const operationId = useOperationId();

  const handleReprocess = async () => {
    setRunning(true);
    const toastId = toast.loading("Reprocessando normalização de gastos...");
    try {
      const body = operationId ? { operation_id: operationId } : {};

      const results = await Promise.allSettled([
        supabase.functions.invoke("sync-meta-hourly", { body }),
        supabase.functions.invoke("sync-meta-today", { body }),
      ]);

      const failed = results.filter(
        (r) => r.status === "rejected" || (r.value as any)?.error,
      ).length;

      // Recalcula CAC / ROAS / receita em todos os painéis afetados
      await queryClient.invalidateQueries();
      await queryClient.refetchQueries({ type: "active" });

      if (failed === results.length) {
        toast.error("Falha ao re-sincronizar a Meta. Caches foram atualizados mesmo assim.", { id: toastId });
      } else {
        toast.success("Gastos renormalizados — CAC, ROAS e receita recalculados.", { id: toastId });
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao reprocessar gastos", { id: toastId });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleReprocess}
      disabled={running}
      className={className}
      title="Re-sincroniza a Meta por hora (fuso da conta → BRT) e recalcula CAC/ROAS/receita em todos os painéis"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">{running ? "Reprocessando..." : "Reprocessar gastos"}</span>
    </Button>
  );
}
