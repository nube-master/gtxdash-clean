export type ClickbankAuditAmountRow = {
  receipt: string | null;
  amount_brl: number | string | null;
};

export type RedtrackRevenueSource = {
  amount?: number | string | null;
  currency?: string | null;
  raw_payload?: any;
  redtrack_id?: string | null;
  transaction_id?: string | null;
};

export function getRedtrackReceipt(event: RedtrackRevenueSource): string | null {
  const rawReceipt =
    event?.raw_payload?.p_sub1 ??
    event?.raw_payload?.receipt ??
    event?.raw_payload?.order ??
    event?.transaction_id ??
    null;

  if (rawReceipt) {
    const receipt = String(rawReceipt).trim();
    if (receipt) return receipt;
  }

  const redtrackId = String(event?.redtrack_id || "").trim();
  const manualReceiptMatch = redtrackId.match(/^reconcile-\d{4}-\d{2}-\d{2}-receipt-(.+)$/i);
  if (manualReceiptMatch?.[1]) {
    const receipt = manualReceiptMatch[1].trim();
    return receipt || null;
  }

  return null;
}

export function buildReceiptAmountMap(rows: ClickbankAuditAmountRow[] | null | undefined = []): Map<string, number> {
  if (!rows || !Array.isArray(rows)) return new Map<string, number>();
  const receiptAmountMap = new Map<string, number>();

  for (const row of rows) {
    const receipt = row?.receipt ? String(row.receipt).trim() : "";
    const amountBrl = Number(row?.amount_brl || 0);

    if (!receipt || amountBrl <= 0 || receiptAmountMap.has(receipt)) continue;
    receiptAmountMap.set(receipt, amountBrl);
  }

  return receiptAmountMap;
}

export function resolveRedtrackRevenueBrl(
  event: RedtrackRevenueSource,
  usdToBrl: number,
  receiptAmountMap?: Map<string, number>
): number {
  if ((event?.currency || "").toUpperCase() === "BRL") {
    return Number(event?.amount || 0);
  }

  const receipt = getRedtrackReceipt(event);
  const auditAmount = receipt ? receiptAmountMap?.get(receipt) : undefined;

  if (typeof auditAmount === "number" && auditAmount > 0) {
    return auditAmount;
  }

  return Number(event?.amount || 0) * usdToBrl;
}
