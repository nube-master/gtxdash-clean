import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface PlanningGoal {
  id: string;
  revenue_goal: number;
  sales_goal: number;
  cpa_goal: number;
  average_product_price: number;
  profit_goal: number;
  margin_goal: number;
  cogs: number;
  tax_rate: number;
  fee_rate: number;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export function usePlanningGoals() {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["planning-goals", opId],
    queryFn: async () => {
      let q = supabase
        .from("planning_goals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q;
      if (error) throw error;
      return (data?.[0] as PlanningGoal) || null;
    },
  });
}

export function useSavePlanningGoal() {
  const queryClient = useQueryClient();
  const opId = useOperationId();

  return useMutation({
    mutationFn: async (goal: Omit<PlanningGoal, "id" | "created_at" | "updated_at"> & { id?: string }) => {
      if (goal.id) {
        const { id, ...rest } = goal;
        const { data, error } = await supabase
          .from("planning_goals")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { id, ...rest } = goal;
        const payload = { ...rest, operation_id: opId! };
        const { data, error } = await supabase
          .from("planning_goals")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning-goals"] });
    },
  });
}
