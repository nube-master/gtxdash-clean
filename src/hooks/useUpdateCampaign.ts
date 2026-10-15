import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateArgs {
  campaign_id: string;
  account_id: string;
  name?: string;
  daily_budget_brl?: number;
}

export function useUpdateCampaign() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: UpdateArgs) => {
      const { data, error } = await supabase.functions.invoke("pacing-update-campaign", {
        body: {
          campaign_id: args.campaign_id,
          account_id: args.account_id,
          name: args.name,
          daily_budget_brl: args.daily_budget_brl,
          operation_id: (supabase as any).operation_id || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.success === false) throw new Error(data?.error ?? "Meta recusou a alteração");
      return data as {
        success: boolean;
        accepted?: boolean;
        updated: string[];
        daily_budget_brl: number | null;
        daily_budget_cents: number | null;
        account_currency: string;
      };
    },
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ["live-pacing-campaigns"] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ["live-pacing-campaigns"] });
      qc.setQueriesData<any[]>({ queryKey: ["live-pacing-campaigns"] }, (old) =>
        (old ?? []).map((c) =>
          c.id === args.campaign_id
            ? {
                ...c,
                ...(args.name ? { name: args.name } : {}),
                ...(args.daily_budget_brl != null ? { dailyBudget: args.daily_budget_brl } : {}),
              }
            : c
        )
      );
      return { prev };
    },
    onError: (err, _args, ctx) => {
      ctx?.prev?.forEach(([queryKey, data]) => qc.setQueryData(queryKey, data));
      toast.error(`Falha ao atualizar campanha: ${(err as Error).message}`);
    },
    onSuccess: (_data, args) => {
      const parts: string[] = [];
      if (args.name) parts.push("nome");
      if (args.daily_budget_brl != null) parts.push("orçamento");
      toast.success(`Comando enviado (${parts.join(" + ")})`);
      qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
    },
  });
}
