// Helpers e tipos da Pipeline de Farm — Fase 1

export type Stage = "no_ads" | "warming" | "almost" | "ready" | "advertising" | "inactive";

/* ─── Origem da conta (FARM próprio vs AQUECIMENTO — alugadas/compradas) ─── */
export type AccountOrigin = "farm" | "aquecimento";

export const ORIGIN_META: Record<AccountOrigin, {
  label: string;
  short: string;
  tooltip: string;
  tone: string;
  hex: string;
}> = {
  farm: {
    label: "Farm próprio",
    short: "FARM",
    tooltip: "Conta própria — campanhas com tag [FARM]",
    tone: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    hex: "#34d399",
  },
  aquecimento: {
    label: "Aquecimento",
    short: "AQUEC",
    tooltip: "Conta alugada/comprada em esteira — campanhas com tag [AQUECIMENTO]",
    tone: "text-sky-300 border-sky-500/40 bg-sky-500/10",
    hex: "#38bdf8",
  },
};

/**
 * Detecta a origem da conta a partir das tags presentes nas suas campanhas farm.
 * Regra: presença de [AQUECIMENTO] manda — significa esteira alugada/comprada.
 * Sem [AQUECIMENTO] e com [FARM] → farm próprio.
 */
export function detectOrigin(hasFarmTag: boolean, hasAquecimentoTag: boolean): AccountOrigin {
  if (hasAquecimentoTag) return "aquecimento";
  return "farm";
}

export type InactiveReason =
  | "all"
  | "bm_down"      // status 2, 101, 100 — desabilitada/closed/pending_closure
  | "limit"        // status 3, 8, 9 — unsettled, pending_settlement, in_grace
  | "policy"       // status 7 — pending_risk_review
  | "no_ads"       // dias === null
  | "other";

export const INACTIVE_REASON_META: Record<
  Exclude<InactiveReason, "all">,
  { label: string; short: string; tone: string; hex: string }
> = {
  bm_down: {
    label: "Caiu (BM/Closed)",
    short: "BM",
    tone: "text-rose-400 border-rose-500/40 bg-rose-500/10",
    hex: "#fb7185",
  },
  limit: {
    label: "Limite / Pagamento",
    short: "Limite",
    tone: "text-amber-400 border-amber-500/40 bg-amber-500/10",
    hex: "#fbbf24",
  },
  policy: {
    label: "Em Review (Política)",
    short: "Política",
    tone: "text-fuchsia-400 border-fuchsia-500/40 bg-fuchsia-500/10",
    hex: "#e879f9",
  },
  no_ads: {
    label: "Sem anúncios",
    short: "Sem ads",
    tone: "text-slate-400 border-slate-500/40 bg-slate-500/10",
    hex: "#94a3b8",
  },
  other: {
    label: "Outros",
    short: "Outros",
    tone: "text-muted-foreground border-border bg-muted/40",
    hex: "#64748b",
  },
};

/**
 * Mapeia account_status do Meta + estado interno em um motivo de queda.
 * 1=active, 2=disabled, 3=unsettled, 7=pending_review,
 * 8=pending_settlement, 9=in_grace, 100=pending_closure, 101=closed
 */
export function getInactiveReason(
  accountStatus: number | null | undefined,
  days: number | null,
): InactiveReason {
  if (days === null) return "no_ads";
  switch (accountStatus) {
    case 2:
    case 100:
    case 101:
      return "bm_down";
    case 3:
    case 8:
    case 9:
      return "limit";
    case 7:
      return "policy";
    default:
      return "other";
  }
}

export type SortMode = "smart" | "name" | "days_desc" | "days_asc";

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "smart", label: "Padrão (inteligente)" },
  { value: "name", label: "Nome (A→Z)" },
  { value: "days_desc", label: "Mais tempo no status" },
  { value: "days_asc", label: "Menos tempo no status" },
];

export function sortRowsForStage(rows: any[], stage: Stage, mode: SortMode): any[] {
  const copy = [...rows];
  if (mode === "name") {
    return copy.sort((a, b) => a.account_name.localeCompare(b.account_name));
  }
  if (mode === "days_desc") {
    return copy.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  }
  if (mode === "days_asc") {
    return copy.sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER));
  }
  // smart
  switch (stage) {
    case "warming":
    case "almost":
      // mais perto de virar (mais dias) primeiro
      return copy.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
    case "ready":
      // gasto recente desc (rec.dropped no topo se houver, depois mais novas)
      return copy.sort((a, b) => {
        if (a.recentlyDropped !== b.recentlyDropped) return a.recentlyDropped ? -1 : 1;
        return (b.days ?? -1) - (a.days ?? -1);
      });
    case "advertising":
      // contas anunciando há mais tempo no topo
      return copy.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
    case "inactive":
      // caiu recente primeiro
      return copy.sort((a, b) => {
        if (a.recentlyDropped !== b.recentlyDropped) return a.recentlyDropped ? -1 : 1;
        return (b.days ?? -1) - (a.days ?? -1);
      });
    case "no_ads":
    default:
      return copy.sort((a, b) => a.account_name.localeCompare(b.account_name));
  }
}

/**
 * Identifica IDs de contas que transitaram de status=1 → status≠1
 * nas últimas `hours` horas. Usa os logs já carregados.
 */
export function computeRecentDrops(
  log: { account_id: string; old_status: number | null; new_status: number; changed_at: string }[] | undefined,
  hours = 24,
): Set<string> {
  if (!log) return new Set();
  const cutoff = Date.now() - hours * 3600_000;
  // Pega o evento MAIS RECENTE de cada conta dentro da janela.
  // Só marca como "caiu" se a última transição foi 1 → não-1 (e ainda não voltou).
  const latestByAcc = new Map<string, { old: number | null; nw: number; t: number }>();
  for (const e of log) {
    const t = new Date(e.changed_at).getTime();
    if (t < cutoff) continue;
    const cur = latestByAcc.get(e.account_id);
    if (!cur || t > cur.t) latestByAcc.set(e.account_id, { old: e.old_status, nw: e.new_status, t });
  }
  const set = new Set<string>();
  for (const [acc, ev] of latestByAcc) {
    if (ev.old === 1 && ev.nw !== 1) set.add(acc);
  }
  return set;
}

/**
 * Previsão: contas que devem ficar Prontas nos próximos N dias.
 * Considera só warming/almost com account_status ativo.
 */
export function computeForecast(
  rows: { stage: Stage; days: number | null; account_status: number | null | undefined }[],
  almostMaxDays: number,
  withinDays = 3,
): number {
  return rows.filter((r) => {
    if (r.stage !== "warming" && r.stage !== "almost") return false;
    if (r.account_status !== 1 && r.account_status !== null && r.account_status !== undefined) return false;
    if (r.days === null) return false;
    const daysToReady = (almostMaxDays + 1) - r.days;
    return daysToReady > 0 && daysToReady <= withinDays;
  }).length;
}

/**
 * Detecta "Pronta zumbi": marcada como Pronta + Meta ativa,
 * mas sem nenhum gasto registrado nas últimas 48h.
 */
export function isZombieReady(
  row: { stage: Stage; account_status: number | null | undefined; account_id: string },
  spendLast48h: Record<string, number> | undefined,
): boolean {
  if (row.stage !== "ready") return false;
  if (row.account_status !== 1) return false;
  if (!spendLast48h) return false;
  const v = spendLast48h[row.account_id];
  if (v === undefined) return false;
  return v <= 0;
}

/**
 * Métrica por coluna: média de dias entre as contas atuais do status.
 */
export function avgDaysInStage(rows: { days: number | null }[]): number | null {
  const valid = rows.map((r) => r.days).filter((d): d is number => d !== null && d >= 0);
  if (valid.length === 0) return null;
  return valid.reduce((s, d) => s + d, 0) / valid.length;
}

/**
 * Churn por coluna nos últimos `hours`: contas que estão atualmente no stage
 * e caíram (old=1 → new≠1) na janela.
 */
export function computeStageChurn(
  stageAccountIds: Set<string>,
  log: { account_id: string; old_status: number | null; new_status: number; changed_at: string }[] | undefined,
  hours = 168,
): number {
  if (!log) return 0;
  const cutoff = Date.now() - hours * 3600_000;
  const seen = new Set<string>();
  for (const e of log) {
    const t = new Date(e.changed_at).getTime();
    if (t < cutoff) continue;
    if (!stageAccountIds.has(e.account_id)) continue;
    if (e.old_status === 1 && e.new_status !== 1) seen.add(e.account_id);
  }
  return seen.size;
}

/**
 * Total de quedas (Meta 1→≠1) na janela inteira.
 */
export function computeBurnRate(
  log: { account_id: string; old_status: number | null; new_status: number; changed_at: string }[] | undefined,
  hours = 168,
): number {
  if (!log) return 0;
  const cutoff = Date.now() - hours * 3600_000;
  const seen = new Set<string>();
  for (const e of log) {
    const t = new Date(e.changed_at).getTime();
    if (t < cutoff) continue;
    if (e.old_status === 1 && e.new_status !== 1) seen.add(e.account_id);
  }
  return seen.size;
}
