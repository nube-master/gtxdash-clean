import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

function opFilter(opId: string | null) {
  return opId ? { operation_id: opId } : {};
}

// ── Variable Costs ──
export function useVariableCosts() {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["variable-costs", opId],
    queryFn: async () => {
      const { data, error } = await supabase.from("variable_costs").select("*").match(opFilter(opId)).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertVariableCost() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (cost: any) => {
      const record = opId ? { ...cost, operation_id: opId } : cost;
      if (record.id) {
        const { error } = await supabase.from("variable_costs").update(record).eq("id", record.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("variable_costs").insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["variable-costs"] }),
  });
}

export function useDeleteVariableCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("variable_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["variable-costs"] }),
  });
}

// ── Team Members ──
export function useTeamMembers() {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["team-members", opId],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members").select("*").match(opFilter(opId)).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertTeamMember() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (member: any) => {
      const record = opId ? { ...member, operation_id: opId } : member;
      if (record.id) {
        const { error } = await supabase.from("team_members").update(record).eq("id", record.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("team_members").insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

// ── Manual Adjustments ──
export function useManualAdjustments() {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["manual-adjustments", opId],
    queryFn: async () => {
      const { data, error } = await supabase.from("manual_adjustments").select("*").match(opFilter(opId)).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertManualAdjustment() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (adj: any) => {
      const record = opId ? { ...adj, operation_id: opId } : adj;
      if (record.id) {
        const { error } = await supabase.from("manual_adjustments").update(record).eq("id", record.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("manual_adjustments").insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manual-adjustments"] }),
  });
}

export function useDeleteManualAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manual_adjustments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manual-adjustments"] }),
  });
}

// ── Fixed Costs ──
export function useFixedCosts() {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["fixed-costs", opId],
    queryFn: async () => {
      const { data, error } = await supabase.from("fixed_costs").select("*").match(opFilter(opId)).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertFixedCost() {
  const qc = useQueryClient();
  const opId = useOperationId();
  return useMutation({
    mutationFn: async (cost: any) => {
      const record = opId ? { ...cost, operation_id: opId } : cost;
      if (record.id) {
        const { error } = await supabase.from("fixed_costs").update(record).eq("id", record.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fixed_costs").insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixed-costs"] }),
  });
}

export function useDeleteFixedCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fixed_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixed-costs"] }),
  });
}
