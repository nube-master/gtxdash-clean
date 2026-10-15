import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { registerOfferProjects, getAllProjects } from "@/lib/projectUtils";

/**
 * Loads active offers and registers their `apelido_interno` as project tags.
 * Returns the merged project list (hardcoded + offers) for use in filters.
 *
 * Match rule: bracket exato `[APELIDO]` em qualquer posição do nome.
 */
export function useOfferProjects() {
  const opId = useOperationId();

  const { data: offers = [] } = useQuery({
    queryKey: ["offer-projects", opId],
    queryFn: async () => {
      let q = supabase
        .from("offers")
        .select("id, apelido_interno, produto_real, status, geo, operation_id, redtrack_offer_names")
        .in("status", ["ativa", "em_teste", "pausada"] as any[]);
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown || []) as { id: string; apelido_interno: string; produto_real: string | null; status: string; geo: string | null; redtrack_offer_names?: string[] | null }[];
    },
    enabled: !!opId,
    staleTime: 60_000,
  });


  // Register synchronously during render so getAllProjects() picks up
  // the dynamic projects in the same render cycle (useEffect runs too late).
  if (offers.length > 0) {
    registerOfferProjects(offers as any);
  }

  const allProjects = useMemo(() => {
    void offers.length;
    return getAllProjects(opId);
  }, [offers, opId]);


  return { offers, allProjects };
}

