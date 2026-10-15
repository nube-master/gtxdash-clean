/**
 * Sales merge utility.
 *
 * REGRA: CartPanda é a FONTE PRIMÁRIA de verdade.
 * - sales_data (CartPanda) → sempre incluir (exceto store="clickbank_ref")
 * - redtrack_events → apenas como BACKUP (vendas que o CP não capturou)
 * - Para cada combo date+utm_campaign, RedTrack só adiciona vendas
 *   que EXCEDAM a contagem do CartPanda (dedup por contagem)
 * - ClickBank entries do sales_data são excluídas
 *   (RedTrack + reconciliador é a fonte autoritativa para CB)
 */

/**
 * Normalizes utm_campaign for dedup key building.
 * CartPanda UTMs often have a pipe+campaignId suffix (e.g. "...top|120241316377050366")
 * that RedTrack UTMs don't have. Stripping this ensures proper matching.
 */
function normalizeCampaignKey(utm: string | null | undefined): string {
  if (!utm) return "";
  let s = utm.toLowerCase().trim();
  // Strip pipe+numeric ID suffix (UTMfy appends |meta_campaign_id)
  s = s.replace(/\|[\d]+$/, "");
  return s;
}

export function normalizeSaleOrderKey(orderId: string | null | undefined): string {
  const raw = String(orderId || "").trim().toLowerCase();
  if (!raw) return "";
  // Strip source prefixes so the same real sale dedupes across mirrors:
  // - rt:<clickid> (RedTrack injection)
  // - hotmart_HP123 (clickbank_audit mirror) vs hm_HP123 (sales_data mirror)
  //   → both collapse to "hp123"
  return raw
    .replace(/^rt:/, "")
    .replace(/^hotmart[_-]?/, "")
    .replace(/^hm[_-]/, "");
}

export function getSaleDedupeKey(sale: { order_id?: string | null; id?: string | null; created_at?: string | null; revenue?: unknown; product_name?: string | null }): string {
  const orderKey = normalizeSaleOrderKey(sale.order_id);
  if (orderKey) return `order:${orderKey}`;
  return `row:${sale.id || `${sale.created_at || ""}|${sale.product_name || ""}|${Number(sale.revenue || 0).toFixed(2)}`}`;
}

/**
 * Merges sales_data + RedTrack sales with CartPanda-first dedup.
 * For each date+campaign combo, CartPanda sales are kept as primary.
 * RedTrack only contributes sales that EXCEED CartPanda's count
 * (i.e., sales that CP missed but RT captured).
 */
export function mergeAllSales(
  salesData: any[],
  redTrackSales: any[],
  { approvedOnly = true }: { approvedOnly?: boolean } = {}
): any[] {
  // From sales_data: exclude ClickBank entries (RedTrack + reconciler covers those)
  const filteredSales = (salesData || []).filter((s: any) => {
    const isClickbank =
      s.store === "clickbank" ||
      s.store === "clickbank_ref" ||
      ((s.order_id || "").toLowerCase().includes("clickbank"));
    return !isClickbank;
  });

  const filteredRT = redTrackSales || [];

  const sales = approvedOnly
    ? filteredSales.filter((s: any) => s.status === "approved")
    : filteredSales;
  const rt = approvedOnly
    ? filteredRT.filter((s: any) => s.status === "approved")
    : filteredRT;

  const officialOrderKeys = new Set<string>();
  for (const s of sales) {
    const key = normalizeSaleOrderKey(s.order_id);
    if (key) officialOrderKeys.add(key);
  }

  // DEDUP: CartPanda is primary source. For each date+campaign combo,
  // only add RedTrack sales that EXCEED the CartPanda count (backup sales CP missed).
  // Key is normalized to strip |campaignId suffix that CartPanda/UTMfy appends.
  const cpCountByKey = new Map<string, number>();
  for (const s of sales) {
    const key = `${s.date || ""}||${normalizeCampaignKey(s.utm_campaign)}`;
    cpCountByKey.set(key, (cpCountByKey.get(key) || 0) + 1);
  }

  const rtCountUsed = new Map<string, number>();
  const rtExtras: any[] = [];
  for (const r of rt) {
    const rtOrderKey = normalizeSaleOrderKey(r.order_id);
    if (rtOrderKey && officialOrderKeys.has(rtOrderKey)) continue;

    const isAuditOnlyClickbank = r?._source === "clickbank_audit" || r?.store === "clickbank" || r?.store === "hotmart";
    if (isAuditOnlyClickbank) {
      rtExtras.push(r);
      continue;
    }

    const key = `${r.date || ""}||${normalizeCampaignKey(r.utm_campaign)}`;
    const cpCount = cpCountByKey.get(key) || 0;
    const usedSoFar = rtCountUsed.get(key) || 0;
    // Only add RT sales beyond what CP already has
    if (usedSoFar + 1 > cpCount) {
      rtExtras.push(r);
    }
    rtCountUsed.set(key, usedSoFar + 1);
  }

  return [...sales, ...rtExtras];
}

/**
 * Utility for inline queries (useCampaign3DayData, useMarketPulseData)
 * that don't use the normalized RedTrack sales format.
 * Returns the set of dates where RedTrack should be excluded in favor of sales_data.
 *
 * NOTE: With the new additive logic, this returns an empty set.
 * RedTrack is never excluded — it's always summed with CartPanda.
 */
export function getRedTrackExcludeDates(
  _salesData: any[],
  _redTrackPurchases: { date: string; revenue: number }[]
): Set<string> {
  return new Set<string>();
}

/**
 * For inline queries: returns dates where clickbank should be excluded from sales_data.
 * With the new logic, ClickBank entries from sales_data are ALWAYS excluded
 * (RedTrack + reconciler is the authoritative source).
 */
export function getClickbankExcludeDates(
  salesData: any[],
  _redTrackPurchases: { date: string; revenue: number }[]
): Set<string> {
  // Return ALL dates that have ClickBank entries — they should all be excluded
  const dates = new Set<string>();
  for (const s of salesData) {
    const isClickbank =
      s.store === "clickbank" ||
      ((s.order_id || "").toLowerCase().includes("clickbank"));
    if (isClickbank && s.date) dates.add(s.date);
  }
  return dates;
}
