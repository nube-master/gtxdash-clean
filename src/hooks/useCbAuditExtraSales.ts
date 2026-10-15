import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import type { CbAuditExtraSale } from "@/components/dashboard/SalesIntelligence";
import { isFrontEndCbSale } from "@/lib/frontEndSale";

/** Known vendors handled by the tier breakdown hook — skip them here */
const KNOWN_VENDORS = new Set([
  "neurodyne", "memoryon", "memopryl", "crstrenght", "crstrange",
  "nrptgtx", "leandrops1", "leandrop", "synaboost", "corestrength", "ailula"
]);

/**
 * Fetches CB audit sales from vendors NOT covered by the tier breakdown hook.
 * This is for truly unknown/new vendors only.
 */
export function useCbAuditExtraSales() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const opId = useOperationId();

  return useQuery({
    queryKey: ["cb-audit-extra-sales", start, end, opId],
    queryFn: async () => {
      let q = supabase
        .from("clickbank_audit")
        .select("date, vendor, amount_brl, amount_usd, item_name, quantity")
        .eq("transaction_type", "SALE")
        .gte("date", start)
        .lte("date", end);
      if (opId) q = q.eq("operation_id", opId);

      const { data, error } = await q;
      if (error || !data) return [];

      // Filter to unknown vendors only AND enforce front-end-only rule
      // (Hotmart bypassa a banda USD porque vende BRL R$ 67-497).
      return data
        .filter((row) => {
          const v = (row.vendor || "").toLowerCase();
          if (v.length === 0 || KNOWN_VENDORS.has(v)) return false;
          if (!isFrontEndCbSale(row.amount_usd, row.item_name, row.vendor)) return false;
          return true;
        })
        .map((row) => ({
          date: row.date || start,
          vendor: row.vendor || "",
          amount_brl: Number(row.amount_brl || 0),
          item_name: row.item_name,
          quantity: row.quantity,
        })) as CbAuditExtraSale[];
    },
    staleTime: 60_000,
  });
}
