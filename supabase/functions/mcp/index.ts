// OWNED BY THE TEAM — banner removed on purpose so the Vite plugin stops regenerating this file.
// Bundle below is generated from src/lib/mcp/index.ts. When that file changes, re-sync this bundle manually
// (temporarily restore the AUTO-GENERATED banner, run a build, then remove it again and re-apply the wrapper at the bottom).
// To take ownership, delete this banner line; the plugin then leaves the file alone.
// supabase function: mcp
// Bundled from src/lib/mcp/index.ts by @lovable.dev/mcp-js.
// src/lib/mcp/index.ts
import { createClient } from "npm:@supabase/supabase-js@^2.95.3";
import { auth, defineMcp, defineTool } from "npm:@lovable.dev/mcp-js@0.20.0";
import { z } from "npm:zod@^4.4.3";
var projectRef = "taeduxiandktefcwgspx";
function backendAdmin() {
  const denoEnv = globalThis.Deno?.env;
  const url = denoEnv?.get("SUPABASE_URL") ?? "https://taeduxiandktefcwgspx.supabase.co";
  const key = denoEnv?.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Backend environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function getTodayBRT() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(/* @__PURE__ */ new Date());
}
var healthCheckTool = defineTool({
  name: "health_check",
  title: "Health Check",
  description: "Check if the Traffic OS MCP server is responding.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => ({ content: [{ type: "text", text: "OK" }] })
});
var getDashboardSnapshotTool = defineTool({
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
        body: { start: today, end: today }
      });
      if (totalsError) throw totalsError;
      const { data: alerts } = await backend.from("meta_pacing_audit").select("action, entity_name, reason, created_at").order("created_at", { ascending: false }).limit(5);
      const snapshot = {
        date_brt: today,
        metrics: {
          spend_brl: totals?.totalSpend ?? 0,
          revenue_brl: totals?.totalRevenue ?? 0,
          roas: totals?.roas ?? 0,
          sales: totals?.totalConversions ?? 0
        },
        recent_alerts: alerts ?? []
      };
      return { content: [{ type: "text", text: JSON.stringify(snapshot) }], structuredContent: snapshot };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }
});
var getTodayTotalsTool = defineTool({
  name: "get_today_totals",
  title: "Get Today Totals",
  description: "Alias for get_dashboard_snapshot.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_, ctx) => getDashboardSnapshotTool.handler({}, ctx)
});
var listAdAccountsTool = defineTool({
  name: "list_ad_accounts",
  title: "List Meta Ad Accounts",
  description: "List Meta ad accounts linked to Traffic OS.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const { data, error } = await backendAdmin().from("meta_accounts").select("account_id, name, status, currency, timezone_name").order("name");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }], structuredContent: { accounts: data ?? [] } };
  }
});
var listCreativesTool = defineTool({
  name: "list_creatives",
  title: "List Meta Creatives Performance",
  description: "Returns aggregated performance metrics per creative [AD##] for the last 30 days.",
  inputSchema: {
    min_spend: z.number().optional().describe("Minimum spend in BRL"),
    limit: z.number().int().min(1).max(200).optional().default(50).describe("Maximum results")
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ min_spend, limit }) => {
    let query = backendAdmin().from("meta_creatives_performance").select("*").order("spend_brl", { ascending: false }).limit(limit);
    if (min_spend !== void 0) query = query.gt("spend_brl", min_spend);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }], structuredContent: { creatives: data ?? [] } };
  }
});
var getCreativeByCodeTool = defineTool({
  name: "get_creative_by_code",
  title: "Get Creative Detail by Code",
  description: "Returns detailed metrics for a creative ID such as AD125.",
  inputSchema: { ad_code: z.string().min(1).describe("Creative code, for example AD125") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ ad_code }) => {
    const cleanCode = ad_code.replace(/[\[\]]/g, "").toUpperCase();
    const { data, error } = await backendAdmin().from("meta_creatives_performance").select("*").eq("ad_code", cleanCode).maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: `Creative ${cleanCode} not found.` }] };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { creative: data } };
  }
});
function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
function nestedValue(payload, keys) {
  if (!payload || typeof payload !== "object") return null;
  const queue = [payload];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    const record = node;
    for (const key of keys) {
      const value = record[key];
      if (value !== void 0 && value !== null && value !== "") return value;
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return null;
}
function encodeCursor(createdAt, id) {
  return btoa(`${createdAt}|${id}`).replace(/=+$/, "");
}
function decodeCursor(cursor) {
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
var SERVICE_PRINCIPAL_PREFIX = "service:";
async function canReadOperation(userId, operationId) {
  const backend = backendAdmin();
  if (userId.startsWith(SERVICE_PRINCIPAL_PREFIX)) {
    const allowedOperation = userId.slice(SERVICE_PRINCIPAL_PREFIX.length);
    const { data: operation2 } = await backend.from("operations").select("id").eq("id", operationId).maybeSingle();
    return { exists: Boolean(operation2), allowed: allowedOperation === operationId };
  }
  const [{ data: operation }, { data: admin }, { data: membership }] = await Promise.all([
    backend.from("operations").select("id").eq("id", operationId).maybeSingle(),
    backend.from("super_admins").select("user_id, is_restricted").eq("user_id", userId).maybeSingle(),
    backend.from("operation_members").select("operation_id").eq("operation_id", operationId).eq("user_id", userId).eq("status", "active").maybeSingle()
  ]);
  return { exists: Boolean(operation), allowed: Boolean(admin && !admin.is_restricted || membership) };
}
function dateOnly(value) {
  if (!value) return null;
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}
var PROGRAM_COUNTRY = [
  [/tchec|czech|\bcz\b/i, "CZ"],
  [/polon|poland|polska|\bpl\b/i, "PL"],
  [/romen|romani|\bro\b/i, "RO"],
  [/hungr|hungar|\bhu\b/i, "HU"],
  [/eslovaq|slovak|\bsk\b/i, "SK"],
  [/bulgar|\bbg\b/i, "BG"]
];
function countryFromProgram(program) {
  if (!program) return null;
  const text = String(program);
  for (const [pattern, code] of PROGRAM_COUNTRY) if (pattern.test(text)) return code;
  return null;
}
var listOrdersTool = defineTool({
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
    include_total: z.boolean().optional().default(true)
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, operation_id, platform, status, program, cursor, limit, include_total }, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "401 unauthenticated" }], isError: true };
    if (from > to) return { content: [{ type: "text", text: "400 from must not be after to" }], isError: true };
    const access = await canReadOperation(userId, operation_id);
    if (!access.exists) return { content: [{ type: "text", text: "404 operation_not_found" }], isError: true };
    if (!access.allowed) return { content: [{ type: "text", text: "403 operation_access_denied" }], isError: true };
    const statusMap = {
      paid: ["paid", "commission_approved", "approved"],
      pending: ["pending", "created", "processing"],
      refused: ["refused", "cancelled", "canceled", "rejected"],
      expired: ["expired"],
      delivered: ["delivered", "entregue"]
    };
    const platformMap = { sphere: ["sphere", "shphere"], fahto: ["fahto"] };
    const backend = backendAdmin();
    const startIso = `${from}T00:00:00.000Z`;
    const endIso = `${to}T23:59:59.999Z`;
    const programFilter = program?.trim();
    const applyFilters = (query2) => {
      let filtered = query2.eq("operation_id", operation_id).eq("received_via", "webhook").gte("created_at", startIso).lte("created_at", endIso);
      if (platform !== "all") filtered = filtered.in("platform", platformMap[platform]);
      if (status !== "all") filtered = filtered.in("status", statusMap[status]);
      if (programFilter) {
        const escaped = programFilter.replace(/[,()]/g, "");
        filtered = filtered.or(
          `program_id.ilike.${escaped},raw_payload->afiliado->>programa_id.ilike.${escaped}`
        );
      }
      return filtered;
    };
    let total;
    if (include_total) {
      const { count, error: error2 } = await applyFilters(backend.from("cod_orders").select("id", { count: "exact", head: true }));
      if (error2) return { content: [{ type: "text", text: error2.message }], isError: true };
      total = count ?? 0;
    }
    let query = applyFilters(backend.from("cod_orders").select(
      "id, platform, webhook_endpoint_slug, operation_id, status, created_at, paid_at, refused_at, expired_at, cancelled_at, delivery_date, product_name, product_key, program_id, country_code, customer_country, order_value, commission_value, commission_currency, raw_payload"
    ));
    if (cursor) {
      const parsed = decodeCursor(cursor);
      if (!parsed) return { content: [{ type: "text", text: "400 invalid_cursor" }], isError: true };
      query = query.or(`created_at.lt.${parsed.createdAt},and(created_at.eq.${parsed.createdAt},id.lt.${parsed.id})`);
    }
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.map((row) => {
      const payload = row.raw_payload;
      const nestedCommission = nestedValue(payload, ["commission", "comissao"]);
      const nestedCommissionRecord = nestedCommission && typeof nestedCommission === "object" ? nestedCommission : null;
      const commissionValue = row.commission_value ?? nestedValue(payload, ["commission_value", "comissao_valor"]) ?? nestedCommissionRecord?.value ?? nestedCommissionRecord?.valor ?? null;
      const commissionCurrency = row.commission_currency ?? nestedCommissionRecord?.currency ?? nestedCommissionRecord?.moeda ?? null;
      const rawPlatform = String(row.platform ?? "").toLowerCase();
      const programId = row.program_id ?? nestedValue(payload, ["program", "programa_id", "programa"]);
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
        amount: row.order_value === null || row.order_value === void 0 ? null : Number(row.order_value),
        commission: {
          value: commissionValue === null || commissionValue === "" ? null : Number(commissionValue),
          currency: commissionCurrency === null || commissionCurrency === "" ? null : String(commissionCurrency)
        },
        clickid: nestedValue(payload, ["clickid", "click_id", "sub1"]),
        utm_campaign: nestedValue(payload, ["utm_campaign", "campaign"])
      };
    });
    const last = page.at(-1);
    const response = {
      items,
      next_cursor: hasMore && last ? encodeCursor(new Date(last.created_at).toISOString(), last.id) : null,
      generated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (include_total) response.total = total;
    return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
  }
});
function deprecatedTool(name) {
  return defineTool({
    name,
    title: name,
    description: "Deprecated tool. Use the current aggregated Traffic OS tools instead.",
    inputSchema: {},
    handler: async () => ({
      content: [{ type: "text", text: "This tool is deprecated. Use list_orders, list_creatives, get_dashboard_snapshot, list_ad_accounts, or get_creative_by_code." }]
    })
  });
}
var mcp_default = defineMcp({
  name: "traffic-os-mcp",
  title: "TRAFFIC OS",
  version: "0.7.0",
  instructions: "Official Traffic OS MCP server. list_orders is the authoritative tool for webhook-received COD affiliate orders.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: ["authenticated"],
    requireOAuthClientClaim: false
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
    deprecatedTool("resume_campaign")
  ]
});

// lovable-mcp-supabase-entry.ts
import { createSupabaseHandler } from "npm:@lovable.dev/mcp-js@0.20.0/stacks/supabase";
const oauthHandler = createSupabaseHandler(mcp_default, { functionName: "mcp" });

// ---------------------------------------------------------------------------
// Static service-token auth (server-to-server). Read-only, FAHTO only.
// OAuth behaviour is untouched: anything that is not a valid service token
// falls straight through to the existing handler.
// ---------------------------------------------------------------------------
const SERVICE_OPERATION_ID = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
const SERVICE_TOOLS = new Map([
  ["health_check", healthCheckTool],
  ["list_orders", listOrdersTool]
]);
const SERVICE_TOOL_SCHEMAS = [
  {
    name: "health_check",
    title: "Health Check",
    description: "Check if the Traffic OS MCP server is responding.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "list_orders",
    title: "List COD Affiliate Orders",
    description: "Lists webhook-received Sphere/Fahto COD orders for the FAHTO operation, newest first, using opaque cursor pagination. Filters combine with AND. delivered_date is a calendar date (no time).",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "UTC start date, YYYY-MM-DD" },
        to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "UTC end date, YYYY-MM-DD" },
        operation_id: { type: "string", description: "Optional for service tokens; forced to the FAHTO operation." },
        platform: { type: "string", enum: ["sphere", "fahto", "all"], default: "all" },
        status: { type: "string", enum: ["paid", "pending", "refused", "expired", "delivered", "all"], default: "all" },
        program: { type: "string", description: "Exact program id / slug, case-insensitive (AND filter)" },
        cursor: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
        include_total: { type: "boolean", default: true }
      },
      required: ["from", "to"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }
];

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  // Compare a fixed-length digest so length itself does not leak through timing.
  let diff = left.length === right.length ? 0 : 1;
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

function isServiceToken(request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const presented = match[1].trim();
  if (presented.length < 16) return false;
  const env = globalThis.Deno?.env;
  // Two slots so a token can be rotated without downtime.
  const accepted = [env?.get("MCP_SERVICE_TOKEN"), env?.get("MCP_SERVICE_TOKEN_NEXT")].filter(Boolean);
  return accepted.some((token) => timingSafeEqual(presented, token));
}

const serviceCtx = {
  isAuthenticated: () => true,
  getToken: () => undefined,
  getUserId: () => `service:${SERVICE_OPERATION_ID}`,
  getUserEmail: () => undefined,
  getClientId: () => "traffic-os-service-token",
  getScopes: () => ["read"],
  getIssuer: () => "traffic-os-service-token",
  getClaims: () => ({ sub: `service:${SERVICE_OPERATION_ID}`, scope: "read" })
};

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handleServiceRpc(message) {
  const { id, method, params } = message ?? {};
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: mcp_default.name ?? "traffic-os-mcp", version: mcp_default.version ?? "0.7.0" },
      instructions: "Service-token session: read-only tools scoped to the FAHTO operation."
    });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: SERVICE_TOOL_SCHEMAS });
  if (method === "tools/call") {
    const name = params?.name;
    const tool = SERVICE_TOOLS.get(name);
    if (!tool) {
      return rpcError(id, -32602, `Tool '${name}' is not available to service tokens (read-only, FAHTO scope).`);
    }
    const args = { ...(params?.arguments ?? {}) };
    if (name === "list_orders") {
      if (args.operation_id && args.operation_id !== SERVICE_OPERATION_ID) {
        return rpcError(id, -32602, "403 operation_access_denied: service token is scoped to the FAHTO operation.");
      }
      args.operation_id = SERVICE_OPERATION_ID;
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRe.test(String(args.from ?? "")) || !dateRe.test(String(args.to ?? ""))) {
        return rpcError(id, -32602, "400 from/to are required as YYYY-MM-DD");
      }
      args.platform = args.platform ?? "all";
      args.status = args.status ?? "all";
      args.limit = args.limit ?? 100;
      args.include_total = args.include_total ?? true;
    }
    try {
      const result = await tool.handler(args, serviceCtx);
      return rpcResult(id, result);
    } catch (error) {
      return rpcError(id, -32603, error instanceof Error ? error.message : String(error));
    }
  }
  if (typeof method === "string" && method.startsWith("notifications/")) return null;
  return rpcError(id, -32601, `Method '${method}' is not supported for service tokens.`);
}

Deno.serve(async (request) => {
  if (request.method === "POST" && isServiceToken(request)) {
    let body;
    try {
      body = await request.clone().json();
    } catch {
      return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
    }
    const messages = Array.isArray(body) ? body : [body];
    const responses = [];
    for (const message of messages) {
      const response = await handleServiceRpc(message);
      if (response) responses.push(response);
    }
    if (responses.length === 0) return new Response(null, { status: 202 });
    return Response.json(Array.isArray(body) ? responses : responses[0], { status: 200 });
  }
  return oauthHandler(request);
});

