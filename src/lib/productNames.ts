/**
 * Manual mapping: RedTrack offer_name → display name.
 * Add new entries here as new products are added.
 */
const OFFER_NAME_MAP: Record<string, string> = {
  "Facebook | Clickbank | NDM | Controle": "NDM",
  "NDM": "NDM",
  "Facebook | Clickbank | NDR | Controle": "NDR",
  "NDR": "NDR",
  "Facebook | Clickbank | NDB | Controle": "NDB",
  "NDB": "NDB",
  "Facebook | Clickbank | LDG | Controle": "LDR",
  "LDG": "LDR",
  "Facebook | Clickbank | CRT | Controle": "CRT",
  "CRT": "CRT",
  "Facebook | Clickbank | AILULA | Controle": "CRT",
  "AILULA": "CRT",
  "[MANUAL] Ajuste paridade CB v4": "NDM",
  "[MANUAL] Facebook | Clickbank | NDB | Reconciled": "NDB",
  
  "[MANUAL] Facebook | Clickbank | NDM | Reconciled": "NDM",
  "[MANUAL] Facebook | Clickbank | NDR | Reconciled": "NDR",
  "[MANUAL] Facebook | Clickbank | LDG | Reconciled": "LDR",
  "[MANUAL] Facebook | Clickbank | CRT | Reconciled": "CRT",
  "[MANUAL] Facebook | Clickbank | AILULA | Reconciled": "CRT",
  // Add future products below:
};

/** ClickBank affiliate IDs that map to known products (defaults, overridden by clickbank_vendors) */
const DEFAULT_AFFILIATE_MAP: Record<string, string> = {
  guipires: "NDM",
  guipiresp: "NDM",
  gtxndr: "NDR",
  gtxndb: "NDB",
  
  gtxwl: "LDR",
  nrptgtx: "CRT",
};

/** Dynamic map built from app_settings clickbank_vendors — overrides defaults */
let dynamicAffiliateMap: Record<string, string> | null = null;

/** Call this to update the affiliate→project mapping from clickbank_vendors config */
export function setDynamicAffiliateMap(vendors: { nickname: string; label: string }[]) {
  dynamicAffiliateMap = {};
  for (const v of vendors) {
    if (v.nickname && v.label) {
      dynamicAffiliateMap[v.nickname.trim().toLowerCase()] = v.label.trim().toUpperCase();
    }
  }
}

/** Returns the active affiliate map (dynamic overrides defaults) */
function getAffiliateMap(): Record<string, string> {
  if (dynamicAffiliateMap) return { ...DEFAULT_AFFILIATE_MAP, ...dynamicAffiliateMap };
  return DEFAULT_AFFILIATE_MAP;
}

/** Pattern-based detection for product_name strings (CartPanda, etc.) */
const PRODUCT_PATTERNS: { regex: RegExp; code: string }[] = [
  { regex: /leandrops|ldg/i, code: "LDR" },
  { regex: /\bldr\b/i, code: "LDR" },
  { regex: /\bnmd\b/i, code: "NMD" },
  { regex: /\bndb\b/i, code: "NDB" },
  { regex: /\bndm\b|neurodyne\s*m/i, code: "NDM" },
  { regex: /\bndr\b/i, code: "NDR" },
  { regex: /\bmo\b|\bmon\b|memoryon/i, code: "MO" },
  { regex: /memopryl|\bmmp\b/i, code: "MMP" },
  { regex: /\bcrt\b|\bcst\b|core\s*stren(?:ge?th?|ght)|crstrenght|crstrange/i, code: "CRT" },
  { regex: /ailula/i, code: "CRT" },
  { regex: /\bntd\b/i, code: "NTD" },
  { regex: /telemed|semaglutide|tirzepatide|glp-?1/i, code: "PP" },
];

/**
 * Resolves a human-friendly product name from a RedTrack sale/event.
 * Priority: offer_name mapping → product_name pattern → fallback.
 */
export function resolveProductName(
  offerName?: string | null,
  productName?: string | null,
  fallback = "Produto",
  utmSource?: string | null
): string {
  if (offerName) {
    const mapped = OFFER_NAME_MAP[offerName.trim()];
    if (mapped) return mapped;
  }

  // Check affiliate ID via utm_source
  if (utmSource) {
    const affCode = getAffiliateMap()[utmSource.trim().toLowerCase()];
    if (affCode) return affCode;
  }

  // Pattern match on product_name (e.g. "Leandrops DTC FE LeanDrops 3 B" → "LDG")
  if (productName) {
    for (const { regex, code } of PRODUCT_PATTERNS) {
      if (regex.test(productName)) return code;
    }
  }

  // If offer_name exists but isn't mapped, try to extract the apelido (3rd segment if present)
  if (offerName) {
    const parts = offerName.split("|").map((p) => p.trim()).filter(Boolean);
    const generic = new Set([
      "Facebook", "Clickbank", "Controle", "Google", "TikTok",
      "Digistore24", "CartPanda", "BuyGoods", "ClickBank",
      "H&W", "HW", "Sphere", "MaxNuts", "Newsbreak", "Meta",
    ]);
    // Prefer 3rd segment (apelido) when present and not generic
    if (parts[2] && !generic.has(parts[2])) return parts[2].slice(0, 30);
    const meaningful = parts.find((p) => p && !generic.has(p));
    if (meaningful) return meaningful.slice(0, 30);
  }
  return fallback;
}
