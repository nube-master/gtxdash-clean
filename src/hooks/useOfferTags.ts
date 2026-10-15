import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the list of `apelido_interno` values from the offers table.
 * These are the canonical project/offer tags (NDM, CB-COD, MMP, CRT, etc.)
 * used to filter campaigns by bracket tag in the name.
 */
/**
 * Returns the list of `apelido_interno` values from the offers table.
 * Scoped by operation_id to prevent offer leakage across tenants.
 */
export function useOfferTags(operationId?: string | null) {
  return useQuery({
    queryKey: ["offer-apelidos", operationId],
    queryFn: async () => {
      let query = supabase
        .from("offers")
        .select("apelido_interno")
        .not("apelido_interno", "is", null);

      if (operationId) {
        query = query.eq("operation_id", operationId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const set = new Set<string>();
      (data ?? []).forEach((r: any) => {
        if (r.apelido_interno) set.add(normalizeApelidoCode(String(r.apelido_interno)));
      });
      return Array.from(set).sort();
    },
    staleTime: 5 * 60_000,
  });
}

/** Códigos de geo/mercado usados como sufixo em apelidos (ex: VIT-RRT-ITA). */
const GEO_SUFFIX_TOKENS = new Set([
  "ITA","SVK","POL","CZE","CZ","POR","ESP","USA","MEX","ARG","BRA",
  "JAP","JAPA","HW","SP","DE","FR","UK","IT","US","SK","PL","RO",
  "HU","HUN","GR","GRC","BG","BGR","HR","HRV","SI","SVN","AT","AUT",
  "BE","BEL","NL","NLD","NO","NOR","SE","SWE","FI","FIN","DK","DNK","IE","IRL",
  "CH","CHE","CA","CAN","AU","AUS","NZ","NZL","ZA","ZAF","IN","IND",
  "ID","IDN","PH","PHL","TH","THA","VN","VNM","MY","MYS","SG","SGP","JP","JPN",
  "KR","KOR","CN","CHN","HK","HKG","TW","TWN","RU","RUS","UA","UKR","TR","TUR",
  "IL","ISR","AE","ARE","SA","SAU","EG","EGY","MA","MAR","CL","CHL","CO","COL","PE","PER",
  "ROU","POR","PRT","ESP","DEU","FRA","GBR","ITA","SVK","POL","CZE",
]);

const BRACKET_TAG_ALIASES: Record<string, string> = {
  "VIT-RTT": "VIT-RRT",
};

function normalizeBracketTag(tag: string): string {
  const upper = tag.trim().toUpperCase();
  return BRACKET_TAG_ALIASES[upper] ?? upper;
}

function normalizeApelidoCode(apelido: string): string {
  return normalizeBracketTag(apelido).replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
}

/** Extrai as bracket-tags que um apelido representa dentro do nome da campanha. */
function apelidoToBracketTags(apelido: string): string[] {
  const trimmed = normalizeApelidoCode(apelido);
  const bracketTags = trimmed.match(/\[([^\]]+)\]/g);
  if (bracketTags && bracketTags.length >= 2) {
    return bracketTags.map((m) => normalizeBracketTag(m.replace(/^\[|\]$/g, ""))).filter(Boolean);
  }
  const lastDash = trimmed.lastIndexOf("-");
  if (lastDash > 0) {
    const suffix = trimmed.slice(lastDash + 1);
    const prefix = trimmed.slice(0, lastDash);
    if (GEO_SUFFIX_TOKENS.has(suffix) && prefix.length > 0) return [prefix, suffix];
  }
  return [trimmed];
}

/** Detects which offer tag (apelido) is present inside a campaign name's brackets.
 * Suporta apelidos simples ("MMPB" → `[MMPB]`), com brackets embutidos
 * ("[VIT-RRT] [SVK]") e com sufixo de geo ("VIT-RRT-ITA" → `[VIT-RRT] [ITA]`).
 * Apelidos com mais tags vencem (mais específicos primeiro).
 */
export function detectOfferTag(name: string, tags: string[]): string | null {
  const campaignBrackets = new Set(
    (name?.toUpperCase().match(/\[([^\]]+)\]/g) ?? [])
      .map((m) => normalizeBracketTag(m.replace(/^\[|\]$/g, "")))
      .filter(Boolean),
  );
  const enriched = tags
    .map((t) => ({ tag: t, brackets: apelidoToBracketTags(t) }))
    .sort((a, b) => b.brackets.length - a.brackets.length || b.tag.length - a.tag.length);
  for (const { tag, brackets } of enriched) {
    const ok = brackets.every((b) => campaignBrackets.has(normalizeBracketTag(b)));
    if (ok) {
      return tag;
    }
  }
  return null;
}
