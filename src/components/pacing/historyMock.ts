// Mock data for /pacing/historico — log de ações
import { PROJECT_SLUGS, ALL_ACCOUNTS, mockRulesV2, type ProjectSlug } from "./mockData";

export type LogAction = "pause" | "resume" | "alert" | "reduce_budget" | "increase_budget" | "activate" | "fail" | "snooze";
export type LogStatus = "success" | "fail" | "manual_resume" | "cooldown_skip";

export interface LogEntry {
  id: string;
  ts: string; // ISO
  action: LogAction;
  status: LogStatus;
  campaign: string;
  campaignId?: string;
  accountId?: string;
  project: ProjectSlug;
  account: string;
  ruleId: string;
  ruleName: string;
  ratio: number;          // pacing ratio (1.0 = on pace)
  spend: number;          // BRL at action time
  expected: number;       // BRL expected at action time
  economy: number;        // estimated saved BRL
  lastSaleMinAgo: number; // minutes since last sale
  reason: string;
  // optional badges/data
  manualResumeBy?: string;
  manualResumeAt?: string;
  metaApiError?: string;
  cooldownLeftMin?: number;
  snoozePreset?: string;
  newBudgetPct?: number;
  // NEW: janela rolling ~60min gravada pelo pacing-controller
  salesLastHour?: number;
  spendLastHour?: number;
  dailyBudget?: number;
}

const CAMPAIGNS_BY_PROJECT: Record<ProjectSlug, string[]> = {
  NDM: ["NDM-top-F3-001", "NDM-top-F3-018", "NDM-bttn-F1-022", "NDM-top-ABO-031", "NDM-vsl-F2-007"],
  ERX: ["ERX-top-F2-014", "ERX-vsl-ABO-008", "ERX-bttn-F3-017", "ERX-top-F1-005"],
  GLP: ["GLP-xxx-F1-007", "GLP-top-F4-013", "GLP-vsl-F2-011", "GLP-bttn-F3-024"],
  MMP: ["MMP-top-ABO-022", "MMP-bttn-F2-019", "MMP-vsl-F3-010"],
  CRT: ["CRT-bttn-F4-009", "CRT-top-F3-027", "CRT-vsl-F2-016"],
  LDR: ["LDR-top-F1-003", "LDR-vsl-F2-015", "LDR-bttn-F3-021"],
  NEURO: ["NEURO-vsl-F2-011", "NEURO-top-F3-021", "NEURO-bttn-F1-006"],
  NDB: ["NDB-top-F2-004", "NDB-vsl-F1-009", "NDB-bttn-F3-014"],
  "TDM-COD": ["TDM-COD-top-F1-001", "TDM-COD-vsl-F2-005", "TDM-COD-bttn-F3-010"],
  EDD: ["EDD-top-F1-001", "EDD-xxx-F2-005"],
  GTX: ["GTX-top-F3-001", "GTX-xxx-F1-002"],
};

const RULES = mockRulesV2.map((r) => ({ id: r.id, name: r.name }));

// deterministic PRNG
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

function buildBatch(seed: number, count: number, dayOffsetDays: number): LogEntry[] {
  const r = rng(seed);
  const out: LogEntry[] = [];
  const base = new Date();
  base.setDate(base.getDate() - dayOffsetDays);
  base.setHours(23, 59, 0, 0);

  for (let i = 0; i < count; i++) {
    const project = pick(r, [...PROJECT_SLUGS]);
    const campaign = pick(r, CAMPAIGNS_BY_PROJECT[project]);
    const account = pick(r, ALL_ACCOUNTS);
    const rule = pick(r, RULES);

    // distribuição: pause 60%, alert 25%, reduce 5%, fail 4%, resume 5%, snooze 1%
    const roll = r();
    let action: LogAction;
    if (roll < 0.6) action = "pause";
    else if (roll < 0.85) action = "alert";
    else if (roll < 0.9) action = "reduce_budget";
    else if (roll < 0.94) action = "fail";
    else if (roll < 0.99) action = "resume";
    else action = "snooze";

    let status: LogStatus = "success";
    if (action === "fail") status = "fail";
    if (action === "resume") status = "manual_resume";
    if (r() < 0.04 && action === "pause") status = "cooldown_skip";

    const ratio = action === "pause" ? 1.5 + r() * 2.0 : 0.8 + r() * 1.6;
    const expected = 40 + r() * 200;
    const spend = expected * ratio;
    const economy = action === "pause" && status === "success" ? Math.round((spend - expected) * 0.45) : 0;
    const lastSaleMinAgo = Math.floor(r() * 180);

    // distribuir ao longo do dia
    const minOfDay = Math.floor((1 - i / count) * 24 * 60 + (r() - 0.5) * 20);
    const ts = new Date(base);
    ts.setHours(0, 0, 0, 0);
    ts.setMinutes(Math.max(0, Math.min(24 * 60 - 1, minOfDay)));
    ts.setSeconds(Math.floor(r() * 60));

    const entry: LogEntry = {
      id: `log-${seed}-${i}`,
      ts: ts.toISOString(),
      action,
      status,
      campaign,
      project,
      account,
      ruleId: rule.id,
      ruleName: rule.name,
      ratio: Math.round(ratio * 100) / 100,
      spend: Math.round(spend * 100) / 100,
      expected: Math.round(expected * 100) / 100,
      economy,
      lastSaleMinAgo,
      reason:
        action === "pause"
          ? `Sem venda ${Math.floor(lastSaleMinAgo / 60)}h${lastSaleMinAgo % 60}min · ratio ${ratio.toFixed(2)}×`
          : action === "alert"
          ? `Pace ${ratio.toFixed(2)}× acima do esperado`
          : action === "reduce_budget"
          ? `Redução automática budget -30%`
          : action === "fail"
          ? `Falha ao chamar Meta API`
          : action === "resume"
          ? `Religação manual após pausa`
          : `Snooze aplicado pelo operador`,
    };

    if (status === "fail") entry.metaApiError = "Meta API erro 17 (rate limit). Resolvido em 2ª tentativa";
    if (status === "manual_resume") {
      entry.manualResumeBy = "Gabriel";
      entry.manualResumeAt = new Date(ts.getTime() + 12 * 60_000).toISOString();
    }
    if (status === "cooldown_skip") entry.cooldownLeftMin = Math.floor(r() * 30) + 5;
    if (action === "snooze") entry.snoozePreset = pick(r, ["15min", "1h", "4h", "até amanhã 9h BRT"]);
    if (action === "reduce_budget") entry.newBudgetPct = 70;

    out.push(entry);
  }

  // forçar 2 falsos positivos prováveis hoje (pause logo após venda recente)
  if (dayOffsetDays === 0) {
    for (let k = 0; k < 2; k++) {
      const fp = out.find((e) => e.action === "pause" && e.lastSaleMinAgo > 60);
      if (fp) fp.lastSaleMinAgo = 15 + k * 10;
    }
  }

  return out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

export const mockLogEntries: LogEntry[] = [
  ...buildBatch(101, 38, 0),
  ...buildBatch(202, 87, 1),
  ...buildBatch(303, 45, 2),
];

export const LOG_RULES = RULES;

export function isFalsePositive(e: LogEntry): boolean {
  return e.action === "pause" && e.status === "success" && e.lastSaleMinAgo < 60;
}

export function logActionLabel(a: LogAction): string {
  return {
    pause: "PAUSADA",
    resume: "RELIGADA",
    alert: "ALERTA",
    reduce_budget: "↓ BUDGET",
    increase_budget: "↑ SCALE 2×",
    activate: "ATIVADA",
    fail: "FALHA",
    snooze: "SNOOZE",
  }[a];
}

export function logActionIcon(a: LogAction): string {
  return { pause: "⏸", resume: "↺", alert: "🔔", reduce_budget: "🔻", increase_budget: "🚀", activate: "▶", fail: "❌", snooze: "⏰" }[a];
}

export function toCSV(entries: LogEntry[]): string {
  const header = "timestamp,action,campaign,project,account,rule,ratio,spend,expected,economy,status,reason";
  const lines = entries.map((e) =>
    [
      e.ts,
      e.action,
      e.campaign,
      e.project,
      e.account,
      `"${e.ruleName.replace(/"/g, '""')}"`,
      e.ratio.toFixed(2),
      e.spend.toFixed(2),
      e.expected.toFixed(2),
      e.economy.toFixed(2),
      e.status,
      `"${e.reason.replace(/"/g, '""')}"`,
    ].join(",")
  );
  return [header, ...lines].join("\n");
}
