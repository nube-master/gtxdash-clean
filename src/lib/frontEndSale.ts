/**
 * Single source of truth for "front-end sale" classification.
 *
 * A ClickBank/Digistore audit row counts as a front-end sale only if:
 *  1. amount_usd is within commission band ($200-$260), AND
 *  2. item_name does NOT contain upsell/upgrade/last-chance/bump markers.
 *
 * Non-CB platforms (CartPanda/BuyGoods) are always front-end if revenue > 0.
 * Hotmart (EDD): vende BRL R$ 67-497 — bypass da banda USD, mantém bloqueio de upsell.
 */

export const FRONTEND_USD_MIN = 200;
export const FRONTEND_USD_MAX = 260;

const UPSELL_NAME_REGEX =
  /\b(upgrade|upsell|last\s*chance|order\s*bump|bump|downsell)\b/i;

export function isUpsellItemName(itemName: unknown): boolean {
  if (!itemName) return false;
  return UPSELL_NAME_REGEX.test(String(itemName));
}

export function isFrontEndCbSale(
  amountUsd: unknown,
  itemName?: unknown,
  vendor?: unknown,
): boolean {
  if (isUpsellItemName(itemName)) return false;
  // Hotmart bypassa a banda USD (produtos em BRL R$ 67-497).
  if (String(vendor ?? "").toLowerCase() === "hotmart") return true;
  const v = Number(amountUsd ?? 0);
  if (!Number.isFinite(v)) return false;
  if (v < FRONTEND_USD_MIN || v > FRONTEND_USD_MAX) return false;
  return true;
}

/** Filter helper for arrays of CB-audit-like rows. */
export function filterFrontEndCbRows<
  T extends { amount_usd?: number | null; item_name?: string | null; vendor?: string | null },
>(rows: T[] | null | undefined): T[] {
  if (!rows) return [];
  return rows.filter((r) => isFrontEndCbSale(r.amount_usd, r.item_name, r.vendor));
}
