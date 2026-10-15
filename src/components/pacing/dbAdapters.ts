// Adapters DB row <-> existing UI types. Keeps editor panels untouched.
import type {
  PacingRuleV2,
  RuleScope,
  RuleTrigger,
  RuleAction,
  RuleNotification,
  RuleTriggerKind,
  RuleActionKind,
  RuleSeverity,
  RulePhase,
  ProjectSlug,
  BudgetGroup,
  BudgetGroupAction,
  BudgetGroupCurrency,
  BudgetGroupMatcher,
} from "./mockData";
import { countMatchedCampaigns, matchCampaignsForGroup } from "./mockData";

// ============ RULES ============

export interface DbRule {
  id: string;
  operation_id?: string | null;
  name: string;
  description: string | null;
  budget_group_id: string | null;
  enabled: boolean;
  dry_run: boolean;
  filter_config: any;
  trigger_config: any;
  action_config: any;
  notification_config: any;
  last_triggered_at: string | null;
  fire_count_today: number;
  fire_count_total: number;
  created_at: string;
  updated_at: string;
}

export function dbToRule(row: DbRule): PacingRuleV2 {
  const scope: RuleScope = {
    nameContains: row.filter_config?.nameContains ?? "",
    projects: (row.filter_config?.projects ?? []) as ProjectSlug[],
    account: row.filter_config?.account ?? "all",
    phases: (row.filter_config?.phases ?? []) as RulePhase[],
    minBudget: Number(row.filter_config?.minBudget ?? 0),
    appliesTo: (row.filter_config?.appliesTo ?? "active") as RuleScope["appliesTo"],
    minSpendYesterdayBrl: Number(row.filter_config?.minSpendYesterdayBrl ?? 0),
    activeHourStart: row.filter_config?.activeHourStart != null ? Number(row.filter_config.activeHourStart) : undefined,
    activeHourEnd: row.filter_config?.activeHourEnd != null ? Number(row.filter_config.activeHourEnd) : undefined,
  };
  const trigger: RuleTrigger = {
    kind: (row.trigger_config?.kind ?? "linear_pacing") as RuleTriggerKind,
    tolerance: Number(row.trigger_config?.tolerance ?? 1.5),
    andNoSale: !!row.trigger_config?.andNoSale,
    noSaleMinutes: Number(row.trigger_config?.noSaleMinutes ?? 60),
    groupId: row.trigger_config?.groupId ?? row.budget_group_id ?? "",
    accelPctOfDaily: Number(row.trigger_config?.accelPctOfDaily ?? 30),
    defaultDailyTargetBrl: row.trigger_config?.defaultDailyTargetBrl != null
      ? Number(row.trigger_config.defaultDailyTargetBrl)
      : undefined,
    maxSpendPerHourBrl: row.trigger_config?.maxSpendPerHourBrl != null
      ? Number(row.trigger_config.maxSpendPerHourBrl)
      : undefined,
    maxPctOfDailyPerHour: row.trigger_config?.maxPctOfDailyPerHour != null
      ? Number(row.trigger_config.maxPctOfDailyPerHour)
      : undefined,
    hourStart: row.trigger_config?.hourStart != null ? Number(row.trigger_config.hourStart) : undefined,
    hourEnd: row.trigger_config?.hourEnd != null ? Number(row.trigger_config.hourEnd) : undefined,
    minSpendBeforeTrigger: row.trigger_config?.minSpendBeforeTrigger != null ? Number(row.trigger_config.minSpendBeforeTrigger) : undefined,
    spendBetweenMin: row.trigger_config?.spendBetweenMin != null ? Number(row.trigger_config.spendBetweenMin) : undefined,
    spendBetweenMax: row.trigger_config?.spendBetweenMax != null ? Number(row.trigger_config.spendBetweenMax) : undefined,
    andNoSaleInLastMinutes: row.trigger_config?.andNoSaleInLastMinutes != null ? Number(row.trigger_config.andNoSaleInLastMinutes) : undefined,
    profitThreshold: row.trigger_config?.profitThreshold != null ? Number(row.trigger_config.profitThreshold) : undefined,
    profitThresholdUnit: (row.trigger_config?.profitThresholdUnit === "pct" ? "pct" : "brl") as RuleTrigger["profitThresholdUnit"],
    window: (row.trigger_config?.window ?? "today") as RuleTrigger["window"],
    evalEveryMin: (Number(row.trigger_config?.evalEveryMin ?? 10) as RuleTrigger["evalEveryMin"]),
    extraConditions: Array.isArray(row.trigger_config?.extraConditions)
      ? row.trigger_config.extraConditions.map((c: any) => ({
          metric: c.metric,
          op: c.op,
          value: Number(c.value),
          unit: c.unit === "pct" ? "pct" : "abs",
        }))
      : [],
  };
  const action: RuleAction = {
    kind: (row.action_config?.kind ?? "pause") as RuleActionKind,
    reducePct: Number(row.action_config?.reducePct ?? 50),
    increasePct: Number(row.action_config?.increasePct ?? row.action_config?.increaseBudgetByPct ?? 100),
    maxDailyBudgetBrl:
      row.action_config?.maxDailyBudgetBrl != null || row.action_config?.maxBudgetBrl != null
        ? Number(row.action_config?.maxDailyBudgetBrl ?? row.action_config?.maxBudgetBrl)
        : undefined,
    cooldownMin: Number(row.action_config?.cooldownMin ?? row.action_config?.cooldownMinutes ?? 30),
    autoResume: !!(row.action_config?.autoResume ?? row.action_config?.smartReEnable ?? true),
    maxFiresPerDay: Number(row.action_config?.maxFiresPerDay ?? 0),
    maxFiresPerCampaignPerDay: Number(row.action_config?.maxFiresPerCampaignPerDay ?? 0),
    hardStopUntilHourBRT:
      row.action_config?.hardStopUntilHourBRT == null
        ? undefined
        : Number(row.action_config.hardStopUntilHourBRT),
  };
  const notification: RuleNotification = {
    pushcut: !!(row.notification_config?.pushcut ?? true),
    severity: (row.notification_config?.severity ?? "medium") as RuleSeverity,
  };
  return {
    id: row.id,
    operationId: row.operation_id ?? null,
    name: row.name,
    enabled: row.enabled,
    scope,
    trigger,
    action,
    notification,
    matchedCampaigns: countMatchedCampaigns(scope),
    firedToday: row.fire_count_today,
    firedTotal: row.fire_count_total,
    lastFiredAt: row.last_triggered_at,
  };
}

export function ruleToDbPayload(rule: PacingRuleV2): Partial<DbRule> {
  return {
    name: rule.name,
    enabled: rule.enabled,
    dry_run: false,
    budget_group_id: rule.trigger.kind === "group_cap" && rule.trigger.groupId ? rule.trigger.groupId : null,
    filter_config: rule.scope as any,
    trigger_config: rule.trigger as any,
    action_config: rule.action as any,
    notification_config: rule.notification as any,
  };
}

// ============ BUDGET GROUPS ============

export interface DbBudgetGroup {
  id: string;
  name: string;
  description: string | null;
  max_spend_per_hour: number;
  max_daily_total: number | null;
  currency: string;
  enabled: boolean;
  config: any;
  created_at: string;
  updated_at: string;
}

export function dbToBudgetGroup(row: DbBudgetGroup): BudgetGroup {
  const cfg = row.config ?? {};
  const matcher: BudgetGroupMatcher = {
    nameContains: cfg.matcher?.nameContains ?? "",
    projects: (cfg.matcher?.projects ?? []) as ProjectSlug[],
    account: cfg.matcher?.account ?? "all",
    phases: (cfg.matcher?.phases ?? []) as RulePhase[],
  };
  const matched = matchCampaignsForGroup(matcher);
  const hourly = matched.reduce((acc, c) => acc + c.spend / 8, 0); // mock current pace
  const daily = matched.reduce((acc, c) => acc + c.spend, 0);
  return {
    id: row.id,
    name: row.name,
    matcher,
    capHourly: Number(row.max_spend_per_hour),
    capDaily: Number(row.max_daily_total ?? 0),
    currency: (row.currency as BudgetGroupCurrency) ?? "BRL",
    action: (cfg.action ?? "pause_all") as BudgetGroupAction,
    cooldownMin: Number(cfg.cooldownMin ?? 60),
    pushcut: !!(cfg.pushcut ?? true),
    severity: (cfg.severity ?? "medium") as RuleSeverity,
    hourlySpend: hourly,
    dailySpend: daily,
    rulesLinked: Number(cfg.rulesLinked ?? 0),
    lastPauseAt: cfg.lastPauseAt ?? null,
    firedToday: Number(cfg.firedToday ?? 0),
  };
}

export function budgetGroupToDbPayload(g: BudgetGroup): Partial<DbBudgetGroup> {
  return {
    name: g.name,
    description: null,
    max_spend_per_hour: g.capHourly,
    max_daily_total: g.capDaily || null,
    currency: g.currency,
    enabled: true,
    config: {
      matcher: g.matcher,
      action: g.action,
      cooldownMin: g.cooldownMin,
      pushcut: g.pushcut,
      severity: g.severity,
    } as any,
  };
}

// ============ ACTION LOG ============

export interface DbActionLog {
  id: string;
  rule_id: string | null;
  budget_group_id: string | null;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  account_name: string | null;
  action_type: string;
  reason: string;
  spend_at_action: number | null;
  spend_expected: number | null;
  spend_last_hour: number | null;
  daily_budget: number | null;
  sales_last_hour: number | null;
  pct_above_expected: number | null;
  dry_run: boolean;
  success: boolean | null;
  meta_response: any;
  error_message: string | null;
  pushcut_sent: boolean;
  pushcut_response: any;
  triggered_at: string;
  created_at: string;
}

import type { LogEntry, LogAction, LogStatus } from "./historyMock";
import { getProjectSlug, PROJECT_SLUGS } from "./mockData";

export function dbToLogEntry(
  row: DbActionLog,
  ruleNameById?: Map<string, string>
): LogEntry {
  const slug = (getProjectSlug(row.campaign_name) ?? PROJECT_SLUGS[0]);
  const spend = Number(row.spend_at_action ?? 0);
  const expected = Number(row.spend_expected ?? 0);
  let status: LogStatus = "success";
  if (row.success === false) status = "fail";
  else if (row.action_type === "resume") status = "manual_resume";
  return {
    id: row.id,
    ts: row.triggered_at,
    action: (row.action_type as LogAction) ?? "alert",
    status,
    campaign: row.campaign_name,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    project: slug,
    account: row.account_name ?? row.account_id,
    ruleId: row.rule_id ?? "",
    ruleName: (row.rule_id && ruleNameById?.get(row.rule_id)) || "—",
    ratio: expected > 0 ? spend / expected : 1,
    spend,
    expected,
    economy: Math.max(0, spend - expected),
    lastSaleMinAgo: 0,
    reason: row.reason,
    metaApiError: row.error_message ?? undefined,
    salesLastHour: row.sales_last_hour ?? undefined,
    spendLastHour: row.spend_last_hour ?? undefined,
    dailyBudget: row.daily_budget ?? undefined,
  };
}
