/**
 * Display formatting for campaign and content names.
 * Does NOT modify stored data — only for UI rendering.
 */

/**
 * Normalize split date brackets: [DD] [MM] → [DD.MM]
 * Handles optional spaces: [10] [04], [10][04], [10]  [04]
 */
export function normalizeDateBrackets(raw: string): string {
  return raw.replace(/\[(\d{2})\]\s*\[(\d{2})\]/g, "[$1.$2]");
}

/**
 * Campaign: strip trailing pipe + ID suffix, keep everything else.
 * Also normalizes split date brackets.
 * e.g. "[BMGTX-FBMAX-C/A1946] [H02B31] ... - T3 top|120239684876360518"
 *   → "[BMGTX-FBMAX-C/A1946] [H02B31] ... - T3 top"
 */
export function formatCampaignName(raw: string): string {
  const normalized = normalizeDateBrackets(raw);
  const cleaned = normalized.replace(/\|[\d]+$/, "").trim();
  return cleaned;
}

/**
 * Content / ad_name: show only the second bracket block.
 * e.g. "[BMGTX-FBMAX-C/A1947] [H02B31]" → "[H02B31]"
 * If no second bracket found, return as-is.
 */
export function formatContentName(raw: string): string {
  const normalized = normalizeDateBrackets(raw);
  const matches = normalized.match(/\[[^\]]+\]/g);
  if (matches && matches.length >= 2) {
    return matches[1];
  }
  return normalized;
}

/**
 * Detect campaign structure from name.
 * "1-50-1"  → TESTE DE CRIATIVOS
 * "1-100-1" → PRÉ ESCALA
 * "1-250-1" → ESCALA
 */
export type CampaignStructure = "TESTE" | "PRÉ ESCALA" | "ESCALA" | "OUTRO";

export function detectStructure(campaignName: string): CampaignStructure {
  if (campaignName.includes("1-250-1")) return "ESCALA";
  if (campaignName.includes("1-100-1")) return "PRÉ ESCALA";
  if (campaignName.includes("1-50-1")) return "TESTE";
  return "OUTRO";
}

export const structureLabels: Record<CampaignStructure, string> = {
  TESTE: "Teste de Criativos",
  "PRÉ ESCALA": "Pré Escala",
  ESCALA: "Escala",
  OUTRO: "Outro",
};

export const structureColors: Record<CampaignStructure, string> = {
  TESTE: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  "PRÉ ESCALA": "text-amber-400 border-amber-400/30 bg-amber-400/5",
  ESCALA: "text-wr-positive border-wr-positive/30 bg-wr-positive/5",
  OUTRO: "text-muted-foreground border-muted-foreground/30",
};
