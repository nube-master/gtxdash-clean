/**
 * Creative Intelligence V3 — Utilities
 * Strict extraction, weighted calculations, 3-day diagnostic engine, scoring.
 */
import { extractProjectCodeFromNaming } from "@/lib/projectUtils";

// USD → BRL conversion is handled dynamically via useExchangeRate() hook
// Traffic data is already stored in BRL after sync-meta-ads conversion

// ─── Creative ID Extraction (STRICT) ────────────────────────────────────

/**
 * Extract the SECOND [bracket] tag from a campaign name / utm_campaign.
 * This is the ONLY method to identify creative IDs.
 * E.g. "[BMV-C/A-10] [H02B28] [CONVERSÃO]..." → "H02B28"
 * "[BMGTX-C/A05] [H02B28-TOM]" → "H02B28-TOM"
 */
export function extractSecondBracketTag(text: string | null | undefined): string | null {
  if (!text) return null;
  // Normalize split date brackets [DD] [MM] → [DD.MM] before parsing
  const normalized = text.replace(/\[(\d{2})\]\s*\[(\d{2})\]/g, "[$1.$2]");
  const matches = normalized.match(/\[([^\]]+)\]/g);
  if (!matches || matches.length < 2) return null;
  let raw = matches[1].replace(/^\[|\]$/g, "").trim();
  if (!raw) return null;
  // Clean nested/malformed brackets (e.g. "H02B31 [ND" → "H02B31")
  raw = raw.replace(/\s*\[.*$/, "").trim();
  if (!raw) return null;
   // Normalize IMG IDs: zero-pad number (IMG7 → IMG07, IMG14 stays IMG14)
   if (/^IMG\d/i.test(raw)) {
     return normalizeImgId(raw);
   }
  return normalizeHBId(raw);
}

/**
 * Extract an HxxBxx(-SUFFIX) creative ID from ANY text (not bracket-dependent).
 * Scans the full string for the first occurrence of HxxBxx pattern.
 * Supports suffixes with spaces when inside brackets (e.g. "[H02B28-THE CHOSEN]").
 * E.g. "[BMV-C/A-10] [H01B28-JAPA]" → "H01B28-JAPA"
 *      "[H02B31-TOM]" → "H02B31-TOM"
 *      "[H02B28-THE CHOSEN]" → "H02B28-THE CHOSEN"
 */
export function extractCreativeIdFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  // First try: extract IMG creative ID from within brackets (e.g. [IMG14], [IMG014])
  const imgBracketMatch = text.match(/\[(IMG0*\d+)\]/i);
  if (imgBracketMatch) {
    const raw = imgBracketMatch[1].trim();
    if (raw) return normalizeImgId(raw);
  }
  // Second try: extract HxxBxx from within brackets
  const bracketMatch = text.match(/\[(H\d{1,2}B\d{1,2}[^\]]*)\]/i);
  if (bracketMatch) {
    const raw = bracketMatch[1].trim().replace(/\s*\[.*$/, "").trim();
    if (raw) return normalizeHBId(raw);
  }

  // FAHTO special patterns (AURAD, VTPAD, EDBAD, AETAD, WL-VTPAD)
  const fahtoMatch = text.match(/([A-Z]{2,6}AD\d{1,3}(H\d{1,3})?|VTPAD-?[A-Z0-9]+|WL-VTPAD-[A-Z0-9]+)/i);
  if (fahtoMatch) {
    return fahtoMatch[1].toUpperCase();
  }

  // Fallback: bare regex (no spaces in suffix)
  const match = text.match(/\b(H\d{1,2}B\d{1,2}(?:-[A-Z0-9]+(?:-[A-Z0-9]+)*)?)\b/i);
  if (match) return normalizeHBId(match[1]);
  
  // Last resort: if the text ITSELF matches the valid creative pattern, return it normalized
  if (isValidCreativePattern(text)) {
    return text.trim().toUpperCase().replace(/[\[\]]/g, "");
  }

  return null;
}

/** Normalize IMG ID: zero-pad the number part (IMG7 → IMG07) and uppercase suffix */
function normalizeImgId(raw: string): string {
  const imgMatch = raw.match(/^(IMG)(\d+)(.*)/i);
  if (imgMatch) {
    const num = imgMatch[2].padStart(2, "0");
    const suffix = imgMatch[3] ? imgMatch[3].trim().toUpperCase() : "";
    return `IMG${num}${suffix}`;
  }
  return raw.toUpperCase();
}

/** Normalize HxxBxx ID with zero-padded prefix and uppercased suffix */
function normalizeHBId(raw: string): string {
  const hbMatch = raw.match(/^(H\d{1,2})(B\d{1,2})(.*)/i);
  if (hbMatch) {
    const h = hbMatch[1].toUpperCase().replace(/H(\d{1,2})/, (_, d: string) => `H${d.padStart(2, "0")}`);
    const b = hbMatch[2].toUpperCase().replace(/B(\d{1,2})/, (_, d: string) => `B${d.padStart(2, "0")}`);
    // Normalize separators: treat space, +, _, / as hyphen, then strip leading/trailing seps
    let suffix = hbMatch[3] ? hbMatch[3].trim().toUpperCase() : "";
    suffix = suffix.replace(/[\s+_/]+/g, "-").replace(/^-+|-+$/g, "");
    return suffix ? `${h}${b}-${suffix}` : `${h}${b}`;
  }
  return raw.toUpperCase();
}

// ─── IMG Creative Qualification ─────────────────────────────────────────
// IMG creatives are ALWAYS differentiated by author tag.
// For IMG, the SAME person does copy + design, so the tag = the author.
// E.g. "IMG01" with [IAN] → "IMG01-IAN", "IMG01" with [SP] → "IMG01-SP"
//      "IMG14" with [JD] → "IMG14-JD" (João), "IMG14" with [SP] → "IMG14-SP" (Peres)

// ALL known person tags — used to qualify IMG IDs into separate creatives
const ALL_PERSON_TAGS = new Set(["DD", "SK", "SP", "JC", "IAN", "VK", "JD", "IG", "GV", "ENZ"]);

// Unified name map for IMG creatives: tag → display name (same for copy & editor)
const IMG_PERSON_NAME: Record<string, string> = {
  DD: "Dan",
  SK: "Samuka",
  SP: "Peres",
  JC: "Jadiel",
  IAN: "Ian",
  VK: "Vitor",
  JD: "João",
  IG: "Iza",
};

// ─── Default person tags: fallback when NO person tag is found in nomenclature ──
// Based on data analysis: SP is the primary author for the vast majority of IMG creatives.
// IAN-dominant creatives (IMG04, IMG09, IMG11, IMG13, IMG20, IMG22) already carry [IAN] in their campaign names.
const IMG_DEFAULT_TAG: Record<string, string> = {
  IMG01: "SP", IMG02: "SP", IMG03: "SP", IMG04: "IAN", IMG05: "SP",
  IMG06: "SP", IMG07: "SP", IMG08: "SP", IMG09: "IAN", IMG10: "SP",
  IMG11: "IAN", IMG12: "SP", IMG13: "IAN", IMG14: "SP", IMG15: "SP",
  IMG16: "SP", IMG17: "SP", IMG18: "SP", IMG19: "SP", IMG20: "IAN",
  IMG21: "SP", IMG22: "IAN", IMG23: "SP", IMG24: "SP", IMG25: "SP",
  IMG26: "SP", IMG27: "SP", IMG28: "SP", IMG29: "SP", IMG30: "SP",
  IMG31: "SP", IMG32: "SP", IMG33: "SP", IMG34: "SP", IMG35: "SP",
  IMG36: "SP", IMG37: "SP", IMG38: "SP", IMG39: "SP", IMG40: "SP",
  IMG41: "SP", IMG42: "SP", IMG43: "SP", IMG44: "SP", IMG45: "SP",
};

// ─── Manual Team Overrides (used only for detectTeamFromCampaign fallback) ──
const MANUAL_TEAM_OVERRIDES: Record<string, { copyWriter: string; editor: string }> = {
  // These are kept for team detection, but NO LONGER skip qualification
};

/**
 * For IMG creative IDs, extract the copy tag from campaign/ad text and append it.
 * This ensures IMG01 by Ian ≠ IMG01 by Peres.
 * For non-IMG IDs, returns the ID unchanged.
 * When no tag is found, uses IMG_DEFAULT_TAG fallback (e.g. IMG14 → IMG14-SP).
 */
function qualifyImgId(baseId: string, ...texts: (string | null | undefined)[]): string {
  if (!/^IMG\d/i.test(baseId)) return baseId;
  // Ensure consistent normalization (IMG7 → IMG07)
  baseId = normalizeImgId(baseId);

   // Scan all texts for bracket tags that match a known person tag
   for (const text of texts) {
     if (!text) continue;
     const brackets = text.match(/\[([^\]]+)\]/g);
     if (!brackets) continue;
 
     for (const bracket of brackets) {
       const raw = bracket.replace(/[\[\]]/g, "").trim().toUpperCase();
       // Handle combined tags like [SP.SP] or [IAN.VK]
       const parts = raw.includes(".") ? raw.split(".") : [raw];
       for (const part of parts) {
         const normalized = part.trim();
         if (ALL_PERSON_TAGS.has(normalized)) {
          return `${baseId}-${normalized}`;
        }
      }
    }
  }

  // Fallback: use default tag if defined, otherwise leave unqualified
  const defaultTag = IMG_DEFAULT_TAG[baseId.toUpperCase()];
  if (defaultTag) return `${baseId}-${defaultTag}`;

  return baseId;
}

/**
 * Scan ALL brackets in the given texts for a variation tag (V01, V02, V03…)
 * and return the normalized suffix (e.g. "V02") to append to the creative ID.
 * Returns null when no variation bracket is found.
 *
 * This lets us treat [H02B28] [V01] and [H02B28] [V02] as DIFFERENT creatives
 * (H02B28-V01 vs H02B28-V02) instead of merging them under H02B28.
 */
function extractVariationTag(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const brackets = text.match(/\[([^\]]+)\]/g);
    if (!brackets) continue;
    for (const bracket of brackets) {
      const raw = bracket.replace(/[\[\]]/g, "").trim().toUpperCase();
      // Match V01/V02… (variation) or HV1/HV2… (headline variation)
      const mv = raw.match(/^V(\d{1,3})$/);
      if (mv) return `V${mv[1].padStart(2, "0")}`;
      const mhv = raw.match(/^HV(\d{1,3})$/);
      if (mhv) return `HV${mhv[1].padStart(2, "0")}`;
      // [AVATAR 9] / [AVATAR9] / [AVATAR-9] → AVATAR09 (treats avatar variations as distinct creatives)
      const mav = raw.match(/^AVATAR[\s\-_]*(\d{1,3})$/);
      if (mav) return `AVATAR${mav[1].padStart(2, "0")}`;
    }
  }
  return null;
}

/** Append a variation suffix (-V02) to a creative ID when applicable. */
function appendVariationTag(baseId: string, ...texts: (string | null | undefined)[]): string {
  if (baseId === "SEM_ID") return baseId;
  const variation = extractVariationTag(...texts);
  if (!variation) return baseId;
  // Avoid double-appending if the suffix is already present (e.g. baseId already ends with -V02)
  if (new RegExp(`-${variation}$`, "i").test(baseId)) return baseId;
  return `${baseId}-${variation}`;
}

/**
 * Whitelist de padrões que constituem um ID de criativo VÁLIDO.
 * H##B##, IMG##, AD##, VSL##, TXT##. Qualquer outra coisa na 2ª tag
 * (BID-CAP, CBO, COACHCAP, SMART, BUD###, etc.) é ESTRUTURA de campanha
 * e NÃO deve virar criativo — polui o ranking.
 */
export function isValidCreativePattern(raw: string | null | undefined): boolean {
  if (!raw) return false;
  // Patterns like H##B##, IMG##, AD##, VSL##, TXT##.
  // Expanded for FAHTO: accept AURAD##, VTPAD##, EDBAD##, AETAD##, WL-VTPAD-##, VTPAD-##, etc.
  const CREATIVE_PATTERN = /^([A-Z]{2,6}AD\d{1,3}(H\d{1,3})?|H\d{1,2}B\d{1,2}|IMG\d{1,3}|AD\s?\d{1,3}(H\d{1,3})?|VSL\d{1,3}|TXT\d{1,3}|VTPAD-?[A-Z0-9]+|WL-VTPAD-[A-Z0-9]+)/i;
  return CREATIVE_PATTERN.test(raw.trim());
}

/**
 * Blacklist explícita de nomes de ESTRUTURA que às vezes aparecem na 2ª tag.
 * Redundante com o whitelist acima, mas documenta a intenção.
 */
const STRUCTURE_TAG_BLACKLIST = /^(BID[-\s]?CAP|COACHCAP|CBO|SMART|MANUAL|BUD\d+|SCALE|TESTE?|PRE[-\s]?SCALE)/i;

function extractSecondBracketStrict(text: string | null | undefined): string | null {
  const raw = extractSecondBracketTag(text);
  if (!raw) return null;
  if (STRUCTURE_TAG_BLACKLIST.test(raw)) return null;
  if (!isValidCreativePattern(raw)) return null;
  return raw;
}

/**
 * Resolve creative ID.
 * Ordem de resolução (STRICT — só aceita padrão válido de criativo):
 *  1. Padrão HxxBxx / IMG## dentro de campaign_name ou utm_campaign
 *  2. 2ª tag do campaign_name/utm_campaign, SE bater whitelist e não bater blacklist
 *  3. Fallback: padrão dentro de ad_name ou utm_content (útil quando campanha é
 *     estrutural — CBO/BID-CAP/COACHCAP — e o ID real está só no anúncio)
 *  4. "SEM_ID"
 */
export function resolveCreativeId(
  campaignName?: string | null,
  utmCampaign?: string | null,
  adName?: string | null,
  utmContent?: string | null,
  metaAdName?: string | null,
  rtAd?: string | null,
  rtSub4?: string | null,
): string {
  const isSujo = (val: any) => 
    !val || 
    typeof val !== 'string' || 
    /^v3_|^[a-f0-9]{8}-|^[a-z0-9]{20}/i.test(val) || 
    /[,&]/.test(val) ||
    val === "[OVERVIEW]";

  // 1. Real Meta Ad Name (JOIN via meta_ad_status populated in traffic_data or payload)
  if (!isSujo(metaAdName)) {
    const id = extractCreativeIdFromText(metaAdName);
    if (id) return qualifyImgId(appendVariationTag(id, metaAdName), metaAdName);
  }

  // 2. RedTrack Code (rt_ad / clickSub4)
  if (!isSujo(rtAd)) {
    const id = extractCreativeIdFromText(rtAd);
    if (id) return qualifyImgId(appendVariationTag(id, rtAd), rtAd);
  }

  // 3. RedTrack sub4
  if (!isSujo(rtSub4)) {
    const id = extractCreativeIdFromText(rtSub4);
    if (id) return qualifyImgId(appendVariationTag(id, rtSub4), rtSub4);
  }

  // 4. utm_content / adName
  const rawAd = !isSujo(adName) ? adName : !isSujo(utmContent) ? utmContent : null;
  if (rawAd) {
    const id = extractCreativeIdFromText(rawAd);
    if (id) return qualifyImgId(appendVariationTag(id, rawAd), rawAd);
  }

  // 5. Campaign Bracket (Fallback)
  const fromCampaign = extractCreativeIdFromText(campaignName) || extractCreativeIdFromText(utmCampaign);
  if (fromCampaign) {
    return qualifyImgId(appendVariationTag(fromCampaign, campaignName, utmCampaign), campaignName, utmCampaign);
  }

  return "SEM_ID";
}


/**
 * Resolve creative ID with campaign_name as primary source.
 * campaign_name (second bracket tag) is authoritative.
 * ad_name is only used as fallback when campaign_name has no creative ID.
 * For IMG creatives, qualifies with copy tag for author differentiation.
 * 
 * NOTE: Use resolveCreativeIdForTraffic for spend/traffic attribution
 * where the ad_name represents the actual creative that ran.
 */
export function resolveCreativeIdWithAd(
  campaignName?: string | null,
  adName?: string | null,
): string {
  // Primary: campaign_name second bracket tag (authoritative)
  // resolveCreativeId already qualifies IMG IDs — do NOT re-qualify
  const campaignCreativeId = resolveCreativeId(campaignName);
  if (campaignCreativeId !== "SEM_ID") {
    return campaignCreativeId;
  }
  // Fallback: extract from ad_name only if campaign has no ID
  const adCreativeId = extractCreativeIdFromText(adName);
  if (adCreativeId) {
    return appendVariationTag(qualifyImgId(adCreativeId, adName, campaignName), adName, campaignName);
  }
  return "SEM_ID";
}

/**
 * Resolve creative ID for TRAFFIC/SPEND attribution.
 * Prioritizes ad_name (the actual creative that ran) over campaign_name.
 * This is critical because a campaign like [IMG03] can run ads like [IMG25],
 * and the spend should be attributed to IMG25, not IMG03.
 * 
 * Falls back to campaign_name only if ad_name has no creative ID.
 */
export function resolveCreativeIdForTraffic(
  campaignName?: string | null,
  adName?: string | null,
): string {
  // Primary: ad_name — this is the actual creative asset that ran
  const adCreativeId = extractCreativeIdFromText(adName);
  if (adCreativeId) {
    // Use ad_name for ID but campaign_name for tag qualification context
    return appendVariationTag(qualifyImgId(adCreativeId, adName, campaignName), adName, campaignName);
  }
  // Fallback: campaign_name second bracket tag
  const campaignCreativeId = resolveCreativeId(campaignName);
  if (campaignCreativeId !== "SEM_ID") {
    return campaignCreativeId;
  }
  return "SEM_ID";
}

// ─── Classification V3 (3-Day Rolling) ─────────────────────────────────

export type CreativeTier = "ESCALAVEL" | "PROMISSOR" | "CRITICO" | "TESTE";

export interface CreativeTierInfo {
  tier: CreativeTier;
  label: string;
  emoji: string;
  className: string;
  glowClass?: string;
}

const MIN_IMPRESSIONS_FOR_CLASSIFICATION = 1000;

export interface Creative3DMetrics {
  avgRoi: number;
  profitPositiveAllDays: boolean;
  totalSales: number;
  daysWithData: number;
  hookRate: number;
}

/**
 * V3 Classification — uses 3-day rolling data when available.
 * ESCALÁVEL: Best ROI ≥ 1.3 + Hook ≥ 45% + 5+ vendas
 * PROMISSOR: Best ROI entre 1.0 e 1.3
 * CRÍTICO: Best ROI < 1.0
 * TESTE: baixo volume
 *
 * Best ROI = max(period ROI, 3D avg ROI) — evita penalizar criativos
 * que estão performando bem hoje mas tiveram dias ruins anteriormente.
 */
export function classifyCreative(
  roi: number,
  hookRate: number,
  impressions: number,
  data3d?: Creative3DMetrics | null,
  isVideo?: boolean,
): CreativeTierInfo {
  // TESTE — not enough data
  if (impressions < MIN_IMPRESSIONS_FOR_CLASSIFICATION) {
    return {
      tier: "TESTE",
      label: "Teste",
      emoji: "⚫",
      className: "border-muted-foreground/40 bg-muted/10 text-muted-foreground",
    };
  }

  // Use the BEST of period ROI vs 3-day avg ROI — don't penalize good current performance
  const roi3d = data3d && data3d.daysWithData >= 2 ? data3d.avgRoi : roi;
  const bestRoi = Math.max(roi, roi3d);
  const bestHook = data3d && data3d.daysWithData >= 2 ? Math.max(hookRate, data3d.hookRate) : hookRate;
  const totalSales3d = data3d ? data3d.totalSales : 0;

  // ESCALÁVEL — Best ROI ≥ 1.3, Hook ≥ 45%, mínimo 5 vendas
  const hookOk = isVideo === false || bestHook >= 45;
  if (bestRoi >= 1.3 && hookOk && (totalSales3d >= 5 || roi >= 1.3)) {
    return {
      tier: "ESCALAVEL",
      label: "Escalável",
      emoji: "🟢",
      className: "border-wr-positive/40 bg-wr-positive/10 text-wr-positive",
      glowClass: "shadow-[0_0_12px_hsl(142_71%_45%/0.25)]",
    };
  }
  // PROMISSOR — Best ROI ≥ 1.0
  if (bestRoi >= 1.0) {
    return {
      tier: "PROMISSOR",
      label: "Promissor",
      emoji: "🟡",
      className: "border-wr-warning/40 bg-wr-warning/10 text-wr-warning",
    };
  }
  // CRÍTICO — Best ROI < 1.0
  return {
    tier: "CRITICO",
    label: "Crítico",
    emoji: "🔴",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  };
}

// ─── Diagnostic Engine V3 ───────────────────────────────────────────────

export function generateDiagnostic(row: {
  hookRate: number;
  holdRate: number;
  ctr: number;
  roi: number;
  conversionRate: number;
  impressions: number;
}): string {
  const { hookRate, holdRate, ctr, roi, conversionRate, impressions } = row;

  if (impressions < MIN_IMPRESSIONS_FOR_CLASSIFICATION) {
    return "Dados insuficientes — aguardar mais volume.";
  }
  if (hookRate < 45) {
    return "🎯 Problema no criativo — revisar primeiros 3 segundos.";
  }
  if (hookRate >= 55 && holdRate < 3) {
    return "⚠️ Problema no desenvolvimento inicial — perde audiência cedo.";
  }
  if (hookRate >= 45 && holdRate >= 3 && roi < 1) {
    return "🔄 Problema na oferta ou CPA alto — criativo engaja mas não converte.";
  }
  if (ctr < 1.2) {
    return "🔍 Criativo não gera clique — revisar CTA e thumbnail.";
  }
  if (conversionRate > 0.01 && roi < 1) {
    return "💰 Conversão boa, ROI ruim — custo de mídia alto.";
  }
  if (roi >= 1.3 && conversionRate > 0.005) {
    return "🚀 Candidato à escala — priorizar investimento.";
  }
  if (roi >= 1.0 && roi < 1.3) {
    return "📈 Otimizar para escalar — ajustar pitch ou público.";
  }
  return "📊 Monitorar desempenho.";
}

// ─── Creative Score V3 (0-100) ──────────────────────────────────────────
// 40% ROI, 20% Hook, 20% Hold, 20% Conversão

export function calculateCreativeScore(
  roi: number,
  hookRate: number,
  holdRate: number,
  conversionRate: number,
): number {
  const roiNorm = Math.min(roi / 3, 1) * 100;
  const hookNorm = Math.min(hookRate / 100, 1) * 100;
  const holdNorm = Math.min(holdRate / 20, 1) * 100; // 20% hold = max
  const convNorm = Math.min(conversionRate / 0.05, 1) * 100;

  return roiNorm * 0.4 + hookNorm * 0.2 + holdNorm * 0.2 + convNorm * 0.2;
}

// ─── Budget Protection V3 ───────────────────────────────────────────────
// Spend alto + ROI < 0.7 + Hook < 40% → 🔴 Desligar imediatamente

export function shouldAlertBudget(
  spend: number,
  roi: number,
  hookRate: number,
  minSpendForAlert = 500,
): boolean {
  return spend > minSpendForAlert && roi < 0.7 && hookRate < 40;
}

// ─── Aggregated Creative Row Type V2 ────────────────────────────────────

// ─── Integrity Status ───────────────────────────────────────────────────

export type CreativeIntegrityStatus =
  | "ok"
  | "mismatch_project"
  | "missing_utm"
  | "missing_meta_data"
  | "cross_project_conflict";

export interface CreativeIntegrityInfo {
  status: CreativeIntegrityStatus;
  details: string[];
  hookRateReliable: boolean; // false when impressions are suspect
}

export interface CreativeRow {
  creativeId: string;
  project: ProjectInfo;
  adNames: string[];
  accountIds: Set<string>;
  campaignNames: Set<string>;
  // Meta metrics (sums)
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  video3sViews: number;
  video25: number;
  video50: number;
  video75: number;
  video100: number;
  hookRate: number;
  holdRate: number;
  isVideo: boolean; // true when creative has video data (3s views or thruplays > 0)
  hookSanity: "ok" | "inflated" | "no_data" | "low_volume"; // sanity check result
  // Sales metrics
  sales: number;
  /** Vendas front-end (base do CAC). Fora da Escola do Dólar = todas as vendas. */
  frontSales?: number;
  revenue: number;
  avgTicket: number;
  // Calculated
  roi: number;
  profit: number;
  conversionRate: number;
  rpm: number;
  // V2 Advanced Metrics
  costPer3sView: number;
  costPerPitch: number;
  conversionPostPitch: number;
  profitPer1000: number;
  // V2 Intelligence
  creativeScore: number;
  budgetAlert: boolean;
  // Classification
  tier: CreativeTierInfo;
  diagnostic: string;
  // V4 Integrity
  integrity: CreativeIntegrityInfo;
  isTestStructure: boolean;
  isScaleStructure: boolean;
  isF1: boolean;
  isF3: boolean;
  // V5 Team identification
  copyWriter: string | null;
  editor: string | null;
  // V6 IC Metrics (RedTrack)
  icCount: number;
  icSource: "redtrack" | "meta" | "none";
  costPerIc: number;
  checkoutConvRate: number;
  cac: number;
}




// ─── Copy & Editor Detection ────────────────────────────────────────────

const COPY_MAP: Record<string, string> = {
  DD: "Dan",
  SK: "Samuka",
  SP: "Peres",
  JC: "Jadiel",
  IAN: "Ian",
  GV: "Gabriel Vidal",
};

const EDITOR_MAP: Record<string, string> = {
  JD: "João",
  IG: "Iza",
  VK: "Vitor",
  ENZ: "Enzo",
};

function incrementTagCount(map: Map<string, number>, tag: string) {
  map.set(tag, (map.get(tag) || 0) + 1);
}

function collectTeamTags(
  names: Iterable<string>,
  copyCounts: Map<string, number>,
  editorCounts: Map<string, number>,
) {
  for (const name of names) {
    const brackets = name.match(/\[([^\]]+)\]/g);
    if (!brackets) continue;

    for (const bracket of brackets) {
      const tag = bracket.replace(/[\[\]]/g, "").trim().toUpperCase();
      if (!tag) continue;

      const parts = tag.includes(".") ? tag.split(".") : [tag];
      for (const part of parts) {
        const normalized = part.trim();
        if (!normalized) continue;

        if (COPY_MAP[normalized]) incrementTagCount(copyCounts, normalized);
        if (EDITOR_MAP[normalized]) incrementTagCount(editorCounts, normalized);
      }
    }
  }
}

function pickMostFrequentTag(map: Map<string, number>): string | null {
  let winner: string | null = null;
  let maxCount = -1;

  for (const [tag, count] of map.entries()) {
    if (count > maxCount) {
      winner = tag;
      maxCount = count;
    }
  }

  return winner;
}

function isImgCreativeName(value: string | null | undefined): boolean {
  if (!value) return false;
  return /(?:^|\[|\s)IMG\d/i.test(value);
}

/**
 * Extract copy writer and editor from campaign name bracket tags.
 * Pattern: [SP][IG][H02B28-JAPA][CONVERSÃO]
 * First bracket = Copy tag, Second bracket = Editor tag
 */
export function detectTeamFromCampaign(
  campaignNames: Set<string>,
  adNames: Set<string> = new Set(),
  creativeId?: string | null,
): { copyWriter: string | null; editor: string | null } {
  const adCopyCounts = new Map<string, number>();
  const adEditorCounts = new Map<string, number>();
  const campaignCopyCounts = new Map<string, number>();
  const campaignEditorCounts = new Map<string, number>();

  collectTeamTags(adNames, adCopyCounts, adEditorCounts);
  collectTeamTags(campaignNames, campaignCopyCounts, campaignEditorCounts);

  // Manual overrides for specific creatives without proper tags
  if (creativeId) {
    const baseId = creativeId.replace(/-[A-Z]+$/, "").toUpperCase();
    const override = MANUAL_TEAM_OVERRIDES[baseId];
    if (override) return { ...override };
  }

   // IMG creatives → same person does BOTH copy + design when they are in IMG_PERSON_NAME
   // If the winner tag is only in COPY_MAP or EDITOR_MAP, use specific roles instead
   const hasImgCreative = isImgCreativeName(creativeId) || Array.from(adNames).some(isImgCreativeName);
   if (hasImgCreative) {
     // Merge all tag counts (copy + editor) into one unified count for IMG
     const allCounts = new Map<string, number>();
     for (const [tag, count] of adCopyCounts) allCounts.set(tag, (allCounts.get(tag) || 0) + count);
     for (const [tag, count] of adEditorCounts) allCounts.set(tag, (allCounts.get(tag) || 0) + count);
     for (const [tag, count] of campaignCopyCounts) allCounts.set(tag, (allCounts.get(tag) || 0) + count);
     for (const [tag, count] of campaignEditorCounts) allCounts.set(tag, (allCounts.get(tag) || 0) + count);
     
     const winnerTag = pickMostFrequentTag(allCounts);
     
     // If winner is a known "solo IMG author" (does both copy+editor), assign both roles
     if (winnerTag && IMG_PERSON_NAME[winnerTag]) {
       return {
         copyWriter: IMG_PERSON_NAME[winnerTag],
         editor: IMG_PERSON_NAME[winnerTag],
       };
     }
     
     // Otherwise, use specific role maps for specialized collaborators
     return {
       copyWriter: winnerTag ? COPY_MAP[winnerTag] ?? null : null,
       editor: winnerTag ? EDITOR_MAP[winnerTag] ?? null : null,
     };
   }

  const copyTag = pickMostFrequentTag(adCopyCounts) ?? pickMostFrequentTag(campaignCopyCounts);
  const editorTag = pickMostFrequentTag(adEditorCounts) ?? pickMostFrequentTag(campaignEditorCounts);

  return {
    copyWriter: copyTag ? COPY_MAP[copyTag] : null,
    editor: editorTag ? EDITOR_MAP[editorTag] : null,
  };
}

// ─── Project Detection ──────────────────────────────────────────────────

export type ProjectTag = "LDG" | "LDR" | "NDR" | "NDM" | "NDB" | "NDN" | "NEURO" | "CRT" | "SEM_TAG" | null;

export interface ProjectInfo {
  tag: ProjectTag;
  label: string;
  className: string; // badge color classes
}

const PROJECT_CODE_TO_INFO: Record<string, ProjectInfo> = {
  NDM: { tag: "NDM", label: "NDM", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  NDB: { tag: "NDB", label: "NDB", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  
  NDR: { tag: "NDR", label: "NDR", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  LDG: { tag: "LDG", label: "LDR", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  LDR: { tag: "LDR", label: "LDR", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  NEURO: { tag: "NEURO", label: "NEURO", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  CRT: { tag: "CRT", label: "Core Strength", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
};

/**
 * Detect project from composite key or campaign name.
 * V10: Accepts any project code (incl. dinâmicos via offers — MMP, GHP, GLH, NHB...)
 * Sem hardcoded info → gera badge neutro com o próprio código.
 */
// Paleta determinística para apelidos dinâmicos (MMP, MPB, GHP, GLH, NHB...)
// Mantém o mesmo formato visual (border + bg + text) usado pelos códigos hardcoded.
const DYNAMIC_TAG_PALETTE = [
  "bg-rose-500/15 text-rose-400 border-rose-500/30",
  "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "bg-lime-500/15 text-lime-400 border-lime-500/30",
  "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "bg-red-500/15 text-red-400 border-red-500/30",
];

function colorForCode(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return DYNAMIC_TAG_PALETTE[hash % DYNAMIC_TAG_PALETTE.length];
}

function infoForCode(code: string): ProjectInfo {
  const known = PROJECT_CODE_TO_INFO[code];
  if (known) return known;
  return {
    tag: code as ProjectTag,
    label: code,
    className: colorForCode(code),
  };
}

export function detectProject(
  creativeId: string,
  campaignName?: string,
  compositeKey?: string,
): ProjectInfo {
  // 1. If composite key has a project code, use it directly
  if (compositeKey && compositeKey.includes("::")) {
    const projectCode = compositeKey.split("::")[1];
    if (projectCode) return infoForCode(projectCode);
  }

  // 2. Re-scan campaign name for project tag (catches cases where composite key had no project)
  if (campaignName) {
    const code = extractProjectCodeFromNaming(campaignName);
    if (code !== "OUTROS") return infoForCode(code);
  }

  return { tag: "SEM_TAG", label: "Sem Tag", className: "bg-destructive/15 text-destructive border-destructive/30" };
}

export type CreativeSortKey =
  | "roi"
  | "revenue"
  | "profit"
  | "hookRate"
  | "holdRate"
  | "spend"
  | "sales"
  | "cpc"
  | "ctr"
  | "creativeScore"
  | "rpm"
  | "costPer3sView"
  | "icCount"
  | "costPerIc"
  | "checkoutConvRate"
  | "cac"
  | "campaignCount"
  | "accountCount";

// ─── Integrity Validation ───────────────────────────────────────────────

/**
 * Validate creative integrity: project association consistency,
 * cross-project conflicts, missing data, and hook rate reliability.
 */
export function validateCreativeIntegrity(
  creativeId: string,
  campaignNames: Set<string>,
  salesProjectTags: Set<string>,
  trafficProjectTags: Set<string>,
  impressions: number,
  video3sViews: number,
  spend: number,
  sales: number,
): CreativeIntegrityInfo {
  const details: string[] = [];
  let status: CreativeIntegrityStatus = "ok";

  // 1. Missing meta data — no traffic data at all
  if (impressions === 0 && spend === 0 && sales > 0) {
    status = "missing_meta_data";
    details.push("Criativo tem vendas mas sem dados Meta (gasto/impressões).");
  }

  // 2. Missing UTM — has traffic but no sales attribution
  if (spend > 0 && sales === 0 && creativeId !== "SEM_ID") {
    // Not necessarily an error, but flag if significant spend
    // (only flag as missing_utm if it seems like attribution is broken)
  }

  // 3. Cross-project conflict — sales in multiple projects
  if (salesProjectTags.size > 1) {
    status = "cross_project_conflict";
    details.push(`Vendas em ${salesProjectTags.size} projetos: ${Array.from(salesProjectTags).join(", ")}.`);
  }

  // 4. Project mismatch — traffic project ≠ sales project
  if (trafficProjectTags.size > 0 && salesProjectTags.size > 0) {
    const trafficOnly = Array.from(trafficProjectTags).filter((t) => !salesProjectTags.has(t));
    const salesOnly = Array.from(salesProjectTags).filter((t) => !trafficProjectTags.has(t));
    if (trafficOnly.length > 0 || salesOnly.length > 0) {
      if (status === "ok") status = "mismatch_project";
      details.push(
        `Projeto divergente — Tráfego: [${Array.from(trafficProjectTags).join(",")}] vs Vendas: [${Array.from(salesProjectTags).join(",")}].`
      );
    }
  }

  // 5. Traffic across multiple projects
  if (trafficProjectTags.size > 1) {
    if (status === "ok") status = "mismatch_project";
    details.push(`Gasto vinculado a ${trafficProjectTags.size} projetos: ${Array.from(trafficProjectTags).join(", ")}.`);
  }

  // Hook rate reliability: needs real impressions and video views
  const hookRateReliable = impressions >= 100 && video3sViews <= impressions;

  return { status, details, hookRateReliable };
}

/**
 * Detect if a campaign name indicates a test structure (1-50-1).
 */
export function isTestStructureCampaign(campaignName: string): boolean {
  return /1-50-1/.test(campaignName);
}

/**
 * Detect if a campaign name indicates a pre-scale structure (1-100-1).
 */
export function isPreScaleCampaign(campaignName: string): boolean {
  return /1-100-1/.test(campaignName);
}

/**
 * Detect if a campaign name indicates a scale structure (1-250-1 or 1-251)
 * or contains the F3 scale tag.
 */
export function isScaleCampaign(campaignName: string): boolean {
  return /1-250-1/.test(campaignName) || /1-251/.test(campaignName) || /\bF3\b/i.test(campaignName);
}
