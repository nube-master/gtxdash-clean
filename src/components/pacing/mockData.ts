// Mock data for Pacing Controller — Fase 1 (visual validation)
// Replace with real hooks (usePacingCampaigns, usePacingRules) in Fase 2.

export type PacingStatus = "ok" | "warning" | "critical" | "paused" | "warming";

export interface PacingCampaign {
  id: string;
  name: string;
  account: string;
  pacePct: number;
  spend: number;
  cpa: number | null;
  roas: number;
  rulesApplied: number;
  status: PacingStatus;
  sparkline: number[];
  accountId?: string;
  dailyBudget?: number | null;
  spendYesterday?: number;
  salesYesterday?: number;
  revenueYesterday?: number;
  impressions?: number;
  clicks?: number;
  cpm?: number;
  ctr?: number;
  cpc?: number;
  sales?: number;
  revenue?: number;
  // Teto diário resolvido (ABO-aware): override > CBO Meta > regra > null
  dailyTargetBrl?: number | null;
  dailyTargetSource?: "override" | "cbo" | "rule" | null;
  // Exceção manual: pacing-controller ignora regras para esta campanha enquanto
  // ativo. Veja CampaignTargetOverrideDialog → seção "Exceção de regras".
  rulesExempt?: boolean;
  hourlyCapBrlOverride?: number | null;
  exemptUntil?: string | null; // ISO timestamp; null = permanente
  operation_id?: string | null;
}


export interface PacingRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  scope: string;
  active: boolean;
  firedToday: number;
  cooldownH: number;
  inCooldown?: boolean;
}

export interface PacingEvent {
  id: string;
  ts: string; // ISO
  type: "pause" | "resume" | "scale" | "warm" | "alert";
  message: string;
  campaign?: string;
  rule?: string;
}

const seed = (n: number) => {
  // deterministic pseudo-sparkline
  const arr: number[] = [];
  let v = 50 + (n * 7) % 30;
  for (let i = 0; i < 14; i++) {
    v += ((n * 13 + i * 17) % 20) - 10;
    arr.push(Math.max(5, v));
  }
  return arr;
};

export const PROJECT_SLUGS = ["NDM", "ERX", "GLP", "MMP", "CRT", "LDR", "NEURO", "NDB", "TDM-COD", "EDD", "GTX"] as const;
export type ProjectSlug = (typeof PROJECT_SLUGS)[number];

export const getProjectSlug = (name: string): ProjectSlug | null => {
  const upper = name.toUpperCase();
  // Match multi-segment slugs first (e.g. "TDM-COD")
  for (const slug of PROJECT_SLUGS) {
    if (slug.includes("-") && upper.startsWith(slug + "-")) return slug;
  }
  const prefix = upper.split("-")[0];
  return (PROJECT_SLUGS as readonly string[]).includes(prefix) ? (prefix as ProjectSlug) : null;
};

export const mockCampaigns: PacingCampaign[] = [
  { id: "c1", name: "NDM-top-F3-001", account: "C01", pacePct: 92, spend: 489.12, cpa: 612.4, roas: 2.81, rulesApplied: 3, status: "ok", sparkline: seed(1) },
  { id: "c2", name: "ERX-top-F2-014", account: "CA 01", pacePct: 145, spend: 728.55, cpa: 891.0, roas: 1.42, rulesApplied: 2, status: "critical", sparkline: seed(2).reverse() },
  { id: "c3", name: "GLP-xxx-F1-007", account: "C02", pacePct: 8, spend: 56.20, cpa: null, roas: 0, rulesApplied: 1, status: "warming", sparkline: seed(3) },
  { id: "c4", name: "MMP-top-ABO-022", account: "AURORA 03 DUB", pacePct: 64, spend: 312.80, cpa: 458.1, roas: 2.04, rulesApplied: 2, status: "ok", sparkline: seed(4) },
  { id: "c5", name: "CRT-bttn-F4-009", account: "04 GTX MIDIA", pacePct: 108, spend: 1042.10, cpa: 720.5, roas: 1.91, rulesApplied: 3, status: "warning", sparkline: seed(5) },
  { id: "c6", name: "NDM-top-F3-018", account: "C03", pacePct: 0, spend: 0, cpa: null, roas: 0, rulesApplied: 1, status: "paused", sparkline: seed(6).map(() => 0) },
  { id: "c7", name: "LDR-top-F1-003", account: "CA 02", pacePct: 78, spend: 234.50, cpa: 391.0, roas: 2.48, rulesApplied: 2, status: "ok", sparkline: seed(7) },
  { id: "c8", name: "NEURO-vsl-F2-011", account: "CA 03", pacePct: 132, spend: 891.30, cpa: 812.6, roas: 1.51, rulesApplied: 2, status: "warning", sparkline: seed(8) },
  { id: "c9", name: "NDB-top-F2-004", account: "C01", pacePct: 88, spend: 412.00, cpa: 540.0, roas: 2.62, rulesApplied: 2, status: "ok", sparkline: seed(9) },
  { id: "c10", name: "NDM-bttn-F1-022", account: "CA 03", pacePct: 156, spend: 1287.40, cpa: 945.2, roas: 1.28, rulesApplied: 4, status: "critical", sparkline: seed(10) },
  { id: "c11", name: "ERX-vsl-ABO-008", account: "C02", pacePct: 71, spend: 198.30, cpa: 421.0, roas: 2.19, rulesApplied: 2, status: "ok", sparkline: seed(11) },
  { id: "c12", name: "GLP-top-F4-013", account: "AURORA 03 DUB", pacePct: 115, spend: 678.90, cpa: 681.5, roas: 1.78, rulesApplied: 3, status: "warning", sparkline: seed(12) },
  { id: "c13", name: "MMP-bttn-F2-019", account: "CA 01", pacePct: 0, spend: 0, cpa: null, roas: 0, rulesApplied: 1, status: "paused", sparkline: seed(13).map(() => 0) },
  { id: "c14", name: "CRT-top-F3-027", account: "04 GTX MIDIA", pacePct: 95, spend: 521.60, cpa: 588.0, roas: 2.34, rulesApplied: 3, status: "ok", sparkline: seed(14) },
  { id: "c15", name: "LDR-vsl-F2-015", account: "C03", pacePct: 12, spend: 78.40, cpa: null, roas: 0, rulesApplied: 1, status: "warming", sparkline: seed(15) },
  { id: "c16", name: "NEURO-top-F3-021", account: "CA 02", pacePct: 102, spend: 845.20, cpa: 712.0, roas: 1.95, rulesApplied: 2, status: "warning", sparkline: seed(16) },
  { id: "c17", name: "NDB-vsl-F1-009", account: "C02", pacePct: 67, spend: 289.10, cpa: 412.5, roas: 2.45, rulesApplied: 2, status: "ok", sparkline: seed(17) },
  { id: "c18", name: "NDM-top-ABO-031", account: "AURORA 03 DUB", pacePct: 83, spend: 367.80, cpa: 502.0, roas: 2.58, rulesApplied: 3, status: "ok", sparkline: seed(18) },
  { id: "c19", name: "ERX-bttn-F3-017", account: "04 GTX MIDIA", pacePct: 138, spend: 962.40, cpa: 858.0, roas: 1.46, rulesApplied: 2, status: "critical", sparkline: seed(19) },
  { id: "c20", name: "GLP-vsl-F2-011", account: "C01", pacePct: 0, spend: 0, cpa: null, roas: 0, rulesApplied: 1, status: "paused", sparkline: seed(20).map(() => 0) },
];

export const mockRules: PacingRule[] = [
  { id: "r1", name: "CPA Cap Universal R$750", condition: "cpa_3d > 750 E spend_3d > 250", action: "PAUSAR campanha", scope: "todas", active: true, firedToday: 3, cooldownH: 4 },
  { id: "r2", name: "Madrugada 1/3", condition: "horário ∈ [00h–06h]", action: "ORÇAMENTO × 0.33", scope: "ABO Baiano", active: true, firedToday: 47, cooldownH: 0 },
  { id: "r3", name: "Pace > 110%", condition: "spend_dia / target_dia > 1.10", action: "PAUSAR adset", scope: "todas", active: true, firedToday: 5, cooldownH: 2 },
  { id: "r4", name: "Sem venda após R$50", condition: "spend > 50 E sales = 0", action: "ALERTAR + reduzir budget 50%", scope: "todas", active: true, firedToday: 12, cooldownH: 1 },
  { id: "r5", name: "Scale ROAS > 2.5", condition: "roas_3d > 2.5 E spend_3d > 500", action: "AUMENTAR budget +20%", scope: "todas", active: true, firedToday: 2, cooldownH: 6 },
  { id: "r6", name: "Frequência alta", condition: "frequency > 3.5", action: "ALERTAR", scope: "todas", active: false, firedToday: 0, cooldownH: 4 },
  { id: "r7", name: "CTR baixo", condition: "ctr < 0.8", action: "PAUSAR ad", scope: "todas", active: false, firedToday: 0, cooldownH: 2, inCooldown: true },
];

const now = Date.now();
const min = (m: number) => new Date(now - m * 60_000).toISOString();

export const mockEvents: PacingEvent[] = [
  { id: "e1", ts: min(3), type: "pause", message: 'disparou regra "CPA > R$818"', campaign: "ERX-top-F2-014", rule: "CPA Cap R$750" },
  { id: "e2", ts: min(7), type: "scale", message: "atingiu 80% do orçamento diário", campaign: "NDM-top-F3-001" },
  { id: "e3", ts: min(20), type: "warm", message: "ainda sem venda após R$50 spend", campaign: "GLP-xxx-F1-007" },
  { id: "e4", ts: min(34), type: "resume", message: "retomada após cooldown", campaign: "NDM-top-F3-018", rule: "Pace > 110%" },
  { id: "e5", ts: min(58), type: "alert", message: "ROAS abaixo de 1.5 por 2h", campaign: "NEURO-vsl-F2-011" },
  { id: "e6", ts: min(91), type: "pause", message: "frequência atingiu 3.8", campaign: "CRT-bttn-F4-009" },
  { id: "e7", ts: min(127), type: "scale", message: "budget aumentado +20%", campaign: "MMP-top-ABO-022", rule: "Scale ROAS > 2.5" },
];

export const mockKpis = {
  spend: 12420.55,
  spendDelta: 8.3,
  roas: 2.31,
  roasDelta: 0.08,
  activeCount: 47,
  totalCount: 52,
  pausedCount: 5,
  rulesOn: 14,
  rulesFired: 2,
};

// =================================================================
// Rule Editor V2 — schema rico p/ tela /pacing/regras
// =================================================================

export type RuleTriggerKind = "linear_pacing" | "group_cap" | "daily_cap" | "acceleration_no_sale" | "campaign_hourly_cap" | "hourly_window" | "profit_threshold" | "daily_schedule" | "metric_threshold";
export type RuleActionKind = "pause" | "reduce_budget" | "increase_budget" | "alert_only" | "activate";
export type RuleSeverity = "low" | "medium" | "high";
export type RulePhase = "F1" | "F2" | "F3";
export type RuleAppliesTo = "active" | "paused" | "any";
// "last_15min" | "last_30min" | "last_60min" = janelas ROLLING (aprox. 60min por
// causa da granularidade horária da Meta). Ideal para regras de scale reativo.
export type RuleWindow = "today" | "yesterday" | "last_3d" | "last_7d" | "last_15min" | "last_30min" | "last_60min" | "custom";
export type RuleEvalEvery = 1 | 2 | 3 | 5 | 10 | 15 | 30 | 60;

export type ExtraCondMetric = "spend" | "sales" | "roi" | "roas" | "cpa" | "ctr" | "cpc" | "profit" | "ic";
export type ExtraCondOp = ">" | ">=" | "<" | "<=" | "=";
// "abs" = número absoluto (R$, contagem, ratio). "pct" = porcentagem (valor é % — ex: 20 = 20%).
export type ExtraCondUnit = "abs" | "pct";

export interface ExtraCondition {
  metric: ExtraCondMetric;
  op: ExtraCondOp;
  value: number;
  unit?: ExtraCondUnit;
}

// Unidade do limite de lucro/prejuízo. "brl" = valor em R$. "pct" = % sobre spend.
export type ProfitThresholdUnit = "brl" | "pct";

export interface RuleScope {
  nameContains: string;
  projects: ProjectSlug[];
  account: string; // "all" or account name
  phases: RulePhase[];
  minBudget: number;
  // 1) UTMify "Aplicar regra a" — filtro de estado da campanha
  appliesTo?: RuleAppliesTo;
  // 2) Só campanhas que tiveram spend >= X reais ONTEM (BRT). 0 ou undefined = off.
  minSpendYesterdayBrl?: number;
  // 3) Janela horária BRT em que a regra fica ATIVA (avaliada).
  //    Fora da janela a regra é pulada. undefined / 0–24 = sempre ativa.
  //    Suporta janelas que viram a meia-noite (ex: 22→6 = 22h às 6h).
  activeHourStart?: number; // 0..23
  activeHourEnd?: number;   // 1..24 (exclusivo)
}


export interface RuleTrigger {
  kind: RuleTriggerKind;
  tolerance: number;
  andNoSale: boolean;
  noSaleMinutes: number;
  groupId: string;
  accelPctOfDaily: number;
  defaultDailyTargetBrl?: number;
  maxSpendPerHourBrl?: number;
  maxPctOfDailyPerHour?: number;
  hourStart?: number;
  hourEnd?: number;
  minSpendBeforeTrigger?: number;
  spendBetweenMin?: number;
  spendBetweenMax?: number;
  andNoSaleInLastMinutes?: number;
  profitThreshold?: number;
  // unidade do profitThreshold — "brl" (R$ absoluto) ou "pct" (% sobre spend). Default "brl".
  profitThresholdUnit?: ProfitThresholdUnit;
  // 3) janela de cálculo
  window?: RuleWindow;
  // 6) frequência de avaliação
  evalEveryMin?: RuleEvalEvery;
  // 5) condições extras combináveis (AND com o trigger principal)
  extraConditions?: ExtraCondition[];
  // 7) daily_schedule — agendamento diário (BRT). Dispara 1x/dia no horário configurado.
  scheduledHour?: number;   // 0..23
  scheduledMinute?: number; // 0..59
}

export interface RuleAction {
  kind: RuleActionKind;
  reducePct: number;
  // % de aumento no orçamento quando kind = "increase_budget". Ex: 100 = 2x, 50 = 1.5x
  increasePct?: number;
  // Teto absoluto (R$) para o daily_budget da campanha após aumento/redução.
  // undefined/0 = sem teto. Guard-rail p/ evitar escalar infinito.
  maxDailyBudgetBrl?: number;
  cooldownMin: number;
  autoResume: boolean;
  // 4) limite de execuções por dia (0 = sem limite) — POR REGRA (agregado em todas campanhas)
  maxFiresPerDay?: number;
  // 4b) limite de execuções por dia POR CAMPANHA — a mesma regra só dispara N vezes em cada
  // campanha individual por dia BRT. 0/undefined = sem limite. Independente de maxFiresPerDay.
  maxFiresPerCampaignPerDay?: number;
  // Trava religação por outras regras até esta hora BRT (0-23). Vazio = sem lock.
  hardStopUntilHourBRT?: number;
}

export interface RuleNotification {
  pushcut: boolean;
  severity: RuleSeverity;
}

export interface PacingRuleV2 {
  id: string;
  operationId?: string | null;
  name: string;
  enabled: boolean;
  scope: RuleScope;
  trigger: RuleTrigger;
  action: RuleAction;
  notification: RuleNotification;
  matchedCampaigns: number;
  firedToday: number;
  firedTotal: number;
  lastFiredAt: string | null;
}

const isoMinAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const defaultRuleV2 = (): PacingRuleV2 => ({
  id: "",
  name: "",
  enabled: true,
  scope: { nameContains: "", projects: [], account: "all", phases: [], minBudget: 0, appliesTo: "active", activeHourStart: undefined, activeHourEnd: undefined },
  trigger: { kind: "linear_pacing", tolerance: 1.5, andNoSale: false, noSaleMinutes: 60, groupId: "", accelPctOfDaily: 30, defaultDailyTargetBrl: undefined, maxSpendPerHourBrl: undefined, maxPctOfDailyPerHour: undefined, hourStart: undefined, hourEnd: undefined, minSpendBeforeTrigger: undefined, spendBetweenMin: undefined, spendBetweenMax: undefined, andNoSaleInLastMinutes: undefined, profitThreshold: undefined, profitThresholdUnit: "brl", window: "today", evalEveryMin: 10, extraConditions: [], scheduledHour: undefined, scheduledMinute: undefined },
  action: { kind: "pause", reducePct: 50, increasePct: 100, maxDailyBudgetBrl: undefined, cooldownMin: 30, autoResume: true, maxFiresPerDay: 0 },
  notification: { pushcut: true, severity: "medium" },
  matchedCampaigns: 0,
  firedToday: 0,
  firedTotal: 0,
  lastFiredAt: null,
});

export const mockRulesV2: PacingRuleV2[] = [
  {
    id: "rv1",
    name: "Aceleração F3 NDM Escala",
    enabled: true,
    scope: { nameContains: "1-250-1", projects: ["NDM"], account: "04 GTX MIDIA", phases: ["F3"], minBudget: 0 },
    trigger: { kind: "linear_pacing", tolerance: 1.5, andNoSale: true, noSaleMinutes: 60, groupId: "", accelPctOfDaily: 30 },
    action: { kind: "pause", reducePct: 50, cooldownMin: 30, autoResume: true },
    notification: { pushcut: true, severity: "high" },
    matchedCampaigns: 12, firedToday: 14, firedTotal: 89, lastFiredAt: isoMinAgo(5),
  },
  {
    id: "rv2",
    name: "Grupo F3 NDM — Teto $370/h",
    enabled: true,
    scope: { nameContains: "", projects: ["NDM"], account: "all", phases: ["F3"], minBudget: 0 },
    trigger: { kind: "group_cap", tolerance: 1.5, andNoSale: false, noSaleMinutes: 60, groupId: "f3-ndm-escala", accelPctOfDaily: 30 },
    action: { kind: "pause", reducePct: 50, cooldownMin: 45, autoResume: false },
    notification: { pushcut: true, severity: "high" },
    matchedCampaigns: 8, firedToday: 4, firedTotal: 27, lastFiredAt: isoMinAgo(42),
  },
  {
    id: "rv3",
    name: "Sem Venda 90min Geral",
    enabled: true,
    scope: { nameContains: "", projects: [], account: "all", phases: [], minBudget: 100 },
    trigger: { kind: "linear_pacing", tolerance: 1.25, andNoSale: true, noSaleMinutes: 90, groupId: "", accelPctOfDaily: 30 },
    action: { kind: "pause", reducePct: 50, cooldownMin: 60, autoResume: true },
    notification: { pushcut: true, severity: "medium" },
    matchedCampaigns: 47, firedToday: 9, firedTotal: 142, lastFiredAt: isoMinAgo(18),
  },
  {
    id: "rv4",
    name: "Daily Cap Hard Stop",
    enabled: true,
    scope: { nameContains: "", projects: [], account: "all", phases: [], minBudget: 0 },
    trigger: { kind: "daily_cap", tolerance: 1.0, andNoSale: false, noSaleMinutes: 60, groupId: "", accelPctOfDaily: 30 },
    action: { kind: "pause", reducePct: 50, cooldownMin: 1440, autoResume: false },
    notification: { pushcut: true, severity: "high" },
    matchedCampaigns: 52, firedToday: 6, firedTotal: 198, lastFiredAt: isoMinAgo(120),
  },
  {
    id: "rv5",
    name: "Aceleração F1 Aquecimento",
    enabled: true,
    scope: { nameContains: "", projects: [], account: "all", phases: ["F1"], minBudget: 50 },
    trigger: { kind: "linear_pacing", tolerance: 2.0, andNoSale: false, noSaleMinutes: 60, groupId: "", accelPctOfDaily: 30 },
    action: { kind: "reduce_budget", reducePct: 50, cooldownMin: 60, autoResume: true },
    notification: { pushcut: false, severity: "low" },
    matchedCampaigns: 6, firedToday: 2, firedTotal: 18, lastFiredAt: isoMinAgo(310),
  },
  {
    id: "rv6",
    name: "ERX Conservadora",
    enabled: false,
    scope: { nameContains: "", projects: ["ERX"], account: "all", phases: [], minBudget: 200 },
    trigger: { kind: "linear_pacing", tolerance: 1.25, andNoSale: true, noSaleMinutes: 45, groupId: "", accelPctOfDaily: 30 },
    action: { kind: "pause", reducePct: 50, cooldownMin: 30, autoResume: true },
    notification: { pushcut: true, severity: "medium" },
    matchedCampaigns: 5, firedToday: 0, firedTotal: 11, lastFiredAt: isoMinAgo(2880),
  },
  {
    id: "rv7",
    name: "Alerta Soft NEURO",
    enabled: true,
    scope: { nameContains: "", projects: ["NEURO"], account: "all", phases: [], minBudget: 0 },
    trigger: { kind: "linear_pacing", tolerance: 1.5, andNoSale: false, noSaleMinutes: 60, groupId: "", accelPctOfDaily: 30 },
    action: { kind: "alert_only", reducePct: 50, cooldownMin: 15, autoResume: true },
    notification: { pushcut: true, severity: "low" },
    matchedCampaigns: 3, firedToday: 7, firedTotal: 34, lastFiredAt: isoMinAgo(11),
  },
  {
    id: "rv8",
    name: "🚀 Auto-Scale Madrugada 2x/h",
    enabled: false,
    scope: {
      nameContains: "",
      projects: [],
      account: "all",
      phases: [],
      minBudget: 0,
      appliesTo: "active",
      // Só de madrugada BRT — 00h às 08h
      activeHourStart: 0,
      activeHourEnd: 8,
    },
    trigger: {
      kind: "metric_threshold",
      tolerance: 1,
      andNoSale: false,
      noSaleMinutes: 60,
      groupId: "",
      accelPctOfDaily: 30,
      window: "last_60min",
      evalEveryMin: 15,
      extraConditions: [
        { metric: "sales", op: ">=", value: 1, unit: "abs" },
        { metric: "roas", op: ">=", value: 2.5, unit: "abs" },
        { metric: "spend", op: ">=", value: 20, unit: "abs" }, // evita ROAS falso com R$2 gastos
      ],
    },
    action: {
      kind: "increase_budget",
      reducePct: 50,
      increasePct: 100,      // dobra
      maxDailyBudgetBrl: 2000, // teto absoluto
      cooldownMin: 60,       // reavalia a cada 1h
      autoResume: true,
      maxFiresPerDay: 6,     // 2^6 = 64× já é MUITO — para sozinho
    },
    notification: { pushcut: true, severity: "high" },
    matchedCampaigns: 0, firedToday: 0, firedTotal: 0, lastFiredAt: null,
  },
];

export const BUDGET_GROUPS = [
  { id: "f3-ndm-escala", name: "F3 NDM Escala" },
  { id: "f2-erx-teste", name: "F2 ERX Teste" },
  { id: "f1-aquecimento", name: "F1 Aquecimento Global" },
  { id: "abo-baiano", name: "ABO Baiano" },
];

export const ALL_ACCOUNTS = [
  "C01", "C02", "C03", "CA 01", "CA 02", "CA 03", "04 GTX MIDIA", "AURORA 03 DUB",
];

export const countMatchedCampaigns = (scope: RuleScope): number => {
  return mockCampaigns.filter((c) => {
    if (scope.nameContains && !c.name.toLowerCase().includes(scope.nameContains.toLowerCase())) return false;
    if (scope.projects.length > 0) {
      const slug = getProjectSlug(c.name);
      if (!slug || !scope.projects.includes(slug)) return false;
    }
    if (scope.account !== "all" && c.account !== scope.account) return false;
    if (scope.phases.length > 0) {
      const phaseMatch = scope.phases.some((p) => c.name.includes(`-${p}-`));
      if (!phaseMatch) return false;
    }
    if (scope.minBudget > 0 && c.spend < scope.minBudget) return false;
    return c.status !== "paused";
  }).length;
};

// =================================================================
// Budget Groups — /pacing/budget-groups
// =================================================================

export type BudgetGroupAction = "pause_all" | "pause_overpacing" | "alert_only";
export type BudgetGroupCurrency = "BRL" | "USD" | "EUR";
export type BudgetGroupAggStatus = "ok" | "warning" | "critical";

export interface BudgetGroupMatcher {
  nameContains: string;
  projects: ProjectSlug[];
  account: string; // "all" or account name
  phases: RulePhase[];
}

export interface BudgetGroup {
  id: string;
  name: string;
  matcher: BudgetGroupMatcher;
  capHourly: number;
  capDaily: number;
  currency: BudgetGroupCurrency;
  action: BudgetGroupAction;
  cooldownMin: number;
  pushcut: boolean;
  severity: RuleSeverity;
  // observability (mock)
  hourlySpend: number;
  dailySpend: number;
  rulesLinked: number;
  lastPauseAt: string | null;
  firedToday: number;
}

export const defaultBudgetGroup = (): BudgetGroup => ({
  id: "",
  name: "",
  matcher: { nameContains: "", projects: [], account: "all", phases: [] },
  capHourly: 200,
  capDaily: 4000,
  currency: "BRL",
  action: "pause_all",
  cooldownMin: 60,
  pushcut: true,
  severity: "high",
  hourlySpend: 0,
  dailySpend: 0,
  rulesLinked: 0,
  lastPauseAt: null,
  firedToday: 0,
});

export const matchCampaignsForGroup = (m: BudgetGroupMatcher): PacingCampaign[] => {
  return mockCampaigns.filter((c) => {
    if (m.nameContains && !c.name?.toLowerCase().includes(m.nameContains.toLowerCase())) return false;
    if (m.projects.length > 0) {
      const slug = getProjectSlug(c.name);
      if (!slug || !m.projects.includes(slug)) return false;
    }
    if (m.account !== "all" && c.account !== m.account) return false;
    if (m.phases.length > 0) {
      const phaseMatch = m.phases.some((p) => c.name?.includes(`-${p}-`));
      if (!phaseMatch) return false;
    }
    return true;
  });
};

export const aggregateGroupStatus = (g: BudgetGroup): BudgetGroupAggStatus => {
  const camps = matchCampaignsForGroup(g.matcher);
  const hourlyPct = g.capHourly ? (g.hourlySpend / g.capHourly) * 100 : 0;
  if (hourlyPct > 100 || camps.some((c) => c.status === "critical")) return "critical";
  if (hourlyPct >= 75 || camps.some((c) => c.status === "warning")) return "warning";
  return "ok";
};

export const mockBudgetGroups: BudgetGroup[] = [
  {
    id: "bg-f3-ndm-escala",
    name: "F3 NDM Escala",
    matcher: { nameContains: "F3", projects: ["NDM"], account: "04 GTX MIDIA", phases: ["F3"] },
    capHourly: 370,
    capDaily: 7000,
    currency: "BRL",
    action: "pause_all",
    cooldownMin: 60,
    pushcut: true,
    severity: "high",
    hourlySpend: 287,
    dailySpend: 4230,
    rulesLinked: 2,
    lastPauseAt: isoMinAgo(14),
    firedToday: 3,
  },
  {
    id: "bg-f2-erx-teste",
    name: "F2 ERX Teste",
    matcher: { nameContains: "", projects: ["ERX"], account: "all", phases: ["F2"] },
    capHourly: 250,
    capDaily: 4500,
    currency: "BRL",
    action: "pause_overpacing",
    cooldownMin: 45,
    pushcut: true,
    severity: "medium",
    hourlySpend: 124,
    dailySpend: 1820,
    rulesLinked: 1,
    lastPauseAt: isoMinAgo(220),
    firedToday: 0,
  },
  {
    id: "bg-f1-aquecimento",
    name: "F1 Aquecimento Geral",
    matcher: { nameContains: "", projects: [], account: "all", phases: ["F1"] },
    capHourly: 80,
    capDaily: 1800,
    currency: "BRL",
    action: "alert_only",
    cooldownMin: 30,
    pushcut: false,
    severity: "low",
    hourlySpend: 42,
    dailySpend: 760,
    rulesLinked: 1,
    lastPauseAt: null,
    firedToday: 0,
  },
  {
    id: "bg-glp-escala-premium",
    name: "GLP Escala Premium",
    matcher: { nameContains: "F3", projects: ["GLP"], account: "all", phases: [] },
    capHourly: 420,
    capDaily: 8000,
    currency: "BRL",
    action: "pause_all",
    cooldownMin: 90,
    pushcut: true,
    severity: "high",
    hourlySpend: 428,
    dailySpend: 5910,
    rulesLinked: 3,
    lastPauseAt: isoMinAgo(4),
    firedToday: 5,
  },
  {
    id: "bg-neuro-teste",
    name: "NEURO Teste",
    matcher: { nameContains: "", projects: ["NEURO"], account: "all", phases: [] },
    capHourly: 150,
    capDaily: 3000,
    currency: "BRL",
    action: "pause_overpacing",
    cooldownMin: 30,
    pushcut: true,
    severity: "medium",
    hourlySpend: 89,
    dailySpend: 1240,
    rulesLinked: 1,
    lastPauseAt: isoMinAgo(680),
    firedToday: 1,
  },
];
