import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveProductName } from "@/lib/productNames";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useOperationId } from "@/contexts/OperationContext";
import { useOfferProjects } from "@/hooks/useOfferProjects";
import { extractProjectCode } from "@/lib/projectUtils";
import {
  buildReceiptAmountMap,
  getRedtrackReceipt,
  resolveRedtrackRevenueBrl,
} from "@/lib/redtrackRevenue";
import { getSaleDedupeKey, normalizeSaleOrderKey } from "@/lib/salesMerge";
/** GTX MIDIA — única operação que consome cod_orders no War Room/Faturamento. */
const GTX_OPERATION_ID = "0b758a2b-1b92-4769-b47b-416c567e320d";


function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isManualSale(sale: Pick<LiveSale, "offer_name" | "product_name">) {
  return (sale.offer_name || "").includes("[MANUAL]") || (sale.product_name || "").includes("[MANUAL]");
}

function sortLiveSales(list: LiveSale[]) {
  return [...list].sort((a, b) => {
    const timeDiff = toTimestamp(b.created_at) - toTimestamp(a.created_at);
    if (timeDiff !== 0) return timeDiff;

    const aIsManual = isManualSale(a);
    const bIsManual = isManualSale(b);
    if (aIsManual && !bIsManual) return 1;
    if (!aIsManual && bIsManual) return -1;

    return a.id.localeCompare(b.id);
  });
}

export interface LiveSale {
  id: string;
  created_at: string;
  date?: string | null;
  product_name: string | null;
  offer_name?: string | null;
  revenue: number;
  store: string | null;
  status: string;
  order_id: string;
  utm_campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  device?: string | null;
  device_brand?: string | null;
  browser?: string | null;
  os?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  connection_type?: string | null;
  isp?: string | null;
  /** Resolved display name for the product/project */
  project?: string | null;
  /** Variant within the project (NDM, NDR, etc.) */
  variant?: string | null;
  /** Event type: purchase, upsell, etc. */
  event_type?: string | null;
  is_manual?: boolean;
  /** ClickBank vendor nickname (authoritative for product mapping when present) */
  vendor?: string | null;
  /** Meta Ads IDs extraídos do UTMfy SCK (Hotmart) */
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  meta_placement?: string | null;
  meta_campaign_name?: string | null;
  meta_adset_name?: string | null;
  meta_ad_name?: string | null;
  /** RedTrack raw payload fields for UTM mapping */
  sub4?: string | null;
  sub5?: string | null;
  sub6?: string | null;
  sub7?: string | null;
  sub8?: string | null;
  sub9?: string | null;
  sub4_ad_name?: string | null;
  raw_payload?: any;
}

// --- Sound engine ---
function playPingSound(intensity: "normal" | "strong" | "alert" = "normal") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (intensity === "alert") {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else if (intensity === "strong") {
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      osc.frequency.setValueAtTime(1400, ctx.currentTime + 0.06);
      osc.frequency.setValueAtTime(1600, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {}
}

function getBrasiliaDateBounds() {
  const now = new Date();
  const spDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const brDateStr = spDateFormatter.format(now);
  
  // Brasília 00:00:00 (UTC-3) translates to UTC 03:00:00 of the same day.
  // Using an ISO format with the offset to ensure the JS Date constructor handles it correctly.
  const startUTC = new Date(`${brDateStr}T00:00:00-03:00`);
  return { brDateStr, startUTC };
}

function toSPDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getHotmartEffectiveDate(row: { vendor?: string | null; date?: string | null; created_at?: string | null }): string | null {
  const storedDate = row.date || null;
  if ((row.vendor || "").toLowerCase() !== "hotmart") return storedDate;
  const createdDateBrt = toSPDate(row.created_at);
  if (!storedDate) return createdDateBrt;
  return createdDateBrt === addDays(storedDate, -1) ? createdDateBrt : storedDate;
}

const CB_MIRROR_WINDOW_MS = 90 * 1000;

type CbAuditRow = {
  receipt?: string | null;
  amount_brl?: number | string | null;
  amount_usd?: number | string | null;
  created_at?: string | null;
  date?: string | null;
};

function resolveCheckoutPlatformKey(sale: { offer_name?: string | null; store?: string | null }): string {
  const offer = (sale.offer_name || "").trim();
  if (offer) {
    const segments = offer.split("|").map((s) => s.trim().toLowerCase());
    const platform = segments[1] || "";
    if (platform.includes("h&w") || platform.includes("h & w") || platform === "hw") return "hw";
    if (platform.includes("clickbank")) return "clickbank";
    if (platform.includes("cartpanda")) return "cartpanda";
    if (platform.includes("buygoods")) return "buygoods";
    if (platform.includes("digistore")) return "digistore";
  }

  const store = (sale.store || "").trim().toLowerCase();
  if (store === "h&w" || store === "hw") return "hw";
  if (store.includes("clickbank")) return "clickbank";
  return store;
}

function isCbAuditMirrorCandidate(sale: { offer_name?: string | null; store?: string | null }): boolean {
  const platform = resolveCheckoutPlatformKey(sale);
  return platform === "hw" || platform === "clickbank";
}

function findCbAuditMirrorReceipt(
  cbRows: CbAuditRow[],
  source: { createdAt?: string | null; amountUsd?: number | null; amountBrl?: number | null }
): string | null {
  const sourceTime = toTimestamp(source.createdAt);
  if (!sourceTime) return null;

  const sourceUsdRounded = source.amountUsd && source.amountUsd > 0 ? Math.round(source.amountUsd) : null;
  const sourceBrl = source.amountBrl && source.amountBrl > 0 ? source.amountBrl : null;

  let bestReceipt: string | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const cb of cbRows) {
    const receipt = String(cb.receipt || "").trim();
    if (!receipt) continue;

    const cbTime = toTimestamp(cb.created_at || (cb.date ? `${cb.date}T03:00:00Z` : null));
    if (!cbTime) continue;
    const diff = Math.abs(cbTime - sourceTime);
    if (diff > CB_MIRROR_WINDOW_MS || diff >= bestDiff) continue;

    const cbUsdRounded = Math.round(Number(cb.amount_usd || 0));
    const cbBrl = Number(cb.amount_brl || 0);
    const usdMatches = sourceUsdRounded != null && cbUsdRounded > 0 && cbUsdRounded === sourceUsdRounded;
    const brlMatches = sourceBrl != null && cbBrl > 0 && Math.abs(cbBrl - sourceBrl) <= Math.max(2, cbBrl * 0.01);

    if (usdMatches || brlMatches) {
      bestReceipt = receipt;
      bestDiff = diff;
    }
  }

  return bestReceipt;
}

/**
 * Resolves the project variant (NDM, NDR, LDG) and group (Neurodyne, LDG).
 */
function resolveProject(sale: {
  offer_name?: string | null;
  product_name?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_source?: string | null;
  store?: string | null;
  vendor?: string | null;
  raw_payload?: any;
  project_slug?: string | null;
}): { project: string; variant: string } {
  // ClickBank vendor is authoritative — overrides any ambiguous product_name
  const vendor = (sale.vendor || "").toLowerCase();
  if (vendor && /memopryl|\bmmp\b/.test(vendor)) {
    return { project: "MMP", variant: "MMP" };
  }

  // Newsbreak channel (utm_source) only runs MMP/memopryl — override any legacy [NDM] bracket
  const utmSource = sale.utm_source;
  if (utmSource && /newsbreak/i.test(utmSource)) {
    return { project: "MMP", variant: "MMP" };
  }

  // Bracket [MMP] in campaign/content takes priority (channel-agnostic)
  const earlyTexts = [sale.utm_campaign, sale.utm_content, sale.offer_name, sale.product_name].filter(Boolean) as string[];
  for (const text of earlyTexts) {
    if (/\[MMP\]|memopryl/i.test(text)) return { project: "MMP", variant: "MMP" };
    if (/\[CB[-_ ]?COD\]|\bCB[-_ ]?COD\b/i.test(text)) return { project: "Vitalis", variant: "CB-COD" };
    if (/\[AURAVITA\]|\[XPERI\]/i.test(text)) return { project: "AURAVITA", variant: "AURAVITA" };
    if (/\[VITALIS\]|\[VTP\]|\[FATO\]|\[FAHTO\]/i.test(text)) return { project: "Vitalis", variant: "VTP" };
  }

  const resolved = resolveProductName(sale.offer_name, sale.product_name, "");

  if (resolved === "MMP") return { project: "MMP", variant: "MMP" };
  if (resolved === "NDM") return { project: "Neurodyne", variant: "NDM" };
  if (resolved === "NDB") return { project: "Neurodyne", variant: "NDB" };
  if (resolved === "NDR") return { project: "Neurodyne", variant: "NDR" };
  if (resolved === "CRT") return { project: "Core Strength", variant: "CRT" };
  if (resolved === "LDG") return { project: "LDR", variant: "LDR" };
  if (resolved === "LDR") return { project: "LDR", variant: "LDR" };
  if (resolved === "AILULA") return { project: "Core Strength", variant: "CRT" };
  if (resolved) return { project: resolved, variant: resolved };

  // Fallback: check utm_campaign then utm_content for known tags
  const textsToCheck = earlyTexts;
  for (const text of textsToCheck) {
    if (/\[CRT\]|\[CST\]|\[AILULA\]/i.test(text)) return { project: "Core Strength", variant: "CRT" };
    if (/\[NDM\]|\[MEMO\]|\[NDN\]/i.test(text)) return { project: "Neurodyne", variant: "NDM" };
    if (/\[ND\]/i.test(text)) return { project: "Neurodyne", variant: "NDB" };
    if (/\[NDR\]/i.test(text)) return { project: "Neurodyne", variant: "NDR" };
    if (/\[NEURO\]/i.test(text)) return { project: "Neurodyne", variant: "NDB" };
    if (/\[LDG\]/i.test(text)) return { project: "LDR", variant: "LDR" };
    if (/\[LDR\]/i.test(text)) return { project: "LDR", variant: "LDR" };
    // Without brackets
    if (/\bCRT\b|\bCST\b|AILULA|CRSTRENGHT|CRSTRANGE|CORE\s*STR/i.test(text)) return { project: "Core Strength", variant: "CRT" };
    if (/NDM|MEMO/i.test(text)) return { project: "Neurodyne", variant: "NDM" };
    if (/NDR/i.test(text)) return { project: "Neurodyne", variant: "NDR" };
    if (/LDG|leandrops/i.test(text)) return { project: "LDR", variant: "LDR" };
    if (/\bLDR\b/i.test(text)) return { project: "LDR", variant: "LDR" };
  }

  // PRIORIDADE: usa extractor central que conhece offers cadastrados
  // (apelido_interno como [VIT-RRT], [MMPB], etc) via registerOfferProjects.
  // Evita que store='redtrack_unknown' vire project='REDTRACK_UNKNOWN'.
  const dynCode = extractProjectCode(
    sale.utm_campaign,
    null,
    sale.offer_name,
    sale.product_name,
    null,
    sale.raw_payload,
    sale.project_slug
  );
  // Rejeita códigos puramente numéricos (ex: Hotmart product_id "7380164" vindo
  // de utm_content) — não são projetos, são IDs internos do checkout.
  if (dynCode && dynCode !== "OUTROS" && !/^\d+$/.test(dynCode)) {
    return { project: dynCode, variant: dynCode };
  }

  // Hotmart: agrupa sob "EDD" (Escola do Dólar) quando não há tag específica.
  const vendorLc = (sale as any).vendor?.toString().toLowerCase();
  if (vendorLc === "hotmart" || sale.store === "hotmart") {
    return { project: "EDD", variant: "EDD" };
  }

  // Fallback: store (apenas se for um store conhecido — ignora 'redtrack' e 'redtrack_unknown')
  if (sale.store && sale.store !== "redtrack" && !sale.store.startsWith("redtrack")) {
    const s = sale.store.toLowerCase();
    if (/crstrenght|crstrange|crt|cst|ailula/i.test(s)) return { project: "Core Strength", variant: "CRT" };
    if (s === "ldg") return { project: "LDR", variant: "LDR" };
    if (s === "ndm" || s === "principal") return { project: "Neurodyne", variant: "NDM" };
    if (s === "ndr") return { project: "Neurodyne", variant: "NDR" };
    return { project: s.toUpperCase(), variant: s.toUpperCase() };
  }
  return { project: "Outros", variant: "Outros" };
}

export function useLiveSales() {
  const usdToBrl = useExchangeRate();
  const opId = useOperationId();
  // Registra offers cadastrados ([VIT-RRT], [MMPB], etc) no extractor central
  // para que resolveProject() reconheça apelido_interno como projeto.
  useOfferProjects();
  const usdToBrlRef = useRef(usdToBrl);
  usdToBrlRef.current = usdToBrl;
  const opIdRef = useRef(opId);
  opIdRef.current = opId;
  const [sales, setSales] = useState<LiveSale[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestNewSale, setLatestNewSale] = useState<LiveSale | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem("gtx-live-sound") === "true"; } catch { return false; }
  });
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Track known IDs so polling can detect truly new sales
  const knownIdsRef = useRef<Set<string>>(new Set());
  // Track semantic dedupe keys (receipt/order_id) — same real sale may arrive with
  // different row IDs from RedTrack, ClickBank audit injection, and CartPanda.
  const knownDedupeKeysRef = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  // Builds a stable semantic key for a sale to dedupe across sources (RT id ≠ CB id ≠ CP id).
  const getDedupeKey = (sale: Pick<LiveSale, "order_id" | "id" | "created_at" | "revenue" | "product_name">): string => getSaleDedupeKey(sale);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("gtx-live-sound", String(next)); } catch {}
      return next;
    });
  }, []);

  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const consumeLatestSale = useCallback(() => {
    setLatestNewSale(null);
  }, []);

  const resolveRealtimeAuditDetails = useCallback(async (evt: any) => {
    const fallbackRevenue = resolveRedtrackRevenueBrl(evt, usdToBrlRef.current);
    const fallbackCreatedAt = evt.occurred_at || evt.created_at || new Date().toISOString();
    const receipt = getRedtrackReceipt(evt);
    const currentOpId = opIdRef.current;
    const manualSale = isManualSale({
      offer_name: evt.offer_name || null,
      product_name: evt.product_name || null,
    });

    if (!receipt) {
      return {
        revenue: fallbackRevenue,
        createdAt: fallbackCreatedAt,
      };
    }

    try {
      let auditQuery = supabase
        .from("clickbank_audit")
        .select("amount_brl, created_at")
        .eq("receipt", receipt)
        .eq("transaction_type", "SALE")
        .gte("amount_usd", 200)
        .lte("amount_usd", 260)
        .limit(1);

      if (currentOpId) {
        auditQuery = auditQuery.eq("operation_id", currentOpId);
      }

      const { data, error } = await auditQuery.maybeSingle();

      if (error) {
        return {
          revenue: fallbackRevenue,
          createdAt: fallbackCreatedAt,
        };
      }

      const auditAmount = Number(data?.amount_brl || 0);
      return {
        revenue: auditAmount > 0 ? auditAmount : fallbackRevenue,
        createdAt: manualSale ? data?.created_at || fallbackCreatedAt : fallbackCreatedAt,
      };
    } catch {
      return {
        revenue: fallbackRevenue,
        createdAt: fallbackCreatedAt,
      };
    }
  }, []);

  const findRealtimeCbMirrorReceipt = useCallback(async (source: {
    createdAt?: string | null;
    amountUsd?: number | null;
    amountBrl?: number | null;
  }) => {
    const spDate = toSPDate(source.createdAt);
    if (!spDate) return null;

    try {
      let q = supabase
        .from("clickbank_audit")
        .select("receipt, amount_brl, amount_usd, created_at, date")
        .eq("date", spDate)
        .eq("transaction_type", "SALE")
        .gte("amount_usd", 200)
        .lte("amount_usd", 260)
        .limit(100);

      const currentOpId = opIdRef.current;
      if (currentOpId) q = q.eq("operation_id", currentOpId);

      const { data, error } = await q;
      if (error || !data) return null;
      return findCbAuditMirrorReceipt(data as CbAuditRow[], source);
    } catch {
      return null;
    }
  }, []);

  // Fetch all approved sales for today (Brasília timezone) from BOTH sources
  const fetchRecent = useCallback(async () => {
    const currentRate = usdToBrlRef.current;
    const { brDateStr, startUTC } = getBrasiliaDateBounds();
    const startISO = startUTC.toISOString();

    const currentOpId = opIdRef.current;
    // Fetch from both sales_data AND redtrack_events in parallel
    let salesQ = supabase
      .from("sales_data")
      .select("id, created_at, date, product_name, revenue, store, status, order_id, utm_campaign, utm_source, utm_content, utm_term, project_slug")
      .gte("created_at", startISO)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(500);
    if (currentOpId) salesQ = salesQ.eq("operation_id", currentOpId);

    // RT filter for valid transactions only
    // NOTE: redtrack_events não tem coluna is_transaction — a classificação estrita
    // (is_transaction=1 OU payout>0) já é feita na ingestão (pull-conversions),
    // portanto event_type='purchase' já vem limpo.
    const rtQ = (supabase
      .from("redtrack_events")
      .select("id, occurred_at, offer_name, amount, currency, event_type, redtrack_id, transaction_id, clickid, product_name, utm_campaign, utm_source, utm_medium, utm_content, utm_term, device, browser, os, country, city, raw_payload") as any)
      .eq("event_type", "purchase")
      .gte("occurred_at", startISO)
      .order("occurred_at", { ascending: false })
      .limit(500);

    const rtQFinal = currentOpId ? rtQ.eq("operation_id", currentOpId) : rtQ;

    // Front-end band: ClickBank USD 200-260. Hotmart (BRL) bypassa a trava.
    let cbQ = supabase
      .from("clickbank_audit")
      .select("id, receipt, amount_brl, amount_usd, vendor, product_name, item_name, affiliate, created_at, date, transaction_type, meta_campaign_id, meta_adset_id, meta_ad_id, meta_placement, meta_campaign_name, meta_adset_name, meta_ad_name, utm_campaign, utm_source, utm_medium, utm_content, utm_term, raw_tracking")
      .gte("date", brDateStr)
      .lte("date", addDays(brDateStr, 1))
      .eq("transaction_type", "SALE")
      .or("and(amount_usd.gte.200,amount_usd.lte.260),vendor.eq.hotmart")
      .order("created_at", { ascending: false })
      .limit(500);
    if (currentOpId) cbQ = cbQ.eq("operation_id", currentOpId);

    // Query legada de "conversions" removida: usava colunas inexistentes
    // (type / conv_time / status) e retornava 400 em toda operação.
    const [salesResult, redtrackResult, clickbankAuditResult] = await Promise.all([salesQ, rtQFinal, cbQ]);
    const redtrackEventsResult: { data: any[] } = { data: [] };


    // === Hotmart allowlist (por operação) ===
    // Se configurado, remove vendas Hotmart de produtos fora da lista antes de qualquer
    // processamento — assim faturamento/toasts/live só contam produtos permitidos.
    let hotmartAllowlist: string[] | null = null;
    if (currentOpId) {
      const { data: cfgRow } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "hotmart_config")
        .eq("operation_id", currentOpId)
        .maybeSingle();
      const list: string[] = Array.isArray((cfgRow?.value as any)?.allowed_products)
        ? (cfgRow!.value as any).allowed_products
        : [];
      hotmartAllowlist = list.length > 0 ? list.map((s) => String(s).trim().toLowerCase()) : null;
    }
    const isHotmartAllowed = (cb: any): boolean => {
      if (!hotmartAllowlist) return true;
      if ((cb.vendor || "").toLowerCase() !== "hotmart") return true;
      const a = String(cb.product_name || "").trim().toLowerCase();
      const b = String(cb.item_name || "").trim().toLowerCase();
      return (a && hotmartAllowlist.includes(a)) || (b && hotmartAllowlist.includes(b));
    };

    const cbRows = ((clickbankAuditResult.data || []) as any[])
      .filter((cb) => (cb.date || toSPDate(cb.created_at)) === brDateStr)
      .filter(isHotmartAllowed);
    const receiptAmountMap = buildReceiptAmountMap(cbRows);
    const cbReceiptDetailsMap = new Map<string, { amountBrl: number; createdAt: string; vendor: string | null }>();
    for (const cb of cbRows) {
      const receipt = String(cb.receipt || "").trim();
      if (!receipt) continue;
      cbReceiptDetailsMap.set(receipt, {
        amountBrl: Number(cb.amount_brl || 0),
        createdAt: cb.created_at || `${cb.date}T03:00:00Z`,
        vendor: cb.vendor || null,
      });
    }

    // sales_data pode receber linhas aprovadas com revenue=0 para fallback/debug (ex: NewsBreak).
    // Elas não representam venda confirmada e não devem aparecer no feed/toast ao vivo.
    const cartPandaSales: LiveSale[] = (salesResult.data || [])
      .filter((s: any) => Number(s.revenue || 0) > 0)
      // Hotmart em sales_data é só espelho para outros módulos e pode conter backfills
      // criados hoje. No War Room, a fonte correta é clickbank_audit (cbRows), que
      // aplica data efetiva BRT igual ao Dashboard e evita inflar o "Hoje".
      .filter((s: any) => String(s.store || "").toLowerCase() !== "hotmart")
      .filter((s: any) => {
        if (!isCbAuditMirrorCandidate(s)) return true;
        const mirrorReceipt = findCbAuditMirrorReceipt(cbRows, {
          createdAt: s.created_at,
          amountBrl: Number(s.revenue || 0),
        });
        if (!mirrorReceipt) return true;
        return false;
      })
      .map((s: any) => {
        const receipt = String(s.order_id || "").trim();
        const vendor = receipt ? cbReceiptDetailsMap.get(receipt)?.vendor || null : null;
        const projectSlugPersisted = s.project_slug || null;
        const { project, variant } = resolveProject({ ...s, vendor, project_slug: projectSlugPersisted });
        return { ...s, vendor, project, variant, is_manual: false, project_slug: projectSlugPersisted };
      });

    const isFahto = currentOpId === "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
    const redtrackEntries = isFahto ? [] : (redtrackResult.data || []).map((e: any) => {
      const isUpsell = e.event_type === "upsell";
      const manualSale = isManualSale({
        offer_name: e.offer_name || null,
        product_name: e.product_name || null,
      });
      const receipt = getRedtrackReceipt(e);
      const directReceiptHasCb = !!receipt && cbReceiptDetailsMap.has(receipt);
      const amount = Number(e.amount || 0);
      const amountUsd = (e.currency || "USD").toString().toUpperCase() === "BRL"
        ? (currentRate > 0 ? amount / currentRate : null)
        : amount;
      const mirrorReceipt = !directReceiptHasCb && !isUpsell && isCbAuditMirrorCandidate({ offer_name: e.offer_name, store: "redtrack" })
        ? findCbAuditMirrorReceipt(cbRows, {
            createdAt: e.occurred_at || e.created_at,
            amountUsd,
          })
        : null;
      const effectiveReceiptMap = isUpsell ? undefined : receiptAmountMap;
      const revenue = resolveRedtrackRevenueBrl(e, currentRate, effectiveReceiptMap);
      const cbVendor = receipt ? cbReceiptDetailsMap.get(receipt)?.vendor || null : mirrorReceipt ? cbReceiptDetailsMap.get(mirrorReceipt)?.vendor || null : null;
      
      const rtEvent: any = (redtrackEventsResult.data || []).find((ev: any) => ev.clickid === e.clickid);
      const payload = rtEvent?.raw_payload || e.raw_payload || {};
      
      const sale: LiveSale = {
        id: e.id,
        created_at: e.occurred_at,
        product_name: e.product_name || "RedTrack",
        offer_name: e.offer_name || null,
        revenue,
        store: "redtrack",
        status: "approved",
        order_id: receipt || e.transaction_id || e.clickid || e.redtrack_id || e.id,
        utm_campaign: e.utm_campaign || null,
        utm_source: e.utm_source || null,
        utm_medium: (e.utm_medium || "").replace(/\|[\d]+$/, "") || null,
        utm_content: e.utm_content || null,
        utm_term: e.utm_term || null,
        device: e.device || payload.device || null,
        device_brand: payload.device_brand || payload.device_fullname || null,
        browser: e.browser || payload.browser || null,
        os: e.os || payload.os || null,
        country: e.country || payload.country || null,
        region: payload.region || null,
        city: e.city || payload.city || null,
        connection_type: payload.connection_type || null,
        isp: payload.isp || null,
        project: null,
        variant: null,
        event_type: e.event_type || "purchase",
        is_manual: manualSale,
        vendor: cbVendor,
        sub4: payload.rt_ad || payload.clickSub4 || payload.sub4 || null,
        sub5: payload.rt_adgroup || payload.clickSub5 || payload.sub5 || null,
        sub6: payload.rt_campaign || payload.clickSub6 || payload.sub6 || null,
        sub7: payload.rt_placement || payload.clickSub7 || null,
        sub8: payload.rt_source || payload.clickSub8 || null,
        sub9: payload.rt_medium || payload.clickSub9 || null,
        sub4_ad_name: payload.adname || payload.rt_ad || null,
        raw_payload: payload,
      };
      // Assign extra RedTrack tracking for the "Rastreamento RedTrack" section in UI
      Object.assign(sale as any, {
        rt_campaign: payload.rt_campaign || null,
        rt_adgroup: payload.rt_adgroup || null,
        rt_ad: payload.rt_ad || null,
        rt_placement: payload.rt_placement || null,
        rt_campaign_id: payload.rt_campaign_id || null,
        rt_adgroup_id: payload.rt_adgroup_id || null,
        rt_ad_id: payload.rt_ad_id || null,
        device_fullname: payload.device_fullname || null,
      });
      const resolved = resolveProject(sale);
      sale.project = resolved.project;
      sale.variant = resolved.variant;
      return { sale, receipt: directReceiptHasCb ? receipt : mirrorReceipt || receipt, sourceCreatedAt: e.created_at || null, isMirrorOnly: !!mirrorReceipt && !directReceiptHasCb };
    });

    const officialOrderKeys = new Set(
      cartPandaSales
        .map((sale) => normalizeSaleOrderKey(sale.order_id))
        .filter(Boolean)
    );

    // --- Merge RT + CB: enrich RT entries with CB confirmed revenue + real timestamp ---
    // This preserves RT's full enrichment (geo, UTM, device) + CB's financial truth.
    // For reconciled/manual RT rows, CB is the authoritative source for the real sale time.
    const enrichedRedtrackEntries = redtrackEntries.map(({ sale, receipt, sourceCreatedAt, isMirrorOnly }) => {
      const cbDetails = receipt ? cbReceiptDetailsMap.get(receipt) : undefined;
      if (!cbDetails) return { sale, receipt, isMirrorOnly };

      const manualSale = sale.is_manual || isManualSale(sale);
      const authoritativeCreatedAt = manualSale
        ? cbDetails.createdAt || sourceCreatedAt || sale.created_at
        : sale.created_at || cbDetails.createdAt || sourceCreatedAt;

      return {
        sale: {
          ...sale,
          created_at: authoritativeCreatedAt,
          revenue: manualSale || Number(sale.revenue || 0) <= 0 ? cbDetails.amountBrl : sale.revenue,
          is_manual: manualSale,
          offer_name: manualSale
            ? (sale.offer_name || "").replace(/^\[MANUAL\]\s*/i, "") || sale.offer_name
            : sale.offer_name,
        },
        receipt,
        isMirrorOnly,
      };
    });

    // Now filter: only sales with confirmed revenue (either from RT or CB-enriched)
    const redtrackSales = enrichedRedtrackEntries
      .filter(({ isMirrorOnly }) => !isMirrorOnly)
      .map(({ sale }) => sale)
      .filter((sale) => Number(sale.revenue || 0) > 0 && !officialOrderKeys.has(normalizeSaleOrderKey(sale.order_id)));

    // --- Inject clickbank_audit sales not covered by RedTrack ---
    // Collect ALL receipts that RT has (with or without revenue) to avoid duplicate injection
    const allRtReceipts = new Set<string>(
      enrichedRedtrackEntries
        .filter(({ receipt, isMirrorOnly }) => !!receipt && !isMirrorOnly)
        .map(({ receipt }) => receipt as string)
    );

    // Inject every audited CB sale that has no RT receipt match at all.
    // Receipt-level matching is safer than count-based deficit logic because RT can
    // have the same number of purchase events while still missing the latest audited sales.
    const unmatchedCbRows = cbRows.filter((cb: any) => {
      const r = (cb.receipt || "").trim();
      return r && !allRtReceipts.has(r);
    });
    const cbToInject = unmatchedCbRows;

    // Enrich CB-only sales with UTM data from meta_campaign_status using meta_campaign_id (aff_sub2)
    const campaignIdsToLookup = cbToInject
      .map((cb: any) => cb.meta_campaign_id)
      .filter((id: string | null) => !!id);

    let campaignNameMap = new Map<string, string>();
    if (campaignIdsToLookup.length > 0) {
      const uniqueIds = [...new Set(campaignIdsToLookup)] as string[];
      let cmpQ = supabase
        .from("meta_campaign_status")
        .select("campaign_id, campaign_name, account_id")
        .in("campaign_id", uniqueIds)
        .limit(500);
      if (currentOpId) cmpQ = cmpQ.eq("operation_id", currentOpId);
      const { data: cmpData } = await cmpQ;
      (cmpData || []).forEach((c: any) => {
        campaignNameMap.set(c.campaign_id, c.campaign_name);
      });
    }

    const cbOnlySales: LiveSale[] = cbToInject.map((cb: any) => {
      const campaignName = cb.meta_campaign_id ? campaignNameMap.get(cb.meta_campaign_id) || null : null;
      const isHotmart = (cb.vendor || "").toLowerCase() === "hotmart";
      const tracking = cb.raw_tracking || {};
      const sale: LiveSale = {
        id: cb.id,
        created_at: cb.created_at,
        product_name: cb.product_name || cb.item_name || cb.vendor || (isHotmart ? "Hotmart" : "ClickBank"),
        offer_name: cb.item_name || null,
        revenue: Number(cb.amount_brl || 0),
        store: isHotmart ? "hotmart" : "clickbank",
        status: "approved",
        order_id: cb.receipt,
        utm_campaign: cb.utm_campaign || campaignName,
        utm_source: cb.utm_source || null,
        utm_medium: cb.utm_medium || null,
        utm_content: cb.utm_content || null,
        utm_term: cb.utm_term || null,
        device: null,
        browser: null,
        os: null,
        country: null,
        city: null,
        project: null,
        variant: null,
        event_type: "purchase",
        vendor: cb.vendor || null,
        meta_campaign_id: cb.meta_campaign_id || null,
        meta_adset_id: cb.meta_adset_id || null,
        meta_ad_id: cb.meta_ad_id || null,
        meta_placement: cb.meta_placement || null,
        meta_campaign_name: cb.meta_campaign_name || null,
        meta_adset_name: cb.meta_adset_name || null,
        meta_ad_name: cb.meta_ad_name || null,
        sub4: tracking.sub4 || null,
        sub5: tracking.sub5 || null,
        sub6: tracking.sub6 || null,
        sub4_ad_name: tracking.adname || tracking.rt_ad || null,
      };
      const resolved = resolveProject(sale);
      sale.project = resolved.project;
      sale.variant = resolved.variant;
      sale.is_manual = false;
      return sale;
    });

    const seenMerged = new Set<string>();
    const rtConversionsMapped: LiveSale[] = (redtrackEventsResult.data as any || []).map((rc: any) => {
      const payload = rc.raw_payload || {};
      const sale: LiveSale = {
        id: rc.id,
        created_at: rc.conv_time,
        product_name: rc.offer || "RedTrack Sale",
        offer_name: rc.rt_campaign || rc.campaign || rc.offer,
        revenue: Number(rc.payout_brl || 0),
        store: "redtrack",
        status: "approved",
        order_id: rc.rt_id || rc.clickid || rc.id,
        utm_campaign: rc.rt_campaign || rc.campaign,
        country: rc.country,
        event_type: "purchase",
        is_manual: false,
        utm_source: rc.rt_source || undefined,
        utm_medium: rc.rt_medium || undefined,
        utm_content: rc.rt_ad || undefined,
        utm_term: rc.rt_placement || undefined,
        sub4: payload.sub4 || null,
        sub5: payload.sub5 || null,
        sub6: payload.sub6 || rc.rt_campaign || null,
        sub4_ad_name: rc.rt_ad || payload.adname || null,
        meta_campaign_name: rc.rt_campaign || null,
      } as LiveSale;
      Object.assign(sale as any, {
        rt_source: rc.rt_source,
        rt_medium: rc.rt_medium,
        rt_campaign: rc.rt_campaign,
        rt_adgroup: rc.rt_adgroup,
        rt_ad: rc.rt_ad,
        rt_placement: rc.rt_placement,
        rt_campaign_id: rc.rt_campaign_id,
        rt_adgroup_id: rc.rt_adgroup_id,
        rt_ad_id: rc.rt_ad_id,
        device_fullname: rc.device_fullname,
        browser: rc.browser,
        os: rc.os,
        city: rc.city,
        rt_project: rc.project,
        rt_product: rc.product,
      });
      const resolved = resolveProject(sale);
      sale.project = resolved.project;
      sale.variant = resolved.variant;
      return sale;
    });

    // === COD orders (GTX MIDIA apenas) ===
    // GTX opera COD por afiliação: a receita autoritativa é a COMISSÃO em BRL
    // (commission_value_brl), mesma regra do Dashboard COD. NÃO usar order_value_brl
    // (é o valor bruto do pedido, do anunciante — não é faturamento nosso).
    // Escopo estrito: só roda quando a operação ativa é GTX.
    const codSales: LiveSale[] = [];
    if (currentOpId === GTX_OPERATION_ID) {
      const { data: codRows } = await supabase
        .from("cod_orders")
        .select("id, created_at, order_date, product_name, product_key, commission_value_brl, status, source, platform, external_order_id, customer_country, raw_payload")
        .eq("operation_id", GTX_OPERATION_ID)
        .gte("created_at", startISO)
        .not("status", "in", "(cancelled,expired,refunded)")
        .order("created_at", { ascending: false })
        .limit(500);

      for (const c of (codRows || []) as any[]) {
        const attribution = (c.raw_payload?.data?.attribution || c.raw_payload?.attribution || {}) as any;
        const sale: LiveSale = {
          id: `cod:${c.id}`,
          created_at: c.created_at,
          date: c.order_date || null,
          product_name: c.product_name || c.product_key || "COD",
          offer_name: c.product_name || null,
          revenue: Number(c.commission_value_brl || 0),
          store: c.source === "fahto" ? "fahto" : c.source || c.platform || "cod",
          status: "approved",
          order_id: `cod:${c.external_order_id || c.id}`,
          utm_campaign: attribution.utm_campaign || null,
          utm_source: attribution.utm_source || null,
          utm_medium: attribution.utm_medium || null,
          utm_content: attribution.utm_content || null,
          utm_term: attribution.utm_term || null,
          country: c.customer_country || null,
          event_type: "purchase",
          is_manual: c.source === "manual",
        };
        const resolved = resolveProject(sale);
        sale.project = resolved.project;
        sale.variant = resolved.variant;
        codSales.push(sale);
      }
    }

    const merged = sortLiveSales([...cartPandaSales, ...redtrackSales, ...cbOnlySales, ...rtConversionsMapped, ...codSales]).filter((sale) => {

      const key = getDedupeKey(sale);
      if (seenMerged.has(key)) return false;
      seenMerged.add(key);
      return true;
    });

    // --- Meta Ads Enrichment (Batch Fetch) ---
    // BUG 1: sales_data doesn't have raw_payload. Fetch from redtrack_events.
    const orderIds = merged.map(s => s.order_id).filter(Boolean);
    const rtClickIds = orderIds.map(o => o.replace('rt:', ''));
    
    if (rtClickIds.length > 0) {
      try {
        const { data: rtEvents } = await supabase
          .from('redtrack_events')
          .select('clickid, raw_payload')
          .in('clickid', rtClickIds);
          
        const payloadMap = new Map((rtEvents || []).map(e => [e.clickid, e.raw_payload]));
        
        const campIds = new Set<string>();
        const adsetIds = new Set<string>();
        const adIds = new Set<string>();
        
        for (const s of merged) {
          const clickId = s.order_id?.replace('rt:', '');
          const p = payloadMap.get(clickId) as any;
          if (p) {
            s.raw_payload = p;
            if (p.rt_campaign_id) campIds.add(String(p.rt_campaign_id));
            if (p.rt_adgroup_id) adsetIds.add(String(p.rt_adgroup_id));
            if (p.rt_ad_id) adIds.add(String(p.rt_ad_id));
          }
        }

        // BUG 2: Correct table names are meta_campaign_status, etc.
        if (campIds.size > 0 || adsetIds.size > 0 || adIds.size > 0) {
          const [campsRes, adsetsRes, adsRes] = await Promise.all([
            campIds.size > 0 ? (supabase as any).from('meta_campaign_status').select('campaign_id, campaign_name').in('campaign_id', [...campIds]) : Promise.resolve({ data: [] }),
            adsetIds.size > 0 ? (supabase as any).from('meta_adset_status').select('adset_id, adset_name').in('adset_id', [...adsetIds]) : Promise.resolve({ data: [] }),
            adIds.size > 0 ? (supabase as any).from('meta_ad_status').select('ad_id, name').in('ad_id', [...adIds]) : Promise.resolve({ data: [] }),
          ]);

          const campMap = new Map((campsRes.data || []).map((c: any) => [String(c.campaign_id), c.campaign_name]));
          const adsetMap = new Map((adsetsRes.data || []).map((a: any) => [String(a.adset_id), a.adset_name]));
          const adMap = new Map((adsRes.data || []).map((a: any) => [String(a.ad_id), a.name]));

          for (const s of merged) {
            const clickId = s.order_id?.replace('rt:', '');
            const p = payloadMap.get(clickId) as any;
            if (!p) continue;
            
            if (p.rt_campaign_id && campMap.has(String(p.rt_campaign_id))) s.meta_campaign_name = campMap.get(String(p.rt_campaign_id)) as string;
            if (p.rt_adgroup_id && adsetMap.has(String(p.rt_adgroup_id))) s.meta_adset_name = adsetMap.get(String(p.rt_adgroup_id)) as string;
            if (p.rt_ad_id && adMap.has(String(p.rt_ad_id))) s.meta_ad_name = adMap.get(String(p.rt_ad_id)) as string;
          }
        }
      } catch (e) {
        console.error("Error enriching Meta Ads names:", e);
      }
    }



    // Detect new sales from polling (only after initial load).
    // Dedupe by semantic key (receipt/order_id), NOT by row id, because the same
    // real sale may arrive with different IDs from RedTrack, ClickBank audit
    // injection, and CartPanda — which previously caused duplicate toasts.
    if (initialLoadDone.current) {
      const seenInBatch = new Set<string>();
      const newSales = merged.filter((s) => {
        if (knownIdsRef.current.has(s.id)) return false;
        const key = getDedupeKey(s);
        if (knownDedupeKeysRef.current.has(key)) return false;
        if (seenInBatch.has(key)) return false;
        seenInBatch.add(key);
        return true;
      });

      if (newSales.length > 0 && newSales.length <= 5) {
        // Only notify if a small batch (≤5) — large batches are likely backfills/reconciliation, not real new sales
        const newest = newSales[0];
        setLatestNewSale(newest);
        setUnreadCount((c) => c + newSales.length);

        if (soundEnabledRef.current) {
          playPingSound(newSales.length >= 3 ? "strong" : "normal");
        }
      }
    }

    // Update known IDs + dedupe keys — additive to prevent "ghost" new sales on subsequent polls
    for (const s of merged) {
      knownIdsRef.current.add(s.id);
      knownDedupeKeysRef.current.add(getDedupeKey(s));
    }
    initialLoadDone.current = true;

    setSales(merged);
  }, []);

  useEffect(() => {
    fetchRecent();

    // Realtime subscription for sales_data
    if (!opId) return;

    const salesChannel = supabase
      .channel(`sales-live-v2-${opId}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "sales_data",
          filter: `operation_id=eq.${opId}`
        },
        async (payload) => {
          const raw = payload.new as any;
          if (raw.status !== "approved") return;
          if (Number(raw.revenue || 0) <= 0) return;
          if (String(raw.store || "").toLowerCase() === "hotmart") return;
          // Filter by operation
          const currentOpId = opIdRef.current;
          if (currentOpId && raw.operation_id && raw.operation_id !== currentOpId) return;
          if (isCbAuditMirrorCandidate(raw)) {
            const mirrorReceipt = await findRealtimeCbMirrorReceipt({
              createdAt: raw.created_at,
              amountBrl: Number(raw.revenue || 0),
            });
            if (mirrorReceipt) return;
          }
          // Skip if already known (polling already caught it) — by row id OR semantic key
          if (knownIdsRef.current.has(raw.id)) return;
          const dedupeKey = getDedupeKey(raw);
          if (knownDedupeKeysRef.current.has(dedupeKey)) return;
          knownIdsRef.current.add(raw.id);
          knownDedupeKeysRef.current.add(dedupeKey);

          const { project, variant } = resolveProject(raw);
          const newSale: LiveSale = {
            ...raw,
            project,
            variant,
          };

          setSales((prev) => {
            const updated = sortLiveSales([newSale, ...prev]);

            if (updated.length >= 5) {
              const span =
                new Date(updated[0].created_at).getTime() -
                new Date(updated[4].created_at).getTime();
              if (span < 2 * 60_000 && soundEnabledRef.current) {
                playPingSound("strong");
                return updated;
              }
            }

            if (soundEnabledRef.current) playPingSound("normal");
            return updated;
          });

          setLatestNewSale(newSale);
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();

    // Realtime subscription for redtrack_events
    const redtrackChannel = supabase
      .channel(`redtrack-live-v1-${opId}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "redtrack_events",
          filter: `operation_id=eq.${opId}`
        },
        async (payload) => {
          const evt = payload.new as any;
          if (evt.event_type !== "purchase") return;

          // Filter by operation
          const currentOpId = opIdRef.current;
          if (currentOpId && evt.operation_id && evt.operation_id !== currentOpId) return;
          // Upsells with $0 should NOT inherit primary sale value from audit
          const isUpsell = evt.event_type === "upsell";
          const manualSale = isManualSale({
            offer_name: evt.offer_name || null,
            product_name: evt.product_name || null,
          });
          const realtimeDetails = isUpsell
            ? {
                revenue: resolveRedtrackRevenueBrl(evt, usdToBrlRef.current),
                createdAt: evt.occurred_at || evt.created_at || new Date().toISOString(),
              }
            : await resolveRealtimeAuditDetails(evt);
          const revenue = realtimeDetails.revenue;

          // War Room should only react to confirmed revenue.
          if (Number(revenue || 0) <= 0) return;

          const receipt = getRedtrackReceipt(evt);
          if (resolveCheckoutPlatformKey({ offer_name: evt.offer_name, store: "redtrack" }) === "hw") {
            const amount = Number(evt.amount || 0);
            const amountUsd = (evt.currency || "USD").toString().toUpperCase() === "BRL"
              ? (usdToBrlRef.current > 0 ? amount / usdToBrlRef.current : null)
              : amount;
            const mirrorReceipt = await findRealtimeCbMirrorReceipt({
              createdAt: evt.occurred_at || evt.created_at,
              amountUsd,
            });
            if (mirrorReceipt) return;
          }

          // Skip if already known — by row id OR semantic key (receipt).
          // Prevents duplicate toasts when the same receipt also arrives via
          // clickbank_audit injection during polling.
          if (knownIdsRef.current.has(evt.id)) return;
          const dedupeKeyRt = getDedupeKey({ id: evt.id, order_id: receipt || evt.redtrack_id || evt.id, created_at: evt.occurred_at || evt.created_at, revenue, product_name: evt.product_name || "RedTrack" });
          if (knownDedupeKeysRef.current.has(dedupeKeyRt)) return;
          knownIdsRef.current.add(evt.id);
          knownDedupeKeysRef.current.add(dedupeKeyRt);

          const newSale: LiveSale = {
            id: evt.id,
            created_at: realtimeDetails.createdAt || evt.occurred_at || evt.created_at,
            product_name: evt.product_name || "RedTrack",
            offer_name: evt.offer_name || null,
            revenue,
            store: "redtrack",
            status: "approved",
            order_id: receipt || evt.transaction_id || evt.clickid || evt.redtrack_id || evt.id,
            utm_campaign: evt.utm_campaign || null,
            utm_source: evt.utm_source || null,
            utm_medium: (evt.utm_medium || "").replace(/\|[\d]+$/, "") || null,
            utm_content: evt.raw_payload?.rt_ad || evt.utm_content || null,
            utm_term: evt.utm_term || null,
            device: evt.device || null,
            browser: evt.browser || null,
            os: evt.os || null,
            country: evt.country || null,
            city: evt.city || null,
            project: null,
            variant: null,
            event_type: evt.event_type || "purchase",
            is_manual: manualSale,
          };
          const resolved = resolveProject(newSale);
          newSale.project = resolved.project;
          newSale.variant = resolved.variant;
          if (manualSale) {
            newSale.offer_name = (newSale.offer_name || "").replace(/^\[MANUAL\]\s*/i, "") || newSale.offer_name;
          }

          setSales((prev) => {
            if (prev.some((s) => s.id === newSale.id)) return prev;
            const updated = sortLiveSales([newSale, ...prev]);

            if (updated.length >= 5) {
              const span =
                new Date(updated[0].created_at).getTime() -
                new Date(updated[4].created_at).getTime();
              if (span < 2 * 60_000 && soundEnabledRef.current) {
                playPingSound("strong");
                return updated;
              }
            }

            if (soundEnabledRef.current) playPingSound("normal");
            return updated;
          });

          setLatestNewSale(newSale);
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();

    // Polling fallback every 15s (more aggressive to catch sales faster when realtime fails)
    const pollInterval = setInterval(fetchRecent, 15_000);

    return () => {
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(redtrackChannel);
      clearInterval(pollInterval);
    };
  }, [fetchRecent]);
  
  useEffect(() => {
    const interval = setInterval(fetchRecent, 15_000);
    return () => clearInterval(interval);
  }, [fetchRecent]);

  // Use ALL sales for the "last sale" timer, but skip future timestamps
  // (reconciled entries may have uncorrected future occurred_at if CB match wasn't found).
  const nowMs = Date.now();
  const lastValidSale = sales.find((s) => new Date(s.created_at).getTime() <= nowMs);
  const lastSaleAt = lastValidSale ? new Date(lastValidSale.created_at) : null;

  return {
    sales,
    lastSaleAt,
    unreadCount,
    markAsRead,
    soundEnabled,
    toggleSound,
    refetch: fetchRecent,
    latestNewSale,
    consumeLatestSale,
  };
}
