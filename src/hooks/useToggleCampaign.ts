import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isMetaCampaignPaused } from "@/lib/metaCampaignStatus";


interface ToggleArgs {
  campaign_id: string;
  account_id: string;
  campaign_name: string;
  new_status: "ACTIVE" | "PAUSED";
  /**
   * Modalidade da pausa manual (só usado quando new_status='PAUSED'):
   * - 'sticky' (default): cooldown set_by='manual' permanente; nenhuma regra automática religa.
   * - 'wake_up': cooldown set_by='manual_until' expira no próximo HH:MM BRT escolhido;
   *   regras de activate (ATIVAR|TOP) conseguem religar.
   */
  pause_mode?: "sticky" | "wake_up";
  /** Só quando pause_mode='wake_up'. 0-23, hora BRT (UTC-3). */
  wake_up_hour_brt?: number;
  /** Só quando pause_mode='wake_up'. 0 ou 30. */
  wake_up_minute_brt?: number;
}

export function useToggleCampaign() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: ToggleArgs) => {
      // Guard: campanhas "órfãs" (spend em traffic_data sem par em meta_campaign_status)
      // vêm com id sintético "orphan:<hash>:<name>". Se mandarmos isso pro Meta, o Graph
      // responde "Unknown path components: /..." porque interpreta o "/" do nome como URL.
      if (args.campaign_id.startsWith("orphan:") || !/^\d+$/.test(args.campaign_id)) {
        throw new Error(
          `Campanha sem vínculo Meta (órfã). Sync de status precisa rodar ou a conta ${args.account_id} está sem token válido — não dá pra pausar por aqui.`,
        );
      }
      const pauseMode = args.pause_mode ?? "sticky";
      const hh = args.wake_up_hour_brt;
      const mm = args.wake_up_minute_brt ?? 0;
      const reasonSuffix =
        args.new_status === "PAUSED" && pauseMode === "wake_up" && typeof hh === "number"
          ? ` (até ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} BRT)`
          : "";
      const { data, error } = await supabase.functions.invoke("pacing-toggle-campaign", {
        body: {
          campaign_id: args.campaign_id,
          account_id: args.account_id,
          campaign_name: args.campaign_name,
          new_status: args.new_status,
          pause_mode: pauseMode,
          wake_up_hour_brt: pauseMode === "wake_up" ? hh : undefined,
          wake_up_minute_brt: pauseMode === "wake_up" ? mm : undefined,
          operation_id: (supabase as any).operation_id || undefined,
          reason: `Manual ${args.new_status} via UI${reasonSuffix} — ${args.campaign_name}`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.success === false) throw new Error(data?.error ?? "Meta recusou a alteração");
      return data as {
        success: boolean;
        accepted?: boolean;
        dry_run: boolean;
        new_status: string;
        confirmed_status?: string;
        confirmed_effective_status?: string;
      };
    },
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ["live-pacing-campaigns"] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ["live-pacing-campaigns"] });
      qc.setQueriesData<any[]>({ queryKey: ["live-pacing-campaigns"] }, (old) =>
        (old ?? []).map((c) =>
          c.id === args.campaign_id
            ? { ...c, status: args.new_status === "PAUSED" ? "paused" : "ok" }
            : c
        )
      );
      return { prev };
    },
    onError: (err, _args, ctx) => {
      ctx?.prev?.forEach(([queryKey, data]) => qc.setQueryData(queryKey, data));
      toast.error(`Falha ao alterar campanha: ${(err as Error).message}`);
    },
    onSuccess: (data, args) => {
      const verb = args.new_status === "PAUSED" ? "pausada" : "religada";
      toast.success(
        data.dry_run
          ? `[dry-run] ${args.campaign_name} seria ${verb}`
          : `Comando enviado para ${verb}: ${args.campaign_name}`
      );
      // Aplica o status confirmado pelo Meta direto no cache, sem esperar refetch.
      // IN_PROCESS/WITH_ISSUES/etc contam como ATIVA — a fonte única decide.
      const confirmedEff = data.confirmed_effective_status ?? data.new_status;
      const confirmedRaw = data.confirmed_status ?? data.new_status;
      const nowPaused = isMetaCampaignPaused(confirmedRaw, confirmedEff);
      qc.setQueriesData<any[]>({ queryKey: ["live-pacing-campaigns"] }, (old) =>
        (old ?? []).map((c) =>
          c.id === args.campaign_id
            ? { ...c, status: nowPaused ? "paused" : "ok" }
            : c
        )

      );
      // Refetch imediato + log
      qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
      qc.invalidateQueries({ queryKey: ["pacing-action-log"] });
    },
  });
}

