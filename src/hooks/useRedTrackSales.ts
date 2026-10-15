import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { resolveProductName } from "@/lib/productNames";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { buildReceiptAmountMap, getRedtrackReceipt, resolveRedtrackRevenueBrl } from "@/lib/redtrackRevenue";
import { useOperationId } from "@/contexts/OperationContext";

const SAO_PAULO_TZ = "America/Sao_Paulo";

/** Maps CB audit vendor to project code for product attribution */
const CB_VENDOR_TO_PROJECT: Record<string, string> = {
  memopryl: "MMP",
  neurodyne: "MMP", // legacy vendor nick — produto real MemoPryl
  memoryon: "MO",
  crstrenght: "CRT",
  crstrange: "CRT",
  nrptgtx: "CRT",
  leandrops1: "LDR",
  synaboost: "NDB",
  leandrop: "LDR",
  corestrength: "CRT",
};

function resolveProductFromCbVendor(
  receipt: string | null,
  vendorMap: Map<string, string>
): string | null {
  if (!receipt) return null;
  const vendor = vendorMap.get(receipt);
  if (!vendor) return null;
  const code = CB_VENDOR_TO_PROJECT[vendor.toLowerCase().trim()];
  return code || null;
}

type ClickbankAuditRow = {
  receipt: string | null;
  amount_brl: number | string | null;
  quantity: number | null;
  product_name: string | null;
  item_name: string | null;
  vendor: string | null;
  created_at: string | null;
  date: string | null;
};

function getSaoPauloDayBoundsUTC(day: string) {
  const startUtc = `${day}T03:00:00Z`;
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDay = next.toISOString().slice(0, 10);
  const endExclusiveUtc = `${nextDay}T03:00:00Z`;
  return { startUtc, endExclusiveUtc };
}

function toSaoPauloDate(isoDateTime: string | null | undefined, fallbackDay: string) {
  if (!isoDateTime) return fallbackDay;
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return fallbackDay;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function normalizeReceipt(value: string | null | undefined) {
  const receipt = String(value || "").trim().toUpperCase();
  return receipt || null;
}

export function useRedTrackSales() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const usdToBrl = useExchangeRate();
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["redtrack-sales", start, end, usdToBrl, opId],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;
      const { startUtc } = getSaoPauloDayBoundsUTC(start);
      const { endExclusiveUtc: rangeEndExclusiveUtc } = getSaoPauloDayBoundsUTC(end);

      while (hasMore) {
        let q = supabase
          .from("redtrack_events")
          .select("*")
          .in("event_type", ["purchase", "upsell"])
          .gte("occurred_at", startUtc)
          .lt("occurred_at", rangeEndExclusiveUtc)
          .order("occurred_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (opId) q = q.eq("operation_id", opId);

        const { data, error } = await q;
        if (error) {
          console.warn("[useRedTrackSales] Query error:", error.message);
          return [];
        }
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const auditRows = await fetchAllPaginated(
        "clickbank_audit",
        "receipt, amount_brl, quantity, product_name, item_name, vendor, created_at, date",
        (q: any) => {
          let query = q
            .gte("date", start)
            .lte("date", end)
            .eq("transaction_type", "SALE")
            .gte("amount_usd", 200)
            .lte("amount_usd", 260);
          if (opId) query = query.eq("operation_id", opId);
          return query;
        },
        "created_at",
        false,
      ) as ClickbankAuditRow[];

      const receiptAmountMap = buildReceiptAmountMap(auditRows as any[]);
      const receiptQtyMap = new Map<string, number>();
      const receiptVendorMap = new Map<string, string>();
      for (const r of auditRows) {
        const receipt = normalizeReceipt(r.receipt);
        if (receipt) {
          if (r.quantity != null) receiptQtyMap.set(receipt, Number(r.quantity));
          if (r.vendor) receiptVendorMap.set(receipt, r.vendor);
          if (r.item_name) {
            // Also store item_name for product resolution fallback
            if (!receiptVendorMap.has(receipt) || !r.vendor) {
              // vendor takes priority, item_name is fallback
            }
          }
        }
      }

      const filtered = allData.filter((e: any) =>
        e.event_type === "upsell" || Number(e.amount || 0) > 0
      );

      const redtrackReceipts = new Set<string>(
        filtered
          .map((e: any) => normalizeReceipt(getRedtrackReceipt(e)))
          .filter((receipt): receipt is string => !!receipt)
      );

      // DEDUP por receipt: mesma venda pode aparecer 2x no RedTrack
      // (evento original + reconcile manual com offer_name "[MANUAL]/Reconciled").
      // Prioriza evento NÃO-manual (offer_name real da campanha).
      const byReceipt = new Map<string, any>();
      const noReceipt: any[] = [];
      for (const e of filtered) {
        const receipt = normalizeReceipt(getRedtrackReceipt(e));
        if (!receipt) {
          noReceipt.push(e);
          continue;
        }
        const existing = byReceipt.get(receipt);
        const isManual = /\[MANUAL\]|reconcil/i.test(String(e.offer_name || "") + String(e.redtrack_id || ""));
        if (!existing) {
          byReceipt.set(receipt, e);
        } else {
          const existingIsManual = /\[MANUAL\]|reconcil/i.test(String(existing.offer_name || "") + String(existing.redtrack_id || ""));
          // Prefer non-manual event over manual reconcile
          if (existingIsManual && !isManual) byReceipt.set(receipt, e);
        }
      }
      const dedupedFiltered = [...byReceipt.values(), ...noReceipt];

      const redtrackSales = dedupedFiltered.map((e) => {
        const receipt = normalizeReceipt(getRedtrackReceipt(e));
        return {
          id: e.id,
          date: toSaoPauloDate(e.occurred_at, start),
          revenue: resolveRedtrackRevenueBrl(e, usdToBrl, receiptAmountMap),
          status: "approved",
          order_id: receipt || e.clickid || e.redtrack_id || e.id,
          product_name: resolveProductFromCbVendor(receipt, receiptVendorMap) || resolveProductName(e.offer_name, e.product_name, "RedTrack"),
          offer_name: e.offer_name,
          store: "redtrack",
          utm_source: e.utm_source,
          utm_campaign: e.utm_campaign,
          utm_medium: (e.utm_medium || "").replace(/\|[\d]+$/, ""),
          utm_content: e.utm_content,
          utm_term: e.utm_term,
          created_at: e.occurred_at || e.created_at,
          event_type: e.event_type || "purchase",
          amount: Number(e.amount || 0),
          quantity: receipt ? (receiptQtyMap.get(receipt) ?? null) : null,
          _source: "redtrack",
          _country: e.country || e.raw_payload?.country || null,
          _device: e.device || e.raw_payload?.device || null,
          _os: e.os || e.raw_payload?.os || null,
          _device_brand: e.raw_payload?.device_brand || null,
          _browser: e.browser || e.raw_payload?.browser || null,
          _city: e.city || e.raw_payload?.city || null,
          _placement_page: e.raw_payload?.page || null,
          _connection_type: e.raw_payload?.connection_type || null,
        };
      });

      const clickbankOnlySales = auditRows
        .filter((row) => {
          const receipt = normalizeReceipt(row.receipt);
          return !!receipt && !redtrackReceipts.has(receipt);
        })
        .map((row) => ({
          id: `cb-audit-${normalizeReceipt(row.receipt)}`,
          date: row.date || start,
          revenue: Number(row.amount_brl || 0),
          status: "approved",
          order_id: row.receipt,
          product_name: row.product_name || row.item_name || row.vendor || "ClickBank",
          offer_name: row.item_name || null,
          store: "clickbank",
          utm_source: null,
          utm_campaign: null,
          utm_medium: null,
          utm_content: null,
          utm_term: null,
          created_at: row.created_at || `${row.date || start}T03:00:00Z`,
          event_type: "purchase",
          amount: null,
          quantity: row.quantity ?? null,
          _source: "clickbank_audit",
          _country: null,
          _device: null,
          _os: null,
          _device_brand: null,
          _browser: null,
          _city: null,
          _placement_page: null,
          _connection_type: null,
        }));

      return [...redtrackSales, ...clickbankOnlySales].sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      });
    },
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
