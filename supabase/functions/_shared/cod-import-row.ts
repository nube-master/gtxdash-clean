/**
 * Validação + mapeamento de uma linha do CSV de import COD.
 * Compartilhado entre cod-import-orders (dry-run) e cod-import-worker (batches).
 */
import { getBrasiliaDate } from "./cod-ingest.ts";

export type Row = Record<string, string | number | null | undefined>;

export type RowOutcome = {
  row_number: number;
  external_order_id: string | null;
  result: "ok" | "skip" | "orphan" | "error";
  field?: string;
  message?: string;
  insert?: Record<string, unknown>;
  push?: Record<string, unknown>;
  operation_id?: string;
};

export const VALID_STATUS = ["pending", "approved", "delivered", "cancelled", "refunded"];
/** Aliases aceitos (padrão MCP FAHTO/Sphere) → valor canônico. */
export const STATUS_ALIASES: Record<string, string> = {
  paid: "approved",
  confirmed: "approved",
  processing: "pending",
  awaiting_payment: "pending",
  billet_generated: "pending",
  chargeback: "refunded",
  disputed: "refunded",
  shipped: "delivered",
  refused: "cancelled",
  expired: "cancelled",
};
export const STATUS_MAP: Record<string, string> = {
  pending: "pending",
  approved: "commission_approved",
  delivered: "delivered",
  cancelled: "canceled",
  refunded: "refused",
};

export const STATUS_ERROR_HINT =
  "status 'X' não aceito. Valores canônicos: pending | approved | delivered | cancelled | refunded. Aliases aceitos: " +
  Object.entries(STATUS_ALIASES).map(([k, v]) => `${k}→${v}`).join("; ");

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

export function parseIsoBrt(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const base = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? `${s}T00:00:00-03:00`
    : /(Z|[+-]\d{2}:?\d{2})$/.test(s)
      ? s
      : `${s}-03:00`;
  const d = new Date(base);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Cache de lookups pra não bater no banco por linha. */
export class ImportCaches {
  ops = new Map<string, string | null>();
  affiliates = new Map<string, boolean>();
  fx = new Map<string, number>();
}

/** Lista de valores aceitos (slugs + aliases), pra mensagem de erro clara. */
let acceptedCache: string[] | null = null;
export async function acceptedOperationValues(supabase: any): Promise<string[]> {
  if (acceptedCache) return acceptedCache;
  const [{ data: ops }, { data: aliases }] = await Promise.all([
    supabase.from("operations").select("slug"),
    supabase.from("operation_aliases").select("alias_input"),
  ]);
  const set = new Set<string>();
  (ops ?? []).forEach((o: any) => o?.slug && set.add(o.slug));
  (aliases ?? []).forEach((a: any) => a?.alias_input && set.add(a.alias_input));
  acceptedCache = [...set].sort();
  return acceptedCache;
}

export async function resolveOperation(
  supabase: any,
  raw: string | null,
  caches: ImportCaches,
): Promise<string | null> {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (caches.ops.has(key)) return caches.ops.get(key) ?? null;

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let id: string | null = null;
  if (uuid.test(key)) {
    const { data } = await supabase.from("operations").select("id").eq("id", key).maybeSingle();
    id = data?.id ?? null;
  } else {
    // 1) alias table (case-insensitive)
    const { data: alias } = await supabase
      .from("operation_aliases")
      .select("operation_id, alias_input")
      .ilike("alias_input", key)
      .limit(1)
      .maybeSingle();
    id = alias?.operation_id ?? null;

    // 2) fallback: slug/name direto
    if (!id) {
      const { data } = await supabase
        .from("operations")
        .select("id, name, slug")
        .or(`slug.ilike.${key},name.ilike.${key}`)
        .limit(1)
        .maybeSingle();
      id = data?.id ?? null;
    }
  }
  caches.ops.set(key, id);
  return id;
}

/** Fallbacks aproximados por moeda (usados só se não houver taxa em cache). */
const FX_FALLBACK: Record<string, number> = {
  EUR: 5.89,
  USD: 5.1,
  GBP: 6.8,
  PLN: 1.362,
  RON: 1.122,
  CZK: 0.2433,
  HUF: 0.01604,
  BGN: 3.013,
  SEK: 0.53,
  CHF: 6.35,
};

export class UnknownCurrencyError extends Error {
  constructor(public currency: string) {
    super(`moeda '${currency}' sem taxa de câmbio conhecida — valor não convertido para BRL`);
  }
}

export async function fxToBrl(
  supabase: any,
  value: number | null,
  currency: string,
  caches: ImportCaches,
): Promise<number | null> {
  if (value === null) return null;
  const cur = (currency || "BRL").toUpperCase();
  if (cur === "BRL") return value;

  let rate = caches.fx.get(cur);
  if (rate === undefined) {
    const { data } = await supabase
      .from("exchange_rates_cache")
      .select("rate")
      .eq("base_currency", cur)
      .eq("target_currency", "BRL")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    rate = Number(data?.rate) || FX_FALLBACK[cur] || 0;
    if (!rate) throw new UnknownCurrencyError(cur);
    caches.fx.set(cur, rate);
  }
  return Number((value * rate).toFixed(4));
}


async function affiliateHasMapping(supabase: any, affiliate: string, caches: ImportCaches) {
  if (caches.affiliates.has(affiliate)) return caches.affiliates.get(affiliate)!;
  const { data } = await supabase
    .from("affiliate_operation_mapping")
    .select("operation_id")
    .eq("affiliate_id", affiliate)
    .limit(1)
    .maybeSingle();
  const has = Boolean(data);
  caches.affiliates.set(affiliate, has);
  return has;
}

const err = (
  lineNo: number,
  orderId: string | null,
  field: string,
  message: string,
): RowOutcome => ({ row_number: lineNo, external_order_id: orderId, result: "error", field, message });

export async function processRow(
  supabase: any,
  r: Row,
  lineNo: number,
  opts: { retroactive: boolean; existing: Set<string>; seenInFile: Set<string>; caches: ImportCaches },
): Promise<RowOutcome> {
  const { retroactive, existing, seenInFile, caches } = opts;
  const orderId = str(r.order_id);

  if (!orderId) return err(lineNo, null, "order_id", "order_id obrigatório");
  if (existing.has(orderId) || seenInFile.has(orderId)) {
    return { row_number: lineNo, external_order_id: orderId, result: "skip", message: "order_id duplicado" };
  }

  const opRaw = str(r.operation_id);
  const operationId = await resolveOperation(supabase, opRaw, caches);
  if (!operationId) {
    const accepted = await acceptedOperationValues(supabase);
    return err(
      lineNo,
      orderId,
      "operation_id",
      `operation_id '${opRaw ?? ""}' não corresponde a nenhuma operação. Valores aceitos: ${accepted.join(", ")}`,
    );
  }

  const statusRaw = (str(r.status) ?? "").toLowerCase();
  const statusCanonical = STATUS_ALIASES[statusRaw] ?? statusRaw;
  if (!VALID_STATUS.includes(statusCanonical)) {
    return err(lineNo, orderId, "status", STATUS_ERROR_HINT.replace("'X'", `'${statusRaw}'`));
  }
  const status = STATUS_MAP[statusCanonical];

  const createdAt = parseIsoBrt(r.created_at);
  if (!createdAt) return err(lineNo, orderId, "created_at", "created_at inválido (ISO 8601)");

  const deliveredAt = parseIsoBrt(r.delivered_at);
  if (r.delivered_at && !deliveredAt) return err(lineNo, orderId, "delivered_at", "delivered_at inválido");

  const paidAt = parseIsoBrt(r.paid_at);
  if (r.paid_at && !paidAt) return err(lineNo, orderId, "paid_at", "paid_at inválido (ISO 8601)");

  const refusedAt = parseIsoBrt(r.refused_at);
  if (r.refused_at && !refusedAt) return err(lineNo, orderId, "refused_at", "refused_at inválido (ISO 8601)");

  if (paidAt && refusedAt) {
    return err(lineNo, orderId, "paid_at", "pedido não pode ter paid_at e refused_at");
  }

  const projectSlug = (str(r.project_slug) ?? "").toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(projectSlug)) {
    return err(lineNo, orderId, "project_slug", "project_slug obrigatório (3-40 chars, A-Z 0-9 e hífen)");
  }
  const countryCode = (str(r.country_code) ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return err(lineNo, orderId, "country_code", "country_code obrigatório (ISO 3166 alpha-2)");
  }

  const quantity = num(r.quantity) ?? 1;
  const currency = (str(r.currency) ?? "BRL").toUpperCase();
  const orderTotalOrig = num(r.order_total) ?? num(r.order_total_brl);
  const commissionOrig = num(r.commission_value) ?? num(r.commission_value_brl);
  let orderTotalBrl: number | null;
  let commissionBrl: number | null;
  try {
    orderTotalBrl = currency === "BRL"
      ? num(r.order_total_brl) ?? orderTotalOrig
      : await fxToBrl(supabase, orderTotalOrig, currency, caches);
    commissionBrl = currency === "BRL"
      ? num(r.commission_value_brl) ?? commissionOrig
      : await fxToBrl(supabase, commissionOrig, currency, caches);
  } catch (e) {
    return err(lineNo, orderId, "currency", (e as Error).message);
  }

  if (quantity <= 0) return err(lineNo, orderId, "quantity", "quantity deve ser > 0");
  if ((orderTotalBrl ?? 0) < 0 || (commissionBrl ?? 0) < 0) {
    return err(lineNo, orderId, "order_total_brl", "valor negativo");
  }

  const affiliate = str(r.affiliate_username);
  const orphan = affiliate ? !(await affiliateHasMapping(supabase, affiliate, caches)) : true;
  const platform = (str(r.platform) ?? "manual").toLowerCase();

  const insert: Record<string, unknown> = {
    operation_id: operationId,
    platform,
    source: platform === "manual" ? "manual" : platform,
    external_order_id: orderId,
    product_key: str(r.product_slug),
    product_name: str(r.product_name),
    order_date: getBrasiliaDate(createdAt),
    delivery_date: deliveredAt ? getBrasiliaDate(deliveredAt) : null,
    payment_date: paidAt ? getBrasiliaDate(paidAt) : null,
    paid_at: paidAt,
    refused_at: refusedAt,
    project_slug: projectSlug,
    country_code: countryCode,
    legacy: false,
    status,
    order_value: orderTotalOrig,
    order_value_brl: orderTotalBrl,
    commission_value: commissionOrig,
    commission_value_brl: commissionBrl,
    commission_currency: currency,
    customer_country: str(r.customer_state),
    affiliate_id: affiliate,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
    received_via: "csv_import",
    raw_payload: { manual_import: true, line: lineNo, original: r },
  };

  const ageHours = (Date.now() - new Date(createdAt).getTime()) / 36e5;
  const push = !retroactive && ageHours <= 24 && status === "commission_approved"
    ? {
      operation_id: operationId,
      order_id: orderId,
      valor: commissionBrl,
      produto: str(r.product_name),
      afiliado: affiliate,
    }
    : undefined;

  return {
    row_number: lineNo,
    external_order_id: orderId,
    result: orphan ? "orphan" : "ok",
    message: orphan ? "afiliado sem mapping — importado como órfão" : undefined,
    insert,
    push,
    operation_id: operationId,
  };
}
