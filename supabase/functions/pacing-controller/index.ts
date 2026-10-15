import { mirrorToWebPush } from "../_shared/push-mirror.ts";
// =============================================================================
// pacing-controller — Supabase Edge Function (Deno)
// =============================================================================
// Migrado do daemon Apify (Node 22 + TypeScript) preservando 100% da lógica.
// Disparado por pg_cron a cada 2 min via net.http_post → POST nesta função.
//
// Arquitetura (1 arquivo, ~800 linhas):
//   1. Imports + Types
//   2. Logger JSON estruturado
//   3. Supabase client (SERVICE_ROLE)
//   4. Settings loader (cache em memória da request)
//   5. Token selector + Meta API client (retry exp 10/30/60s)
//   6. Campaign fetcher (multi-token, paralelo por conta)
//   7. Decision engine (4 triggers + filter matching) — função pura
//   8. Executor (Meta call + log + cooldown + Pushcut + safety)
//   9. Smart re-enable check
//  10. Entry point Deno.serve
// =============================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// =============================================================================
// 1. TYPES — espelham as 5 tabelas Supabase + Meta API responses
// =============================================================================

interface PacingSettings {
  pushcutWebhookUrl: string;
  pollingIntervalMinutes: number;
  defaultCooldownMinutes: number;
  maxActionsPerHour: number;
  dryRunGlobal: boolean;
  timezone: string;
  defaultCurrency: 'USD' | 'BRL' | 'EUR' | 'HUF';
  exchangeRates: Record<string, number>;
  dailySummaryEnabled: boolean;
  dailySummaryHourBrt: number;
  hourlyWindowMode: 'rolling' | 'fixed';
}


interface BudgetGroup {
  id: string;
  name: string;
  description: string | null;
  max_spend_per_hour: number;
  max_daily_total: number;
  currency: 'USD' | 'BRL' | 'EUR' | 'HUF';
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

type TriggerType = 'linear_pacing' | 'group_hourly_cap' | 'daily_cap' | 'acceleration' | 'campaign_hourly_cap' | 'daily_schedule' | 'hourly_window' | 'profit_threshold' | 'metric_threshold' | 'absolute_spend_no_sale';
type ActionType = 'pause' | 'alert_only' | 'reduce_budget' | 'increase_budget' | 'activate';
type NotificationLevel = 'low' | 'medium' | 'high';
type AppliesTo = 'active' | 'paused' | 'any';

interface RuleFilterConfig {
  nameContains?: string;
  // Match obrigatório no FINAL do nome da campanha (ex.: "top" casa com "... - top" ou "... top 🚫").
  nameEndsWith?: string;
  accountIds?: string[];
  tagsAny?: string[];
  projects?: string[];
  phases?: Array<'F1' | 'F2' | 'F3'>;
  minDailyBudget?: number;
  // UI: a quais campanhas a regra se aplica (default 'active' = comportamento legado).
  appliesTo?: AppliesTo;
  // Só campanhas com spend (BRL) ontem >= X. 0/undefined = ignorar.
  minSpendYesterdayBrl?: number;
  // UI alias — também aceita "minBudget" (vem do form/dbAdapters)
  minBudget?: number;
  // Janela horária BRT em que a regra está ATIVA. Fora dela a regra é pulada.
  // Aceita janela que cruza a meia-noite (ex: 22→6).
  activeHourStart?: number;
  activeHourEnd?: number;
}

interface RuleTriggerConfig {
  type?: TriggerType;
  kind?: string; // alias from UI editor (linear_pacing | group_cap | daily_cap | acceleration_no_sale | campaign_hourly_cap)
  tolerance?: number;
  andNoSaleInLastMinutes?: number;
  minSpendBeforeTrigger?: number;
  hourlyCapPct?: number;
  fiveMinDeltaPct?: number;
  defaultDailyTargetBrl?: number; // ABO fallback: usado quando snap.dailyBudgetMajor === 0
  // daily_cap: se setado, usa este valor FIXO em BRL como cap, IGNORANDO o teto da campanha/override.
  // Útil quando o cap operacional da campanha é só referência e a regra deve disparar num threshold fixo.
  fixedCapBrl?: number;
  // campaign_hourly_cap — limites de gasto por hora, por campanha (vale 24h)
  maxSpendPerHourBrl?: number;
  maxPctOfDailyPerHour?: number;
  // UI: frequência de re-avaliação por regra (minutos). Default = sempre avalia.
  evalEveryMin?: number;
  // daily_schedule — dispara 1×/dia no horário BRT configurado.
  scheduledHour?: number;   // 0..23
  scheduledMinute?: number; // 0..59
  // hourly_window — dispara dentro de uma janela de horas BRT [hourStart, hourEnd)
  // se spend acumulado hoje está entre spendBetweenMin e spendBetweenMax.
  hourStart?: number;       // 0..23
  hourEnd?: number;         // 1..24
  spendBetweenMin?: number; // R$
  spendBetweenMax?: number; // R$
  andNoSale?: boolean;      // se true, exige noSale por noSaleMinutes
  noSaleMinutes?: number;
  // profit_threshold — dispara quando profit (rev-spend) cruza threshold.
  // unit='brl' compara valor absoluto; 'pct' compara margem % sobre spend.
  profitThreshold?: number;
  profitThresholdUnit?: 'brl' | 'pct';
  // absolute_spend_no_sale — dispara quando spendToday > spendThreshold (BRL)
  // e (opcionalmente) sem vendas há andNoSaleInLastMinutes.
  spendThreshold?: number;
  andNoSaleInLastMinutes?: number;
  // Janela de tempo para extraConditions. Default: 'today'.
  //   'last_15min'|'last_30min'|'last_60min' = ROLLING (aprox. última hora — Meta é horária).
  window?: 'today' | 'yesterday' | 'last_15min' | 'last_30min' | 'last_60min';
  extraConditions?: Array<{
    metric: 'spend' | 'sales' | 'revenue' | 'cpc' | 'cpa' | 'ctr' | 'roas' | 'roi' | 'profit' | 'ic';
    op: '>' | '>=' | '<' | '<=' | '==' | '!=' | '=';
    value: number;
    unit?: 'abs' | 'pct';
    // Override opcional de janela por condição. Se omitido, usa trigger_config.window.
    // Ex.: window rolling last_60min + 1 condição com window='today' = "última hora OK E dia OK"
    window?: 'today' | 'yesterday' | 'last_15min' | 'last_30min' | 'last_60min';
  }>;
}

// Normaliza UI `kind` → controller `type`. UI usa nomes ligeiramente diferentes.
function resolveTriggerType(t: RuleTriggerConfig): TriggerType | null {
  const raw = (t.type ?? t.kind ?? '').toString();
  switch (raw) {
    case 'linear_pacing': return 'linear_pacing';
    case 'daily_cap': return 'daily_cap';
    case 'group_hourly_cap':
    case 'group_cap': return 'group_hourly_cap';
    case 'acceleration':
    case 'acceleration_no_sale': return 'acceleration';
    case 'campaign_hourly_cap': return 'campaign_hourly_cap';
    case 'daily_schedule': return 'daily_schedule';
    case 'hourly_window': return 'hourly_window';
    case 'profit_threshold': return 'profit_threshold';
    case 'absolute_spend_no_sale': return 'absolute_spend_no_sale';
    case 'metric_threshold':
    case 'cpc_threshold':
    case 'cpa_threshold':
    case 'ctr_threshold':
    case 'roas_threshold': return 'metric_threshold';
    default: return null;
  }
}

interface RuleActionConfig {
  type?: ActionType;
  kind?: string; // alias UI: 'pause' | 'reduce_budget' | 'increase_budget' | 'alert_only' | 'activate'
  reduceBudgetByPct?: number;
  reducePct?: number; // alias UI
  // % de aumento no daily_budget para 'increase_budget'. Ex: 100 = 2×, 50 = 1.5×.
  increaseBudgetByPct?: number;
  increasePct?: number; // alias UI
  // Teto absoluto do daily_budget (BRL) após ação. undefined/0 = sem teto.
  maxDailyBudgetBrl?: number;
  // Alias legado salvo por versões antigas da UI.
  maxBudgetBrl?: number;
  cooldownMinutes?: number;
  cooldownMin?: number; // alias UI
  smartReEnable?: boolean;
  autoResume?: boolean; // alias UI
  hardStopUntilNextDay?: boolean;
  hardStopUntilHourBRT?: number;
  maxFiresPerDay?: number;
  // Limite de disparos por CAMPANHA por dia BRT — quando setado (>0), essa regra só pode
  // disparar N vezes em cada campanha individual por dia (fires contados via pacing_action_log).
  // Independente de `maxFiresPerDay` (que é por regra, agregado). Opt-in por regra: só é
  // aplicado se o campo estiver presente no action_config — não afeta outras regras.
  maxFiresPerCampaignPerDay?: number;
}

function getMaxDailyBudgetBrl(action?: RuleActionConfig | null): number | null {
  const raw = action?.maxDailyBudgetBrl ?? action?.maxBudgetBrl;
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Normaliza UI `kind` → controller `type`. Aceita ambos.
function resolveActionType(a: RuleActionConfig): ActionType | null {
  const raw = (a.type ?? a.kind ?? '').toString();
  switch (raw) {
    case 'pause': return 'pause';
    case 'reduce_budget': return 'reduce_budget';
    case 'increase_budget': return 'increase_budget';
    case 'alert_only': return 'alert_only';
    case 'activate': return 'activate';
    default: return null;
  }
}

interface RuleNotificationConfig {
  pushcut: boolean;
  level: NotificationLevel;
  customMessage?: string;
}

interface PacingRule {
  id: string;
  operation_id?: string | null;
  name: string;
  description: string | null;
  budget_group_id: string | null;
  enabled: boolean;
  dry_run: boolean;
  filter_config: RuleFilterConfig;
  trigger_config: RuleTriggerConfig;
  action_config: RuleActionConfig;
  notification_config: RuleNotificationConfig;
  last_triggered_at: string | null;
  last_evaluated_at: string | null;
  fire_count_today: number;
  fire_count_total: number;
}

type ActionLogType = 'pause' | 'resume' | 'alert' | 'reduce_budget' | 'increase_budget' | 'activate' | 'snooze' | 'skip';

interface ActionLogInsert {
  rule_id: string | null;
  operation_id: string | null;
  budget_group_id: string | null;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  account_name?: string | null;
  action_type: ActionLogType;
  reason: string;
  spend_at_action: number;
  spend_expected: number | null;
  spend_last_hour: number | null;
  daily_budget: number | null;
  sales_last_hour: number | null;
  pct_above_expected: number | null;
  dry_run: boolean;
  success: boolean;
  meta_response: unknown;
  error_message: string | null;
  pushcut_sent: boolean;
  pushcut_response: unknown;
  triggered_at: string;
}

type CooldownSetBy = 'daemon' | 'manual' | 'manual_until' | 'smart_reenable' | 'daemon_lock' | 'reactivation_lock';

interface CooldownRow {
  campaign_id: string;
  rule_id: string | null;
  snoozed_until: string;
  reason: string | null;
  set_by: CooldownSetBy;
  locked_until_hour_brt?: number | null;
  locked_by_rule_id?: string | null;
  last_set_budget_brl?: number | null;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time?: string;
}

interface MetaInsightAction {
  action_type: string;
  value: string;
}

interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  spend: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: MetaInsightAction[];
  action_values?: MetaInsightAction[];
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
  date_start?: string;
  date_stop?: string;
}

interface CampaignSnapshot {
  campaignId: string;
  campaignName: string;
  accountId: string;
  operationId?: string | null;
  accountName?: string;
  status: string;
  dailyBudget: number;
  dailyBudgetMajor: number;
  spendToday: number;
  spendYesterday: number;
  spendLastHour: number;
  spendLast5Min: number;
  revenueToday: number;   // BRL — soma de action_values.purchase
  revenueLastHour: number; // BRL — janela rolling ~última hora (Meta é horária)
  salesToday: number;     // count
  icToday: number;        // Initiate Checkout count (Meta actions)
  salesLastHour: number;
  noSaleInLastMinutes: number;
  // Métricas brutas de tráfego (para CPC/CTR/CPA em extraConditions)
  clicksToday: number;          // total clicks Meta
  linkClicksToday: number;      // inline_link_clicks (preferido p/ CPC)
  impressionsToday: number;
  currency: string;
  detectedProject?: string;
  detectedPhase?: 'F1' | 'F2' | 'F3' | null;
}

type DecisionKind = 'pause' | 'resume' | 'alert' | 'reduce_budget' | 'increase_budget' | 'skip';

interface Decision {
  kind: DecisionKind;
  campaign: CampaignSnapshot;
  rule: PacingRule | null;
  reason: string;
  expectedSpend?: number;
  pctAboveExpected?: number;
  dryRun: boolean;
  newDailyBudgetMajor?: number;
}

interface PushcutPayload {
  title: string;
  text: string;
  input?: string;
  customData?: Record<string, unknown>;
}

interface PushcutResult {
  sent: boolean;
  status: number | null;
  response: unknown;
  error?: string;
}

// =============================================================================
// 2. LOGGER — JSON estruturado (cada linha = 1 evento parseável)
// =============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  const line = { ts: new Date().toISOString(), level, msg, ...(ctx ?? {}) };
  if (level === 'error') console.error(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

// =============================================================================
// 3. SUPABASE CLIENT (SERVICE_ROLE — bypassa RLS)
// =============================================================================

function getSupabase(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes (Edge Function deveria auto-injetar)');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-pacing-actor': 'edge-function' } },
  });
}

// =============================================================================
// 4. SETTINGS LOADER — cache em memória da request
// =============================================================================

const SETTINGS_DEFAULTS: PacingSettings = {
  pushcutWebhookUrl: '',
  pollingIntervalMinutes: 2,
  defaultCooldownMinutes: 60,
  maxActionsPerHour: 150,
  dryRunGlobal: true, // safe default: começa em dry-run até Gabriel confirmar
  timezone: 'America/Sao_Paulo',
  defaultCurrency: 'BRL',
  exchangeRates: { USD_BRL: 5.4, EUR_BRL: 5.9, HUF_BRL: 0.015 },
  dailySummaryEnabled: true,
  dailySummaryHourBrt: 9,
  hourlyWindowMode: 'fixed',

};

function unwrapValue(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw) {
    return (raw as { value: unknown }).value;
  }
  return raw;
}

export async function loadSettings(supabase: SupabaseClient): Promise<PacingSettings> {
  const { data, error } = await supabase.from('pacing_settings').select('key, value');

  if (error) {
    log('warn', 'Falha ao carregar pacing_settings — usando defaults', { error: error.message });
    return { ...SETTINGS_DEFAULTS };
  }

  const settings: PacingSettings = { ...SETTINGS_DEFAULTS };

  for (const row of data ?? []) {
    const key = row.key as string;
    const raw = unwrapValue(row.value);
    switch (key) {
      case 'pushcut_webhook_url':
        if (typeof raw === 'string') settings.pushcutWebhookUrl = raw;
        break;
      case 'polling_interval_minutes':
        if (typeof raw === 'number') settings.pollingIntervalMinutes = raw;
        break;
      case 'default_cooldown_minutes':
        if (typeof raw === 'number') settings.defaultCooldownMinutes = raw;
        break;
      case 'max_actions_per_hour':
        if (typeof raw === 'number') settings.maxActionsPerHour = raw;
        break;
      case 'dry_run_global':
        if (typeof raw === 'boolean') settings.dryRunGlobal = raw;
        break;
      case 'timezone':
        if (typeof raw === 'string') settings.timezone = raw;
        break;
      case 'default_currency':
        if (raw === 'USD' || raw === 'BRL' || raw === 'EUR' || raw === 'HUF') {
          settings.defaultCurrency = raw;
        }
        break;
      case 'exchange_rates':
        if (raw && typeof raw === 'object') settings.exchangeRates = raw as Record<string, number>;
        break;
      case 'daily_summary_enabled':
        if (typeof raw === 'boolean') settings.dailySummaryEnabled = raw;
        break;
      case 'daily_summary_hour_brt':
        if (typeof raw === 'number') settings.dailySummaryHourBrt = raw;
        break;
      case 'hourly_window_mode':
        if (raw === 'rolling' || raw === 'fixed') settings.hourlyWindowMode = raw;
        break;

    }
  }

  // Fallback: se setting não trouxe pushcut, usa env var.
  if (!settings.pushcutWebhookUrl) {
    settings.pushcutWebhookUrl = Deno.env.get('PUSHCUT_WEBHOOK_URL') ?? '';
  }

  // Override USD_BRL com a última cotação real do exchange_rate_log (PTAX/avg APIs),
  // que o GTX já mantém atualizado. Mantém EUR/HUF do app_settings.
  try {
    const { data: fxRow } = await supabase
      .from('exchange_rate_log')
      .select('rate, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const liveUsdBrl = Number(fxRow?.rate);
    if (Number.isFinite(liveUsdBrl) && liveUsdBrl > 0) {
      settings.exchangeRates = { ...settings.exchangeRates, USD_BRL: liveUsdBrl };
      log('info', 'FX USD→BRL ao vivo aplicado', { rate: liveUsdBrl, at: fxRow?.created_at });
    }
  } catch (err) {
    log('warn', 'Falha ao buscar exchange_rate_log — usando fallback do app_settings', {
      err: (err as Error)?.message,
    });
  }

  return settings;
}



// =============================================================================
// 5. TOKEN SELECTOR + META API CLIENT
// =============================================================================

const META_GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') ?? 'v22.0';
const META_HTTP_TIMEOUT_MS = Number(Deno.env.get('META_HTTP_TIMEOUT_MS') ?? '20000');
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [10_000, 30_000, 60_000];

class MetaApiError extends Error {
  constructor(message: string, public status: number, public payload: unknown) {
    super(message);
    this.name = 'MetaApiError';
  }
}

function getMetaErrorCode(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const error = (payload as { error?: { code?: unknown } }).error;
  const code = error?.code;
  return typeof code === 'number' ? code : null;
}

function getMetaErrorSubcode(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const error = (payload as { error?: { error_subcode?: unknown } }).error;
  const subcode = error?.error_subcode;
  return typeof subcode === 'number' ? subcode : null;
}

function isTokenRetryableMetaError(err: unknown): boolean {
  if (!(err instanceof MetaApiError)) return false;
  if (err.status === 401 || err.status === 403) return true;
  // A Graph API muitas vezes devolve erro de OAuth/permissão como HTTP 400
  // (ex.: code 10/190/200). Nesse caso vale tentar o token legado da conta.
  if (err.status === 400) {
    const code = getMetaErrorCode(err.payload);
    const subcode = getMetaErrorSubcode(err.payload);
    // code 100/subcode 33 aparece em POST de pausa quando o token atual lê a
    // conta via insights, mas não consegue carregar/mutar aquele campaign_id.
    // Nesse caso devemos tentar o próximo token antes de declarar sem permissão.
    return code === 10 || code === 190 || code === 200 || code === 368 || (code === 100 && subcode === 33);
  }
  return false;
}

function getHuAccountIds(): Set<string> {
  const csv = Deno.env.get('HU_TOKEN_ACCOUNT_IDS') ?? '';
  return new Set(
    csv
      .split(',')
      .map((s) => s.trim().replace(/^act_/, ''))
      .filter((s) => s.length > 0),
  );
}

// Pool unificado de tokens Meta (mesma origem usada por Integrações/manual pause).
// Carregado uma vez por tick e usado antes do split legado HU/CATALOG.
let _allMetaTokens: string[] = [];
// F8.B.6.5.1 — meta do pool (Vault vs legacy) para instrumentação pré-ação
let _allMetaTokensMeta: Array<{ profile_key: string; source: 'vault' | 'legacy_fallback' }> = [];
let _rootOperationId: string | null = null;

async function loadGlobalMetaToken(supabase: SupabaseClient): Promise<void> {
  _allMetaTokens = [];
  _allMetaTokensMeta = [];
  try {
    const { getAllMetaTokensForOperation, getOperationFromContext } = await import('../_shared/getMetaToken.ts');
    const { operationId } = await getOperationFromContext({});
    _rootOperationId = operationId;
    const entries = await getAllMetaTokensForOperation(operationId);
    _allMetaTokens = entries.map((e) => e.token);
    _allMetaTokensMeta = entries.map((e) => ({ profile_key: e.profile_key, source: e.source }));
  } catch (err) {
    log('warn', 'loadGlobalMetaToken: throw', { err: (err as Error)?.message });
    // Fallback duro para o path legacy — nunca deixa o pool vazio se der ruim.
    try {
      const { getAllMetaAccessTokens } = await import('../_shared/getMetaToken.ts');
      _allMetaTokens = await getAllMetaAccessTokens(supabase as any);
      _allMetaTokensMeta = _allMetaTokens.map(() => ({ profile_key: 'legacy_exception', source: 'legacy_fallback' as const }));
    } catch (err2) {
      log('error', 'loadGlobalMetaToken: legacy fallback também falhou', { err: (err2 as Error)?.message });
    }
  }
  log('info', 'Meta token pool carregado', {
    count: _allMetaTokens.length,
    sources: _allMetaTokensMeta.map((m) => m.source),
    operation_id: _rootOperationId,
  });
}

function legacyTokenForAccount(accountId: string, huIds: Set<string>): string | null {
  const normalized = accountId.replace(/^act_/, '');
  const isHu = huIds.has(normalized);
  return (isHu ? Deno.env.get('META_TOKEN_HU') : Deno.env.get('META_TOKEN_CATALOG')) ?? null;
}

// Lista ordenada de tokens a tentar pra uma conta. Pool unificado primeiro
// (app_settings + META_ACCESS_TOKEN/_2/_3... + HU/CATALOG), depois legado.
function pickTokens(accountId: string, huIds: Set<string>): string[] {
  const tokens: string[] = [];
  for (const token of _allMetaTokens) {
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  const legacy = legacyTokenForAccount(accountId, huIds);
  if (legacy && !tokens.includes(legacy)) tokens.push(legacy);
  if (tokens.length === 0) {
    throw new Error(`Token Meta ausente pra account ${accountId} (pool vazio e sem HU/CATALOG)`);
  }
  return tokens;
}

function pickToken(accountId: string, huIds: Set<string>): string {
  return pickTokens(accountId, huIds)[0];
}

// Tenta cada token em sequência; em erro de autorização/OAuth tenta o próximo.
// Outros erros (rate-limit, network, etc.) propagam imediato.
async function tryWithTokens<T>(tokens: string[], fn: (token: string) => Promise<T>): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i < tokens.length; i += 1) {
    try {
      return await fn(tokens[i]);
    } catch (err) {
      lastErr = err;
      const canTryNextToken = isTokenRetryableMetaError(err);
      if (!canTryNextToken || i === tokens.length - 1) throw err;
      const metaErr = err as MetaApiError;
      log('warn', 'Meta API token sem permissão/OAuth — tentando fallback', {
        tokenIndex: i,
        status: metaErr.status,
        code: getMetaErrorCode(metaErr.payload),
      });
    }
  }
  throw lastErr;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function metaUrl(path: string): string {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, '')}`;
}

async function metaRequest<T>(
  token: string,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string | undefined> = {},
  body?: Record<string, string>,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) search.set(k, v);
  }
  if (method === 'GET') search.set('access_token', token);

  const url = `${metaUrl(path)}?${search.toString()}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), META_HTTP_TIMEOUT_MS);

    try {
      const init: RequestInit = {
        method,
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      };
      if (method === 'POST') {
        const form = new URLSearchParams(body ?? {});
        form.set('access_token', token);
        init.body = form;
        init.headers = {
          ...init.headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        };
      }

      const resp = await fetch(url, init);
      clearTimeout(timer);

      const raw = await resp.text();
      let parsed: unknown;
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        parsed = { raw };
      }

      if (!resp.ok) {
        if (RETRY_STATUS.has(resp.status) && attempt < BACKOFF_MS.length) {
          const wait = BACKOFF_MS[attempt];
          log('warn', 'Meta API retry', { status: resp.status, path, attempt: attempt + 1, waitMs: wait });
          await sleep(wait);
          continue;
        }
        throw new MetaApiError(`Meta API ${method} ${path} falhou ${resp.status}`, resp.status, parsed);
      }

      return parsed as T;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (err instanceof MetaApiError) throw err;
      if (attempt < BACKOFF_MS.length) {
        const wait = BACKOFF_MS[attempt];
        log('warn', 'Meta API network error retry', {
          path,
          attempt: attempt + 1,
          waitMs: wait,
          err: (err as Error)?.message,
        });
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function fetchActiveCampaigns(
  accountId: string,
  token: string,
  includePaused = false,
): Promise<MetaCampaign[]> {
  const all: MetaCampaign[] = [];
  let after: string | undefined;
  const statuses = includePaused ? ['ACTIVE', 'PAUSED'] : ['ACTIVE'];
  for (let page = 0; page < 5; page += 1) {
    const params: Record<string, string | undefined> = {
      fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,created_time',
      filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: statuses }]),
      limit: '500',
      after,
    };
    const resp = await metaRequest<{
      data: MetaCampaign[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(token, 'GET', `act_${accountId}/campaigns`, params);

    all.push(...(resp.data ?? []));
    after = resp.paging?.next ? resp.paging?.cursors?.after : undefined;
    if (!after) break;
  }
  return all;
}

const BRT_TZ = 'America/Sao_Paulo';

function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
  const part = dtf.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || 'GMT+0';
  const m = part.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === '+' ? 1 : -1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
}

function localToUtc(dateStr: string, hour: number, tz: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, hour, 0, 0));
  const off = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - off * 60_000);
}

function utcToLocalDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function localDatesForBrtDay(brtDate: string, tz: string): string[] {
  const startUtc = localToUtc(brtDate, 0, BRT_TZ);
  const endUtc = new Date(startUtc.getTime() + 24 * 3600_000 - 1);
  const a = utcToLocalDate(startUtc, tz);
  const b = utcToLocalDate(endUtc, tz);
  return a === b ? [a] : [a, b];
}

function localDatesForUtcRange(startMs: number, endMs: number, tz: string): string[] {
  const a = utcToLocalDate(new Date(startMs), tz);
  const b = utcToLocalDate(new Date(endMs - 1), tz);
  return a === b ? [a] : [a, b];
}

async function fetchInsightsHourly(accountId: string, dateBrt: string, accountTz: string, token: string): Promise<MetaInsightRow[]> {
  const all: MetaInsightRow[] = [];
  const nowMs = Date.now();
  // Hoje na timezone da conta — filtra qualquer data > hoje local (Meta rejeita "since in the future").
  const todayLocal = utcToLocalDate(new Date(nowMs), accountTz);
  const datesToFetch = Array.from(new Set([
    ...localDatesForBrtDay(dateBrt, accountTz),
    ...localDatesForUtcRange(nowMs - 60 * 60_000, nowMs, accountTz),
  ])).filter((d) => d <= todayLocal).sort();


  for (const localDate of datesToFetch) {
    let after: string | undefined;
    for (let page = 0; page < 8; page += 1) {
      const params: Record<string, string | undefined> = {
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,actions,action_values,date_start,date_stop',
        time_range: JSON.stringify({ since: localDate, until: localDate }),
        time_increment: '1',
        breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
        level: 'campaign',
        limit: '500',
        after,
      };
      const resp = await metaRequest<{
        data: MetaInsightRow[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>(token, 'GET', `act_${accountId}/insights`, params);

      all.push(...(resp.data ?? []));
      after = resp.paging?.next ? resp.paging?.cursors?.after : undefined;
      if (!after) break;
    }
  }
  return all;
}

async function fetchInsightsDaily(accountId: string, dateBrt: string, token: string): Promise<MetaInsightRow[]> {
  const all: MetaInsightRow[] = [];
  let after: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const params: Record<string, string | undefined> = {
      fields: 'campaign_id,campaign_name,spend,actions',
      time_range: JSON.stringify({ since: dateBrt, until: dateBrt }),
      time_increment: '1',
      level: 'campaign',
      limit: '500',
      after,
    };
    const resp = await metaRequest<{
      data: MetaInsightRow[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(token, 'GET', `act_${accountId}/insights`, params);
    all.push(...(resp.data ?? []));
    after = resp.paging?.next ? resp.paging?.cursors?.after : undefined;
    if (!after) break;
  }
  return all;
}

async function pauseCampaign(campaignId: string, token: string): Promise<unknown> {
  return metaRequest(token, 'POST', campaignId, {}, { status: 'PAUSED' });
}

async function resumeCampaign(campaignId: string, token: string): Promise<unknown> {
  return metaRequest(token, 'POST', campaignId, {}, { status: 'ACTIVE' });
}

async function updateDailyBudget(campaignId: string, dailyBudgetCents: number, token: string): Promise<unknown> {
  return metaRequest(token, 'POST', campaignId, {}, {
    daily_budget: String(Math.max(100, Math.floor(dailyBudgetCents))),
  });
}

async function getCampaignStatus(campaignId: string, token: string): Promise<MetaCampaign> {
  return metaRequest<MetaCampaign>(token, 'GET', campaignId, {
    fields: 'id,name,status,effective_status,daily_budget',
  });
}

// =============================================================================
// 6. CAMPAIGN FETCHER — agrega campaigns + insights em CampaignSnapshot
// =============================================================================

function centsToMajor(cents?: string): number {
  if (!cents) return 0;
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

function currencyToBrlRate(currencyRaw: string | undefined, settings: PacingSettings): number {
  const currency = String(currencyRaw || 'USD').trim().toUpperCase();
  if (currency === 'BRL') return 1;
  const rate = Number(settings.exchangeRates?.[`${currency}_BRL`] ?? settings.exchangeRates?.[currency] ?? 0);
  if (rate > 0) return rate;
  if (currency === 'USD') return 5.15;
  if (currency === 'EUR') return 5.60;
  if (currency === 'HUF') return 0.015;
  return 1;
}

function majorToBrl(amount: number, currencyRaw: string | undefined, settings: PacingSettings): number {
  if (!(amount > 0)) return 0;
  return Number((amount * currencyToBrlRate(currencyRaw, settings)).toFixed(2));
}

function brlToMajor(amountBrl: number, currencyRaw: string | undefined, settings: PacingSettings): number {
  if (!(amountBrl > 0)) return 0;
  const rate = currencyToBrlRate(currencyRaw, settings);
  if (!(rate > 0)) return amountBrl;
  return Number((amountBrl / rate).toFixed(2));
}

function detectProject(name: string): string | undefined {
  // Projetos válidos — bate com mockData/PROJECT_SLUGS do front
  const KNOWN = ['NDM', 'NDR', 'NDB', 'LDR', 'CRT', 'CST', 'NEURO', 'MMP', 'MMPB', 'AILULA'];
  // 1) Tag em brackets: `[NDM]`, `[ NDM ]`
  for (const p of KNOWN) {
    const re = new RegExp(`\\[\\s*${p}\\s*\\]`, 'i');
    if (re.test(name)) return p.toUpperCase();
  }
  // 2) Fallback legado: começa com `NDM-` / `NDM_` / `NDM `
  const m = name.match(/^([A-Z]{2,5})[-_ ]/i);
  const cand = m?.[1]?.toUpperCase();
  if (cand && KNOWN.includes(cand)) return cand;
  return undefined;
}

function detectPhase(name: string): 'F1' | 'F2' | 'F3' | null {
  if (/1-?50-?1/.test(name)) return 'F1';
  if (/1-?100-?1/.test(name)) return 'F2';
  if (/1-?250-?1/.test(name)) return 'F3';
  return null;
}

function todayBrt(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function parseHourBucket(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{2}):/);
  return m ? Number(m[1]) : null;
}

interface AggregatedInsights {
  spendToday: number;
  spendLastHour: number;
  spendPreviousClosedHour: number;
  salesToday: number;
  salesLastHour: number;
  revenueToday: number;     // moeda nativa da conta
  revenueLastHour: number;  // moeda nativa — janela rolling ~última hora
  noSaleInLastMinutes: number;
  clicksToday: number;
  linkClicksToday: number;
  impressionsToday: number;
  icToday: number;
}

function getBrtDayBoundsMs(dateBrt: string): { startMs: number; endMs: number } {
  const startMs = localToUtc(dateBrt, 0, BRT_TZ).getTime();
  return { startMs, endMs: startMs + 24 * 3600_000 };
}

function bucketStartMs(row: MetaInsightRow, accountTz: string, fallbackDate: string): number | null {
  const hr = parseHourBucket(row.hourly_stats_aggregated_by_advertiser_time_zone);
  if (hr === null) return null;
  const localDate = row.date_start ?? fallbackDate;
  return localToUtc(localDate, hr, accountTz).getTime();
}

function aggregateInsights(
  rows: MetaInsightRow[],
  nowMs: number,
  dateBrt: string,
  accountTz: string,
  hourlyWindowMode: 'rolling' | 'fixed' = 'fixed',
): AggregatedInsights {
  let spendToday = 0;
  let spendLastHour = 0;
  let spendPreviousClosedHour = 0;
  let spendClosedHoursToday = 0; // soma de TODOS os buckets do dia BRT já fechados
  let salesToday = 0;
  let salesLastHour = 0;
  let salesPreviousClosedHour = 0;
  let salesClosedHoursToday = 0;
  let revenueToday = 0;
  let revenueLastHour = 0;
  let revenuePreviousClosedHour = 0;
  let clicksToday = 0;
  let linkClicksToday = 0;
  let impressionsToday = 0;
  let icToday = 0;
  let lastSaleMs = -1;
  const { startMs: brtStartMs, endMs: brtEndMs } = getBrtDayBoundsMs(dateBrt);
  const last60StartMs = nowMs - 60 * 60_000;

  for (const r of rows) {
    const startMs = bucketStartMs(r, accountTz, dateBrt);
    if (startMs === null) continue;
    const bucketEndMs = startMs + 60 * 60_000;
    const spend = Number(r.spend ?? '0') || 0;

    const purchaseAction = (r.actions ?? []).find(
      (a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase',
    );
    const sales = purchaseAction ? Number(purchaseAction.value) || 0 : 0;

    const purchaseValue = (r.action_values ?? []).find(
      (a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase',
    );
    const revenue = purchaseValue ? Number(purchaseValue.value) || 0 : 0;

    // Initiate Checkout — soma variantes conhecidas do action_type na Meta.
    const icActions = (r.actions ?? []).filter(
      (a) =>
        a.action_type === 'initiate_checkout' ||
        a.action_type === 'offsite_conversion.fb_pixel_initiate_checkout' ||
        a.action_type === 'omni_initiated_checkout',
    );
    const ics = icActions.reduce((sum, a) => sum + (Number(a.value) || 0), 0);

    // Janela "hoje" SEMPRE em BRT, independente da TZ da conta.
    // O bucketStartMs já converte a hora local da conta para UTC; aqui só comparamos.
    const isTodayBrt = startMs >= brtStartMs && startMs < brtEndMs;
    if (isTodayBrt) {
      spendToday += spend;
      salesToday += sales;
      revenueToday += revenue;
      icToday += ics;
      clicksToday += Number(r.clicks ?? '0') || 0;
      linkClicksToday += Number(r.inline_link_clicks ?? '0') || 0;
      impressionsToday += Number(r.impressions ?? '0') || 0;
      if (bucketEndMs <= nowMs) {
        spendClosedHoursToday += spend;
        salesClosedHoursToday += sales;
      }
    }

    if (hourlyWindowMode === 'fixed') {
      // Bucket da hora corrente (BRT) + última hora fechada (BRT).
      // Janela horária da regra é SEMPRE BRT — buckets em TZ da conta são
      // convertidos para UTC e classificados pelo relógio BRT.
      if (startMs <= nowMs && nowMs < bucketEndMs) {
        spendLastHour += spend;
        salesLastHour += sales;
        revenueLastHour += revenue;
      } else if (bucketEndMs <= nowMs && bucketEndMs > last60StartMs) {
        spendPreviousClosedHour += spend;
        salesPreviousClosedHour += sales;
        revenuePreviousClosedHour += revenue;
      }
    } else {
      const availableEndMs = Math.min(bucketEndMs, nowMs);
      const availableMs = availableEndMs - startMs;
      const overlapMs = Math.max(0, Math.min(availableEndMs, nowMs) - Math.max(startMs, last60StartMs));
      if (availableMs > 0 && overlapMs > 0) {
        const factor = Math.min(1, overlapMs / availableMs);
        spendLastHour += spend * factor;
        salesLastHour += Math.round(sales * factor);
        revenueLastHour += revenue * factor;
      }
    }

    if (sales > 0 && startMs > lastSaleMs) {
      lastSaleMs = Math.min(bucketEndMs, nowMs);
    }
  }

  if (hourlyWindowMode === 'fixed') {
    // 1) Latency-fix: a Meta entrega o bucket horário com 30–60min de atraso.
    //    Se o spendToday (endpoint diário, instantâneo) é MAIOR que a soma das
    //    horas fechadas + bucket corrente entregue, a diferença é a hora corrente
    //    que ainda não foi propagada no breakdown horário. Sem isso uma campanha
    //    que estoura R$200 na primeira hora do dia fica invisível por ~1h.
    const inferredCurrentHour = Math.max(0, spendToday - spendClosedHoursToday);
    if (inferredCurrentHour > spendLastHour) {
      spendLastHour = inferredCurrentHour;
      salesLastHour = Math.max(salesLastHour, salesToday - salesClosedHoursToday);
    }
    // 2) Promoção da última hora fechada (regra do turno anterior).
    if (spendPreviousClosedHour > spendLastHour) {
      spendLastHour = spendPreviousClosedHour;
      salesLastHour = salesPreviousClosedHour;
      revenueLastHour = revenuePreviousClosedHour;
    }
  }

  let noSale = Number.POSITIVE_INFINITY;
  if (lastSaleMs >= 0) {
    noSale = Math.max(0, (nowMs - lastSaleMs) / 60_000);
  }

  return { spendToday, spendLastHour, spendPreviousClosedHour, salesToday, salesLastHour, revenueToday, revenueLastHour, noSaleInLastMinutes: noSale, clicksToday, linkClicksToday, impressionsToday, icToday };
}

// Snapshot anterior pra delta de acceleration.
// IMPORTANTE: Edge Functions são stateless — esse Map é vazio em cada cold start.
// Pra acceleration funcionar de fato precisa persistir em tabela (TODO v1.1).
const previousSpendByCampaign = new Map<string, { ts: number; spend: number }>();

function setPreviousSpend(campaignId: string, spend: number): void {
  previousSpendByCampaign.set(campaignId, { ts: Date.now(), spend });
}

function getDelta5Min(campaignId: string, currentSpend: number): number {
  const prev = previousSpendByCampaign.get(campaignId);
  if (!prev) return 0;
  const minutesAgo = (Date.now() - prev.ts) / 60_000;
  if (minutesAgo < 3 || minutesAgo > 10) return 0;
  return Math.max(0, currentSpend - prev.spend);
}

interface StoredCampaignForScan {
  account_id: string;
  campaign_name: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | string | null;
}

interface ActiveAccountForScan {
  account_id: string;
  account_name: string | null;
  is_active: boolean | null;
  account_status: number | null;
}

async function loadStoredCampaignsForScan(supabase: SupabaseClient): Promise<StoredCampaignForScan[]> {
  const pageSize = 1000;
  const out: StoredCampaignForScan[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('meta_campaign_status')
      .select('account_id, campaign_name, status, effective_status, daily_budget')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = (data ?? []) as StoredCampaignForScan[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }

  return out;
}

async function loadCooldownRows(supabase: SupabaseClient): Promise<CooldownRow[]> {
  const pageSize = 1000;
  const out: CooldownRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('pacing_cooldowns')
      .select('campaign_id, rule_id, snoozed_until, reason, set_by, locked_until_hour_brt, locked_by_rule_id, last_set_budget_brl')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = (data ?? []) as CooldownRow[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }

  return out;
}

function storedCampaignMayMatchRule(
  row: StoredCampaignForScan,
  rule: PacingRule,
  accountNames: Map<string, string>,
): boolean {
  const f = rule.filter_config ?? {};
  const campaignName = row.campaign_name ?? '';
  const accountId = row.account_id.startsWith("act_") ? row.account_id : `act_${row.account_id}`;

  if (f.accountIds && f.accountIds.length > 0) {
    const has = f.accountIds.some((id) => (id.startsWith("act_") ? id : `act_${id}`) === accountId);
    if (!has) return false;
  }

  if (f.account && f.account !== 'all') {
    const accName = accountNames.get(accountId) ?? accountId;
    if (f.account !== accName && f.account !== accountId) return false;
  }

  if (f.nameContains) {
    const re = new RegExp(escapeRegex(f.nameContains), 'i');
    if (!re.test(campaignName)) return false;
  }

  if (f.nameEndsWith) {
    const suffix = escapeRegex(String(f.nameEndsWith).trim());
    const re = new RegExp(`(?:^|\\s|-|–|—)${suffix}(?:\\s|[🚫⛔️❌✅🔥📌🛑⚠️⭐️✨]*)*$`, 'i');
    if (!re.test(campaignName.trim())) return false;
  }

  if (f.projects && f.projects.length > 0) {
    // Substring match tolerante a brackets: "VIT-RRT-POL" casa com "[VIT-RRT] [POL]".
    // Normaliza ambos os lados colapsando qualquer sequência não-alfanumérica em "-".
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const nameNorm = normalize(campaignName);
    const hit = f.projects.some((slug) => {
      const s = normalize(String(slug ?? ''));
      return s.length >= 2 && nameNorm.includes(s);
    });
    if (!hit) return false;
  }

  if (f.phases && f.phases.length > 0) {
    const phase = detectPhase(campaignName);
    if (!phase || !f.phases.includes(phase)) return false;
  }

  const applies: AppliesTo = f.appliesTo ?? 'active';
  if (applies !== 'any') {
    const status = (row.effective_status ?? row.status ?? '').toUpperCase();
    const isActive = status === 'ACTIVE';
    if (applies === 'active' && !isActive) return false;
    if (applies === 'paused' && isActive) return false;
  }

  // Não aplica minDailyBudget/minBudget aqui: campanhas ABO têm daily_budget=0 e
  // podem ter teto por override/regra, então filtrar no DB removeria campanhas válidas.
  return true;
}

async function resolveAccountsToScan(
  supabase: SupabaseClient,
  rules: PacingRule[],
  hu: Set<string>,
): Promise<string[]> {
  const acc = new Set<string>();

  for (const rule of rules) {
    for (const id of rule.filter_config?.accountIds ?? []) {
      acc.add(id.replace(/^act_/, ''));
    }
  }
  for (const id of hu) acc.add(id.replace(/^act_/, ''));

  const enabledRules = rules.filter((r) => r.enabled);
  if (enabledRules.length === 0) return Array.from(acc);

  // F9-DIA3: Filtro estrito de contas ativas e com gasto recente (3 dias)
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [accountsResult, campaignsResult, recentSpendResult] = await Promise.allSettled([
    supabase
      .from('meta_ad_accounts')
      .select('account_id, account_name, is_active, account_status, disable_reason'),
    loadStoredCampaignsForScan(supabase),
    supabase
      .from('traffic_data')
      .select('account_id')
      .gte('date', cutoff)
      .gt('spend', 0)
  ]);

  const accountsRaw = accountsResult.status === 'fulfilled' ? accountsResult.value.data : null;
  const accountsErr = accountsResult.status === 'fulfilled' ? accountsResult.value.error : accountsResult.reason;
  const campaignsRaw = campaignsResult.status === 'fulfilled' ? campaignsResult.value : null;
  const campaignsErr = campaignsResult.status === 'rejected' ? campaignsResult.reason : null;
  const recentSpend = recentSpendResult.status === 'fulfilled' ? recentSpendResult.value.data : [];

  const accountsWithSpend = new Set(recentSpend?.map((r: any) => r.account_id) ?? []);

  if (accountsErr) {
    log('warn', 'falha ao resolver contas ativas — usando fallback explícito/HU', { err: accountsErr.message ?? String(accountsErr) });
    return Array.from(acc);
  }
  if (campaignsErr) {
    log('warn', 'falha ao resolve campanhas pra scan — usando fallback explícito/HU', { err: campaignsErr.message ?? String(campaignsErr) });
    return Array.from(acc);
  }

  const activeAccounts = new Set<string>();
  const accountNames = new Map<string, string>();
  for (const row of (accountsRaw ?? []) as any[]) {
    const accountId = row.account_id?.startsWith("act_") ? row.account_id : (row.account_id ? `act_${row.account_id}` : null);
    if (!accountId) continue;
    if (row.account_name) accountNames.set(accountId, row.account_name);

    const dr = String(row.disable_reason || "").toLowerCase();
    const isBlocked = dr.includes("api access blocked") || dr.includes("sem acesso via api");
    const hasRecentSpend = accountsWithSpend.has(row.account_id);

    if (row.is_active === true && (row.account_status == null || Number(row.account_status) === 1) && !isBlocked && hasRecentSpend) {
      activeAccounts.add(accountId);
    }
  }

  for (const row of (campaignsRaw ?? []) as StoredCampaignForScan[]) {
    const accountId = row.account_id?.startsWith("act_") ? row.account_id : (row.account_id ? `act_${row.account_id}` : null);
    if (!accountId || !activeAccounts.has(accountId)) continue;
    if (enabledRules.some((rule) => storedCampaignMayMatchRule(row, rule, accountNames))) {
      acc.add(accountId);
    }
  }

  return Array.from(acc);
}

interface SalesAttributionRow {
  campaign_id: string | null;
  sales: number | string | null;
  revenue: number | string | null;
  matched_via?: string | null;
}

async function loadAuthoritativeSalesByCampaign(
  supabase: SupabaseClient,
  dateBrt: string,
): Promise<Map<string, { sales: number; revenue: number }>> {
  const out = new Map<string, { sales: number; revenue: number }>();
  const { data, error } = await supabase.rpc('resolve_pacing_sales_attribution', { p_date: dateBrt });
  if (error) {
    log('warn', 'falha ao carregar vendas autoritativas do pacing — mantendo Meta action_values', { err: error.message });
    return out;
  }
  for (const row of (data ?? []) as SalesAttributionRow[]) {
    if (!row.campaign_id) continue;
    const prev = out.get(row.campaign_id) ?? { sales: 0, revenue: 0 };
    prev.sales += Number(row.sales ?? 0) || 0;
    prev.revenue += Number(row.revenue ?? 0) || 0;
    out.set(row.campaign_id, prev);
  }
  return out;
}

function applyAuthoritativeSales(
  campaigns: CampaignSnapshot[],
  salesByCampaign: Map<string, { sales: number; revenue: number }>,
): CampaignSnapshot[] {
  if (salesByCampaign.size === 0) return campaigns;
  return campaigns.map((c) => {
    const financial = salesByCampaign.get(c.campaignId);
    if (!financial) return c;
    // Se nosso DB autoritativo registra venda hoje, força noSaleInLastMinutes=0
    // pra que regras com andNoSaleInLastMinutes (24h etc) NÃO disparem.
    // Não sabemos o timestamp exato da última venda aqui, mas "vendeu hoje" basta
    // pra bloquear regras de janela diária — o impacto em janelas curtas (60min)
    // é conservador (não pausa por engano), que é o comportamento desejado.
    const hasSale = financial.sales > 0;
    return {
      ...c,
      salesToday: financial.sales,
      revenueToday: Number(financial.revenue.toFixed(2)),
      // Se revenueLastHour do Meta ainda não chegou mas o DB já tem venda hoje,
      // não sobrescreve — mantém o Meta como origem para a janela horária.
      noSaleInLastMinutes: hasSale ? 0 : c.noSaleInLastMinutes,
      salesLastHour: hasSale ? Math.max(c.salesLastHour, 1) : c.salesLastHour,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RT LAST-HOUR FALLBACK (Opção A) — quando redtrack_events grava
// meta_campaign_id "poluído" (adset/ad ID ou variante rotacionada) a soma por
// meta_campaign_id não bate com a campanha real do Meta. Aqui puxamos os
// eventos de conversão da última hora e cruzamos por:
//   1) meta_campaign_id === campaignId  (caminho feliz)
//   2) utm_campaign ILIKE campaign_name (fallback tolerante)
// Sobrescreve snap.revenueLastHour/salesLastHour com MAX(Meta, RT) para que
// regras de ROAS em janela rolling (last_60min) não fiquem travadas por
// revenue=0 quando a venda existe no RT mas com ID divergente.
// NÃO altera revenueToday — esse já é enriquecido pela RPC autoritativa.
// ─────────────────────────────────────────────────────────────────────────────
async function loadRtLastHourFallback(
  supabase: SupabaseClient,
  campaigns: CampaignSnapshot[],
): Promise<Map<string, { sales: number; revenueBrl: number }>> {
  const out = new Map<string, { sales: number; revenueBrl: number }>();
  if (campaigns.length === 0) return out;

  const sinceIso = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from('redtrack_events')
    .select('event_type, amount, currency, meta_campaign_id, utm_campaign, transaction_id, clickid')
    .in('event_type', ['purchase', 'upsell', 'sale'])
    .gte('occurred_at', sinceIso)
    .limit(5000);
  if (error) {
    log('warn', 'RT fallback last-hour: falha na query', { err: error.message });
    return out;
  }

  // FX USD→BRL (mesma fonte que sync-redtrack-sales)
  let usdToBrl = 5.30;
  try {
    const { data: fx } = await supabase
      .from('exchange_rate_log')
      .select('rate')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = Number(fx?.rate);
    if (r && r > 0) usdToBrl = r;
  } catch (_e) { /* ignore */ }

  // Dedup por (transaction_id || clickid) para não contar 2x a mesma venda
  const seen = new Set<string>();
  interface RtRow {
    event_type: string;
    amount: number | null;
    currency: string | null;
    meta_campaign_id: string | null;
    utm_campaign: string | null;
    transaction_id: string | null;
    clickid: string | null;
  }
  const rows = (data ?? []) as RtRow[];

  for (const c of campaigns) {
    const cid = c.campaignId;
    const cname = (c.campaignName || '').toLowerCase().trim();
    if (!cid && !cname) continue;

    let sales = 0;
    let revBrl = 0;
    for (const r of rows) {
      const matchById = r.meta_campaign_id && r.meta_campaign_id === cid;
      const utm = (r.utm_campaign || '').toLowerCase().trim();
      const matchByName = cname.length > 3 && utm.length > 3 && (utm === cname || utm.includes(cname) || cname.includes(utm));
      if (!matchById && !matchByName) continue;

      const dedupKey = r.transaction_id || r.clickid;
      if (dedupKey) {
        const k = `${cid}|${dedupKey}`;
        if (seen.has(k)) continue;
        seen.add(k);
      }

      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      const cur = (r.currency || 'USD').toUpperCase();
      revBrl += cur === 'BRL' ? amt : amt * usdToBrl;
      sales += 1;
    }
    if (sales > 0 || revBrl > 0) {
      out.set(cid, { sales, revenueBrl: Number(revBrl.toFixed(2)) });
    }
  }
  return out;
}

function applyRtLastHourFallback(
  campaigns: CampaignSnapshot[],
  rtByCampaign: Map<string, { sales: number; revenueBrl: number }>,
): CampaignSnapshot[] {
  if (rtByCampaign.size === 0) return campaigns;
  return campaigns.map((c) => {
    const rt = rtByCampaign.get(c.campaignId);
    if (!rt) return c;
    const newRev = Math.max(c.revenueLastHour || 0, rt.revenueBrl);
    const newSales = Math.max(c.salesLastHour || 0, rt.sales);
    if (newRev === c.revenueLastHour && newSales === c.salesLastHour) return c;
    return {
      ...c,
      revenueLastHour: newRev,
      salesLastHour: newSales,
      // Se RT tem venda, zera "sem venda em X min" pra janela rolling ficar honesta
      noSaleInLastMinutes: rt.sales > 0 ? 0 : c.noSaleInLastMinutes,
    };
  });
}

async function fetchAllActiveCampaigns(
  accountIds: string[],
  huIds: Set<string>,
  settings: PacingSettings,
  accountCurrencies: Map<string, { currency: string; timezone: string; operationId: string | null }>,
  includePaused = false,
): Promise<CampaignSnapshot[]> {
  const snapshots: CampaignSnapshot[] = [];
  const dateBrt = todayBrt();
  const yesterdayBrt = (() => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const nowMs = Date.now();

  // Paraleliza por conta — cada conta gera 3 requests Meta (campaigns + insights hoje + insights ontem).
  const perAccount = accountIds.map(async (accountId) => {
    const tokens = pickTokens(accountId, huIds);
    const accountMeta = accountCurrencies.get(accountId.replace(/^act_/, '')) ?? { currency: 'USD', timezone: BRT_TZ, operationId: null };
    const accountTz = accountMeta.timezone || BRT_TZ;
    let campaigns: MetaCampaign[] = [];
    let insights: MetaInsightRow[] = [];
    let insightsYest: MetaInsightRow[] = [];

    try {
      // Campaigns + insights de hoje: tenta cada token, faz fallback em 401/403.
      // Re-emite as 2 chamadas críticas em conjunto pra garantir que ambas usam o
      // mesmo token vencedor (evita estado inconsistente).
      [campaigns, insights] = await tryWithTokens(tokens, async (token) => Promise.all([
        fetchActiveCampaigns(accountId, token, includePaused),
        fetchInsightsHourly(accountId, dateBrt, accountTz, token),
      ]));
      // Insights de ontem: best-effort, com mesmo fallback.
      insightsYest = await tryWithTokens(tokens, (token) =>
        fetchInsightsDaily(accountId, yesterdayBrt, token),
      ).catch((err) => {
        log('warn', 'Falha ao buscar insights de ontem', { accountId, err: (err as Error)?.message });
        return [] as MetaInsightRow[];
      });
    } catch (err) {
      const payload = (err as { payload?: unknown })?.payload;
      log('error', 'Falha ao buscar dados da conta', {
        accountId,
        err: (err as Error)?.message,
        payload: payload ? JSON.stringify(payload).slice(0, 600) : undefined,
      });
      return [];
    }

    if (campaigns.length === 0) return [];


    const insightsByCampaign = new Map<string, MetaInsightRow[]>();
    for (const row of insights) {
      const cid = row.campaign_id;
      if (!cid) continue;
      const list = insightsByCampaign.get(cid) ?? [];
      list.push(row);
      insightsByCampaign.set(cid, list);
    }
    const yestSpendByCampaign = new Map<string, number>();
    for (const row of insightsYest) {
      const cid = row.campaign_id;
      if (!cid) continue;
      const s = Number(row.spend ?? '0') || 0;
      yestSpendByCampaign.set(cid, (yestSpendByCampaign.get(cid) ?? 0) + s);
    }

    const accountSnaps: CampaignSnapshot[] = [];
    for (const c of campaigns) {
      const accountCurrency = accountMeta.currency ?? 'USD';
      const fxRate = currencyToBrlRate(accountCurrency, settings);
      const dailyMajor = centsToMajor(c.daily_budget);
      const dailyBudgetBrl = majorToBrl(dailyMajor, accountCurrency, settings);
      const agg = aggregateInsights(insightsByCampaign.get(c.id) ?? [], nowMs, dateBrt, accountTz, settings.hourlyWindowMode);
      // Meta API retorna spend na moeda da conta. Converter p/ BRL para
      // bater com dailyBudgetBrl e com todos os thresholds das regras.
      const spendTodayBrl = Number((agg.spendToday * fxRate).toFixed(2));
      const spendLastHourBrl = Number((agg.spendLastHour * fxRate).toFixed(2));
      const spendYestNative = yestSpendByCampaign.get(c.id) ?? 0;
      const spendYesterdayBrl = Number((spendYestNative * fxRate).toFixed(2));
      const delta5Native = getDelta5Min(c.id, agg.spendToday);
      const delta5Brl = Number((delta5Native * fxRate).toFixed(2));
      setPreviousSpend(c.id, agg.spendToday); // mantém nativo p/ delta consistente entre ciclos

      accountSnaps.push({
        campaignId: c.id,
        campaignName: c.name,
        accountId,
        operationId: accountMeta.operationId,
        status: c.status,
        dailyBudget: Number(c.daily_budget ?? '0'),
        dailyBudgetMajor: dailyBudgetBrl,
        spendToday: spendTodayBrl,
        spendYesterday: spendYesterdayBrl,
        spendLastHour: spendLastHourBrl,
        spendLast5Min: delta5Brl,
        revenueToday: Number((agg.revenueToday * fxRate).toFixed(2)),
        revenueLastHour: Number((agg.revenueLastHour * fxRate).toFixed(2)),
        salesToday: agg.salesToday,
        salesLastHour: agg.salesLastHour,
        noSaleInLastMinutes: agg.noSaleInLastMinutes,
        clicksToday: agg.clicksToday,
        linkClicksToday: agg.linkClicksToday,
        impressionsToday: agg.impressionsToday,
        icToday: agg.icToday,
        // Valores financeiros do snapshot ficam normalizados em BRL, mas a moeda
        // nativa da conta precisa ser preservada para escrever daily_budget na Meta.
        currency: accountCurrency,
        detectedProject: detectProject(c.name),
        detectedPhase: detectPhase(c.name),
      });
    }
    return accountSnaps;
  });

  const results = await Promise.all(perAccount);
  for (const arr of results) snapshots.push(...arr);
  return snapshots;
}

async function persistCampaignHourlySnapshots(
  supabase: SupabaseClient,
  campaigns: CampaignSnapshot[],
): Promise<void> {
  const now = new Date();
  const snapshotBucket = new Date(Math.floor(now.getTime() / 120_000) * 120_000).toISOString();
  const dateBrt = todayBrt();
  const rows = campaigns
    .filter((c) => Boolean(c.operationId))
    .map((c) => ({
      operation_id: c.operationId,
      account_id: c.accountId.startsWith("act_") ? c.accountId : `act_${c.accountId}`,
      campaign_id: c.campaignId,
      campaign_name: c.campaignName,
      date: dateBrt,
      snapshot_at: now.toISOString(),
      snapshot_bucket: snapshotBucket,
      spend_today_brl: c.spendToday,
      spend_last_60m_brl: c.spendLastHour,
      sales_last_60m: c.salesLastHour,
      revenue_today_brl: c.revenueToday,
      impressions_today: c.impressionsToday ?? 0,
      clicks_today: c.clicksToday ?? 0,
      link_clicks_today: c.linkClicksToday ?? 0,
      source: 'meta_campaign_hourly_api',
    }));

  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('pacing_campaign_hourly_snapshots')
      .upsert(chunk, { onConflict: 'account_id,campaign_id,snapshot_bucket' });
    if (error) {
      log('warn', 'falha ao gravar pacing_campaign_hourly_snapshots', { err: error.message, rows: chunk.length });
    }
  }
}

// =============================================================================
// 7. DECISION ENGINE — pure function: snapshots + rules → decisions
// =============================================================================

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CampaignOverride {
  dailyTargetBrl: number;
  rulesExempt: boolean;
  hourlyCapBrlOverride: number; // 0 = não aplica
  exemptUntil: number | null; // epoch ms; null = sem expiração
}

function resolveDailyTarget(
  snap: CampaignSnapshot,
  rule: PacingRule,
  overrides: Map<string, CampaignOverride>,
): number {
  const ov = overrides.get(snap.campaignId);
  if (ov && ov.dailyTargetBrl > 0) return ov.dailyTargetBrl;
  if (snap.dailyBudgetMajor > 0) return snap.dailyBudgetMajor;
  const def = Number(rule.trigger_config?.defaultDailyTargetBrl ?? 0);
  if (def > 0) return def;
  return 0;
}

function isCampaignExempt(ov: CampaignOverride | undefined, nowMs: number): boolean {
  if (!ov || !ov.rulesExempt) return false;
  if (ov.exemptUntil != null && ov.exemptUntil < nowMs) return false;
  return true;
}


function matchesFilter(snap: CampaignSnapshot, rule: PacingRule, effectiveTarget?: number, ligaTudoMode = false): boolean {
  const f = rule.filter_config;

  if (f.nameContains) {
    const re = new RegExp(escapeRegex(f.nameContains), 'i');
    if (!re.test(snap.campaignName)) return false;
  }
  if (f.nameEndsWith) {
    const suffix = escapeRegex(String(f.nameEndsWith).trim());
    const re = new RegExp(`(?:^|\\s|-|–|—)${suffix}(?:\\s|[🚫⛔️❌✅🔥📌🛑⚠️⭐️✨]*)*$`, 'i');
    if (!re.test(snap.campaignName.trim())) return false;
  }
  if (f.accountIds && f.accountIds.length > 0) {
    const normalized = snap.accountId.replace(/^act_/, '');
    const has = f.accountIds.some((id) => id.replace(/^act_/, '') === normalized);
    if (!has) return false;
  }
  if (f.projects && f.projects.length > 0) {
    // Substring match no nome da campanha (idem matchesRule) — aceita tags dinâmicas.
    const nameLc = snap.campaignName.toLowerCase();
    const hit = f.projects.some((slug) => {
      const s = String(slug ?? '').trim().toLowerCase();
      return s.length >= 2 && nameLc.includes(s);
    });
    if (!hit) return false;
  }
  if (f.phases && f.phases.length > 0) {
    if (!snap.detectedPhase) return false;
    if (!f.phases.includes(snap.detectedPhase)) return false;
  }
  if (typeof f.minDailyBudget === 'number') {
    // Usa teto resolvido (ABO-aware) ou cai pro CBO se ainda não temos o target calculado.
    const budgetForFilter = effectiveTarget != null && effectiveTarget > 0
      ? effectiveTarget
      : snap.dailyBudgetMajor;
    if (budgetForFilter < f.minDailyBudget) return false;
  }
  // appliesTo — filtra por estado da campanha. Default 'active' = comportamento legado.
  const applies: AppliesTo = f.appliesTo ?? 'active';
  if (applies !== 'any') {
    const isActive = (snap.status ?? '').toUpperCase() === 'ACTIVE';
    if (applies === 'active' && !isActive) return false;
    if (applies === 'paused' && isActive) return false;
  }
  // Filtro "teve spend ontem >= X" (R$). 0 ou undefined = ignorar.
  // Em modo "Liga Tudo" (execução manual override), esse filtro é IGNORADO —
  // religa todas as campanhas do escopo, mesmo as sem spend ontem.
  if (!ligaTudoMode) {
    const minYday = Number(f.minSpendYesterdayBrl ?? 0);
    if (minYday > 0 && (snap.spendYesterday ?? 0) < minYday) return false;
  }
  return true;
}

function isOnCooldown(
  campaignId: string,
  cooldowns: CooldownRow[],
  ruleActionType?: ActionType | null,
  bypassManualLock?: boolean,
): boolean {
  const now = Date.now();
  return cooldowns.some((c) => {
    if (c.campaign_id !== campaignId) return false;
    if (new Date(c.snoozed_until).getTime() <= now) return false;
    // Reactivation lock: bloqueia SÓ regras que pausam ou reduzem budget.
    // Regras de scale (increase_budget) e outras reativações passam normal —
    // campanha religada com venda continua elegível pra Auto-Scale se bater critérios.
    // `manual_until` (pausa manual "até 05h BRT") tem MESMA semântica: libera activate.
    if (c.set_by === 'reactivation_lock' || c.set_by === 'manual_until') {
      if (!ruleActionType) return false; // sem contexto de regra: NÃO bloqueia (deixa o check per-rule decidir)
      return ruleActionType === 'pause' || ruleActionType === 'reduce_budget';
    }
    // Manual lock sticky é soberano por padrão. Exceção explícita:
    // regras de activate com `bypassManualLock=true` podem religar campanhas-alvo
    // quando a regra foi desenhada para recuperar um bloco operacional específico.
    // Ajustes de budget (increase_budget / reduce_budget) e pausas em campanhas
    // já ATIVAS não devem ser bloqueados pelo guard — o guard só protege contra
    // religar, não contra otimizar uma campanha que já está rodando.
    if (c.set_by === 'manual') {
      if (ruleActionType === 'activate' && bypassManualLock === true) return false;
      if (ruleActionType && ruleActionType !== 'activate') return false;
      return true;
    }
    return true;
  });
}

interface TriggerResult {
  fires: boolean;
  reason: string;
  expectedSpend?: number;
  pctAboveExpected?: number;
}

function minutesSinceStartOfDayBrt(): number {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.getUTCHours() * 60 + brt.getUTCMinutes();
}

function evalLinearPacing(snap: CampaignSnapshot, rule: PacingRule): TriggerResult {
  const t = rule.trigger_config;
  const tolerance = t.tolerance ?? 1.5;
  const minSpend = t.minSpendBeforeTrigger ?? 50;
  const minutes = minutesSinceStartOfDayBrt();
  const expected = snap.dailyBudgetMajor * (minutes / 1440);
  const ratio = expected > 0 ? snap.spendToday / expected : 0;
  const pctAbove = expected > 0 ? (snap.spendToday - expected) / expected : 0;

  if (snap.spendToday < minSpend) {
    return { fires: false, reason: `spend ${snap.spendToday.toFixed(2)} < minSpendBeforeTrigger ${minSpend}` };
  }
  if (ratio <= tolerance) {
    return {
      fires: false,
      reason: `ratio ${ratio.toFixed(2)} <= tolerance ${tolerance}`,
      expectedSpend: expected,
      pctAboveExpected: pctAbove,
    };
  }
  if (typeof t.andNoSaleInLastMinutes === 'number') {
    if (snap.noSaleInLastMinutes < t.andNoSaleInLastMinutes) {
      return {
        fires: false,
        reason: `houve venda há ${snap.noSaleInLastMinutes.toFixed(0)}min (< ${t.andNoSaleInLastMinutes})`,
        expectedSpend: expected,
        pctAboveExpected: pctAbove,
      };
    }
  }

  const reasonParts = [
    `gastou ${snap.spendToday.toFixed(2)} (esperado ${expected.toFixed(2)})`,
    `${(pctAbove * 100).toFixed(0)}% acima do linear`,
  ];
  if (typeof t.andNoSaleInLastMinutes === 'number') {
    reasonParts.push(`sem venda há ${snap.noSaleInLastMinutes.toFixed(0)}min`);
  }

  return { fires: true, reason: reasonParts.join(' · '), expectedSpend: expected, pctAboveExpected: pctAbove };
}

function evalDailyCap(snap: CampaignSnapshot, rule: PacingRule): TriggerResult {
  const t = rule.trigger_config;
  const tolerance = t.tolerance ?? 1.0;
  // Se fixedCapBrl está setado, usa valor fixo (ignora teto/override da campanha).
  const baseCap = typeof t.fixedCapBrl === 'number' && t.fixedCapBrl > 0
    ? t.fixedCapBrl
    : snap.dailyBudgetMajor;
  const cap = baseCap * tolerance;
  const capLabel = typeof t.fixedCapBrl === 'number' && t.fixedCapBrl > 0 ? `cap fixo ${cap.toFixed(2)}` : `cap ${cap.toFixed(2)}`;
  if (snap.spendToday <= cap) {
    return { fires: false, reason: `spend ${snap.spendToday.toFixed(2)} <= ${capLabel}` };
  }

  // Regras de CPA alvo/"sem venda" nunca podem pausar campanha que já vendeu.
  // Antes daily_cap ignorava andNoSale/noSaleMinutes, então uma campanha com venda
  // podia cair na regra errada só por ter passado do cap de spend.
  const requiresNoSale = t.andNoSale === true || typeof t.andNoSaleInLastMinutes === 'number';
  if (requiresNoSale) {
    if (snap.salesToday >= 1 || snap.revenueToday > 0) {
      return {
        fires: false,
        reason: `regra sem venda bloqueada: campanha já vendeu (sales=${snap.salesToday}, revenue=${snap.revenueToday.toFixed(2)})`,
        expectedSpend: cap,
        pctAboveExpected: cap > 0 ? (snap.spendToday - cap) / cap : 0,
      };
    }

    const noSaleNeed = typeof t.andNoSaleInLastMinutes === 'number'
      ? t.andNoSaleInLastMinutes
      : Number(t.noSaleMinutes ?? 0);
    if (noSaleNeed > 0 && snap.noSaleInLastMinutes < noSaleNeed) {
      return {
        fires: false,
        reason: `houve venda há ${snap.noSaleInLastMinutes.toFixed(0)}min (< ${noSaleNeed})`,
        expectedSpend: cap,
        pctAboveExpected: cap > 0 ? (snap.spendToday - cap) / cap : 0,
      };
    }
  }

  return {
    fires: true,
    reason: `daily_cap estourado · gasto ${snap.spendToday.toFixed(2)} > ${capLabel}`,
    expectedSpend: cap,
    pctAboveExpected: cap > 0 ? (snap.spendToday - cap) / cap : 0,
  };
}

function evalAcceleration(snap: CampaignSnapshot, rule: PacingRule): TriggerResult {
  const t = rule.trigger_config;
  const pct = t.fiveMinDeltaPct ?? 0.05;
  const threshold = snap.dailyBudgetMajor * pct;
  if (snap.spendLast5Min <= threshold) {
    return { fires: false, reason: `delta5min ${snap.spendLast5Min.toFixed(2)} <= threshold ${threshold.toFixed(2)}` };
  }
  return {
    fires: true,
    reason: `acceleration · gastou ${snap.spendLast5Min.toFixed(2)} em 5min (threshold ${threshold.toFixed(2)})`,
  };
}

function evalGroupHourlyCap(
  _snap: CampaignSnapshot,
  rule: PacingRule,
  groups: BudgetGroup[],
  allSnaps: CampaignSnapshot[],
  rulesByGroup: Map<string, PacingRule[]>,
): TriggerResult {
  if (!rule.budget_group_id) {
    return { fires: false, reason: 'group_hourly_cap sem budget_group_id' };
  }
  const group = groups.find((g) => g.id === rule.budget_group_id);
  if (!group) {
    return { fires: false, reason: `budget_group ${rule.budget_group_id} não encontrado` };
  }

  const groupRules = rulesByGroup.get(group.id) ?? [];
  let groupSpendLastHour = 0;
  for (const s of allSnaps) {
    const isInGroup = groupRules.some((r) => matchesFilter(s, r));
    if (isInGroup) groupSpendLastHour += s.spendLastHour;
  }

  const cap = group.max_spend_per_hour;
  if (groupSpendLastHour <= cap) {
    return { fires: false, reason: `group ${group.name} spend1h ${groupSpendLastHour.toFixed(2)} <= cap ${cap}` };
  }
  return { fires: true, reason: `group "${group.name}" estourou ${groupSpendLastHour.toFixed(2)} > ${cap}/h` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign Hourly Cap — teto MÁXIMO de gasto na última 1h, por campanha.
// Vale 24h. Dispara se QUALQUER limite configurado for excedido.
// Use cases:
//  • R$ absoluto (ex: 550/h)            → trigger_config.maxSpendPerHourBrl
//  • % do daily budget (ex: 15%/h)      → trigger_config.maxPctOfDailyPerHour
// Se ambos estiverem definidos, o gatilho dispara no primeiro limite atingido.
// Se nenhum estiver definido (>0), o evaluator é pulado.
// ─────────────────────────────────────────────────────────────────────────────
function evalCampaignHourlyCap(snap: CampaignSnapshot, rule: PacingRule): TriggerResult {
  const t = rule.trigger_config;
  const absCap = Number(t.maxSpendPerHourBrl ?? 0);
  const pctCap = Number(t.maxPctOfDailyPerHour ?? 0);

  const relativeCap = pctCap > 0 && snap.dailyBudgetMajor > 0
    ? snap.dailyBudgetMajor * (pctCap / 100)
    : 0;

  // Determina o teto efetivo: menor entre os limites configurados (>0).
  const caps: number[] = [];
  if (absCap > 0) caps.push(absCap);
  if (relativeCap > 0) caps.push(relativeCap);

  if (caps.length === 0) {
    return { fires: false, reason: 'campaign_hourly_cap sem maxSpendPerHourBrl nem maxPctOfDailyPerHour configurado' };
  }
  const effectiveCap = Math.min(...caps);

  if (snap.spendLastHour <= effectiveCap) {
    return {
      fires: false,
      reason: `spend1h ${snap.spendLastHour.toFixed(2)} <= cap ${effectiveCap.toFixed(2)} (abs=${absCap}, pct=${pctCap}% → rel=${relativeCap.toFixed(2)})`,
      expectedSpend: effectiveCap,
      pctAboveExpected: 0,
    };
  }

  const breachReason = absCap > 0 && snap.spendLastHour > absCap
    ? `R$ ${snap.spendLastHour.toFixed(2)}/h > teto absoluto R$ ${absCap.toFixed(2)}`
    : `R$ ${snap.spendLastHour.toFixed(2)}/h > ${pctCap}% do daily (R$ ${relativeCap.toFixed(2)})`;

  return {
    fires: true,
    reason: `campaign_hourly_cap estourado · ${breachReason}`,
    expectedSpend: effectiveCap,
    pctAboveExpected: (snap.spendLastHour - effectiveCap) / effectiveCap,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Schedule — dispara 1×/dia no horário BRT configurado.
// Sem condição de gasto/lucro. Útil para "religar tudo às 00:00" ou
// "pausar tudo às 23:00". Use junto com maxFiresPerDay=1.
// Janela de tolerância: 60 min após o horário (caso o cron atrase).
// ─────────────────────────────────────────────────────────────────────────────
function evalDailySchedule(_snap: CampaignSnapshot, rule: PacingRule): TriggerResult {
  const t = rule.trigger_config;
  const m = Number(t.scheduledMinute ?? 0);
  // Suporta múltiplos horários por dia via `scheduledHours: number[]`
  // (ex.: [5, 6] pra rede de segurança). Back-compat: se não vier lista,
  // usa `scheduledHour` único.
  const rawList = (t as { scheduledHours?: unknown }).scheduledHours;
  const hoursFromList = Array.isArray(rawList)
    ? rawList.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0 && v <= 23)
    : [];
  const singleH = Number(t.scheduledHour ?? -1);
  const hours = hoursFromList.length > 0
    ? Array.from(new Set(hoursFromList)).sort((a, b) => a - b)
    : (Number.isFinite(singleH) && singleH >= 0 && singleH <= 23 ? [singleH] : []);
  if (hours.length === 0) {
    return { fires: false, reason: 'daily_schedule sem scheduledHour/scheduledHours configurado' };
  }

  const nowUtc = new Date();
  const brtMs = nowUtc.getTime() - 3 * 60 * 60_000;
  const brtNow = new Date(brtMs);
  const TOLERANCE_MS = 60 * 60_000; // 60 min após o horário ainda dispara
  const lastMs = rule.last_triggered_at ? new Date(rule.last_triggered_at).getTime() : 0;

  // Testa cada janela em ordem. Uma janela dispara se:
  //  (a) agora ∈ [scheduledUtc, scheduledUtc + tolerance]
  //  (b) last_triggered_at < scheduledUtc  → aquela janela ainda não rodou
  const attempts: string[] = [];
  for (const h of hours) {
    const scheduledUtcMs = Date.UTC(
      brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate(), h, m, 0, 0,
    ) + 3 * 60 * 60_000;
    const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (nowUtc.getTime() < scheduledUtcMs) {
      attempts.push(`aguardando ${hhmm} BRT`);
      continue;
    }
    if (nowUtc.getTime() > scheduledUtcMs + TOLERANCE_MS) {
      attempts.push(`${hhmm} BRT janela expirada`);
      continue;
    }
    if (Number.isFinite(lastMs) && lastMs >= scheduledUtcMs) {
      attempts.push(`${hhmm} BRT já disparou`);
      continue;
    }
    // Match: essa janela pode disparar agora.
    break;
  }
  // Se nenhuma janela ativa, retorna com resumo. Caso alguma janela match,
  // caímos fora do loop com break e seguimos pros filtros abaixo.
  const activeWindow = hours.find((h) => {
    const scheduledUtcMs = Date.UTC(
      brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate(), h, m, 0, 0,
    ) + 3 * 60 * 60_000;
    return (
      nowUtc.getTime() >= scheduledUtcMs
      && nowUtc.getTime() <= scheduledUtcMs + TOLERANCE_MS
      && (!Number.isFinite(lastMs) || lastMs < scheduledUtcMs)
    );
  });
  if (typeof activeWindow !== 'number') {
    return { fires: false, reason: attempts.join(' | ') || 'sem janela ativa' };
  }


  // Filtros opcionais (usado pela regra "Religar 10h"):
  //   trigger_config.campaignStatus = 'PAUSED' | 'ACTIVE'
  //   trigger_config.spendThreshold = R$ mínimo gasto hoje
  const requiredStatus = (t as { campaignStatus?: string }).campaignStatus;
  if (requiredStatus && String(_snap.status).toUpperCase() !== String(requiredStatus).toUpperCase()) {
    return { fires: false, reason: `status ${_snap.status} != ${requiredStatus}` };
  }
  const spendMin = Number((t as { spendThreshold?: number }).spendThreshold ?? 0);
  if (spendMin > 0 && _snap.spendToday < spendMin) {
    return { fires: false, reason: `spend ${_snap.spendToday.toFixed(2)} < threshold ${spendMin}` };
  }

  return {
    fires: true,
    reason: `agendamento diário ${String(activeWindow).padStart(2, '0')}:${String(m).padStart(2, '0')} BRT${requiredStatus ? ` · status=${requiredStatus}` : ''}${spendMin > 0 ? ` · spend≥R$${spendMin}` : ''}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hourly Window — dispara enquanto o relógio BRT está dentro da janela
// [hourStart, hourEnd) E o spend acumulado hoje está entre spendBetweenMin
// e spendBetweenMax. Se andNoSale=true, exige noSale há noSaleMinutes.
// Ex.: pausar campanhas que entre 00h-01h estão entre R$50 e R$140 sem venda.
// ─────────────────────────────────────────────────────────────────────────────
function evalHourlyWindow(snap: CampaignSnapshot, rule: PacingRule): TriggerResult {
  const t = rule.trigger_config;
  const hs = Number(t.hourStart ?? -1);
  const he = Number(t.hourEnd ?? -1);
  if (!Number.isFinite(hs) || !Number.isFinite(he) || hs < 0 || he <= hs) {
    return { fires: false, reason: 'hourly_window sem hourStart/hourEnd válidos' };
  }
  const nowBrt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const curH = nowBrt.getUTCHours();
  if (curH < hs || curH >= he) {
    return { fires: false, reason: `fora da janela ${hs}h-${he}h (agora ${curH}h BRT)` };
  }
  const minS = Number(t.spendBetweenMin ?? 0);
  const maxS = Number(t.spendBetweenMax ?? Number.POSITIVE_INFINITY);
  if (snap.spendToday < minS) {
    return { fires: false, reason: `spend ${snap.spendToday.toFixed(2)} < min ${minS}` };
  }
  if (snap.spendToday > maxS) {
    return { fires: false, reason: `spend ${snap.spendToday.toFixed(2)} > max ${maxS}` };
  }
  if (t.andNoSale) {
    const need = Number(t.noSaleMinutes ?? 60);
    if (snap.noSaleInLastMinutes < need) {
      return { fires: false, reason: `houve venda há ${snap.noSaleInLastMinutes.toFixed(0)}min (< ${need})` };
    }
  }
  return {
    fires: true,
    reason: `janela ${hs}h-${he}h · spend ${snap.spendToday.toFixed(2)} ∈ [${minS},${maxS}]${t.andNoSale ? ` · noSale ≥${t.noSaleMinutes}min` : ''}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Profit Threshold — dispara quando (revenue - spend) cruza threshold.
// unit='brl' compara valor absoluto; 'pct' compara margem % sobre spend.
// Threshold positivo: dispara quando profit >= threshold (ex.: lucro +20%).
// Threshold negativo: dispara quando profit <= threshold (ex.: prejuízo -R$905).
// ─────────────────────────────────────────────────────────────────────────────
function evalProfitThreshold(snap: CampaignSnapshot, rule: PacingRule): TriggerResult {
  const t = rule.trigger_config;
  const threshold = Number(t.profitThreshold);
  if (!Number.isFinite(threshold)) {
    return { fires: false, reason: 'profit_threshold sem profitThreshold' };
  }
  if (snap.spendToday <= 0) {
    return { fires: false, reason: 'spend=0, sem dados para calcular profit' };
  }
  const metaTax = snap.spendToday * 0.1215;
  const accountRent = snap.spendToday * 0.055;
  const profitBrl = snap.revenueToday - snap.spendToday - metaTax - accountRent;
  const unit = t.profitThresholdUnit ?? 'brl';
  const actual = unit === 'pct' ? (profitBrl / snap.spendToday) * 100 : profitBrl;
  // Threshold positivo → "lucrou pelo menos X" (>=).
  // Threshold negativo → "prejuízo pior que X" (<=).
  const fires = threshold >= 0 ? actual >= threshold : actual <= threshold;
  if (!fires) {
    return {
      fires: false,
      reason: `profit líquido ${unit}=${actual.toFixed(2)} não cruza threshold ${threshold} (rev ${snap.revenueToday.toFixed(2)} − spend ${snap.spendToday.toFixed(2)} − tax ${metaTax.toFixed(2)} − rent ${accountRent.toFixed(2)})`,
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// Absolute Spend No Sale — dispara quando spendToday (BRL) > spendThreshold
// e (opcionalmente) sem venda há andNoSaleInLastMinutes minutos.
// andNoSaleInLastMinutes = 0 ou ausente → exige zero vendas no dia inteiro.
// ─────────────────────────────────────────────────────────────────────────────
function evalAbsoluteSpendNoSale(snap: CampaignSnapshot, rule: PacingRule): TriggerResult {
  const t = rule.trigger_config;
  const threshold = Number(t.spendThreshold ?? 0);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return { fires: false, reason: 'absolute_spend_no_sale sem spendThreshold válido' };
  }
  if (snap.spendToday <= threshold) {
    return { fires: false, reason: `spend ${snap.spendToday.toFixed(2)} ≤ threshold ${threshold}` };
  }
  const noSaleMin = Number(t.andNoSaleInLastMinutes ?? 0);
  if (noSaleMin > 0) {
    if (snap.noSaleInLastMinutes < noSaleMin) {
      return { fires: false, reason: `houve venda há ${snap.noSaleInLastMinutes.toFixed(0)}min (< ${noSaleMin})` };
    }
  } else {
    // threshold=0 → exige zero vendas no dia
    if (snap.salesToday > 0) {
      return { fires: false, reason: `já vendeu ${snap.salesToday} hoje` };
    }
  }
  return {
    fires: true,
    reason: `spend R$${snap.spendToday.toFixed(2)} > R$${threshold}${noSaleMin > 0 ? ` sem venda há ${noSaleMin}min` : ' sem nenhuma venda hoje'}`,
  };
}

  return {
    fires: true,
    reason: `profit líquido ${unit}=${actual.toFixed(2)} cruzou ${threshold} (rev ${snap.revenueToday.toFixed(2)} − spend ${snap.spendToday.toFixed(2)} − tax ${metaTax.toFixed(2)} − rent ${accountRent.toFixed(2)})`,
  };
}



// ─────────────────────────────────────────────────────────────────────────────
// Extra Conditions — AND adicional ao trigger. Lê trigger_config.extraConditions
// e trigger_config.window ('today' | 'yesterday'). Suporta spend/sales/revenue.
// Ex.: window='yesterday' + [{metric:'spend', op:'>', value:0}] = "gastou ontem".
// ─────────────────────────────────────────────────────────────────────────────
function evalExtraConditions(snap: CampaignSnapshot, rule: PacingRule): TriggerResult {
  const conds = rule.trigger_config.extraConditions;
  if (!conds || conds.length === 0) return { fires: true, reason: 'sem extraConditions' };
  const defaultWindow = rule.trigger_config.window ?? 'today';

  const parts: string[] = [];
  const fmtMetric = (m: string): string => {
    const map: Record<string, string> = { spend: 'Spend', sales: 'Vendas', revenue: 'Receita', cpc: 'CPC', cpa: 'CPA', ctr: 'CTR', roas: 'ROAS', roi: 'ROI', profit: 'Lucro', ic: 'IC' };
    return map[m] ?? m.toUpperCase();
  };
  const fmtVal = (m: string, n: number): string => {
    if (m === 'ic' || m === 'sales') return String(Math.round(n));
    if (m === 'ctr' || (m === 'profit')) return n.toFixed(2);
    if (m === 'roas' || m === 'roi') return n.toFixed(2) + 'x';
    if (m === 'spend' || m === 'revenue' || m === 'cpc' || m === 'cpa') return 'R$' + n.toFixed(2);
    return n.toFixed(2);
  };
  const winLabel = (w: string): string => {
    if (w === 'last_15min' || w === 'last_30min' || w === 'last_60min') return '1h';
    if (w === 'yesterday') return 'ontem';
    return 'dia';
  };

  for (const c of conds) {
    let actual = 0;
    let computed = true;
    const metric = String(c.metric);
    // Override por condição: se a própria condição define window, usa; senão, herda do trigger.
    const window = (c as any).window ?? defaultWindow;
    const isRolling = window === 'last_15min' || window === 'last_30min' || window === 'last_60min';

    const spendVal = isRolling ? snap.spendLastHour : (window === 'yesterday' ? snap.spendYesterday : snap.spendToday);
    const salesVal = isRolling ? snap.salesLastHour : snap.salesToday;
    const revenueVal = isRolling ? snap.revenueLastHour : snap.revenueToday;

    if (metric === 'spend') {
      actual = spendVal;
    } else if (metric === 'sales') {
      actual = salesVal;
    } else if (metric === 'revenue') {
      actual = revenueVal;
    } else if (metric === 'cpc') {
      const clicks = snap.linkClicksToday || 0;
      if (clicks <= 0) { computed = false; }
      else actual = snap.spendToday / clicks;
    } else if (metric === 'cpa') {
      if (salesVal <= 0) { computed = false; }
      else actual = spendVal / salesVal;
    } else if (metric === 'ctr') {
      const imp = snap.impressionsToday || 0;
      if (imp <= 0) { computed = false; }
      else actual = (snap.linkClicksToday / imp) * 100;
    } else if (metric === 'roas') {
      if (spendVal <= 0) { computed = false; }
      else actual = revenueVal / spendVal;
    } else if (metric === 'roi') {
      if (spendVal <= 0) { computed = false; }
      else actual = (revenueVal - spendVal) / spendVal;
    } else if (metric === 'profit') {
      if (c.unit === 'pct') {
        if (spendVal <= 0) { computed = false; }
        else actual = ((revenueVal - spendVal) / spendVal) * 100;
      } else {
        actual = revenueVal - spendVal;
      }
    } else if (metric === 'ic') {
      actual = snap.icToday || 0;
    } else {
      continue;
    }

    if (!computed) {
      return {
        fires: false,
        reason: `extraCondition pulada: ${metric} (${winLabel(window)}) sem base (clicks/imp/spend/sales=0)`,
      };
    }

    const v = Number(c.value);
    let ok = false;
    switch (c.op) {
      case '>': ok = actual > v; break;
      case '>=': ok = actual >= v; break;
      case '<': ok = actual < v; break;
      case '<=': ok = actual <= v; break;
      case '==': case '=': ok = actual === v; break;
      case '!=': ok = actual !== v; break;
      default: ok = false;
    }
    if (!ok) {
      return {
        fires: false,
        reason: `extraCondition falhou: ${metric} (${winLabel(window)}) ${actual.toFixed(2)} ${c.op} ${v}`,
      };
    }
    parts.push(`${fmtMetric(metric)} ${winLabel(window)} ${fmtVal(metric, actual)} ${c.op} ${fmtVal(metric, v)}`);
  }
  return {
    fires: true,
    reason: parts.length > 0 ? parts.join(' · ') : 'extraConditions OK',
  };
}



interface RuleEvalStat {
  ruleId: string;
  ruleName: string;
  operationId: string;
  matchedCampaignIds: Set<string>;
  firedCampaignIds: Set<string>;
  blockedCampaigns: Array<{ campaignId: string; campaignName: string; reason: string }>;
  skipReason: string | null;
  dryRun: boolean;
}

interface EvaluateResult {
  decisions: Decision[];
  evaluatedRuleIds: Set<string>;
  ruleStats: Map<string, RuleEvalStat>;
}

function evaluateRules(args: {
  campaigns: CampaignSnapshot[];
  rules: PacingRule[];
  cooldowns: CooldownRow[];
  groups: BudgetGroup[];
  settings: PacingSettings;
  overrides: Map<string, CampaignOverride>;
  bypassThrottles?: boolean;
  // Map<`${rule_id}::${campaign_id}`, count> de disparos SUCCESS/non-dry-run hoje BRT.
  // Usado só por regras que configuraram maxFiresPerCampaignPerDay. Ausência = 0.
  firesPerCampaignToday?: Map<string, number>;
  // Modo Liga Tudo: força ignorar minSpendYesterdayBrl e força bypassManualLock=false
  // (sticky manual segue bloqueando). Ativado só via chamada manual da UI.
  ligaTudoMode?: boolean;
}): EvaluateResult {
  const { campaigns, rules, cooldowns, groups, settings, overrides, bypassThrottles, firesPerCampaignToday, ligaTudoMode } = args;
  const decisions: Decision[] = [];
  const evaluatedRuleIds = new Set<string>();
  const ruleStats = new Map<string, RuleEvalStat>();
  const nowMs = Date.now();

  const ensureStat = (r: PacingRule): RuleEvalStat => {
    let s = ruleStats.get(r.id);
    if (!s) {
      s = {
        ruleId: r.id,
        ruleName: r.name,
        operationId: r.operation_id,
        matchedCampaignIds: new Set(),
        firedCampaignIds: new Set(),
        blockedCampaigns: [],
        skipReason: null,
        dryRun: settings.dryRunGlobal || r.dry_run,
      };
      ruleStats.set(r.id, s);
    }
    return s;
  };

  // Pré-filtra as regras: aplica gates por-regra (não por-campanha)
  //   - evalEveryMin: pula se a última avaliação foi há menos de N min
  //   - maxFiresPerDay: pula se já atingiu o teto diário (0 = sem limite)
  const eligibleRules: PacingRule[] = [];
  // Hora BRT corrente (UTC-3, sem DST) — usada pra gate de janela ativa.
  const nowBrtHour = ((new Date(nowMs - 3 * 60 * 60_000)).getUTCHours());
  for (const r of rules) {
    if (!r.enabled && !bypassThrottles) {
      ensureStat(r).skipReason = 'disabled';
      continue;
    }

    // Janela horária ativa (BRT). Fora dela, pula sem avaliar.
    // Em simulate/bypassThrottles, ignora janela pra permitir dry-run a qualquer hora.
    const ahStart = r.filter_config?.activeHourStart;
    const ahEnd = r.filter_config?.activeHourEnd;
    if (!bypassThrottles && ahStart != null && ahEnd != null && Number.isFinite(ahStart) && Number.isFinite(ahEnd)) {
      const s = ((Number(ahStart) % 24) + 24) % 24;
      const e = Math.min(24, Math.max(1, Number(ahEnd)));
      // Janela [s, e). Suporta cruzar meia-noite (s > e%24).
      const eMod = e === 24 ? 24 : ((e % 24) + 24) % 24;
      const inWindow = s < eMod
        ? (nowBrtHour >= s && nowBrtHour < eMod)
        : (nowBrtHour >= s || nowBrtHour < eMod);
      if (!inWindow) {
        ensureStat(r).skipReason = `active_hours_window (BRT ${nowBrtHour}h fora de ${s}h–${e}h)`;
        log('info', 'rule skipped — fora da janela horária ativa', {
          ruleId: r.id, nowBrtHour, activeHourStart: s, activeHourEnd: e,
        });
        continue;
      }
    }

    const maxFires = Number(r.action_config?.maxFiresPerDay ?? 0);
    // Reset lógico do fire_count_today quando o último disparo foi em outro dia BRT
    // (evita ficar travado se o cron/reset diário falhar)
    let firesTodayEffective = r.fire_count_today ?? 0;
    if (firesTodayEffective > 0 && r.last_triggered_at) {
      const lastBrtDay = new Date(new Date(r.last_triggered_at).getTime() - 3 * 3600_000)
        .toISOString().slice(0, 10);
      const nowBrtDay = new Date(nowMs - 3 * 3600_000).toISOString().slice(0, 10);
      if (lastBrtDay !== nowBrtDay) firesTodayEffective = 0;
    }
    if (!bypassThrottles && maxFires > 0 && firesTodayEffective >= maxFires) {
      ensureStat(r).skipReason = `max_fires_per_day (${firesTodayEffective}/${maxFires})`;
      log('info', 'rule skipped — maxFiresPerDay atingido', {
        ruleId: r.id, fired: firesTodayEffective, cap: maxFires,
      });
      continue;
    }


    const evalEvery = Number(r.trigger_config?.evalEveryMin ?? 0);
    if (!bypassThrottles && evalEvery > 0 && r.last_evaluated_at) {
      const lastMs = new Date(r.last_evaluated_at).getTime();
      if (Number.isFinite(lastMs) && (nowMs - lastMs) < evalEvery * 60_000) {
        ensureStat(r).skipReason = `eval_every_min (${Math.round((nowMs - lastMs) / 60_000)}/${evalEvery}min)`;
        log('info', 'rule skipped — evalEveryMin ainda no intervalo', {
          ruleId: r.id, evalEvery, sinceMin: Math.round((nowMs - lastMs) / 60_000),
        });
        continue;
      }
    }

    ensureStat(r);
    eligibleRules.push(r);
  }

  const rulesByGroup = new Map<string, PacingRule[]>();
  for (const r of eligibleRules) {
    if (r.budget_group_id) {
      const list = rulesByGroup.get(r.budget_group_id) ?? [];
      list.push(r);
      rulesByGroup.set(r.budget_group_id, list);
    }
  }

  for (const snap of campaigns) {
    // Check global: se há QUALQUER cooldown não-reactivation ativo, pula a campanha inteira.
    // Reactivation locks precisam de check per-rule (só bloqueiam pause/reduce_budget).
    // Manual locks bloqueiam activate por padrão; regras com bypassManualLock=true
    // seguem para o check per-rule e podem religar se passarem filtros/trigger.
    const activeCds = cooldowns.filter((c) =>
      c.campaign_id === snap.campaignId
      && new Date(c.snoozed_until).getTime() > Date.now()
    );
    const hasOtherBlockingCd = activeCds.some((c) =>
      c.set_by !== 'reactivation_lock' && c.set_by !== 'manual' && c.set_by !== 'manual_until'
    );
    const hasManualCd = activeCds.some((c) => c.set_by === 'manual');
    // Se alguma regra elegível declara bypassManualLock OU não é do tipo activate
    // (ex.: increase_budget, reduce_budget, pause), deixa o check per-rule decidir.
    // Guard manual só bloqueia hard-skip quando TODAS as regras elegíveis são de
    // reativação — do contrário perdemos scale/blindagem em campanhas ativas que
    // um dia foram pausadas manualmente.
    const anyRuleBypassesManual = eligibleRules.some((r) => {
      if (ligaTudoMode) return false; // Liga Tudo respeita sticky manual
      if (r.action_config?.bypassManualLock === true) return true;
      const at = resolveActionType(r.action_config);
      return !!at && at !== 'activate';
    });
    if (hasOtherBlockingCd || (hasManualCd && !anyRuleBypassesManual)) {
      decisions.push({ kind: 'skip', campaign: snap, rule: null, reason: 'cooldown ativo', dryRun: true });
      continue;
    }

    let fired = false;
    const ovForCampaign = overrides.get(snap.campaignId);
    const campaignExempt = isCampaignExempt(ovForCampaign, nowMs);

    for (const rule of eligibleRules) {
      if (rule.operation_id && rule.operation_id !== snap.operationId) {
        continue;
      }

      // Per-rule cooldown check: reactivation_lock bloqueia SÓ pause/reduce_budget.
      // Manual lock já bloqueou a campanha inteira acima.
      const ruleActType = resolveActionType(rule.action_config);
      // Em Liga Tudo, forçamos bypassManual=false para MANTER sticky bloqueando.
      const bypassManual = ligaTudoMode ? false : (rule.action_config?.bypassManualLock === true);
      if (isOnCooldown(snap.campaignId, cooldowns, ruleActType, bypassManual)) {
        const stat = ensureStat(rule);
        stat.blockedCampaigns.push({
          campaignId: snap.campaignId,
          campaignName: snap.campaignName,
          reason: ligaTudoMode ? 'pausa manual sticky ativa (liga_tudo respeita sticky)' : 'reactivation_lock ativo (regra de pausa bloqueada 6h)',
        });
        continue;
      }
      // Resolve teto efetivo (ABO-aware) — override > CBO > default da regra
      const target = resolveDailyTarget(snap, rule, overrides);

      if (!matchesFilter(snap, rule, target, ligaTudoMode)) continue;

      // ─── Per-campaign fire cap (opt-in por regra via maxFiresPerCampaignPerDay) ───
      // Diferente de maxFiresPerDay (que é agregado por regra), este limita o número de
      // disparos que ESTA regra pode fazer em CADA campanha individual por dia BRT.
      // Só aplica se o campo estiver setado — não muda comportamento de outras regras.
      const maxFiresPerCampaign = Number(rule.action_config?.maxFiresPerCampaignPerDay ?? 0);
      if (!bypassThrottles && maxFiresPerCampaign > 0 && firesPerCampaignToday) {
        const key = `${rule.id}::${snap.campaignId}`;
        const firedForThisCampaign = firesPerCampaignToday.get(key) ?? 0;
        if (firedForThisCampaign >= maxFiresPerCampaign) {
          const stat = ensureStat(rule);
          stat.matchedCampaignIds.add(snap.campaignId);
          stat.blockedCampaigns.push({
            campaignId: snap.campaignId,
            campaignName: snap.campaignName,
            reason: `max_fires_per_campaign_per_day (${firedForThisCampaign}/${maxFiresPerCampaign})`,
          });
          continue;
        }
      }

      // Bate no filtro → conta como "matched" pra essa regra.
      const stat = ensureStat(rule);
      stat.matchedCampaignIds.add(snap.campaignId);
      // A regra foi de fato avaliada contra esta campanha — conta pro batch update.
      evaluatedRuleIds.add(rule.id);

      // ─── Isenção manual: campanha "queridinha" marcada pra ignorar regras ───
      if (campaignExempt) {
        const until = ovForCampaign?.exemptUntil
          ? ` até ${new Date(ovForCampaign.exemptUntil).toISOString()}`
          : ' (sem expiração)';
        stat.blockedCampaigns.push({
          campaignId: snap.campaignId,
          campaignName: snap.campaignName,
          reason: `isenta por override manual${until}`,
        });
        continue;
      }


      const recordBlocked = (reason: string) => {
        stat.blockedCampaigns.push({
          campaignId: snap.campaignId,
          campaignName: snap.campaignName,
          reason,
        });
      };

      const triggerType = resolveTriggerType(rule.trigger_config);
      if (!triggerType) {
        recordBlocked('trigger type desconhecido');
        log('warn', 'Trigger type desconhecido', { type: rule.trigger_config.type, kind: rule.trigger_config.kind });
        continue;
      }
      const needsTarget = triggerType === 'linear_pacing'
        || triggerType === 'daily_cap'
        || triggerType === 'acceleration';

      if (needsTarget && target === 0) {
        recordBlocked('sem teto diário (CBO ausente e sem default da regra)');
        continue;
      }

      if (triggerType === 'campaign_hourly_cap') {
        const pctCap = Number(rule.trigger_config.maxPctOfDailyPerHour ?? 0);
        if (pctCap > 0 && target === 0) {
          recordBlocked('sem teto diário pra calcular % por hora');
          continue;
        }
      }

      const useResolvedTarget = target > 0 && target !== snap.dailyBudgetMajor
        && (needsTarget || triggerType === 'campaign_hourly_cap');
      const snapForEval: CampaignSnapshot = useResolvedTarget
        ? { ...snap, dailyBudgetMajor: target, dailyBudget: Math.round(target * 100) }
        : snap;

      let result: TriggerResult;
      switch (triggerType) {
        case 'linear_pacing':
          result = evalLinearPacing(snapForEval, rule);
          break;
        case 'daily_cap':
          result = evalDailyCap(snapForEval, rule);
          break;
        case 'acceleration':
          result = evalAcceleration(snapForEval, rule);
          break;
        case 'group_hourly_cap':
          result = evalGroupHourlyCap(snapForEval, rule, groups, campaigns, rulesByGroup);
          break;
        case 'campaign_hourly_cap': {
          // Per-campaign hourly override: substitui maxSpendPerHourBrl SÓ pra essa campanha.
          const hourlyOv = ovForCampaign?.hourlyCapBrlOverride ?? 0;
          const ruleForEval = hourlyOv > 0
            ? { ...rule, trigger_config: { ...rule.trigger_config, maxSpendPerHourBrl: hourlyOv } }
            : rule;
          result = evalCampaignHourlyCap(snapForEval, ruleForEval);
          break;
        }
        case 'daily_schedule':
          result = evalDailySchedule(snapForEval, rule);
          break;
        case 'hourly_window':
          result = evalHourlyWindow(snapForEval, rule);
          break;
        case 'profit_threshold':
          result = evalProfitThreshold(snapForEval, rule);
          break;
        case 'absolute_spend_no_sale':
          result = evalAbsoluteSpendNoSale(snapForEval, rule);
          break;
        case 'metric_threshold': {
          // Trigger genérico baseado APENAS em extraConditions (CPC/CPA/CTR/ROAS/etc).
          // Fires=true sempre — a porta de entrada é a evalExtraConditions abaixo.
          if (!rule.trigger_config.extraConditions || rule.trigger_config.extraConditions.length === 0) {
            result = { fires: false, reason: 'metric_threshold sem extraConditions configuradas' };
            break;
          }
          // Janela horária BRT opcional [hourStart, hourEnd)
          const hsRaw = rule.trigger_config.hourStart;
          const heRaw = rule.trigger_config.hourEnd;
          if (hsRaw != null && heRaw != null) {
            const hs = Number(hsRaw);
            const he = Number(heRaw);
            if (Number.isFinite(hs) && Number.isFinite(he) && he > hs) {
              const nowBrt = new Date(Date.now() - 3 * 60 * 60 * 1000);
              const curH = nowBrt.getUTCHours();
              if (curH < hs || curH >= he) {
                result = { fires: false, reason: `fora da janela ${hs}h-${he}h BRT (agora ${curH}h)` };
                break;
              }
            }
          }
          result = { fires: true, reason: 'metric_threshold delega para extraConditions' };
          break;
        }
        default:
          recordBlocked(`trigger desconhecido (${triggerType})`);
          log('warn', 'Trigger type desconhecido', { type: triggerType });
          continue;
      }

      if (!result.fires) {
        recordBlocked(`trigger não disparou${result.reason ? ': ' + result.reason : ''}`);
        continue;
      }

      const extra = evalExtraConditions(snapForEval, rule);
      if (!extra.fires) {
        recordBlocked(`extraCondition bloqueou: ${extra.reason}`);
        log('debug', 'Regra bloqueada por extraCondition', {
          rule: rule.name,
          campaign: snapForEval.campaignName,
          reason: extra.reason,
        });
        continue;
      }
      // metric_threshold: usa o resumo real das condições em vez da string genérica "delega para extraConditions"
      if (triggerType === 'metric_threshold' && extra.reason && extra.reason !== 'extraConditions OK' && extra.reason !== 'sem extraConditions') {
        result.reason = extra.reason;
      }


      const dry = settings.dryRunGlobal || rule.dry_run;
      const actType = resolveActionType(rule.action_config);
      const kind: Decision['kind'] =
        actType === 'pause' ? 'pause'
        : actType === 'reduce_budget' ? 'reduce_budget'
        : actType === 'increase_budget' ? 'increase_budget'
        : actType === 'activate' ? 'resume'
        : 'alert';

      const dec: Decision = {
        kind,
        campaign: snapForEval,
        rule,
        reason: result.reason,
        expectedSpend: result.expectedSpend,
        pctAboveExpected: result.pctAboveExpected,
        dryRun: dry,
      };

      if (kind === 'reduce_budget' || kind === 'increase_budget') {
        const cap = getMaxDailyBudgetBrl(rule.action_config);
        const currentBudget = snapForEval.dailyBudgetMajor || 0;
        // Baseline própria da regra: se essa regra já setou budget antes nessa campanha,
        // dobramos em cima do valor que ELA deixou, não do valor atual do Meta
        // (que pode ter sido alterado manualmente ou por outra regra).
        const priorCd = cooldowns.find((c) => c.rule_id === rule.id && c.campaign_id === snap.campaignId);
        const ruleBaseline = typeof priorCd?.last_set_budget_brl === 'number' && priorCd.last_set_budget_brl > 0
          ? priorCd.last_set_budget_brl
          : null;
        const baseline = ruleBaseline ?? currentBudget;
        let target: number;
        if (kind === 'reduce_budget') {
          const pct = rule.action_config.reduceBudgetByPct ?? rule.action_config.reducePct ?? 20;
          target = baseline * (1 - pct / 100);
        } else {
          const pct = rule.action_config.increaseBudgetByPct ?? rule.action_config.increasePct ?? 100;
          target = baseline * (1 + pct / 100);
        }
        // Aplica teto absoluto (guard-rail) se configurado
        if (cap !== null && target > cap) {
          dec.reason = `${result.reason} [teto R$ ${cap.toFixed(2)} atingido — de R$ ${baseline.toFixed(2)} → R$ ${cap.toFixed(2)}]`;
          target = cap;
        } else if (ruleBaseline !== null && Math.abs(ruleBaseline - currentBudget) > 0.01) {
          dec.reason = `${result.reason} [baseline própria R$ ${ruleBaseline.toFixed(2)} (Meta atual R$ ${currentBudget.toFixed(2)}) → R$ ${target.toFixed(2)}]`;
        }
        // Se increase e já está no teto, não faz nada (evita chamada inútil)
        if (kind === 'increase_budget' && target <= currentBudget + 0.01) {
          recordBlocked(`increase_budget: budget atual R$ ${currentBudget.toFixed(2)} já >= alvo R$ ${target.toFixed(2)}`);
          continue;
        }
        dec.newDailyBudgetMajor = Math.max(1, target);
      }

      decisions.push(dec);
      stat.firedCampaignIds.add(snap.campaignId);
      fired = true;
      break; // 1 regra por campanha por ciclo
    }

    if (!fired) {
      decisions.push({ kind: 'skip', campaign: snap, rule: null, reason: 'no rule fired', dryRun: true });
    }
  }

  return { decisions, evaluatedRuleIds, ruleStats };
}

// =============================================================================
// 8. PUSHCUT — POST simples com 1 retry
// =============================================================================

async function sendPushcut(url: string, payload: PushcutPayload): Promise<PushcutResult> {
  if (!url) return { sent: false, status: null, response: null, error: 'url vazio' };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await resp.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text };
      }

      if (resp.ok) return { sent: true, status: resp.status, response: parsed };

      log('warn', 'Pushcut respondeu não-2xx', { status: resp.status, attempt });
      if (attempt === 1) {
        return { sent: false, status: resp.status, response: parsed, error: 'non-2xx' };
      }
    } catch (err) {
      log('warn', 'Pushcut falhou (network)', { attempt, err: (err as Error)?.message });
      if (attempt === 1) {
        return { sent: false, status: null, response: null, error: (err as Error)?.message };
      }
    }
  }

  return { sent: false, status: null, response: null, error: 'unknown' };
}

// =============================================================================
// 9. EXECUTOR — aplica decisions: Meta call + log + cooldown + Pushcut + safety
// =============================================================================

interface ExecutorStats {
  paused: number;
  reduced: number;
  alerted: number;
  resumed: number;
  failed: number;
  pushcutSent: number;
  dryRun: number;
}

function buildPushcutPayload(dec: Decision): PushcutPayload {
  const prefix = dec.dryRun ? '[DRY-RUN] ' : '';
  const titles: Record<Decision['kind'], string> = {
    pause: 'Pausa Automatica',
    reduce_budget: 'Reducao de Budget',
    increase_budget: 'Aumento de Budget (Scale)',
    alert: 'Alerta de Pacing',
    resume: 'Reativacao Automatica',
    skip: 'Skip',
  };
  const title = `${prefix}${titles[dec.kind] ?? 'Pacing'}`;
  const ruleTag = dec.rule?.name ? ` · [${dec.rule.name}]` : '';
  const text = `${dec.campaign.campaignName} · ${dec.reason}${ruleTag}`;

  return {
    title,
    text,
    input: 'Pacing Controller',
    customData: {
      campaign_id: dec.campaign.campaignId,
      campaign_name: dec.campaign.campaignName,
      rule_id: dec.rule?.id ?? null,
      rule_name: dec.rule?.name ?? null,
      kind: dec.kind,
      dry_run: dec.dryRun,
      spend_at_action: dec.campaign.spendToday,
      expected_spend: dec.expectedSpend ?? null,
      pct_above_expected: dec.pctAboveExpected ?? null,
    },
  };
}

async function executeOne(
  dec: Decision,
  supabase: SupabaseClient,
  settings: PacingSettings,
  huIds: Set<string>,
): Promise<boolean> {
  if (dec.kind === 'skip') return true;

  const triggeredAt = new Date().toISOString();
  const tokens = pickTokens(dec.campaign.accountId, huIds);

  let success = false;
  let metaResponse: unknown = null;
  let errorMessage: string | null = null;

  // 0) Cooldown PRE-EMPTIVO — grava ANTES da call ao Meta pra evitar race condition
  //    (ciclos podem rodar em paralelo; se gravássemos depois, disparos concorrentes
  //    poderiam dobrar o budget várias vezes seguidas). Também guarda a baseline nova.
  if (!dec.dryRun && (dec.kind === 'pause' || dec.kind === 'reduce_budget' || dec.kind === 'increase_budget' || dec.kind === 'resume') && dec.rule) {
    const cooldownMinutes = dec.rule.action_config.cooldownMinutes ?? dec.rule.action_config.cooldownMin ?? settings.defaultCooldownMinutes;
    const snoozedUntil = new Date(Date.now() + cooldownMinutes * 60_000).toISOString();
    const hardStopHour = dec.rule.action_config.hardStopUntilHourBRT;
    const hasLock = typeof hardStopHour === 'number' && hardStopHour >= 0 && hardStopHour <= 23;
    const newBaseline = (dec.kind === 'reduce_budget' || dec.kind === 'increase_budget')
      ? (dec.newDailyBudgetMajor ?? null)
      : null;
    // Reactivation lock: quando religa, bloqueia TODAS as regras nessa campanha
    // pelo tempo de cooldown (isOnCooldown checa QUALQUER cooldown ativo por campaign_id).
    // Evita loop: campanha religada com IC/venda não é re-pausada pela regra de IC no delay.
    const isReactivation = dec.kind === 'resume';
    const { error: cdPreErr } = await supabase
      .from('pacing_cooldowns')
      .upsert(
        {
          campaign_id: dec.campaign.campaignId,
          rule_id: dec.rule.id,
          operation_id: dec.campaign.operationId ?? dec.rule.operation_id ?? null,
          snoozed_until: snoozedUntil,
          reason: isReactivation ? `🔄 REACTIVATION_LOCK ${cooldownMinutes}min · ${dec.reason}` : dec.reason,
          set_by: isReactivation
            ? ('reactivation_lock' as const)
            : (hasLock ? ('daemon_lock' as const) : ('daemon' as const)),
          locked_until_hour_brt: hasLock ? hardStopHour : null,
          locked_by_rule_id: hasLock ? dec.rule.id : null,
          last_set_budget_brl: newBaseline,
        },
        { onConflict: 'campaign_id,rule_id' },
      );
    if (cdPreErr) {
      log('error', 'Falha ao upsertar pacing_cooldowns (pre) — ação abortada por segurança', { err: cdPreErr.message });
      dec.reason = `🚨 SAFETY: cooldown não foi salvo, ação abortada antes de enviar ao Meta (${cdPreErr.message})`;
      const logRow: ActionLogInsert = {
        rule_id: dec.rule.id,
        operation_id: dec.campaign.operationId ?? dec.rule.operation_id ?? _rootOperationId,
        budget_group_id: dec.rule.budget_group_id ?? null,
        campaign_id: dec.campaign.campaignId,
        campaign_name: dec.campaign.campaignName,
        account_id: dec.campaign.accountId,
        account_name: dec.campaign.accountName ?? null,
        action_type: dec.kind as ActionLogType,
        reason: dec.reason,
        spend_at_action: dec.campaign.spendToday,
        spend_expected: dec.expectedSpend ?? null,
        spend_last_hour: dec.campaign.spendLastHour,
        daily_budget: dec.campaign.dailyBudgetMajor,
        sales_last_hour: dec.campaign.salesLastHour,
        pct_above_expected: dec.pctAboveExpected ?? null,
        dry_run: dec.dryRun,
        success: false,
        meta_response: { skipped: 'cooldown_precheck_failed' },
        error_message: cdPreErr.message,
        pushcut_sent: false,
        pushcut_response: null,
        triggered_at: triggeredAt,
      };
      await supabase.from('pacing_action_log').insert(logRow);
      return false;
    }
  }

  if (!dec.dryRun) {
    // F8.B.6.5.1 — preflight log ANTES de qualquer ação irreversível na Meta.
    if (dec.kind === 'pause' || dec.kind === 'resume' || dec.kind === 'reduce_budget' || dec.kind === 'increase_budget') {
      try {
        await supabase.from('integration_logs').insert({
          integration: 'meta_ads',
          status: 'info',
          operation_id: dec.campaign.operationId ?? dec.rule?.operation_id ?? _rootOperationId ?? null,
          message: JSON.stringify({
            event: 'pacing_action_preflight',
            edge_function: 'pacing-controller',
            action: dec.kind,
            campaign_id: dec.campaign.campaignId,
            campaign_name: dec.campaign.campaignName,
            account_id: dec.campaign.accountId,
            rule_id: dec.rule?.id ?? null,
            token_pool_size: _allMetaTokensMeta.length,
            token_sources: _allMetaTokensMeta.map((m) => m.source),
            via_vault: _allMetaTokensMeta.length > 0 && _allMetaTokensMeta.every((m) => m.source === 'vault'),
          }),
        });
      } catch { /* log preventivo nunca bloqueia ação */ }
    }
    try {
      switch (dec.kind) {
        case 'pause':
          metaResponse = await tryWithTokens(tokens, (token) => pauseCampaign(dec.campaign.campaignId, token));
          break;
        case 'resume':
          metaResponse = await tryWithTokens(tokens, (token) => resumeCampaign(dec.campaign.campaignId, token));
          break;
        case 'reduce_budget':
        case 'increase_budget': {
          let targetBudgetBrl = dec.newDailyBudgetMajor ?? dec.campaign.dailyBudgetMajor;
          const originalTarget = targetBudgetBrl;
          const cap = dec.rule ? getMaxDailyBudgetBrl(dec.rule.action_config) : null;
          const currentBudget = dec.campaign.dailyBudgetMajor ?? 0;

          // === TRAVA DUPLA — HARD SAFETY NET ===
          // (a) Teto absoluto global: mesmo que a regra não tenha teto, nunca passa disso.
          const ABSOLUTE_CEILING_BRL = 20000;
          // (b) Sanidade: nenhum update pode ser > 3× o budget atual (regras 2× têm margem).
          const SANITY_MULT = currentBudget > 0 ? currentBudget * 3 : Infinity;

          let hardBlocked = false;
          let hardBlockReason = '';

          if (originalTarget > ABSOLUTE_CEILING_BRL) {
            hardBlocked = true;
            hardBlockReason = `Target R$ ${originalTarget.toFixed(2)} > teto absoluto R$ ${ABSOLUTE_CEILING_BRL.toFixed(2)}`;
          } else if (originalTarget > SANITY_MULT) {
            hardBlocked = true;
            hardBlockReason = `Target R$ ${originalTarget.toFixed(2)} > 3× budget atual R$ ${currentBudget.toFixed(2)} (sanity check)`;
          }

          if (hardBlocked) {
            // ABORTA envio pra Meta + dispara Pushcut de emergência
            log('error', '🚨 HARD-BLOCK acionado — update abortado', {
              campaign: dec.campaign.campaignName,
              campaignId: dec.campaign.campaignId,
              originalTarget,
              currentBudget,
              cap,
              reason: hardBlockReason,
              ruleId: dec.rule?.id,
              ruleName: dec.rule?.name,
            });
            dec.reason = `🚨 HARD-BLOCK: ${hardBlockReason} [envio ABORTADO]`;
            metaResponse = { hard_blocked: true, reason: hardBlockReason, original_target: originalTarget };
            // Pushcut de emergência (bypass do notification_config — sempre alerta)
            if (settings.pushcutWebhookUrl) {
              try {
                await sendPushcut(settings.pushcutWebhookUrl, {
                  title: '🚨 PACING HARD-BLOCK',
                  text: `Regra "${dec.rule?.name ?? '?'}" tentou setar R$ ${originalTarget.toFixed(2)} em "${dec.campaign.campaignName}" (atual R$ ${currentBudget.toFixed(2)}). ABORTADO. Motivo: ${hardBlockReason}`,
                  input: dec.campaign.campaignId,
                } as PushcutPayload);
              } catch (_e) { /* silencia */ }
            }
            success = false;
            errorMessage = hardBlockReason;
            break;
          }

          // Aplica cap da regra (comportamento normal)
          if (cap !== null && targetBudgetBrl > cap) {
            targetBudgetBrl = cap;
            dec.reason = `${dec.reason} [SAFETY: teto R$ ${cap.toFixed(2)} aplicado antes do envio]`;
            // Alerta informativo (não bloqueia, mas notifica)
            if (settings.pushcutWebhookUrl) {
              try {
                await sendPushcut(settings.pushcutWebhookUrl, {
                  title: '⚠️ Teto de pacing acionado',
                  text: `"${dec.campaign.campaignName}" — target R$ ${originalTarget.toFixed(2)} capado em R$ ${cap.toFixed(2)} (regra "${dec.rule?.name ?? '?'}").`,
                  input: dec.campaign.campaignId,
                } as PushcutPayload);
              } catch (_e) { /* silencia */ }
            }
          }
          const targetNativeMajor = brlToMajor(targetBudgetBrl, dec.campaign.currency, settings);
          const newCents = Math.floor(targetNativeMajor * 100);
          const metaResp = await tryWithTokens(tokens, (token) => updateDailyBudget(dec.campaign.campaignId, newCents, token));
          // enriquecer log com previous/new pra relatório old→new
          metaResponse = {
            ...(metaResp as Record<string, unknown>),
            previous_budget_brl: Number(currentBudget.toFixed(2)),
            new_budget_brl: Number(targetBudgetBrl.toFixed(2)),
            requested_target_brl: Number(originalTarget.toFixed(2)),
            capped: originalTarget > targetBudgetBrl,
          };
          dec.reason = `${dec.reason} · R$ ${currentBudget.toFixed(2)} → R$ ${targetBudgetBrl.toFixed(2)}`;
          break;
        }
        case 'alert':
          metaResponse = { skipped: 'alert_only' };
          break;
      }
      success = true;
    } catch (err) {
      errorMessage = (err as Error)?.message ?? 'unknown';
      metaResponse = {
        error: errorMessage,
        payload: err instanceof MetaApiError ? err.payload : null,
        status: err instanceof MetaApiError ? err.status : null,
      };
      log('error', 'Meta API call falhou', {
        campaign: dec.campaign.campaignName,
        kind: dec.kind,
        err: errorMessage,
        payload: err instanceof MetaApiError ? JSON.stringify(err.payload).slice(0, 600) : undefined,
      });
    }
  } else {
    success = true;
    metaResponse = { dry_run: true };
  }

  // 2) Pushcut — dispara para toda ação executada com sucesso (pause, resume,
  //    increase_budget, reduce_budget) quando a regra tem pushcut=true.
  //    Alertas puros (alert_only) já são enviados no bloco de emergência acima.
  let pushcutSent = false;
  let pushcutResponse: unknown = null;
  const notifKinds: Decision['kind'][] = ['pause', 'resume', 'increase_budget', 'reduce_budget', 'alert'];
  if (
    notifKinds.includes(dec.kind) &&
    success &&
    !dec.dryRun &&
    dec.rule?.notification_config?.pushcut
  ) {
    const result = await sendPushcut(settings.pushcutWebhookUrl, buildPushcutPayload(dec));
    pushcutSent = result.sent;
    pushcutResponse = result;

    // Canal PARALELO: Web Push
    const _pp = buildPushcutPayload(dec);
    // Tipos canônicos usados por push_notification_recipients/notification_templates
    const _typeMap: Record<string, string> = {
      increase_budget: "pacing_scale",
      resume: "pacing_scale",
      pause: "pacing_death",
      reduce_budget: "pacing_off_pace",
      alert: "pacing_off_pace",
    };
    await mirrorToWebPush({
      operation_id: dec.campaign.operationId ?? dec.rule?.operation_id ?? _rootOperationId ?? null,
      notification_type: _typeMap[dec.kind] ?? `pacing_${dec.kind}`,
      title: _pp.title,
      body: _pp.text ?? "",
      url: "/pacing",
      payload: {
        campaign_name: dec.campaign.campaignName,
        campaign_id: dec.campaign.campaignId,
        rule_name: dec.rule?.name ?? null,
        kind: dec.kind,
        reason: dec.reason,
        spend_today: dec.campaign.spendToday ?? null,
        expected_spend: dec.expectedSpend ?? null,
        pct_above_expected: dec.pctAboveExpected ?? null,
        dry_run: dec.dryRun,
      },
    });

  }

  // 3) Insert log (sempre — inclusive dry-run)
  const logRow: ActionLogInsert = {
    rule_id: dec.rule?.id ?? null,
    operation_id: dec.campaign.operationId ?? dec.rule?.operation_id ?? _rootOperationId,
    budget_group_id: dec.rule?.budget_group_id ?? null,
    campaign_id: dec.campaign.campaignId,
    campaign_name: dec.campaign.campaignName,
    account_id: dec.campaign.accountId,
    account_name: dec.campaign.accountName ?? null,
    // increase_budget agora tem tipo próprio no constraint (migration jul/2026)
    action_type: dec.kind as ActionLogType,
    reason: dec.reason,
    spend_at_action: dec.campaign.spendToday,
    spend_expected: dec.expectedSpend ?? null,
    spend_last_hour: dec.campaign.spendLastHour,
    daily_budget: dec.campaign.dailyBudgetMajor,
    sales_last_hour: dec.campaign.salesLastHour,
    pct_above_expected: dec.pctAboveExpected ?? null,
    dry_run: dec.dryRun,
    success,
    meta_response: metaResponse,
    error_message: errorMessage,
    pushcut_sent: pushcutSent,
    pushcut_response: pushcutResponse,
    triggered_at: triggeredAt,
  };

  const { error: logError } = await supabase.from('pacing_action_log').insert(logRow);
  if (logError) log('error', 'Falha ao gravar pacing_action_log', { err: logError.message });

  // 3.5) Atualização otimista do meta_campaign_status — reflete pause/resume na UI
  // IMEDIATAMENTE (sem esperar o próximo sync-campaign-status, que pode levar minutos).
  // Espelha o comportamento do pacing-toggle-campaign (pause manual).
  if (success && !dec.dryRun && (dec.kind === 'pause' || dec.kind === 'resume')) {
    const newStatus = dec.kind === 'pause' ? 'PAUSED' : 'ACTIVE';
    const { error: statusErr } = await supabase
      .from('meta_campaign_status')
      .update({
        status: newStatus,
        effective_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', dec.campaign.campaignId);
    if (statusErr) {
      log('warn', 'Falha ao atualizar meta_campaign_status pós-ação', {
        campaign: dec.campaign.campaignName,
        err: statusErr.message,
      });
    }
  }

  // 4) Cooldown — já gravado pré-emptivamente na etapa 0. Nada a fazer aqui.


  // 5) Atualiza contadores da rule
  if (success && dec.rule) {
    const { error: ruleError } = await supabase
      .from('pacing_rules')
      .update({
        last_triggered_at: triggeredAt,
        fire_count_today: (dec.rule.fire_count_today ?? 0) + 1,
        fire_count_total: (dec.rule.fire_count_total ?? 0) + 1,
      })
      .eq('id', dec.rule.id);

    if (ruleError) log('warn', 'Falha ao atualizar contadores da rule', { ruleId: dec.rule.id, err: ruleError.message });
  }

  log('info', 'decisão executada', {
    campaign: dec.campaign.campaignName,
    kind: dec.kind,
    rule: dec.rule?.name ?? null,
    dryRun: dec.dryRun,
    success,
    pushcutSent,
  });

  return success;
}

async function executeDecisions(
  decisions: Decision[],
  supabase: SupabaseClient,
  settings: PacingSettings,
  huIds: Set<string>,
): Promise<ExecutorStats> {
  const stats: ExecutorStats = {
    paused: 0, reduced: 0, alerted: 0, resumed: 0, failed: 0, pushcutSent: 0, dryRun: 0,
  };

  // Safety: conta somente ações destrutivas AUTOMÁTICAS (com rule_id) na última hora.
  // Não contar manual_pause_guard, resume ou increase_budget: esses eventos inflavam o
  // contador e degradavam PAUSAR IC/VIT-RRT para alert, impedindo pausa + Pushcut.
  let actionsLastHourReal = 0;
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('pacing_action_log')
      .select('id', { count: 'exact', head: true })
      .gte('triggered_at', since)
      .eq('dry_run', false)
      .eq('success', true)
      .in('action_type', ['pause', 'reduce_budget'])
      .not('rule_id', 'is', null);
    if (!error && count !== null) actionsLastHourReal = count;
  } catch (err) {
    log('warn', 'Falha ao contar ações da última hora', { err: (err as Error)?.message });
  }

  const maxActions = settings.maxActionsPerHour;

  for (const dec of decisions) {
    if (dec.kind === 'skip') continue;

    // Safety: se passou do limite, degrada pra alert (não pausa, não reduz budget).
    // increase_budget NÃO é rate-limited: scale up é ação de crescimento, não destrutiva,
    // e travar isso significa deixar de dobrar orçamento em campanha ganhadora.
    if (
      !dec.dryRun &&
      (dec.kind === 'pause' || dec.kind === 'reduce_budget') &&
      actionsLastHourReal >= maxActions
    ) {
      log('warn', 'max_actions_per_hour atingido — degradando pra alert', {
        campaign: dec.campaign.campaignName,
        actionsLastHourReal,
        maxActions,
      });
      dec.kind = 'alert';
      dec.reason = `${dec.reason} [DEGRADED: max_actions_per_hour=${maxActions} atingido]`;
    }

    try {
      const success = await executeOne(dec, supabase, settings, huIds);
      if (!success) {
        stats.failed += 1;
        continue;
      }
      if (dec.dryRun) stats.dryRun += 1;
      switch (dec.kind) {
        case 'pause':
          stats.paused += 1;
          if (!dec.dryRun) actionsLastHourReal += 1;
          break;
        case 'reduce_budget':
          stats.reduced += 1;
          if (!dec.dryRun) actionsLastHourReal += 1;
          break;
        case 'increase_budget':
          stats.reduced += 1;
          break;
        case 'alert':
          stats.alerted += 1;
          break;
        case 'resume':
          stats.resumed += 1;
          break;
      }
    } catch (err) {
      stats.failed += 1;
      log('error', 'executeOne falhou catastrophic', {
        campaign: dec.campaign.campaignName,
        err: (err as Error)?.message,
      });
    }
  }

  return stats;
}

// =============================================================================
// 10. SMART RE-ENABLE — chamado no início de cada ciclo
// =============================================================================

async function smartReEnableCheck(
  supabase: SupabaseClient,
  settings: PacingSettings,
  huIds: Set<string>,
): Promise<number> {
  const nowIso = new Date().toISOString();

  // ─── Cleanup de locks expirados ────────────────────────────────────────
  // Se a hora BRT atual já passou do locked_until_hour_brt, limpa o lock.
  // Importante: NÃO apaga a linha (cooldown pode ainda estar ativo) — só
  // libera os campos de lock pra smart_reenable poder atuar.
  const nowBrtForCleanup = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const curHourBrt = nowBrtForCleanup.getUTCHours();
  const { error: cleanupErr } = await supabase
    .from('pacing_cooldowns')
    .update({ locked_until_hour_brt: null, locked_by_rule_id: null })
    .not('locked_until_hour_brt', 'is', null)
    .lte('locked_until_hour_brt', curHourBrt);
  if (cleanupErr) log('warn', 'cleanup de locks expirados falhou', { err: cleanupErr.message });

  const { data: expired, error } = await supabase
    .from('pacing_cooldowns')
    .select('campaign_id, rule_id, snoozed_until, reason, set_by, locked_until_hour_brt, locked_by_rule_id')
    .lte('snoozed_until', nowIso);

  if (error) {
    log('error', 'Falha ao buscar cooldowns expirados', { err: error.message });
    return 0;
  }
  if (!expired || expired.length === 0) return 0;

  // Conjunto global de campanhas com lock ATIVO (qualquer regra).
  // Cobre cross-rule resume: se Regra A trava com locked_until_hour_brt=9,
  // qualquer cooldown da Regra B na MESMA campanha também não pode religar.
  const lockedCampaigns = new Set<string>();
  const { data: activeLocks } = await supabase
    .from('pacing_cooldowns')
    .select('campaign_id, locked_until_hour_brt')
    .not('locked_until_hour_brt', 'is', null)
    .gt('locked_until_hour_brt', curHourBrt);
  for (const row of (activeLocks ?? []) as Array<{ campaign_id: string; locked_until_hour_brt: number }>) {
    if (row.campaign_id) lockedCampaigns.add(row.campaign_id);
  }

  let resumed = 0;

  const ruleIds = Array.from(new Set(expired.map((c) => c.rule_id).filter(Boolean)));
  const { data: rules } = await supabase
    .from('pacing_rules')
    .select('id, action_config, name, notification_config, budget_group_id')
    .in('id', ruleIds.length > 0 ? ruleIds : ['00000000-0000-0000-0000-000000000000']);

  const rulesById = new Map<string, {
    action_config: RuleActionConfig;
    name: string;
    notification_config: RuleNotificationConfig;
    budget_group_id: string | null;
  }>();
  for (const r of rules ?? []) rulesById.set(r.id, r);

  for (const cd of expired) {
    // ─── Sticky manual pause (manual = 100 anos; manual_until = auto-expira ~05h) ──
    if (cd.set_by === 'manual' || cd.set_by === 'manual_until') continue;

    // ─── Hard lock BRT (cross-rule) ──────────────────────────────────────
    // Se a campanha tem QUALQUER cooldown com lock ativo, NÃO religa por
    // nenhuma regra — nem mesmo via outra rule_id sem lock próprio.
    if (lockedCampaigns.has(cd.campaign_id)) {
      log('info', `lock_ativo: campanha ${cd.campaign_id} travada (cross-rule) até liberar BRT lock. Skip re-enable.`);
      continue;
    }

    const rule = cd.rule_id ? rulesById.get(cd.rule_id) : null;

    const cleanup = async () => {
      await supabase.from('pacing_cooldowns').delete().eq('campaign_id', cd.campaign_id);
    };

    const shouldAutoResume = !!(rule?.action_config?.smartReEnable || rule?.action_config?.autoResume);
    if (!rule || !shouldAutoResume) {
      await cleanup();
      continue;
    }

    if (rule.action_config?.hardStopUntilNextDay) {
      const nowBrt = new Date(Date.now() - 3 * 60 * 60 * 1000);
      if (nowBrt.getUTCHours() < 1) continue; // ainda hoje — espera
    }

    // Workaround: cooldown não tem account_id, então tentamos múltiplos tokens
    // em sequência: global (UI) -> CATALOG -> HU. Para qualquer 400/404/403,
    // cai pro próximo. Sem isso contas fora do split legado nunca retomam.
    try {
      const candidateTokens = [
        ..._allMetaTokens,
        Deno.env.get('META_TOKEN_CATALOG'),
        Deno.env.get('META_TOKEN_HU'),
      ].filter((t): t is string => Boolean(t && t.length > 0));
      // dedup preservando ordem
      const seen = new Set<string>();
      const tokensToTry = candidateTokens.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));

      let statusResp: MetaCampaign | null = null;
      let workingToken: string | null = null;
      let lastErr: unknown = null;
      for (const t of tokensToTry) {
        try {
          statusResp = await getCampaignStatus(cd.campaign_id, t);
          workingToken = t;
          break;
        } catch (errTry) {
          lastErr = errTry;
          if (errTry instanceof MetaApiError && (errTry.status === 400 || errTry.status === 403 || errTry.status === 404)) {
            continue;
          }
          throw errTry;
        }
      }
      if (!statusResp || !workingToken) throw lastErr ?? new Error('nenhum token válido para campanha');


      if (statusResp?.status !== 'PAUSED') {
        await cleanup();
        continue;
      }
      // Fallback: o token que lê pode não ter role de Advertiser pra escrever.
      // Tenta resume em todos os tokens disponíveis, começando pelo que leu.
      const writeTokens = [workingToken, ...tokensToTry.filter((t) => t !== workingToken)];
      await tryWithTokens(writeTokens, (token) => resumeCampaign(cd.campaign_id, token));

      // Atualização otimista do meta_campaign_status — reflete resume na UI IMEDIATAMENTE
      // (sem esperar próximo sync-campaign-status). Espelha o comportamento de pause.
      const { error: statusErr } = await supabase
        .from('meta_campaign_status')
        .update({
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          updated_at: new Date().toISOString(),
        })
        .eq('campaign_id', cd.campaign_id);
      if (statusErr) {
        log('warn', 'smart_reenable: falha ao atualizar meta_campaign_status', {
          campaign: cd.campaign_id,
          err: statusErr.message,
        });
      }

      const logRow: ActionLogInsert = {
        rule_id: cd.rule_id ?? null,
        operation_id: rule.operation_id ?? _rootOperationId,
        budget_group_id: rule.budget_group_id ?? null,
        campaign_id: cd.campaign_id,
        campaign_name: statusResp.name ?? cd.campaign_id,
        account_id: 'unknown',
        account_name: null,
        action_type: 'resume',
        reason: `smart_reenable após cooldown expirado (rule: ${rule.name})`,
        spend_at_action: 0,
        spend_expected: null,
        spend_last_hour: null,
        daily_budget: null,
        sales_last_hour: null,
        pct_above_expected: null,
        dry_run: false,
        success: true,
        meta_response: { resumed: true },
        error_message: null,
        pushcut_sent: false,
        pushcut_response: null,
        triggered_at: nowIso,
      };
      await supabase.from('pacing_action_log').insert(logRow);

      // Pushcut desativado em resume — usuário só quer notificação de PAUSE real.


      await cleanup();
      resumed += 1;
    } catch (err) {
      log('error', 'smart_reenable falhou', { campaignId: cd.campaign_id, err: (err as Error)?.message });
      // não limpa cooldown — tenta de novo no próximo ciclo
    }
  }

  return resumed;
}

async function protectExternallyPausedCampaigns(
  supabase: SupabaseClient,
  campaigns: CampaignSnapshot[],
  cooldowns: CooldownRow[],
): Promise<CooldownRow[]> {
  const now = Date.now();
  const paused = campaigns.filter((c) => (c.status ?? '').toUpperCase() === 'PAUSED');
  if (paused.length === 0) return [];

  const needsProtection = paused.filter((campaign) => {
    const rows = cooldowns.filter((cd) => cd.campaign_id === campaign.campaignId);
    // Trata manual E manual_until como bloqueio manual soberano — se o operador
    // pausou (sticky ou "até 05h BRT"), o guard não deve sobrescrever com sticky de 100 anos.
    const hasManualLock = rows.some((cd) => (cd.set_by === 'manual' || cd.set_by === 'manual_until') && new Date(cd.snoozed_until).getTime() > now);
    if (hasManualLock) return false;

    // Pausa feita por regra ainda em cooldown é uma pausa automática legítima.
    // Nesse caso, as regras de RELIGAR podem continuar obedecendo o fluxo normal.
    const hasAutoPauseCooldown = rows.some((cd) => {
      if (new Date(cd.snoozed_until).getTime() <= now) return false;
      return cd.set_by === 'daemon' || cd.set_by === 'daemon_lock';
    });
    return !hasAutoPauseCooldown;
  });
  if (needsProtection.length === 0) return [];

  const campaignIds = needsProtection.map((c) => c.campaignId);
  const { data: logRows, error: logErr } = await supabase
    .from('pacing_action_log')
    .select('campaign_id, action_type, reason, triggered_at')
    .in('campaign_id', campaignIds)
    .order('triggered_at', { ascending: false })
    .limit(Math.max(1000, campaignIds.length * 5));
  if (logErr) {
    log('warn', 'manual_pause_guard: falha ao consultar action_log', { err: logErr.message });
    return [];
  }

  const latestByCampaign = new Map<string, { action_type: string; reason: string | null; triggered_at: string }>();
  for (const row of (logRows ?? []) as Array<{ campaign_id: string; action_type: string; reason: string | null; triggered_at: string }>) {
    if (!latestByCampaign.has(row.campaign_id)) latestByCampaign.set(row.campaign_id, row);
  }

  const shouldLock = needsProtection.filter((campaign) => {
    const latest = latestByCampaign.get(campaign.campaignId);
    if (!latest) return true;
    if (latest.action_type === 'pause') {
      // Se a última pausa registrada foi automática, não transformamos em manual.
      // Se foi manual/mcp ou texto manual, corrige o lock ausente.
      return /manual|mcp:/i.test(latest.reason ?? '');
    }
    // Ex.: a automação religou, o operador desligou direto na Meta; último log fica "resume".
    return latest.action_type === 'resume' || latest.action_type === 'increase_budget' || latest.action_type === 'reduce_budget';
  });
  if (shouldLock.length === 0) return [];

  const stickyUntil = new Date();
  stickyUntil.setUTCFullYear(stickyUntil.getUTCFullYear() + 100);
  const snoozedUntil = stickyUntil.toISOString();
  const idsToLock = shouldLock.map((c) => c.campaignId);

  await supabase.from('pacing_cooldowns').delete().in('campaign_id', idsToLock);

  const insertedRows = shouldLock.map((campaign) => ({
    campaign_id: campaign.campaignId,
    rule_id: null,
    operation_id: campaign.operationId ?? null,
    snoozed_until: snoozedUntil,
    reason: 'Pausa manual/externa detectada — sticky até religar manualmente (nenhuma regra pode religar)',
    set_by: 'manual' as const,
  }));
  const { error: insertErr } = await supabase.from('pacing_cooldowns').insert(insertedRows);
  if (insertErr) {
    log('error', 'manual_pause_guard: falha ao inserir bloqueios manuais', { err: insertErr.message, count: insertedRows.length });
    return [];
  }

  await supabase.from('pacing_action_log').insert(shouldLock.map((campaign) => ({
    rule_id: null,
    operation_id: campaign.operationId ?? _rootOperationId,
    campaign_id: campaign.campaignId,
    campaign_name: campaign.campaignName,
    account_id: campaign.accountId,
    account_name: campaign.accountName ?? null,
    action_type: 'pause',
    reason: 'Pausa manual/externa detectada — regras automáticas bloqueadas até religar manualmente',
    spend_at_action: campaign.spendToday,
    spend_expected: null,
    spend_last_hour: campaign.spendLastHour,
    daily_budget: campaign.dailyBudgetMajor,
    sales_last_hour: campaign.salesLastHour,
    pct_above_expected: null,
    dry_run: false,
    success: true,
    meta_response: { manual_external_guard: true },
    error_message: null,
    pushcut_sent: false,
    pushcut_response: null,
    triggered_at: new Date().toISOString(),
  })));

  log('warn', 'manual_pause_guard: campanhas pausadas fora do app foram travadas', { count: insertedRows.length });
  return insertedRows;
}

// =============================================================================
// 11. ENTRY POINT — Deno.serve (pg_cron dispara via net.http_post)
// =============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  const startedAt = Date.now();
  log('info', 'Pacing tick iniciado', { startedAt: new Date(startedAt).toISOString() });


  try {
    // Parse body opcional (pg_cron envia { triggered_by, cron_at })
    let payload: {
      triggered_by?: string;
      cron_at?: string;
      dry_run_override?: boolean;
      simulate?: boolean;
      simulate_rule_ids?: string[];
      only_rule_ids?: string[];
      liga_tudo?: boolean;
    } = {};
    try {
      if (req.body) payload = (await req.json()) ?? {};
    } catch {
      // body opcional — ignore parse error
    }
    log('info', 'request payload', { payload });

    const simulateMode = Boolean(payload.simulate);
    const simulateRuleIds = new Set((payload.simulate_rule_ids ?? []).filter(Boolean));
    const onlyRuleIds = new Set((payload.only_rule_ids ?? []).filter(Boolean));
    const ligaTudoMode = Boolean(payload.liga_tudo);
    if (ligaTudoMode && onlyRuleIds.size === 0 && !(simulateMode && simulateRuleIds.size > 0)) {
      return new Response(
        JSON.stringify({ success: false, error: 'liga_tudo requer only_rule_ids (ou simulate_rule_ids em simulate)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = getSupabase();
    const settings = await loadSettings(supabase);
    const huIds = getHuAccountIds();
    // Carrega token global Meta (atualizado via UI) — usado como primário antes
    // do split legado HU/CATALOG. Sem ele, contas fora do split antigo retornam 403.
    await loadGlobalMetaToken(supabase);

    log('info', 'pacing_settings carregadas', {
      dryRunGlobal: settings.dryRunGlobal,
      timezone: settings.timezone,
      defaultCurrency: settings.defaultCurrency,
      simulateMode,
    });

    // 1) Smart re-enable: libera cooldowns expirados que tinham smartReEnable=true
    //    Em modo simulate, NÃO mexemos em cooldowns.
    const resumedCount = simulateMode ? 0 : await smartReEnableCheck(supabase, settings, huIds);
    if (resumedCount > 0) log('info', 'smart_reenable executou', { resumed: resumedCount });

    // 2) Load rules, cooldowns, groups
    let rulesQuery = supabase.from('pacing_rules').select('*');
    if (!simulateMode) rulesQuery = rulesQuery.eq('enabled', true);
    if (simulateMode && simulateRuleIds.size > 0) {
      rulesQuery = rulesQuery.in('id', Array.from(simulateRuleIds));
    }
    if (!simulateMode && onlyRuleIds.size > 0) {
      rulesQuery = rulesQuery.in('id', Array.from(onlyRuleIds));
    }
    const { data: rulesRaw, error: rulesErr } = await rulesQuery;
    if (rulesErr) throw new Error(`pacing_rules query falhou: ${rulesErr.message}`);
    const rules = (rulesRaw ?? []) as PacingRule[];
    log('info', 'rules carregadas', { count: rules.length, simulateMode });

    // Carrega TODOS os cooldowns (não só ativos): precisamos do `last_set_budget_brl`
    // mesmo após cooldown expirar, pra dobrar em cima da baseline da própria regra.
    // `isOnCooldown` continua filtrando por snoozed_until > now.
    const cooldowns = await loadCooldownRows(supabase);

    const { data: groupsRaw, error: groupsErr } = await supabase
      .from('pacing_budget_groups')
      .select('*')
      .eq('enabled', true);
    if (groupsErr) throw new Error(`pacing_budget_groups query falhou: ${groupsErr.message}`);
    const groups = (groupsRaw ?? []) as BudgetGroup[];

    // 3) Resolve quais contas varrer.
    // Importante: regras com account="all" precisam varrer TODAS as contas que
    // possuem campanhas compatíveis com o scope — não só HU/accountIds explícitos.
    const accountsToScanRaw = await resolveAccountsToScan(supabase, rules, huIds);
    
    // F9-DIA3: Refina accountsToScan para apenas aquelas com gasto nos últimos 3 dias
    const cutoff3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: recentSpendIds } = await supabase
      .from('traffic_data')
      .select('account_id')
      .gte('date', cutoff3d)
      .gt('spend', 0);
    
    const accountsWithSpend3d = new Set(recentSpendIds?.map(r => r.account_id) ?? []);
    const accountsToScan = accountsToScanRaw.filter(id => accountsWithSpend3d.has(id.replace(/^act_/, '')));

    log('info', 'scanning accounts (filtered by 3d spend)', { 
      total: accountsToScanRaw.length, 
      withSpend: accountsToScan.length 
    });

    if (accountsToScan.length === 0) {
      log('warn', 'Nenhuma conta pra varrer — verificar HU_TOKEN_ACCOUNT_IDS ou regras com accountIds');
      return new Response(
        JSON.stringify({
          success: true,
          duration_ms: Date.now() - startedAt,
          warning: 'no accounts to scan',
          campaigns_evaluated: 0,
          rules_evaluated: rules.length,
          decisions_made: 0,
          actions_executed: 0,
          dry_run_global: settings.dryRunGlobal,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const normalizedAccountIds = accountsToScan.map((id) => id.replace(/^act_/, ''));
    const accountCurrencies = new Map<string, { currency: string; timezone: string; operationId: string | null }>();
    const { data: accountRows, error: accountErr } = await supabase
      .from('meta_ad_accounts')
      .select('account_id, currency, timezone, operation_id')
      .in('account_id', normalizedAccountIds);
    if (accountErr) log('warn', 'falha ao carregar moedas das contas — assumindo USD', { err: accountErr.message });
    for (const row of (accountRows ?? []) as Array<{ account_id: string; currency: string | null; timezone: string | null; operation_id: string | null }>) {
      accountCurrencies.set(row.account_id, {
        currency: row.currency || 'USD',
        timezone: row.timezone || BRT_TZ,
        operationId: row.operation_id ?? null,
      });
    }

    // 3.5) Carrega overrides por campanha (teto diário + isenção de regras + teto/hora custom)
    const { data: ovRaw, error: ovErr } = await supabase
      .from('campaign_pacing_overrides')
      .select('campaign_id, daily_target_brl, rules_exempt, hourly_cap_brl_override, exempt_until');
    if (ovErr) log('warn', 'falha ao carregar campaign_pacing_overrides', { err: ovErr.message });
    const overrides = new Map<string, CampaignOverride>();
    let exemptCount = 0;
    for (const row of (ovRaw ?? []) as Array<{
      campaign_id: string;
      daily_target_brl: number | null;
      rules_exempt: boolean | null;
      hourly_cap_brl_override: number | null;
      exempt_until: string | null;
    }>) {
      const dt = Number(row.daily_target_brl ?? 0);
      const hourly = Number(row.hourly_cap_brl_override ?? 0);
      const exempt = Boolean(row.rules_exempt);
      const until = row.exempt_until ? Date.parse(row.exempt_until) : null;
      if (dt <= 0 && hourly <= 0 && !exempt) continue;
      overrides.set(row.campaign_id, {
        dailyTargetBrl: dt > 0 ? dt : 0,
        rulesExempt: exempt,
        hourlyCapBrlOverride: hourly > 0 ? hourly : 0,
        exemptUntil: Number.isFinite(until as number) ? (until as number) : null,
      });
      if (exempt) exemptCount += 1;
    }
    log('info', 'overrides carregados', { count: overrides.size, exempt: exemptCount });


    // 4) Fetch campanhas + insights (multi-token, paralelo)
    // Se alguma regra ativa exige campanhas pausadas/qualquer, ampliamos o fetch da Meta API.
    const needsPaused = rules.some((r) => {
      const at = (r.filter_config?.appliesTo ?? 'active') as AppliesTo;
      return at === 'paused' || at === 'any';
    });
    let campaigns = await fetchAllActiveCampaigns(
      accountsToScan, huIds, settings, accountCurrencies, needsPaused,
    );
    campaigns = applyAuthoritativeSales(
      campaigns,
      await loadAuthoritativeSalesByCampaign(supabase, todayBrt()),
    );
    // Opção A — fallback RT p/ janela rolling (last_60min) quando meta_campaign_id
    // não bate mas utm_campaign casa com o nome da campanha
    campaigns = applyRtLastHourFallback(
      campaigns,
      await loadRtLastHourFallback(supabase, campaigns),
    );
    log('info', 'campanhas encontradas', { count: campaigns.length, includePaused: needsPaused });
    if (!simulateMode) await persistCampaignHourlySnapshots(supabase, campaigns);

    // 4.4) MANUAL/EXTERNAL PAUSE GUARD — se a campanha aparece PAUSED no Meta
    // mas não há cooldown automático ativo explicando a pausa, tratamos como
    // decisão manual/externa do operador e bloqueamos TODAS as regras de RELIGAR.
    if (!simulateMode) {
      const manualGuardRows = await protectExternallyPausedCampaigns(supabase, campaigns, cooldowns);
      cooldowns.push(...manualGuardRows);
    }

    // 4.5) STALE COOLDOWN HEALING — se a campanha está ACTIVE no Meta mas tem
    // cooldown não-manual ainda válido (ex.: paused pela regra CPA-ALVO com 24h
    // de cooldown, e o operador religou fora da UI), o cooldown é resíduo. Sem
    // limpar, a regra horária pula a campanha (`cooldown ativo`) e nunca pausa
    // mesmo com gasto/hora estourado. Manual pauses (`set_by='manual'`) NÃO
    // são limpos — pausa manual sticky permanece intocada.
    if (!simulateMode && cooldowns.length > 0) {
      const activeCampaignIds = new Set(
        campaigns
          .filter((c) => (c.status ?? '').toUpperCase() === 'ACTIVE')
          .map((c) => c.campaignId),
      );
      const staleCampaignIds: string[] = [];
      for (const cd of cooldowns) {
        if (cd.set_by === 'manual') continue;
        // Reactivation locks NUNCA são limpos aqui — precisamos que outras regras
        // (ex.: IC pause) fiquem bloqueadas pelas 6h completas mesmo com a campanha ACTIVE.
        if (cd.set_by === 'reactivation_lock') continue;
        // manual_until (pausa manual até 05h BRT) precisa sobreviver enquanto snoozed_until
        // for válido. Se o operador religar manual, o toggle limpa; se ATIVAR|TOP religar,
        // aqui apagaríamos o cooldown residual — mas é seguro deixar o TTL natural expirar
        // (não bloqueia activate). Preservamos pra não perder o histórico do bloqueio.
        if (cd.set_by === 'manual_until') continue;
        // Cooldowns de mudança de budget usam last_set_budget_brl como baseline
        // da próxima execução. Nunca apagar aqui, senão a regra volta a rodar
        // a cada ciclo do cron e perde a trava de 60min.
        if (typeof cd.last_set_budget_brl === 'number' && cd.last_set_budget_brl > 0) continue;
        if (activeCampaignIds.has(cd.campaign_id)) staleCampaignIds.push(cd.campaign_id);
      }
      if (staleCampaignIds.length > 0) {
        const uniq = Array.from(new Set(staleCampaignIds));
        const { error: delErr } = await supabase
          .from('pacing_cooldowns')
          .delete()
          .in('campaign_id', uniq)
          .not('set_by', 'in', '(manual,manual_until,reactivation_lock)');
        if (delErr) {
          log('warn', 'stale_cooldown cleanup falhou', { err: delErr.message, count: uniq.length });
        } else {
          log('info', 'stale_cooldown limpos (campanha ACTIVE com cooldown daemon residual)', { count: uniq.length });
          // Remove do array em memória pra liberar a avaliação JÁ neste ciclo.
          for (let i = cooldowns.length - 1; i >= 0; i -= 1) {
            const cd = cooldowns[i];
            if (
              cd.set_by !== 'manual'
              && cd.set_by !== 'manual_until'
              && cd.set_by !== 'reactivation_lock'
              && !(typeof cd.last_set_budget_brl === 'number' && cd.last_set_budget_brl > 0)
              && uniq.includes(cd.campaign_id)
            ) {
              cooldowns.splice(i, 1);
            }
          }
        }
      }
    }


    // 5) Evaluate rules → decisions (pure)
    const effectiveSettings: PacingSettings = {
      ...settings,
      // Em modo simulate, força dry-run global pra garantir 0 side-effect na Meta API.
      dryRunGlobal: settings.dryRunGlobal || Boolean(payload.dry_run_override) || simulateMode,
    };
    // Preload de disparos por (rule, campanha) hoje BRT — SÓ se alguma regra opt-in.
    // Query barata (index em triggered_at recomendado); no-op quando nenhuma regra usa.
    let firesPerCampaignToday: Map<string, number> | undefined;
    const needsPerCampaignFireCount = rules.some(
      (r) => Number(r.action_config?.maxFiresPerCampaignPerDay ?? 0) > 0,
    );
    if (needsPerCampaignFireCount) {
      // BRT midnight = UTC 03:00 do dia corrente BRT
      const brtNow = new Date(Date.now() - 3 * 3600_000);
      const brtMidnightIso = `${brtNow.toISOString().slice(0, 10)}T03:00:00.000Z`;
      const optInRuleIds = rules
        .filter((r) => Number(r.action_config?.maxFiresPerCampaignPerDay ?? 0) > 0)
        .map((r) => r.id);
      const { data: firesRaw, error: firesErr } = await supabase
        .from('pacing_action_log')
        .select('rule_id, campaign_id')
        .in('rule_id', optInRuleIds)
        .gte('triggered_at', brtMidnightIso)
        .eq('success', true)
        .eq('dry_run', false);
      if (firesErr) {
        log('warn', 'Falha ao carregar fires por campanha — trava per-campaign desabilitada neste ciclo', { err: firesErr.message });
      } else {
        firesPerCampaignToday = new Map();
        for (const row of (firesRaw ?? []) as Array<{ rule_id: string; campaign_id: string }>) {
          const key = `${row.rule_id}::${row.campaign_id}`;
          firesPerCampaignToday.set(key, (firesPerCampaignToday.get(key) ?? 0) + 1);
        }
        log('info', 'fires per (rule,campaign) preloaded', {
          rulesOptIn: optInRuleIds.length,
          entries: firesPerCampaignToday.size,
        });
      }
    }

    const { decisions, evaluatedRuleIds, ruleStats } = evaluateRules({
      campaigns, rules, cooldowns, groups, settings: effectiveSettings, overrides,
      bypassThrottles: simulateMode || ligaTudoMode,
      firesPerCampaignToday,
      ligaTudoMode,
    });

    const nowIso = new Date().toISOString();

    // 5.0) Modo SIMULATE: retorna diagnóstico cru e NÃO mexe em nada.
    if (simulateMode) {
      const simResult = Array.from(ruleStats.values()).map((s) => ({
        rule_id: s.ruleId,
        rule_name: s.ruleName,
        skip_reason: s.skipReason,
        campaigns_matched: s.matchedCampaignIds.size,
        campaigns_fired: s.firedCampaignIds.size,
        campaigns_blocked: s.blockedCampaigns.length,
        matched_campaign_ids: Array.from(s.matchedCampaignIds),
        fired_campaign_ids: Array.from(s.firedCampaignIds),
        blocked: s.blockedCampaigns,
      }));
      const fireDecisions = decisions
        .filter((d) => d.kind !== 'skip')
        .map((d) => ({
          kind: d.kind,
          rule_id: d.rule?.id ?? null,
          rule_name: d.rule?.name ?? null,
          campaign_id: d.campaign.campaignId,
          campaign_name: d.campaign.campaignName,
          account_id: d.campaign.accountId,
          reason: d.reason,
          spend_today: d.campaign.spendToday,
          daily_budget: d.campaign.dailyBudgetMajor,
        }));
      return new Response(
        JSON.stringify({
          success: true,
          simulate: true,
          duration_ms: Date.now() - startedAt,
          campaigns_evaluated: campaigns.length,
          rules_evaluated: rules.length,
          would_fire: fireDecisions,
          rule_stats: simResult,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // 5.1) Marca last_evaluated_at para todas as regras que rodaram contra ao menos 1 campanha.
    if (evaluatedRuleIds.size > 0) {
      const { error: evalErr } = await supabase
        .from('pacing_rules')
        .update({ last_evaluated_at: nowIso })
        .in('id', Array.from(evaluatedRuleIds));
      if (evalErr) log('warn', 'falha ao atualizar last_evaluated_at', { err: evalErr.message });
      else log('info', 'last_evaluated_at atualizado', { count: evaluatedRuleIds.size });
    }

    // 5.2) Grava pacing_evaluation_log — 1 linha por regra processada nesse ciclo.
    //      Isso dá visibilidade no histórico mesmo quando nenhuma regra disparou.
    if (ruleStats.size > 0) {
      const evalRows = Array.from(ruleStats.values()).map((s) => ({
        rule_id: s.ruleId,
        rule_name: s.ruleName,
        operation_id: s.operationId,
        evaluated_at: nowIso,
        campaigns_matched: s.matchedCampaignIds.size,
        campaigns_fired: s.firedCampaignIds.size,
        campaigns_blocked: s.blockedCampaigns.length,
        skip_reason: s.skipReason,
        campaign_ids: Array.from(s.matchedCampaignIds),
        blocked_details: s.blockedCampaigns,
        dry_run: s.dryRun,
      }));
      const { error: logErr } = await supabase.from('pacing_evaluation_log').insert(evalRows);
      if (logErr) log('warn', 'falha ao gravar pacing_evaluation_log', { err: logErr.message });
      else log('info', 'pacing_evaluation_log gravado', { rows: evalRows.length });
    }

    const acting = decisions.filter((d) => d.kind !== 'skip');
    log('info', 'decisions calculadas', {
      total: decisions.length,
      acting: acting.length,
      pause: acting.filter((d) => d.kind === 'pause').length,
      reduce: acting.filter((d) => d.kind === 'reduce_budget').length,
      increase: acting.filter((d) => d.kind === 'increase_budget').length,
      resume: acting.filter((d) => d.kind === 'resume').length,
      alert: acting.filter((d) => d.kind === 'alert').length,
    });

    // 6) Execute
    const stats = await executeDecisions(decisions, supabase, effectiveSettings, huIds);

    const durationMs = Date.now() - startedAt;
    log('info', 'ciclo completo', {
      durationMs,
      durationSec: Math.round(durationMs / 1000),
      campaigns: campaigns.length,
      rules: rules.length,
      decisions: decisions.length,
      stats,
      resumedSmart: resumedCount,
    });

    // Relatório extra em modo Liga Tudo — inclui nomes de campanhas e motivos de bloqueio.
    let ligaTudoReport: unknown = undefined;
    if (ligaTudoMode) {
      const attempted = decisions
        .filter((d) => d.kind !== 'skip')
        .map((d) => ({
          kind: d.kind,
          rule_id: d.rule?.id ?? null,
          rule_name: d.rule?.name ?? null,
          campaign_id: d.campaign.campaignId,
          campaign_name: d.campaign.campaignName,
          account_id: d.campaign.accountId,
          reason: d.reason,
        }));
      const ruleReport = Array.from(ruleStats.values()).map((s) => ({
        rule_id: s.ruleId,
        rule_name: s.ruleName,
        campaigns_matched: s.matchedCampaignIds.size,
        campaigns_fired: s.firedCampaignIds.size,
        campaigns_blocked: s.blockedCampaigns.length,
        blocked: s.blockedCampaigns, // {campaignId, campaignName, reason}
      }));
      ligaTudoReport = { attempted, rule_stats: ruleReport };
    }

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: durationMs,
        campaigns_evaluated: campaigns.length,
        rules_evaluated: rules.length,
        decisions_made: decisions.length,
        actions_executed: stats.paused + stats.reduced + stats.alerted + stats.resumed,
        stats,
        resumed_smart: resumedCount,
        dry_run_global: effectiveSettings.dryRunGlobal,
        liga_tudo_report: ligaTudoReport,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    log('error', 'Falha catastrófica no ciclo', { err: message, stack: (err as Error)?.stack });

    // Pushcut em falha catastrófica desativado — usuário só quer alerta de PAUSE real.


    return new Response(
      JSON.stringify({ success: false, error: message, duration_ms: Date.now() - startedAt }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
