import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface FunnelProject {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  offer_name_patterns: string[];
  campaign_name_patterns: string[];
  account_ids: string[];
  spend_source: string;
  revenue_source: string;
  ticket_usd: number;
  commission_usd: number;
  target_roas: number;
  target_cpa_usd: number;
  target_daily_revenue_brl: number;
  target_margin_pct: number;
  color: string;
  icon: string;
  notes: string;
}

export function useFunnelProjects() {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["funnel_projects", opId],
    queryFn: async () => {
      let q = supabase.from("funnel_projects").select("*").eq("is_active", true);
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q;
      if (error) {
        console.warn("[useFunnelProjects]", error.message);
        return [] as FunnelProject[];
      }
      return (data || []) as FunnelProject[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useFunnelProject(code: string) {
  const { data, ...rest } = useFunnelProjects();
  const project = (data || []).find((p) => p.code.toUpperCase() === code.toUpperCase()) || null;
  return { project, ...rest };
}

/** Match utility: case-insensitive substring against any pattern */
export function matchesAnyPattern(text: string | null | undefined, patterns: string[]): boolean {
  if (!text) return false;
  const value = String(text).toLowerCase();
  return patterns.some((p) => p && value.includes(String(p).toLowerCase()));
}

/** Test if a sale row belongs to a project (RedTrack/sales side) */
export function saleMatchesProject(sale: any, project: FunnelProject): boolean {
  return (
    matchesAnyPattern(sale?.offer_name, project.offer_name_patterns) ||
    matchesAnyPattern(sale?.product_name, project.offer_name_patterns) ||
    matchesAnyPattern(sale?.utm_campaign, project.campaign_name_patterns)
  );
}

/** Test if a Meta campaign row belongs to a project (spend side) */
export function campaignMatchesProject(row: any, project: FunnelProject): boolean {
  if (matchesAnyPattern(row?.campaign_name, project.campaign_name_patterns)) return true;
  if (project.account_ids.length > 0 && row?.account_id) {
    if (project.account_ids.includes(String(row.account_id))) return true;
  }
  return false;
}
