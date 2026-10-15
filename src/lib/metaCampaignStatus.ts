/**
 * Fonte única de verdade pra decidir se uma campanha Meta está "pausada" na UI.
 *
 * ⚠️ NÃO trate `effective_status !== 'ACTIVE'` como pausada — a Meta usa vários
 * estados transitórios que continuam GASTANDO/entregando:
 *   - IN_PROCESS        → ajuste de budget/config sendo processado (auto-scale, edit)
 *   - WITH_ISSUES       → alerta mas ainda ativa
 *   - PENDING_REVIEW    → em revisão, mas rodando
 *   - CAMPAIGN_PAUSED   → herdado da campanha-pai (contexto de adset)
 *   - LEARNING          → fase de aprendizado
 *
 * Uma campanha só é pausada quando o Meta reporta explicitamente um dos
 * estados terminais/pausados abaixo.
 */
export const META_PAUSED_STATES = new Set([
  "PAUSED",
  "ARCHIVED",
  "DELETED",
  "ADSET_PAUSED",
  "CAMPAIGN_PAUSED",
]);

export function isMetaCampaignPaused(
  status?: string | null,
  effectiveStatus?: string | null,
): boolean {
  const s = String(status || "").toUpperCase();
  const eff = String(effectiveStatus || "").toUpperCase();
  if (META_PAUSED_STATES.has(s)) return true;
  // Só olha effective_status se o status base não for explicitamente ACTIVE.
  if (s !== "ACTIVE" && META_PAUSED_STATES.has(eff)) return true;
  return false;
}

export function isMetaCampaignActive(
  status?: string | null,
  effectiveStatus?: string | null,
): boolean {
  return !isMetaCampaignPaused(status, effectiveStatus);
}
