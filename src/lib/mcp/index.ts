import { createClient } from "@supabase/supabase-js";
import { auth, defineMcp, defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "taeduxiandktefcwgspx";

function backendAdmin() {
  const denoEnv = (globalThis as unknown as { Deno?: { env: { get(name: string): string | undefined } } }).Deno?.env;
  const url = denoEnv?.get("SUPABASE_URL") ?? import.meta.env.VITE_SUPABASE_URL;
  const key = denoEnv?.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Backend environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getTodayBRT() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const healthCheckTool = defineTool({
  name: "health_check",
  title: "Health Check",
  description: "Check if the Traffic OS MCP server is responding.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => ({ content: [{ type: "text", text: "OK" }] }),
});

const getDashboardSnapshotTool = defineTool({
  name: "get_dashboard_snapshot",
  title: "Get Dashboard Performance Snapshot",
  description: "Returns today's authoritative Traffic OS totals and recent pacing alerts.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const backend = backendAdmin();
    const today = getTodayBRT();
    try {
      const { data: totals, error: totalsError } = await backend.functions.invoke("dashboard-totals", {
        body: { start: today, end: today },
      });
      if (totalsError) throw totalsError;
      const { data: alerts } = await backend
        .from("meta_pacing_audit")
        .select("action, entity_name, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      const snapshot = {
        date_brt: today,
        metrics: {
          spend_brl: totals?.totalSpend ?? 0,
          revenue_brl: totals?.totalRevenue ?? 0,
          roas: totals?.roas ?? 0,
          sales: totals?.totalConversions ?? 0,
        },
        recent_alerts: alerts ?? [],
      };
      return { content: [{ type: "text", text: JSON.stringify(snapshot) }], structuredContent: snapshot };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  },
});

const getTodayTotalsTool = defineTool({
  name: "get_today_totals",
  title: "Get Today Totals",
  description: "Alias for get_dashboard_snapshot.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_, ctx) => getDashboardSnapshotTool.handler({}, ctx),
});

const listAdAccountsTool = defineTool({
  name: "list_ad_accounts",
  title: "List Meta Ad Accounts",
  description: "List Meta ad accounts linked to Traffic OS.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const { data, error } = await backendAdmin()
      .from("meta_accounts")
      .select("account_id, name, status, currency, timezone_name")
      .order("name");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }], structuredContent: { accounts: data ?? [] } };
  },
});

const listCreativesTool = defineTool({
  name: "list_creatives",
  title: "List Meta Creatives Performance",
  description: "Returns aggregated performance metrics per creative [AD##] for the last 30 days.",
  inputSchema: {
    min_spend: z.number().optional().describe("Minimum spend in BRL"),
    limit: z.number().int().min(1).max(200).optional().default(50).describe("Maximum results"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ min_spend, limit }) => {
    let query = backendAdmin()
      .from("meta_creatives_performance")
      .select("*")
      .order("spend_brl", { ascending: false })
      .limit(limit);
    if (min_spend !== undefined) query = query.gt("spend_brl", min_spend);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }], structuredContent: { creatives: data ?? [] } };
  },
});

const getCreativeByCodeTool = defineTool({
  name: "get_creative_by_code",
  title: "Get Creative Detail by Code",
  description: "Returns detailed metrics for a creative ID such as AD125.",
  inputSchema: { ad_code: z.string().min(1).describe("Creative code, for example AD125") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ ad_code }) => {
    const cleanCode = ad_code.replace(/[\[\]]/g, "").toUpperCase();
    const { data, error } = await backendAdmin()
      .from("meta_creatives_performance")
      .select("*")
      .eq("ad_code", cleanCode)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: `Creative ${cleanCode} not found.` }] };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { creative: data } };
  },
});

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function nestedValue(payload: unknown, keys: string[]): unknown {
  if (!payload || typeof payload !== "object") return null;
  const queue: object[] = [payload];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    const record = node as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") queue.push(value as object);
    }
  }
  return null;
}

function encodeCursor(createdAt: string, id: string): string {
  return btoa(`${createdAt}|${id}`).replace(/=+$/, "");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const decoded = atob(cursor + "===".slice((cursor.length + 3) % 4));
    const separator = decoded.lastIndexOf("|");
    if (separator < 1) return null;
    const createdAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    if (!isoOrNull(createdAt) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export const SERVICE_PRINCIPAL_PREFIX = "service:";

async function canReadOperation(userId: string, operationId: string) {
  const backend = backendAdmin();
  if (userId.startsWith(SERVICE_PRINCIPAL_PREFIX)) {
    const allowedOperation = userId.slice(SERVICE_PRINCIPAL_PREFIX.length);
    const { data: operation } = await backend.from("operations").select("id").eq("id", operationId).maybeSingle();
    return { exists: Boolean(operation), allowed: allowedOperation === operationId };
  }
  const [{ data: operation }, { data: admin }, { data: membership }] = await Promise.all([
    backend.from("operations").select("id").eq("id", operationId).maybeSingle(),
    backend.from("super_admins").select("user_id, is_restricted").eq("user_id", userId).maybeSingle(),
    backend
      .from("operation_members")
      .select("operation_id")
      .eq("operation_id", operationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  return { exists: Boolean(operation), allowed: Boolean((admin && !admin.is_restricted) || membership) };
}

function dateOnly(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

const PROGRAM_COUNTRY: Array<[RegExp, string]> = [
  [/tchec|czech|\bcz\b/i, "CZ"],
  [/polon|poland|polska|\bpl\b/i, "PL"],
  [/romen|romani|\bro\b/i, "RO"],
  [/hungr|hungar|\bhu\b/i, "HU"],
  [/eslovaq|slovak|\bsk\b/i, "SK"],
  [/bulgar|\bbg\b/i, "BG"],
];

export function countryFromProgram(program: unknown): string | null {
  if (!program) return null;
  const text = String(program);
  for (const [pattern, code] of PROGRAM_COUNTRY) if (pattern.test(text)) return code;
  return null;
}


const listOrdersTool = defineTool({
  name: "list_orders",
  title: "List COD Affiliate Orders",
  description: "Lists webhook-received Sphere/Fahto COD orders for one operation, newest first, using opaque cursor pagination. Filters combine with AND. delivered_date is a calendar date (no time).",
  inputSchema: {
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Required UTC start date, YYYY-MM-DD"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Required UTC end date, YYYY-MM-DD"),
    operation_id: z.string().uuid().describe("Required operation UUID"),
    platform: z.enum(["sphere", "fahto", "all"]).optional().default("all"),
    status: z.enum(["paid", "pending", "refused", "expired", "delivered", "all"]).optional().default("all"),
    program: z.string().min(1).optional().describe("Exact program id / slug, case-insensitive (AND filter)"),
    cursor: z.string().optional().describe("Opaque cursor returned by the previous page"),
    limit: z.number().int().min(1).max(200).optional().default(100),
    include_total: z.boolean().optional().default(true),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, operation_id, platform, status, program, cursor, limit, include_total }, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "401 unauthenticated" }], isError: true };
    if (from > to) return { content: [{ type: "text", text: "400 from must not be after to" }], isError: true };

    const access = await canReadOperation(userId, operation_id);
    if (!access.exists) return { content: [{ type: "text", text: "404 operation_not_found" }], isError: true };
    if (!access.allowed) return { content: [{ type: "text", text: "403 operation_access_denied" }], isError: true };

    const statusMap: Record<string, string[]> = {
      paid: ["paid", "commission_approved", "approved"],
      pending: ["pending", "created", "processing"],
      refused: ["refused", "cancelled", "canceled", "rejected"],
      expired: ["expired"],
      delivered: ["delivered", "entregue"],
    };
    const platformMap: Record<string, string[]> = { sphere: ["sphere", "shphere"], fahto: ["fahto"] };
    const backend = backendAdmin();
    const startIso = `${from}T00:00:00.000Z`;
    const endIso = `${to}T23:59:59.999Z`;
    const programFilter = program?.trim();
    const applyFilters = (query: any) => {
      let filtered = query
        .eq("operation_id", operation_id)
        .eq("received_via", "webhook")
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      if (platform !== "all") filtered = filtered.in("platform", platformMap[platform]);
      if (status !== "all") filtered = filtered.in("status", statusMap[status]);
      if (programFilter) {
        const escaped = programFilter.replace(/[,()]/g, "");
        filtered = filtered.or(
          `program_id.ilike.${escaped},raw_payload->afiliado->>programa_id.ilike.${escaped}`,
        );
      }
      return filtered;
    };


    let total: number | undefined;
    if (include_total) {
      const { count, error } = await applyFilters(backend.from("cod_orders").select("id", { count: "exact", head: true }));
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      total = count ?? 0;
    }

    let query = applyFilters(backend.from("cod_orders").select(
      "id, platform, webhook_endpoint_slug, operation_id, status, created_at, paid_at, refused_at, expired_at, cancelled_at, delivery_date, product_name, product_key, program_id, country_code, customer_country, order_value, commission_value, commission_currency, raw_payload",
    ));
    if (cursor) {
      const parsed = decodeCursor(cursor);
      if (!parsed) return { content: [{ type: "text", text: "400 invalid_cursor" }], isError: true };
      query = query.or(`created_at.lt.${parsed.createdAt},and(created_at.eq.${parsed.createdAt},id.lt.${parsed.id})`);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.map((row) => {
      const payload = row.raw_payload;
      const nestedCommission = nestedValue(payload, ["commission", "comissao"]);
      const nestedCommissionRecord = nestedCommission && typeof nestedCommission === "object"
        ? nestedCommission as Record<string, unknown>
        : null;
      const commissionValue = row.commission_value
        ?? nestedValue(payload, ["commission_value", "comissao_valor"])
        ?? nestedCommissionRecord?.value
        ?? nestedCommissionRecord?.valor
        ?? null;
      const commissionCurrency = row.commission_currency
        ?? nestedCommissionRecord?.currency
        ?? nestedCommissionRecord?.moeda
        ?? null;
      const rawPlatform = String(row.platform ?? "").toLowerCase();
      const programId = (row.program_id ?? nestedValue(payload, ["program", "programa_id", "programa"])) as string | null;

      return {
        order_id: row.id,
        platform: rawPlatform === "shphere" ? "sphere" : rawPlatform || null,
        endpoint_slug: row.webhook_endpoint_slug ?? null,
        operation_id: row.operation_id,
        status: row.status,
        created_at: isoOrNull(row.created_at),
        paid_at: isoOrNull(row.paid_at),
        refused_at: isoOrNull(row.refused_at ?? row.cancelled_at),
        expired_at: isoOrNull(row.expired_at),
        delivered_date: dateOnly(row.delivery_date),
        product: row.product_name ?? row.product_key ?? null,
        program: programId,
        country: row.country_code ?? row.customer_country ?? countryFromProgram(programId) ?? null,

        currency: nestedValue(payload, ["currency", "moeda"]),
        amount: row.order_value === null || row.order_value === undefined ? null : Number(row.order_value),
        commission: {
          value: commissionValue === null || commissionValue === "" ? null : Number(commissionValue),
          currency: commissionCurrency === null || commissionCurrency === "" ? null : String(commissionCurrency),
        },
        clickid: nestedValue(payload, ["clickid", "click_id", "sub1"]),
        utm_campaign: nestedValue(payload, ["utm_campaign", "campaign"]),
      };
    });
    const last = page.at(-1);
    const response: Record<string, unknown> = {
      items,
      next_cursor: hasMore && last ? encodeCursor(new Date(last.created_at).toISOString(), last.id) : null,
      generated_at: new Date().toISOString(),
    };
    if (include_total) response.total = total;
    return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
  },
});

function deprecatedTool(name: string) {
  return defineTool({
    name,
    title: name,
    description: "Deprecated tool. Use the current aggregated Traffic OS tools instead.",
    inputSchema: {},
    handler: async () => ({
      content: [{ type: "text", text: "This tool is deprecated. Use list_orders, list_creatives, get_dashboard_snapshot, list_ad_accounts, or get_creative_by_code." }],
    }),
  });
}

export default defineMcp({
  name: "traffic-os-mcp",
  title: "TRAFFIC OS",
  version: "0.7.0",
  instructions: "Official Traffic OS MCP server. list_orders is the authoritative tool for webhook-received COD affiliate orders.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: ["authenticated"],
    requireOAuthClientClaim: false,
  }),
  tools: [
    healthCheckTool,
    getTodayTotalsTool,
    getDashboardSnapshotTool,
    listCreativesTool,
    getCreativeByCodeTool,
    listAdAccountsTool,
    listOrdersTool,
    deprecatedTool("list_accounts"),
    deprecatedTool("list_ads"),
    deprecatedTool("list_adsets"),
    deprecatedTool("list_campaigns"),
    deprecatedTool("list_kill_events"),
    deprecatedTool("list_pacing_rules"),
    deprecatedTool("list_scale_events"),
    deprecatedTool("get_ad_insights"),
    deprecatedTool("get_campaign_insights"),
    deprecatedTool("get_pacing_status"),
    deprecatedTool("adjust_campaign_budget"),
    deprecatedTool("pause_campaign"),
    deprecatedTool("resume_campaign"),
  ],
});