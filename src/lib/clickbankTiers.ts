/**
 * ClickBank product tier mapping — based on Tenfi authoritative product catalog.
 * 
 * Real products (from Tenfi):
 *   NeuroDyne 2 Bottles:  $116–$145  (affiliate commission range)
 *   NeuroDyne 3 Bottles:  $146–$200
 *   NeuroDyne 6 Bottles:  $201–$260  (dominant tier, ~$235/$240 commission)
 *   Upgrade (12 Bottles): $261+      (order bumps / upsell bundles — R$0 commission)
 *   Outros:               $0–$115    (NightRenew, CoreStrength, misc products)
 * 
 * NOTE: "1 Pote" does NOT exist as a product. Records with qty=1 are
 * other-brand products (NightRenew, CoreStrength) with lower commissions.
 */

export interface CbTier {
  label: string;
  quantity: number;
  min: number;
  max: number;
  color: string;        // tailwind text class
  bgColor: string;      // tailwind bg class
}

export const CB_TIERS: CbTier[] = [
  { label: "2 Bottles",  quantity: 2,  min: 116, max: 145,   color: "text-violet-400",  bgColor: "bg-violet-400" },
  { label: "3 Bottles",  quantity: 3,  min: 146, max: 200,   color: "text-cyan-400",    bgColor: "bg-cyan-400" },
  { label: "6 Bottles",  quantity: 6,  min: 201, max: 260,   color: "text-emerald-400", bgColor: "bg-emerald-400" },
  { label: "Outros",     quantity: 0,  min: 0,   max: 115,   color: "text-blue-400",    bgColor: "bg-blue-400" },
];

/**
 * Derive the quantity (number of bottles) from the USD commission amount.
 * Returns null for unrecognized amounts.
 */
export function deriveQuantityFromAmount(amountUsd: number): number | null {
  if (amountUsd >= 201 && amountUsd <= 260) return 6;
  if (amountUsd >= 146 && amountUsd <= 200) return 3;
  if (amountUsd >= 116 && amountUsd <= 145) return 2;
  // Amounts > 260 or <= 115 are non-commission (Upgrade/other brands) → Outros
  return 0;
  return null;
}

/**
 * Get the tier label for a given USD amount.
 */
export function getTierLabel(amountUsd: number): string {
  for (const tier of CB_TIERS) {
    if (amountUsd >= tier.min && amountUsd <= tier.max) {
      return tier.label;
    }
  }
  return "Outros";
}

/**
 * Get tier info from a pre-computed quantity field, falling back to amount.
 */
export function getTierFromQuantity(quantity: number | null, amountUsd: number): CbTier {
  if (quantity != null && quantity > 0) {
    const tier = CB_TIERS.find(t => t.quantity === quantity);
    if (tier) return tier;
  }
  // Fallback to amount-based detection
  for (const tier of CB_TIERS) {
    if (amountUsd >= tier.min && amountUsd <= tier.max) {
      return tier;
    }
  }
  return CB_TIERS[CB_TIERS.length - 1]; // default to Outros
}
