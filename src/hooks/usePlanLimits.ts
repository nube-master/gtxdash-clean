import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";

interface PlanLimits {
  maxMetaAccounts: number | null;
  maxMembers: number | null;
  currentMetaAccounts: number;
  currentMembers: number;
  canAddMetaAccount: boolean;
  canAddMember: boolean;
  metaAccountsRemaining: number | null; // null = unlimited
  membersRemaining: number | null;
}

export function usePlanLimits() {
  const { operation, operationId } = useOperation();

  return useQuery<PlanLimits>({
    queryKey: ["plan-limits", operationId],
    queryFn: async () => {
      if (!operationId) {
        return {
          maxMetaAccounts: null, maxMembers: null,
          currentMetaAccounts: 0, currentMembers: 0,
          canAddMetaAccount: true, canAddMember: true,
          metaAccountsRemaining: null, membersRemaining: null,
        };
      }

      const [accountsRes, membersRes] = await Promise.all([
        supabase
          .from("meta_ad_accounts")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("operation_id", operationId),
        supabase
          .from("operation_members")
          .select("id", { count: "exact", head: true })
          .eq("operation_id", operationId)
          .eq("status", "active"),
      ]);

      const currentMetaAccounts = accountsRes.count ?? 0;
      const currentMembers = membersRes.count ?? 0;

      const maxMeta = operation?.max_meta_accounts ?? null;
      const maxMem = operation?.max_members ?? null;

      return {
        maxMetaAccounts: maxMeta,
        maxMembers: maxMem,
        currentMetaAccounts,
        currentMembers,
        canAddMetaAccount: maxMeta === null || currentMetaAccounts < maxMeta,
        canAddMember: maxMem === null || currentMembers < maxMem,
        metaAccountsRemaining: maxMeta === null ? null : Math.max(0, maxMeta - currentMetaAccounts),
        membersRemaining: maxMem === null ? null : Math.max(0, maxMem - currentMembers),
      };
    },
    enabled: !!operationId,
    staleTime: 30_000,
  });
}
