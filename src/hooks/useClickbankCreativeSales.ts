import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { resolveCreativeId } from "@/lib/creativeUtils";
import { extractProjectCodeFromNaming, toCreativeCompositeKey } from "@/lib/projectUtils";
import { useOperationId } from "@/contexts/OperationContext";

type CreativeGroupBy = "creative" | "ad";

const ESCOLA_DO_DOLAR_OP = "1dd606e3-dac2-4064-b863-9784307c9e98";

interface CbCreativeSale {
  campaign_name: string;
  revenue_brl: number;
  receipt: string;
}

export interface CbCreativeAttribution {
  count: number;
  revenueBrl: number;
}

function normalizeAdKey(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "SEM_AD";
  return s.replace(/\s+/g, " ").toLowerCase();
}

function extractEscolaAdCode(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = text.match(/\[(AD\s*0*\d{1,3}|VSL\s*0*\d{1,3}|TXT\s*0*\d{1,3})\]/i);
    if (!match) continue;
    const compact = match[1].replace(/\s+/g, "").toUpperCase();
    const parts = compact.match(/^(AD|VSL|TXT)0*(\d{1,3})$/i);
    if (parts) return `${parts[1].toUpperCase()}${parts[2].padStart(2, "0")}`;
    return compact;
  }
  return null;
}

function toEscolaAdGroupKey(sourceText: string): string {
  const creativeId = extractEscolaAdCode(sourceText) ?? resolveCreativeId(sourceText);
  return creativeId !== "SEM_ID" ? `AD_CODE:${creativeId}` : `AD:${normalizeAdKey(sourceText)}`;
}

async function fetchCbCreativeSales(start: string, end: string, opId?: string | null): Promise<CbCreativeSale[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;

  const params: any = { p_start_date: start, p_end_date: end };
  if (opId) params.p_operation_id = opId;

  while (hasMore) {
    const { data, error } = await supabase
      .rpc("get_cb_creative_sales" as any, params)
      .range(from, from + PAGE - 1);

    if (error) {
      console.warn("[useClickbankCreativeSales] RPC error:", error.message);
      return [];
    }
    const rows = (data as any[]) || [];
    all = all.concat(rows);
    hasMore = rows.length === PAGE;
    from += PAGE;
  }

  return all.map((r: any) => ({
    campaign_name: r.campaign_name,
    revenue_brl: Number(r.revenue_brl),
    receipt: r.receipt,
  }));
}

export function useClickbankCreativeSales(groupBy: CreativeGroupBy = "creative") {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["cb-creative-sales", start, end, opId, groupBy],
    queryFn: async () => {
      const sales = await fetchCbCreativeSales(start, end, opId);

      const seenReceipts = new Set<string>();
      const map = new Map<string, CbCreativeAttribution>();

      for (const sale of sales) {
        if (seenReceipts.has(sale.receipt)) continue;
        seenReceipts.add(sale.receipt);

        const creativeId = opId === ESCOLA_DO_DOLAR_OP
          ? extractEscolaAdCode(sale.campaign_name) ?? resolveCreativeId(sale.campaign_name)
          : resolveCreativeId(sale.campaign_name);
        const groupId = groupBy === "ad" && opId === ESCOLA_DO_DOLAR_OP
          ? toEscolaAdGroupKey(sale.campaign_name)
          : creativeId;
        const projectCode = groupBy === "ad" && opId === ESCOLA_DO_DOLAR_OP
          ? "OUTROS"
          : extractProjectCodeFromNaming(sale.campaign_name);
        const compositeKey = toCreativeCompositeKey(groupId, projectCode);
        
        const existing = map.get(compositeKey) || { count: 0, revenueBrl: 0 };
        existing.count++;
        existing.revenueBrl += sale.revenue_brl;
        map.set(compositeKey, existing);
      }

      return map;
    },
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
