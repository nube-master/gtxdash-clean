import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { isFrontEndCbSale } from "@/lib/frontEndSale";

export interface TierBreakdownRow {
  quantity: number | null;
  count: number;
  totalBrl: number;
}

/** Vendor → project code mapping */
const VENDOR_PROJECT: Record<string, string> = {
  neurodyne: "NDM",
  memoryon: "MO",
  crstrenght: "CRT",
  crstrange: "CRT",
  nrptgtx: "CRT",
  leandrops1: "LDR",
  synaboost: "NDB",
  leandrop: "LDR",
  corestrength: "CRT",
};

export interface VendorTierBreakdown {
  /** Keyed by project code (NDM, CRT, LDR) → tier rows */
  byProject: Record<string, TierBreakdownRow[]>;
  /** Flat list for backward compat (neurodyne only) */
  neurodyne: TierBreakdownRow[];
}

/**
 * Fetches ClickBank audit tier breakdown for ALL vendors,
 * grouped by project code and quantity tier.
 * Only commission-earning tiers (2, 3, 6) are included.
 */
export function useClickbankTierBreakdown() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const opId = useOperationId();

  return useQuery({
    queryKey: ["clickbank-tier-breakdown", start, end, opId],
    queryFn: async () => {
      let q = supabase
        .from("clickbank_audit")
        .select("quantity, amount_brl, amount_usd, item_name, vendor")
        .eq("transaction_type", "SALE")
        .gte("date", start)
        .lte("date", end);
      if (opId) q = q.eq("operation_id", opId);

      const { data, error } = await q;
      if (error || !data) return { byProject: {}, neurodyne: [] } as VendorTierBreakdown;

      // Group by project + quantity
      const projectMap = new Map<string, Map<number, { count: number; totalBrl: number }>>();

      for (const row of data) {
        // Front-end-only: enforces $200-$260 USD AND rejects upgrade/upsell/last-chance items
        if (!isFrontEndCbSale(row.amount_usd, row.item_name, row.vendor)) continue;

        const vendor = (row.vendor || "").toLowerCase();
        const project = VENDOR_PROJECT[vendor];
        if (!project) continue; // unknown vendor → skip

        const qty = row.quantity as number | null;
        // For NDM/NDR/NDB: only commission-earning tiers (2, 3, 6)
        // For other projects (MON, LDR, CRT): allow all quantities
        const needsTierFilter = project === "NDM" || project === "NDR" || project === "NDB";
        if (needsTierFilter && qty !== 2 && qty !== 3 && qty !== 6) continue;

        // Vendor-product disambiguation under neurodyne
        const itemName = (row.item_name || "").toLowerCase();
        if (project === "NDM" && (itemName.includes("nightrenew") || itemName.includes("vitaldefense") || itemName.includes("corestrength"))) continue;

        if (!projectMap.has(project)) projectMap.set(project, new Map());
        const tierMap = projectMap.get(project)!;
        const existing = tierMap.get(qty) || { count: 0, totalBrl: 0 };
        tierMap.set(qty, { count: existing.count + 1, totalBrl: existing.totalBrl + Number(row.amount_brl || 0) });
      }

      const byProject: Record<string, TierBreakdownRow[]> = {};
      for (const [proj, tierMap] of projectMap.entries()) {
        byProject[proj] = Array.from(tierMap.entries()).map(([quantity, agg]) => ({
          quantity,
          count: agg.count,
          totalBrl: agg.totalBrl,
        }));
      }

      // Backward compat: neurodyne flat list
      const neurodyne = byProject["NDM"] || [];

      return { byProject, neurodyne } as VendorTierBreakdown;
    },
    staleTime: 60_000,
  });
}
