import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface MonthlyGoal {
  id: string;
  month: string;
  goal_value: number;
  profit_goal: number;
  created_at: string;
  updated_at: string;
}

export function useCurrentMonthGoal() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const opId = useOperationId();

  return useQuery<MonthlyGoal | null>({
    queryKey: ["monthly-goal", month, opId],
    queryFn: async () => {
      let q = supabase
        .from("monthly_goals")
        .select("*")
        .eq("month", month);
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data as MonthlyGoal) ?? null;
    },
  });
}

export function useAllMonthlyGoals() {
  const opId = useOperationId();
  return useQuery<MonthlyGoal[]>({
    queryKey: ["monthly-goals-all", opId],
    queryFn: async () => {
      let q = supabase
        .from("monthly_goals")
        .select("*")
        .order("month", { ascending: false });
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as MonthlyGoal[]) ?? [];
    },
  });
}

export function useMonthTotals() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const opId = useOperationId();

  return useQuery<{ revenue: number; profit: number }>({
    queryKey: ["month-totals-independent", start, end, opId],
    queryFn: async () => {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let url = `${baseUrl}/functions/v1/dashboard-totals?start=${start}&end=${end}`;
      if (opId) url += `&operation_id=${opId}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
      });
      if (!res.ok) throw new Error("Failed to fetch month totals");
      const data = await res.json();
      return { revenue: data.totalRevenue ?? 0, profit: data.lucroBruto ?? 0 };
    },
    staleTime: 5 * 60_000,
  });
}

export function useMonthlyHistoricalRevenue(months: string[]) {
  const opId = useOperationId();
  return useQuery<Record<string, number>>({
    queryKey: ["monthly-historical-revenue", months, opId],
    enabled: months.length > 0,
    queryFn: async () => {
      const result: Record<string, number> = {};
      for (const month of months) {
        const [y, m] = month.split("-").map(Number);
        const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        try {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          let url = `${baseUrl}/functions/v1/dashboard-totals?start=${startDate}&end=${endDate}`;
          if (opId) url += `&operation_id=${opId}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } });
          if (res.ok) {
            const data = await res.json();
            result[month] = data.totalRevenue ?? 0;
          }
        } catch { result[month] = 0; }
      }
      return result;
    },
    staleTime: 30 * 60_000,
  });
}
