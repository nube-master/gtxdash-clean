/**
 * Project extraction and normalization utilities for Analytics.
 * Extracts project_code, structure, account from UTM campaign naming conventions.
 */

// Known project tags that appear as standalone bracket tags in campaign names
// e.g. [BMGTX-C/A05] [IMG14] [SP] [SP] [NDM] [CONVERSÃO] ...
// The project tag can be in ANY bracket position.
const PROJECT_BRACKET_TAGS: { code: string; label: string; tags: string[] }[] = [
  // ⚠️ Memopryl (MMP/MMPB) NÃO é mais hardcoded aqui — vem dos offers cadastrados
  // em /offers via registerOfferProjects(). Tags legadas [NDM]/[MEMO]/[NDN]/[MEMOPRYL]
  // foram REMOVIDAS porque inflavam o filtro Memopryl com campanhas antigas que
  // não correspondem mais ao produto real ativo. Apenas brackets exatos [MMP] e
  // [MMPB] (registrados via offer.apelido_interno) são reconhecidos.
  { code: "NDR", label: "NeuroDyne Retargeting", tags: ["NDR"] },
  { code: "MO", label: "Memoryon", tags: ["MO", "MON"] },
  { code: "LDR", label: "LDR", tags: ["LDG", "LDR"] },
  { code: "NDB", label: "NeuroDyne B", tags: ["NEURO", "NDB", "ND"] },
  { code: "CRT", label: "Core Strength", tags: ["CRT", "AILULA", "CST"] },
  { code: "PP", label: "TeleMed", tags: ["PP", "TELEMED"] },
];

// Build a fast lookup: tag (uppercase) → project code
const TAG_TO_PROJECT = new Map<string, string>();
for (const proj of PROJECT_BRACKET_TAGS) {
  for (const t of proj.tags) {
    TAG_TO_PROJECT.set(t.toUpperCase(), proj.code);
  }
}

const STORE_TO_PROJECT: Record<string, string> = {
  // Memopryl: roteia para MMPB (apelido ativo). MMP/NDM são legados removidos.
  memopryl: "MMPB",
  mmp: "MMPB",
  mmpb: "MMPB",
  leandrops: "LDR",
  ldg: "LDR",
  ndr: "NDR",
  mon: "MO",
  memoryon: "MO",
  mo: "MO",
  neuro: "NDB",
  ndb: "NDB",
  telemed: "PP",
  pp: "PP",
};

// Structure detection patterns
const STRUCTURE_PATTERNS: { code: string; label: string; pattern: RegExp }[] = [
  { code: "TESTE", label: "Teste (1-50-1)", pattern: /1-50-1/ },
  { code: "PRE_ESCALA", label: "Pré Escala (1-100-1)", pattern: /1-100-1/ },
  { code: "ESCALA", label: "Escala (1-250-1)", pattern: /1-250-1/ },
];

/** Offer name patterns for fallback project detection (Clickbank sales without UTM) */
const OFFER_NAME_PATTERNS: { regex: RegExp; code: string }[] = [
  // Memopryl: usa apenas MMPB (apelido ativo). NDM/MMP legados removidos.
  { regex: /\bMMPB\b|memopryl|memo[\s-]?pryl/i, code: "MMPB" },
  { regex: /\bNDR\b/i, code: "NDR" },
  { regex: /\bMO\b|\bMON\b|memoryon/i, code: "MO" },
  { regex: /\bLDG\b|leandrops/i, code: "LDR" },
  { regex: /\bNDB\b/i, code: "NDB" },
  { regex: /\bCRT\b/i, code: "CRT" },
  { regex: /\bAILULA\b/i, code: "CRT" },
  { regex: /NEURO/i, code: "NDB" },
  { regex: /telemed|semaglutide|tirzepatide|glp-?1/i, code: "PP" },
];

const KNOWN_PROJECT_CODES = new Set(PROJECT_BRACKET_TAGS.map((proj) => proj.code));

// ─────────────────────────────────────────────────────────────────────
// DYNAMIC PROJECT REGISTRATION (driven by `offers.apelido_interno`)
// Offers cadastradas em /offers viram tags de projeto reconhecidas
// pelo extractor. Bracket exato `[APELIDO]` em qualquer posição.
// ─────────────────────────────────────────────────────────────────────
const DYNAMIC_PROJECTS = new Map<string, { code: string; label: string; redtrackOfferNames?: string[] }>();
const DYNAMIC_PRODUCT_PROJECTS: { code: string; productKey: string; tokenCount: number }[] = [];
/**
 * Apelidos compostos (contêm 2+ brackets no próprio nome, ex: `[VIT-RRT] [SVK]`).
 * Só casam quando TODOS os brackets internos aparecem no campaign name — assim
 * cada geo vira um projeto distinto em vez de colapsar no genérico VIT-RRT.
 */
const COMPOSITE_PROJECTS: { code: string; tags: string[] }[] = [];
const REDTRACK_OFFER_MAP = new Map<string, string>();

/**
 * Códigos de geo/mercado que podem aparecer como sufixo em apelidos
 * (ex: "VIT-RRT-ITA" → composite [VIT-RRT] [ITA]). Casam com o bracket
 * de geo que fica no nome da campanha.
 */
const GEO_SUFFIX_TOKENS = new Set([
  "ITA","SVK","POL","CZE","CZ","POR","ESP","USA","MEX","ARG","BRA",
  "JAP","JAPA","HW","SP","DE","FR","UK","IT","US","SK","PL","RO",
  "HU","GR","BG","HR","SI","AT","BE","NL","NO","SE","FI","DK","IE",
  "CH","CA","AU","NZ","ZA","IN","ID","PH","TH","VN","MY","SG","JP",
  "KR","CN","HK","TW","RU","UA","TR","IL","AE","SA","EG","MA","CL","CO","PE",
]);

const BRACKET_TAG_ALIASES: Record<string, string> = {
  "VIT-RTT": "VIT-RRT",
};

function normalizeBracketTag(tag: string): string {
  const upper = tag.trim().toUpperCase();
  return BRACKET_TAG_ALIASES[upper] ?? upper;
}

function normalizeProductText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeApelidoCode(apelido: string): string {
  // Remove outer brackets first: "[WL-COD-PL]" -> "WL-COD-PL"
  const base = apelido.trim().replace(/^\[|\]$/g, "");
  return normalizeBracketTag(base).replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
}

/**
 * Deriva as tags-bracket que um apelido representa. Suporta 3 formas:
 *  1) apelido com brackets explícitos → "[VIT-RRT] [SVK]" → ["VIT-RRT","SVK"]
 *  2) apelido com sufixo de geo         → "VIT-RRT-ITA"    → ["VIT-RRT","ITA"]
 *  3) apelido simples                   → "MMPB"           → ["MMPB"]
 */
function deriveApelidoTags(apelido: string): string[] {
  // Normalize and remove outer brackets: "[WL-COD-PL]" -> "WL-COD-PL"
  const base = apelido.trim();
  const upper = base.toUpperCase();

  // Handle explicit bracket format like "[WL-COD-PL]"
  if (upper.startsWith("[") && upper.endsWith("]")) {
    const content = upper.slice(1, -1);
    // Return BOTH the full content and its split parts to catch all UTM variations
    if (content.includes("-")) {
      const parts = content.split("-").map(p => p.trim()).filter(Boolean);
      return [content, ...parts];
    }
    return [content];
  }

  // If it has internal brackets: "[WL] [COD] [PL]" -> ["WL", "COD", "PL"]
  const bracketMatches = upper.match(/\[([^\]]+)\]/g);
  if (bracketMatches && bracketMatches.length >= 1) {
    return bracketMatches.map((m) => normalizeBracketTag(m.replace(/^\[|\]$/g, ""))).filter(Boolean);
  }

  // If it's a dash-separated code: "WL-COD-PL" -> ["WL-COD-PL", "WL", "COD", "PL"]
  if (upper.includes("-")) {
    const parts = upper.split("-").map(p => p.trim()).filter(Boolean);
    return [upper, ...parts];
  }

  return [upper];
}

export function registerOfferProject(apelido: string, label?: string, redtrackOfferNames?: string[]) {
  if (!apelido) return;
  const trimmed = normalizeApelidoCode(apelido);
  const code = trimmed;
  if (!code) return;

  const tags = deriveApelidoTags(trimmed);
  
  // ALWAYS add the exact code/tag to the lookup map for fast 1:1 bracket matching
  TAG_TO_PROJECT.set(code, code);
  KNOWN_PROJECT_CODES.add(code);
  DYNAMIC_PROJECTS.set(code, { code, label: label || apelido, redtrackOfferNames });

  // Add RedTrack offer names to lookup map
  if (redtrackOfferNames && Array.isArray(redtrackOfferNames)) {
    for (const name of redtrackOfferNames) {
      if (name) REDTRACK_OFFER_MAP.set(name.toUpperCase(), code);
    }
  }

  // If it has multiple tags (composite), add to COMPOSITE_PROJECTS for multi-bracket matching
  if (tags.length >= 2) {
    const exists = COMPOSITE_PROJECTS.some(cp => cp.code === code);
    if (!exists) COMPOSITE_PROJECTS.push({ code, tags });
  }
}

function registerOfferProductAlias(code: string, productName?: string | null) {
  if (!productName) return;
  const productKey = normalizeProductText(productName);
  const tokenCount = productKey ? productKey.split(" ").length : 0;
  // Evita aliases genéricos demais tipo "Vitalis" capturarem ofertas diferentes.
  if (tokenCount < 2) return;
  const exists = DYNAMIC_PRODUCT_PROJECTS.some((p) => p.code === code && p.productKey === productKey);
  if (!exists) DYNAMIC_PRODUCT_PROJECTS.push({ code, productKey, tokenCount });
}

export function registerOfferProjects(offers: { apelido_interno: string; produto_real?: string | null; redtrack_offer_names?: string[] | null }[]) {
  for (const o of offers) {
    registerOfferProject(o.apelido_interno, o.produto_real || o.apelido_interno, o.redtrack_offer_names || []);
    registerOfferProductAlias(normalizeApelidoCode(o.apelido_interno), o.produto_real);
  }
}

export function getDynamicProjects(): { code: string; label: string }[] {
  return Array.from(DYNAMIC_PROJECTS.values());
}

/**
 * Extract project code by scanning ALL bracket tags in the campaign name.
 * The project tag (e.g. [NDM], [NDB], [CRT]) can be in any position.
 */
export function extractProjectCodeFromNaming(
  ...texts: (string | null | undefined)[]
): string {
  // 1ª passada: apelidos COMPOSTOS (múltiplos brackets, ex: `[VIT-RRT] [SVK]`).
  // Precisa vir ANTES do match single-bracket pra vencer o VIT-RRT genérico.
  // Mais específicos (mais tags) primeiro.
  if (COMPOSITE_PROJECTS.length > 0) {
    for (const text of texts) {
      if (!text) continue;
      
      // Clean up text to standard uppercase bracket tags
      const matches = text.match(/\[([^\]]+)\]/g);
      if (!matches) continue;
      const found = new Set<string>();
      for (const m of matches) found.add(normalizeBracketTag(m.replace(/^\[|\]$/g, "")));
      
      // Special MGID handling: [MGID][COD][Nutra] [Vitalis Prime] [POL] -> [Vitalis Prime] + [POL]
      // MGID campaigns often have spaces between brackets or different nesting
      if (text.includes("MGID")) {
        const words = text.toUpperCase().replace(/[\[\]]/g, " ").split(/\s+/).filter(Boolean);
        words.forEach(w => found.add(w));
      }

      const sorted = [...COMPOSITE_PROJECTS].sort((a, b) => b.tags.length - a.tags.length);
      for (const cp of sorted) {
        if (cp.tags.every((t) => found.has(t))) return cp.code;
      }
    }
  }

  // 2ª passada: match EXATO do bracket no registry (rápido).
  for (const text of texts) {
    if (!text) continue;
    const matches = text.match(/\[([^\]]+)\]/g);
    if (!matches) continue;
    for (const m of matches) {
      const tag = normalizeBracketTag(m.replace(/^\[|\]$/g, ""));
      const project = TAG_TO_PROJECT.get(tag);
      if (project) return project;
    }
  }

  // 3ª passada: match por PREFIXO em apelidos dinâmicos (offers).
  const dynamicCodes = Array.from(DYNAMIC_PROJECTS.keys())
    .filter((c) => !c.includes("["))
    .sort((a, b) => b.length - a.length);
  for (const text of texts) {
    if (!text) continue;
    const matches = text.match(/\[([^\]]+)\]/g);
    if (!matches) continue;
    for (const m of matches) {
      const tag = normalizeBracketTag(m.replace(/^\[|\]$/g, ""));
      for (const code of dynamicCodes) {
        if (tag.startsWith(code + "-")) return code;
      }
    }
  }

  return "OUTROS";
}

/**
 * Resolve project code with explicit priority.
 *
 * This avoids a common bug where `extractProjectCodeFromNaming(primary) || ...`
 * never falls back because "OUTROS" is a truthy string.
 */
export function resolveProjectCodeWithFallback(
  primaryText?: string | null,
  fallbackText?: string | null,
): string {
  const primaryProject = extractProjectCodeFromNaming(primaryText);
  if (primaryProject !== "OUTROS") return primaryProject;
  return extractProjectCodeFromNaming(fallbackText);
}

export function extractProjectCode(
  utmCampaign?: string | null,
  store?: string | null,
  offerName?: string | null,
  productName?: string | null,
  extraText?: string | null,
  rawPayload?: any,
  projectSlugPersisted?: string | null,
): string {
  // 1. sales_data.project_slug (persistido) — se existir
  if (projectSlugPersisted && projectSlugPersisted !== "OUTROS") {
    return projectSlugPersisted;
  }

  // PRIORIDADE 0.1: match por sufixo de geo em product_name/offer_name (vence collisions de tags genéricas)
  if (productName || offerName || utmCampaign) {
    const text = ((productName || "") + " " + (offerName || "") + " " + (utmCampaign || "")).toUpperCase();
    if (text.includes("POL") || text.includes("POLONIA")) {
      if (text.includes("VTP") || text.includes("VITALIS")) return "[WL-COD-PL]";
      if (text.includes("EDB") || text.includes("ENDOBOOST")) return "[ED-COD-PL]";
    }
    if (text.includes("ROM") || text.includes("ROMENIA")) {
      // Prioriza match ROM antes de BUL quando ambos são BST
      if (text.includes("BST") || text.includes("ENDOBOOST") || text.includes("BOOST") || text.includes("ED-ROM")) return "[ED-COD-ROM]";
      if (text.includes("VTP") || text.includes("VITALIS") || text.includes("AETERNA")) return "[WL-COD-ROM]";
      return "[WL-COD-ROM]"; // Default WL
    }
  }

  // 2. raw_payload.clickSub6 → aplicar regex [XX-COD-YY]
  if (rawPayload?.clickSub6) {
    const code = extractProjectCodeFromNaming(rawPayload.clickSub6);
    if (code !== "OUTROS") return code;
  }

  // PRIORIDADE 0: match via RedTrack offer mapping (vindo do BD) ou regex CONTAINS
  if (offerName || utmCampaign) {
    const textToSearch = ((offerName || "") + " " + (utmCampaign || "")).toUpperCase();
    
    // 3. raw_payload.Offer → parseia offer_name
    if (rawPayload?.Offer) {
      const code = extractProjectCodeFromNaming(rawPayload.Offer);
      if (code !== "OUTROS") return code;
    }

    // 2.1 Fallback para rt_campaign se clickSub6 falhou
    if (rawPayload?.rt_campaign) {
      const code = extractProjectCodeFromNaming(rawPayload.rt_campaign);
      if (code !== "OUTROS") return code;
    }

    // Procura por matches dinâmicos que contenham as keywords
    for (const [offerSearch, projectCode] of REDTRACK_OFFER_MAP.entries()) {
      if (textToSearch.includes(offerSearch.toUpperCase())) return projectCode;
    }
  }

  // 4. raw_payload.Landings → landing tags
  if (rawPayload?.Landings) {
    const code = extractProjectCodeFromNaming(rawPayload.Landings);
    if (code !== "OUTROS") return code;
  }



  // PRIORIDADE 0.1: match por sufixo de geo em product_name (e.g. "VTP POL" -> [WL-COD-PL])
  if (productName || offerName) {
    const text = ((productName || "") + " " + (offerName || "")).toUpperCase();
    if (text.includes("POL") || text.includes("POLONIA")) {
      if (text.includes("VTP") || text.includes("VITALIS")) return "[WL-COD-PL]";
      if (text.includes("EDB") || text.includes("ENDOBOOST")) return "[ED-COD-PL]";
    }
    if (text.includes("ROM") || text.includes("ROMENIA")) {
      if (text.includes("BST") || text.includes("ENDOBOOST") || text.includes("BOOST")) return "[ED-COD-ROM]";
      if (text.includes("VTP") || text.includes("VITALIS") || text.includes("AETERNA")) return "[WL-COD-ROM]";
      return "[WL-COD-ROM]"; // Default WL
    }
  }

  // PRIORIDADE 1: nome real da oferta/produto. Isso separa geos do mesmo apelido
  // base (ex: "Vitalis Visão Polônia" → VIT-RRT-POL) mesmo se a campanha estiver
  // só com [VIT-RRT] ou com tag legada.
  if (offerName) {
    const byProduct = matchDynamicProductInText(offerName);
    if (byProduct) return byProduct;
  }
  if (productName) {
    const byProduct = matchDynamicProductInText(productName);
    if (byProduct) return byProduct;
  }

  // PRIORIDADE 2: brackets explícitos da campanha/creative. Isso precisa vencer
  // apelidos genéricos no product_name (ex: product_name="VIT-RRT" + campanha
  // com [VIT-RRT] [POL] deve cair em VIT-RRT-POL, não no base VIT-RRT).
  const namingCode = extractProjectCodeFromNaming(utmCampaign, extraText, offerName, productName);
  if (namingCode !== "OUTROS") return namingCode;

  // PRIORIDADE 3: apelido de offer dinâmico (MMP, MMPB, GHP, etc.) detectado em
  // offer_name/product_name quando não há bracket explícito útil.
  if (offerName) {
    const dyn = matchDynamicProjectInText(offerName);
    if (dyn) return dyn;
  }
  if (productName) {
    const dyn = matchDynamicProjectInText(productName);
    if (dyn) return dyn;
  }

  if (store) {
    const key = store.toLowerCase().trim();
    if (STORE_TO_PROJECT[key]) return STORE_TO_PROJECT[key];
  }

  // Fallback: detect project from offer_name (e.g. "Facebook | Clickbank | NDM | Controle")
  if (offerName) {
    for (const { regex, code } of OFFER_NAME_PATTERNS) {
      if (regex.test(offerName)) return code;
    }
    const dyn = matchDynamicProjectInText(offerName);
    if (dyn) return dyn;
  }

  // Fallback: detect project from product_name (e.g. "NDR", "NDM", "LDG", "MMP")
  if (productName) {
    for (const { regex, code } of OFFER_NAME_PATTERNS) {
      if (regex.test(productName)) return code;
    }
    const dyn = matchDynamicProjectInText(productName);
    if (dyn) return dyn;
  }

  return "OUTROS";
}

/**
 * Match any dynamically-registered offer apelido (MMP, MMPB, GHP, etc.) as a
 * word inside free-form text like "Facebook | Clickbank | MMP | ml1cn" or
 * product_name "MMP". Uses word boundary so "md3scladsndm" doesn't match NDM.
 */
function matchDynamicProjectInText(text: string): string | null {
  const upper = text.toUpperCase();
  for (const code of DYNAMIC_PROJECTS.keys()) {
    if (code.length < 2) continue;
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`);
    if (re.test(upper)) return code;
  }
  return null;
}

function matchDynamicProductInText(text: string): string | null {
  if (DYNAMIC_PRODUCT_PROJECTS.length === 0) return null;
  const haystack = normalizeProductText(text);
  if (!haystack) return null;
  const sorted = [...DYNAMIC_PRODUCT_PROJECTS].sort(
    (a, b) => b.tokenCount - a.tokenCount || b.productKey.length - a.productKey.length,
  );
  for (const { code, productKey } of sorted) {
    const escaped = productKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^| )${escaped}( |$)`);
    if (re.test(haystack)) return code;
  }
  return null;
}

export function toCreativeCompositeKey(creativeId: string, projectCode?: string | null): string {
  return projectCode && projectCode !== "OUTROS" ? `${creativeId}::${projectCode}` : creativeId;
}

export function getCreativeIdFromCompositeKey(compositeKey: string): string {
  return compositeKey.includes("::") ? compositeKey.split("::")[0] : compositeKey;
}

export function getProjectCodeFromCompositeKey(compositeKey: string): string | null {
  if (!compositeKey.includes("::")) return null;
  const [, projectCode] = compositeKey.split("::");
  return KNOWN_PROJECT_CODES.has(projectCode) ? projectCode : null;
}

export function inferSingleProjectByCreative(keys: Iterable<string>): Map<string, string> {
  const projectsByCreative = new Map<string, Set<string>>();

  for (const key of keys) {
    const creativeId = getCreativeIdFromCompositeKey(key);
    const projectCode = getProjectCodeFromCompositeKey(key);
    if (!projectCode || creativeId === "SEM_ID") continue;

    if (!projectsByCreative.has(creativeId)) {
      projectsByCreative.set(creativeId, new Set());
    }
    projectsByCreative.get(creativeId)!.add(projectCode);
  }

  const inferred = new Map<string, string>();
  for (const [creativeId, projectCodes] of projectsByCreative) {
    if (projectCodes.size === 1) {
      inferred.set(creativeId, Array.from(projectCodes)[0]);
    }
  }

  return inferred;
}

/**
 * Extract structure type from campaign name.
 */
export function extractStructure(campaignName?: string | null): string {
  if (!campaignName) return "OUTROS";
  for (const s of STRUCTURE_PATTERNS) {
    if (s.pattern.test(campaignName)) return s.code;
  }
  return "OUTROS";
}

/**
 * Extract account tag from first bracket in utm_campaign (e.g. [BMHAVEN]).
 */
export function extractAccountTag(utmCampaign?: string | null): string {
  if (!utmCampaign) return "Desconhecida";
  const match = utmCampaign.match(/\[([^\]]+)\]/);
  return match ? match[1] : "Desconhecida";
}

/**
 * Detect the source/platform from a sale or event.
 */
export function detectSource(sale: any): string {
  if (sale.event_type === "purchase" || sale.event_type === "upsell") return "Clickbank";
  if (sale.store === "clickbank") return "Clickbank";
  
  const utmSource = (sale.utm_source || "").toLowerCase();
  const utmCampaign = (sale.utm_campaign || "").toUpperCase();
  
  if (utmSource.includes("mgid") || utmCampaign.includes("MGID")) return "MGID";
  if (utmSource.startsWith("fb") || utmSource.includes("facebook")) return "Meta";
  if (sale.store === "sphere") return "Meta"; // Standard for FAHTO/GTX
  if (sale.store) return "CartPanda";
  
  return "Outro";
}

/** Project codes hidden from filter UI (data still classified, just not selectable) */
const HIDDEN_PROJECTS = new Set<string>([]);

/** GTX operation id — hardcoded projects (NDR, MO, LDR, NDB, CRT, PP) só aparecem nela.
 *  Outras operações (Escola do Dólar etc.) só veem projetos vindos de offers cadastrados. */
const GTX_OPERATION_ID = "0b758a2b-1b92-4769-b47b-416c567e320d";

/** All known project codes (visible in filter UI) — hardcoded + offers dinâmicos.
 *  Passe operationId para esconder os hardcoded GTX em outras operações. */
export function getAllProjects(operationId?: string | null): { code: string; label: string }[] {
  const includeHardcoded = !operationId || operationId === GTX_OPERATION_ID;
  const base = includeHardcoded
    ? PROJECT_BRACKET_TAGS.filter((p) => !HIDDEN_PROJECTS.has(p.code)).map((p) => ({ code: p.code, label: p.label }))
    : [];
  const dyn = getDynamicProjects();
  const seen = new Set(base.map((b) => b.code));
  for (const d of dyn) if (!seen.has(d.code)) base.push(d);
  return base;
}
export const ALL_PROJECTS = PROJECT_BRACKET_TAGS
  .filter((p) => !HIDDEN_PROJECTS.has(p.code))
  .map((p) => ({ code: p.code, label: p.label }));

export const ALL_STRUCTURES = STRUCTURE_PATTERNS.map((s) => ({ code: s.code, label: s.label }));
