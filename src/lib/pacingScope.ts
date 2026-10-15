import type { PacingRuleV2 } from "@/components/pacing/mockData";
import type { PacingCampaign } from "@/components/pacing/mockData";

/**
 * Match de projeto idêntico ao `detectOfferTag`: procura `[TAG]` (bracket) no nome.
 * Real-world campaign names usam brackets ([NDM], [MMP], etc.), não prefixo.
 */
function nameMatchesProject(campaignName: string, projectTag: string): boolean {
  const upper = campaignName.toUpperCase();
  const tag = projectTag.toUpperCase();
  // 1) bracket exato [NDM]
  if (upper.includes(`[${tag}]`)) return true;
  // 2) fallback prefixo legado (NDM-...)
  if (upper.startsWith(`${tag}-`) || upper === tag) return true;
  return false;
}

/**
 * Verifica se o scope de uma regra "casa" com uma campanha viva.
 * Espelha a lógica do server (filter_config) usando bracket-detection.
 */
export function ruleMatchesCampaign(rule: PacingRuleV2, c: PacingCampaign): boolean {
  if (!rule.enabled) return false;
  const s = rule.scope;
  if (!s) return false;

  // 1) appliesTo — active/paused/all
  const isActive = c.status !== "paused";
  if (s.appliesTo === "paused" && isActive) return false;
  if ((s.appliesTo === "active" || !s.appliesTo) && !isActive) return false;
  // "all" passa direto

  // 2) nameContains (case-insensitive)
  if (s.nameContains && !c.name.toLowerCase().includes(s.nameContains.toLowerCase())) {
    return false;
  }

  // 3) projects — bracket-detection real (alinhado com detectOfferTag)
  if (Array.isArray(s.projects) && s.projects.length > 0) {
    const matched = s.projects.some((p) => nameMatchesProject(c.name, String(p)));
    if (!matched) return false;
  }

  // 4) account
  if (s.account && s.account !== "all" && c.account !== s.account) return false;

  // 5) phases — aceita [FASE 03] OU -F3- (formatos antigos e atuais)
  if (Array.isArray(s.phases) && s.phases.length > 0) {
    const upper = c.name.toUpperCase();
    const phaseMatch = s.phases.some((p) => {
      const num = String(p).replace(/[^0-9]/g, ""); // "F3" → "3"
      if (!num) return false;
      const padded = num.padStart(2, "0"); // "03"
      return (
        upper.includes(`[FASE ${padded}]`) ||
        upper.includes(`[FASE ${num}]`) ||
        upper.includes(`-F${num}-`) ||
        upper.includes(`-${p}-`)
      );
    });
    if (!phaseMatch) return false;
  }

  // 6) minBudget — usa spend hoje como proxy
  if (s.minBudget && s.minBudget > 0 && (c.spend ?? 0) < s.minBudget) return false;

  return true;
}

export function getMatchingRules(rules: PacingRuleV2[], c: PacingCampaign): PacingRuleV2[] {
  return rules.filter((r) => ruleMatchesCampaign(r, c));
}

/**
 * Igual a ruleMatchesCampaign, mas retorna o motivo do primeiro critério que falhou.
 * Retorna null se a regra casa. Não checa `enabled` — caller filtra antes.
 */
export function whyRuleDoesNotMatch(rule: PacingRuleV2, c: PacingCampaign): string | null {
  const s = rule.scope;
  if (!s) return "sem scope configurado";

  const isActive = c.status !== "paused";
  if (s.appliesTo === "paused" && isActive) return "regra só observa campanhas pausadas (está ativa)";
  if ((s.appliesTo === "active" || !s.appliesTo) && !isActive) return "regra só observa campanhas ativas (está pausada)";

  if (s.nameContains && !c.name.toLowerCase().includes(s.nameContains.toLowerCase())) {
    return `nome não contém "${s.nameContains}"`;
  }

  if (Array.isArray(s.projects) && s.projects.length > 0) {
    const matched = s.projects.some((p) => nameMatchesProject(c.name, String(p)));
    if (!matched) return `projeto fora de [${s.projects.join(", ")}]`;
  }

  if (s.account && s.account !== "all" && c.account !== s.account) {
    return `conta ≠ "${s.account}"`;
  }

  if (Array.isArray(s.phases) && s.phases.length > 0) {
    const upper = c.name.toUpperCase();
    const phaseMatch = s.phases.some((p) => {
      const num = String(p).replace(/[^0-9]/g, "");
      if (!num) return false;
      const padded = num.padStart(2, "0");
      return (
        upper.includes(`[FASE ${padded}]`) ||
        upper.includes(`[FASE ${num}]`) ||
        upper.includes(`-F${num}-`) ||
        upper.includes(`-${p}-`)
      );
    });
    if (!phaseMatch) return `fase fora de [${s.phases.join("/")}]`;
  }

  if (s.minBudget && s.minBudget > 0 && (c.spend ?? 0) < s.minBudget) {
    return `spend hoje (R$${(c.spend ?? 0).toFixed(0)}) < mínimo R$${s.minBudget}`;
  }

  return null;
}

/**
 * Retorna regras habilitadas que NÃO casaram com a campanha, junto com o motivo.
 */
export function getBlockedRules(
  rules: PacingRuleV2[],
  c: PacingCampaign,
): Array<{ rule: PacingRuleV2; reason: string }> {
  const out: Array<{ rule: PacingRuleV2; reason: string }> = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    const reason = whyRuleDoesNotMatch(r, c);
    if (reason) out.push({ rule: r, reason });
  }
  return out;
}
