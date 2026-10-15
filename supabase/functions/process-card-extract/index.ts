// =====================================================
// process-card-extract
// Sprint 1 Reconciliação Financeira - D2
//
// Recebe upload (multipart/form-data) de CSV Lot ou Payoneer,
// faz parse, normaliza para daily_card_charges, salva CSV
// original em bucket card-extracts, loga em integration_logs.
//
// Body: FormData
//   - file: File (CSV)
//   - provider: "lot" | "payoneer"
//
// Auth: requer JWT válido + role 'admin'
//
// Comportamento:
//   - Lot: importa apenas status=Settled. Ignora linhas sem transaction_id.
//   - Payoneer: importa apenas Card charges com FACEBK/METAPAY na descrição.
//   - Idempotência: source_row_hash = sha256(provider + ':' + transaction_id)
//   - Upsert: ON CONFLICT (source_row_hash) DO NOTHING (não sobrescreve)
//   - CSV original salvo em card-extracts/{provider}/{yyyy-mm-dd}/{filename}
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface CardCharge {
  charge_date: string; // YYYY-MM-DD
  card_provider: "lot" | "payoneer";
  card_last_four: string | null;
  ad_account_id: string | null; // FB transaction code (ex: "YJZKCM54E2")
  raw_description: string;
  merchant_name: string | null;
  amount_usd: number | null;
  amount_brl: number; // será preenchido depois (FX); se já BRL, valor direto
  fx_rate_charged: number | null;
  source_row_hash: string;
}

// =====================================================
// CSV PARSER (suporta vírgulas dentro de aspas)
// =====================================================
function parseCSV(text: string): string[][] {
  // Remove BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        cell = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// =====================================================
// SHA-256 hash (Web Crypto API)
// =====================================================
async function sha256(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// =====================================================
// Detecta se descrição é cobrança Meta Ads
// =====================================================
function isMetaCharge(desc: string): boolean {
  const upper = desc.toUpperCase();
  return (
    upper.includes("FACEBK") ||
    upper.includes("FACEBOOK") ||
    upper.includes("METAPAY") ||
    upper.includes("META PAY") ||
    upper.includes("META PLATFORMS")
  );
}

// Extrai código FB tipo "YJZKCM54E2" de "FACEBK *YJZKCM54E2"
function extractFbCode(desc: string): string | null {
  const m = desc.match(/(?:FACEBK|FACEBOOK|METAPAY)\s*\*?\s*([A-Z0-9]{6,16})/i);
  return m ? m[1].toUpperCase() : null;
}

// =====================================================
// Categoriza linha Payoneer em uma das 8 categorias
// =====================================================
type PayoneerCategory =
  | "card_charge_meta"
  | "card_charge_other"
  | "wire_in"
  | "wire_out"
  | "fee"
  | "fx_conversion"
  | "refund"
  | "other";

function categorizePayoneer(
  desc: string,
  debit: number,
  credit: number,
): PayoneerCategory {
  const d = desc.toLowerCase();
  // Refund / chargeback
  if (d.includes("refund") || d.includes("chargeback") || d.includes("reversal")) {
    return "refund";
  }
  // Fee
  if (d.includes("fee") || d.includes("commission") || d.includes("charge for")) {
    return "fee";
  }
  // FX conversion
  if (d.includes("currency conversion") || d.includes("fx ") || d.includes("exchange")) {
    return "fx_conversion";
  }
  // Card charge
  if (d.startsWith("card charge") || d.includes("card transaction")) {
    return isMetaCharge(desc) ? "card_charge_meta" : "card_charge_other";
  }
  // Wire / transfer
  if (
    d.includes("wire") ||
    d.includes("ach") ||
    d.includes("transfer") ||
    d.includes("payment received") ||
    d.includes("payment from") ||
    d.includes("incoming") ||
    d.includes("outgoing")
  ) {
    if (credit > 0 && debit === 0) return "wire_in";
    if (debit > 0 && credit === 0) return "wire_out";
  }
  // Default: direção pelo sinal
  if (credit > 0 && debit === 0) return "wire_in";
  return "other";
}

// =====================================================
// PARSER LOT
// Headers: transaction id,nickname,card ending,transaction date,
//          posted date,description,status,amount
// Regras: só status=Settled, ignora sem transaction id
// Amount em BRL (cartão BR)
// =====================================================
async function parseLot(rows: string[][]): Promise<{
  charges: CardCharge[];
  skipped: { reason: string; count: number }[];
  totalRows: number;
}> {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    txId: header.indexOf("transaction id"),
    nickname: header.indexOf("nickname"),
    cardEnd: header.indexOf("card ending"),
    date: header.indexOf("transaction date"),
    desc: header.indexOf("description"),
    status: header.indexOf("status"),
    amount: header.indexOf("amount"),
  };
  if (Object.values(idx).some((v) => v === -1)) {
    throw new Error(
      `CSV Lot inválido. Headers esperados: transaction id, nickname, card ending, transaction date, description, status, amount. Recebido: ${header.join(", ")}`,
    );
  }

  const charges: CardCharge[] = [];
  const skipNoId: string[] = [];
  const skipBadStatus: string[] = [];
  const skipNotMeta: string[] = [];
  const skipInvalidAmount: string[] = [];

  // Regra alinhada (2026-04): aceita Settled + On hold; descarta o resto
  const ALLOWED_LOT_STATUS = new Set(["settled", "on hold", "on_hold", "onhold"]);

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < header.length) continue;

    const txId = (r[idx.txId] || "").trim();
    const status = (r[idx.status] || "").trim();
    const amountStr = (r[idx.amount] || "").trim();
    const desc = (r[idx.desc] || "").trim();
    const date = (r[idx.date] || "").trim(); // YYYY-MM-DD já

    if (!txId) {
      skipNoId.push(desc);
      continue;
    }
    if (!ALLOWED_LOT_STATUS.has(status.toLowerCase())) {
      skipBadStatus.push(status);
      continue;
    }
    // Filtro Meta estrito: só FACEBK / FACEBOOK / METAPAY / META PAY / META PLATFORMS
    if (!isMetaCharge(desc)) {
      skipNotMeta.push(desc.slice(0, 40));
      continue;
    }
    const amount = parseFloat(amountStr);
    if (!isFinite(amount) || amount <= 0) {
      skipInvalidAmount.push(amountStr);
      continue;
    }

    const hash = await sha256(`lot:${txId}`);
    // CORREÇÃO 2026-04-27: Lot vem em USD no CSV (cartão Lotrush é dolarizado).
    // amount_brl será preenchido depois com FX do dia (mesmo fluxo do Payoneer).
    charges.push({
      charge_date: date,
      card_provider: "lot",
      card_last_four: (r[idx.cardEnd] || "").trim() || null,
      ad_account_id: extractFbCode(desc),
      raw_description: desc,
      merchant_name: (r[idx.nickname] || "").trim() || null,
      amount_usd: amount,
      amount_brl: 0, // será calculado com FX abaixo
      fx_rate_charged: null,
      source_row_hash: hash,
    });
  }

  return {
    charges,
    skipped: [
      { reason: "no_transaction_id", count: skipNoId.length },
      { reason: "status_not_allowed", count: skipBadStatus.length },
      { reason: "not_meta_charge", count: skipNotMeta.length },
      { reason: "invalid_amount", count: skipInvalidAmount.length },
    ],
    totalRows: rows.length - 1,
  };
}

// =====================================================
// PARSER PAYONEER (Onda 2 - D8)
// Headers: Transaction Date,Transaction Time,Time Zone,Transaction ID,
//   Description,Credit Amount,Debit Amount,Currency,Transfer Amount,
//   Transfer Amount Currency,Status,Running Balance,
//   Additional Description,Store Name,Source,Target,Reference ID
// Regras:
//   - charges (daily_card_charges): só Meta ad spend (Card charge FACEBK/METAPAY) USD
//   - allTransactions (payoneer_transactions): TODAS linhas com txId, categorizadas
// =====================================================
interface PayoneerTransaction {
  transaction_id: string;
  source_row_hash: string;
  transaction_date: string;
  category: PayoneerCategory;
  description: string;
  raw_description: string;
  store_name: string | null;
  source_label: string | null;
  target_label: string | null;
  reference_id: string | null;
  status: string | null;
  currency: string;
  debit_amount: number;
  credit_amount: number;
  net_amount: number;
  running_balance: number | null;
}

async function parsePayoneer(rows: string[][]): Promise<{
  charges: CardCharge[];
  allTransactions: PayoneerTransaction[];
  skipped: { reason: string; count: number }[];
  totalRows: number;
}> {
  const header = rows[0].map((h) => h.trim());
  const idx = {
    date: header.indexOf("Transaction Date"),
    txId: header.indexOf("Transaction ID"),
    desc: header.indexOf("Description"),
    debit: header.indexOf("Debit Amount"),
    credit: header.indexOf("Credit Amount"),
    currency: header.indexOf("Currency"),
    status: header.indexOf("Status"),
    source: header.indexOf("Source"),
    target: header.indexOf("Target"),
    refId: header.indexOf("Reference ID"),
    storeName: header.indexOf("Store Name"),
    runningBal: header.indexOf("Running Balance"),
  };
  const required = ["date", "txId", "desc", "debit", "currency", "status"];
  for (const k of required) {
    if ((idx as any)[k] === -1) {
      throw new Error(
        `CSV Payoneer inválido. Header faltando para "${k}". Recebido: ${header.join(", ")}`,
      );
    }
  }

  const charges: CardCharge[] = [];
  const allTransactions: PayoneerTransaction[] = [];
  const skipNoId: string[] = [];
  const skipNotMeta: string[] = [];
  const skipNotUsd: string[] = [];
  const skipNotDebit: string[] = [];
  const skipNotCompleted: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < header.length) continue;

    const txId = (r[idx.txId] || "").trim();
    const desc = (r[idx.desc] || "").trim();
    const debitStr = (r[idx.debit] || "").trim();
    const creditStr = (r[idx.credit] || "").trim();
    const currency = (r[idx.currency] || "").trim().toUpperCase() || "USD";
    const dateStr = (r[idx.date] || "").trim(); // MM/DD/YYYY

    if (!txId) {
      skipNoId.push(desc);
      continue;
    }

    // Converte MM/DD/YYYY -> YYYY-MM-DD
    const dateParts = dateStr.split("/");
    if (dateParts.length !== 3) continue;
    const [mm, dd, yyyy] = dateParts;
    const isoDate = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

    const debit = parseFloat(debitStr) || 0;
    const credit = parseFloat(creditStr) || 0;
    const runningBal = idx.runningBal !== -1
      ? (parseFloat((r[idx.runningBal] || "").trim()) || null)
      : null;

    const refId = (r[idx.refId] || "").trim() || null;
    const sourceLabel = (r[idx.source] || "").trim() || null;
    const targetLabel = (r[idx.target] || "").trim() || null;
    const storeName = idx.storeName !== -1 ? ((r[idx.storeName] || "").trim() || null) : null;
    const status = (r[idx.status] || "").trim() || null;

    const category = categorizePayoneer(desc, debit, credit);
    const hash = await sha256(`payoneer:${txId}`);

    // Push em allTransactions (todas com txId, qualquer status — pra histórico/auditoria)
    allTransactions.push({
      transaction_id: txId,
      source_row_hash: hash,
      transaction_date: isoDate,
      category,
      description: desc,
      raw_description: desc,
      store_name: storeName,
      source_label: sourceLabel,
      target_label: targetLabel,
      reference_id: refId,
      status,
      currency,
      debit_amount: debit,
      credit_amount: credit,
      net_amount: credit - debit,
      running_balance: runningBal,
    });

    // ===== Filtros para daily_card_charges (gasto Meta reconciliável) =====
    // Regra alinhada (2026-04): SÓ status=Completed entra. Pending/Cancelled/etc descartados.
    if (category !== "card_charge_meta") {
      skipNotMeta.push(desc.slice(0, 30));
      continue;
    }
    if ((status || "").toLowerCase() !== "completed") {
      skipNotCompleted.push(status || "(empty)");
      continue;
    }
    if (currency !== "USD") {
      skipNotUsd.push(currency);
      continue;
    }
    if (!isFinite(debit) || debit <= 0) {
      skipNotDebit.push(debitStr);
      continue;
    }

    const fbCode = extractFbCode(desc) || (refId ? extractFbCode(refId) : null);
    const lastFourMatch = sourceLabel ? sourceLabel.match(/(\d{4})/) : null;

    charges.push({
      charge_date: isoDate,
      card_provider: "payoneer",
      card_last_four: lastFourMatch ? lastFourMatch[1] : null,
      ad_account_id: fbCode,
      raw_description: desc,
      merchant_name: sourceLabel,
      amount_usd: debit,
      amount_brl: 0, // será calculado depois com FX
      fx_rate_charged: null,
      source_row_hash: hash,
    });
  }

  return {
    charges,
    allTransactions,
    skipped: [
      { reason: "no_transaction_id", count: skipNoId.length },
      { reason: "not_meta_card_charge", count: skipNotMeta.length },
      { reason: "status_not_completed", count: skipNotCompleted.length },
      { reason: "not_usd", count: skipNotUsd.length },
      { reason: "invalid_debit_amount", count: skipNotDebit.length },
    ],
    totalRows: rows.length - 1,
  };
}


// =====================================================
// MAIN HANDLER
// =====================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ---- Auth: valida JWT + role admin ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const jwt = authHeader.slice(7);

  const supabaseAuth = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  // Service client para checagem de role + escrita
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const { data: roleData } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!roleData) {
    return new Response(
      JSON.stringify({ error: "Forbidden: admin role required" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ---- Parse body: aceita multipart/form-data OU JSON {provider, filename, csv_text} ----
  let provider: string | undefined;
  let csvText: string | undefined;
  let originalFilename = "extract.csv";

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const body = await req.json();
      provider = (body.provider as string)?.toLowerCase();
      csvText = body.csv_text as string;
      originalFilename = (body.filename as string) || originalFilename;
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body", detail: String(e) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } else {
    // multipart/form-data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid multipart body", detail: String(e) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const file = formData.get("file");
    provider = (formData.get("provider") as string)?.toLowerCase();
    if (!(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "Missing 'file' field (must be File)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    csvText = await file.text();
    originalFilename = file.name;
  }

  if (provider !== "lot" && provider !== "payoneer") {
    return new Response(
      JSON.stringify({ error: "provider must be 'lot' or 'payoneer'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!csvText || typeof csvText !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing csv content" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    return new Response(
      JSON.stringify({ error: "CSV vazio ou sem linhas de dados" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ---- Parse por provider ----
  type ParsedResult = {
    charges: CardCharge[];
    allTransactions?: PayoneerTransaction[];
    skipped: { reason: string; count: number }[];
    totalRows: number;
  };
  let parsed: ParsedResult;
  try {
    parsed =
      provider === "lot" ? await parseLot(rows) : await parsePayoneer(rows);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Parse failure", detail: String(e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ---- Salva CSV original no bucket card-extracts ----
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${provider}/${today}/${Date.now()}_${safeName}`;
  const { error: uploadErr } = await supabase.storage
    .from("card-extracts")
    .upload(storagePath, csvText, {
      contentType: "text/csv",
      upsert: false,
    });
  if (uploadErr) {
    console.warn("Storage upload failed (non-fatal):", uploadErr.message);
  }

  // ---- Cria log "processing" upfront para vincular linhas via upload_log_id ----
  const { data: logRow, error: logCreateErr } = await supabase
    .from("integration_logs")
    .insert({
      integration: `card_extract_${provider}`,
      status: "processing",
      records_processed: 0,
      message: JSON.stringify({ provider, file_name: originalFilename, storage_path: uploadErr ? null : storagePath, started_at: new Date().toISOString() }),
    })
    .select("id")
    .single();
  if (logCreateErr || !logRow) {
    console.error("[process-card-extract] failed to create upload log", logCreateErr);
  }
  const uploadLogId: string | null = logRow?.id ?? null;

  // ---- Insere em daily_card_charges (idempotente via source_row_hash) ----
  // Estratégia: busca hashes existentes pra calcular novas vs duplicadas
  let inserted = 0;
  let duplicated = 0;
  let failed = 0;
  const errors: string[] = [];

  if (parsed.charges.length > 0) {
    const hashes = parsed.charges.map((c) => c.source_row_hash);
    const { data: existing } = await supabase
      .from("daily_card_charges")
      .select("source_row_hash")
      .in("source_row_hash", hashes);
    const existingSet = new Set((existing || []).map((e) => e.source_row_hash));

    let toInsert = parsed.charges.filter(
      (c) => !existingSet.has(c.source_row_hash),
    );
    duplicated = parsed.charges.length - toInsert.length;

    // Aplica FX (PTAX) USD→BRL para Payoneer E Lot (ambos vêm em USD).
    // Fallback de 5.10 se não tiver cotação cadastrada (fim de semana/feriado).
    if (toInsert.length > 0) {
      const uniqueDates = [...new Set(toInsert.map((c) => c.charge_date))];
      const { data: ratesData } = await supabase
        .from("exchange_rates_daily")
        .select("rate_date, rate_avg")
        .eq("currency_from", "USD")
        .eq("currency_to", "BRL")
        .in("rate_date", uniqueDates);
      const fxByDate = new Map<string, number>();
      for (const r of (ratesData || [])) {
        fxByDate.set(r.rate_date as string, Number(r.rate_avg));
      }
      const FX_FALLBACK = 5.10;
      toInsert = toInsert.map((c) => {
        const fx = fxByDate.get(c.charge_date) ?? FX_FALLBACK;
        return {
          ...c,
          fx_rate_charged: fx,
          amount_brl: c.amount_usd != null ? Number(c.amount_usd) * fx : 0,
        };
      });
    }

    // Insere em chunks de 500 (com upload_log_id para permitir rollback)
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500).map((c) => ({ ...c, upload_log_id: uploadLogId }));
      const { error: insErr, count } = await supabase
        .from("daily_card_charges")
        .insert(chunk, { count: "exact" });
      if (insErr) {
        failed += chunk.length;
        errors.push(insErr.message);
      } else {
        inserted += count ?? chunk.length;
      }
    }
  }

  // ---- D8: Insere TODAS as transações Payoneer (categorizadas) ----
  let payoneerTxInserted = 0;
  let payoneerTxDup = 0;
  let topupsAutoCreated = 0;
  if (provider === "payoneer" && parsed.allTransactions && parsed.allTransactions.length > 0) {
    const allHashes = parsed.allTransactions.map((t) => t.source_row_hash);
    const { data: existingPx } = await supabase
      .from("payoneer_transactions")
      .select("source_row_hash")
      .in("source_row_hash", allHashes);
    const existingPxSet = new Set((existingPx || []).map((e) => e.source_row_hash));
    const txToInsert = parsed.allTransactions.filter(
      (t) => !existingPxSet.has(t.source_row_hash),
    );
    payoneerTxDup = parsed.allTransactions.length - txToInsert.length;

    // Busca FX rate por dia (PTAX) para preencher amount_brl
    const uniqueDates = [...new Set(txToInsert.map((t) => t.transaction_date))];
    const { data: ratesData } = await supabase
      .from("exchange_rates_daily")
      .select("rate_date, rate_avg")
      .eq("currency_from", "USD")
      .eq("currency_to", "BRL")
      .in("rate_date", uniqueDates);
    const fxByDate = new Map<string, number>();
    for (const r of (ratesData || [])) {
      fxByDate.set(r.rate_date as string, Number(r.rate_avg));
    }

    const enriched = txToInsert.map((t) => {
      const fx = fxByDate.get(t.transaction_date) ?? null;
      const amountBrl = fx != null ? t.net_amount * fx : null;
      return { ...t, fx_rate: fx, amount_brl: amountBrl, upload_log_id: uploadLogId };
    });

    for (let i = 0; i < enriched.length; i += 500) {
      const chunk = enriched.slice(i, i + 500);
      const { error: pxErr, count } = await supabase
        .from("payoneer_transactions")
        .insert(chunk, { count: "exact" });
      if (pxErr) {
        console.error("[process-card-extract] payoneer_tx insert failed", pxErr);
      } else {
        payoneerTxInserted += count ?? chunk.length;
      }
    }

    // Auto-cria topups em treasury_topups para wire_in (entradas)
    const wireIns = enriched.filter((t) => t.category === "wire_in" && t.credit_amount > 0);
    if (wireIns.length > 0) {
      // Verifica quais já têm topup vinculado por reference (transaction_id)
      const refs = wireIns.map((w) => `payoneer:${w.transaction_id}`);
      const { data: existingTopups } = await supabase
        .from("treasury_topups")
        .select("reference")
        .in("reference", refs);
      const existingRefs = new Set((existingTopups || []).map((t) => t.reference));

      const topupRows = wireIns
        .filter((w) => !existingRefs.has(`payoneer:${w.transaction_id}`))
        .map((w) => ({
          provider: "payoneer" as const,
          topup_date: w.transaction_date,
          amount: w.credit_amount,
          currency: w.currency,
          fx_rate: w.fx_rate,
          amount_brl: w.amount_brl ?? 0,
          reference: `payoneer:${w.transaction_id}`,
          notes: `Auto-criado via CSV: ${(w.description || "").slice(0, 100)}`,
          created_by: userId,
          upload_log_id: uploadLogId,
        }))
        .filter((t) => t.amount_brl > 0); // só insere se tem FX

      if (topupRows.length > 0) {
        const { error: topupErr, count: topupCount } = await supabase
          .from("treasury_topups")
          .insert(topupRows, { count: "exact" });
        if (topupErr) {
          console.error("[process-card-extract] auto-topup insert failed", topupErr);
        } else {
          topupsAutoCreated = topupCount ?? topupRows.length;
        }
      }
    }
  }

  // ---- Log integração ----
  const summary = {
    provider,
    file_name: originalFilename,
    storage_path: uploadErr ? null : storagePath,
    total_rows: parsed.totalRows,
    parsed_charges: parsed.charges.length,
    inserted,
    duplicated,
    failed,
    payoneer_tx_total: parsed.allTransactions?.length ?? 0,
    payoneer_tx_inserted: payoneerTxInserted,
    payoneer_tx_duplicated: payoneerTxDup,
    topups_auto_created: topupsAutoCreated,
    skipped: parsed.skipped,
    errors: errors.slice(0, 5),
  };

  if (uploadLogId) {
    await supabase
      .from("integration_logs")
      .update({
        status: failed > 0 ? "partial" : "success",
        records_processed: inserted,
        message: JSON.stringify(summary),
      })
      .eq("id", uploadLogId);
  } else {
    await supabase.from("integration_logs").insert({
      integration: `card_extract_${provider}`,
      status: failed > 0 ? "partial" : "success",
      records_processed: inserted,
      message: JSON.stringify(summary),
    });
  }

  // ----- TRIGGER auto-match-charges (fire-and-forget) -----
  // Reconcilia janela ampla pra cobrir charges recém-importadas
  let autoMatchTriggered = false;
  if (inserted > 0) {
    try {
      const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const start = new Date(Date.now() - 33 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      // Não aguarda resposta — dispara em background
      fetch(`${SUPABASE_URL}/functions/v1/auto-match-charges`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-trigger": "auto-match-internal-7c38facb-d3-2026",
        },
        body: JSON.stringify({
          start_date: start,
          end_date: today,
          card_provider: provider,
          trigger_source: `post_upload_${provider}`,
        }),
      }).catch((e) => console.error("[process-card-extract] auto-match trigger failed", e));
      autoMatchTriggered = true;
    } catch (e) {
      console.error("[process-card-extract] auto-match dispatch error", e);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, summary, auto_match_triggered: autoMatchTriggered }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
