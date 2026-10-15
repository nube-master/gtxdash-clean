import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOperationId } from "@/contexts/OperationContext";

const OWNERS_KEY = "farm_pipeline_owners";

export interface FarmOwnerProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export type FarmOwnersMap = Record<string, string>; // account_id → user_id

/**
 * Hook que retorna o mapa account_id → user_id (gestor responsável)
 * + perfis dos owners ativos, pra exibir avatar e nome.
 */
export function useFarmOwners() {
  const qc = useQueryClient();
  const opId = useOperationId();

  const ownersQuery = useQuery({
    queryKey: ["farm-pipeline-owners"],
    queryFn: async (): Promise<FarmOwnersMap> => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", OWNERS_KEY)
        .maybeSingle();
      return ((data?.value as any) || {}) as FarmOwnersMap;
    },
  });

  // Lista de membros da operação (todos os perfis) para o seletor
  const membersQuery = useQuery({
    queryKey: ["farm-pipeline-members"],
    queryFn: async (): Promise<FarmOwnerProfile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email, avatar_url")
        .order("display_name", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as FarmOwnerProfile[];
    },
    staleTime: 5 * 60_000,
  });

  const saveOwner = useMutation({
    mutationFn: async ({ accountId, userId }: { accountId: string; userId: string | null }) => {
      const current = (ownersQuery.data || {}) as FarmOwnersMap;
      const next = { ...current };
      if (userId) next[accountId] = userId;
      else delete next[accountId];
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: OWNERS_KEY, value: next as any, operation_id: opId! }, { onConflict: "key" });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData(["farm-pipeline-owners"], next);
      toast.success("Gestor atualizado", { duration: 1500 });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar gestor"),
  });

  return {
    owners: ownersQuery.data || {},
    members: membersQuery.data || [],
    isLoading: ownersQuery.isLoading || membersQuery.isLoading,
    saveOwner: saveOwner.mutate,
  };
}

export function ownerInitials(p: FarmOwnerProfile | null | undefined): string {
  if (!p) return "?";
  const base = (p.display_name || p.email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || "?").toUpperCase();
}
