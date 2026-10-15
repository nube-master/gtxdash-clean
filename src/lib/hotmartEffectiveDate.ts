// Data efetiva BRT para vendas Hotmart (mesma lógica do edge dashboard-totals).
// `clickbank_audit.date` foi gravado em UTC ou até com a data original da assinatura
// em backfills, então precisamos reconciliar com `created_at` em America/Sao_Paulo.

export function toSPDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  } catch {
    return "";
  }
}

function addDays(ymd: string, delta: number): string {
  if (!ymd) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function getHotmartEffectiveDate(rowDate: string | null | undefined, createdAt: string | null | undefined): string {
  const storedDate = String(rowDate || "");
  if (!storedDate) return createdAt ? toSPDate(createdAt) : "";
  if (!createdAt) return storedDate;
  const createdBrt = toSPDate(createdAt);
  // Vendas 21h-23h59 BRT viram D+1 em `date` (UTC). Corrige só esse caso;
  // backfills antigos preservam `date` original.
  return createdBrt === addDays(storedDate, -1) ? createdBrt : storedDate;
}
