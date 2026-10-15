// Web Push mirror — canal PARALELO ao Pushcut.
// Nunca altera nem bloqueia o fluxo Pushcut existente: fire-and-forget, erros só logam.

export interface PushMirrorOpts {
  operation_id?: string | null;
  notification_type: string;
  title: string;
  body: string;
  url?: string;
  payload?: Record<string, unknown>;
}

export async function mirrorToWebPush(opts: PushMirrorOpts): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;
    if (!opts?.title) return;

    await fetch(`${supabaseUrl}/functions/v1/push-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        operation_id: opts.operation_id ?? null,
        notification_type: opts.notification_type,
        title: opts.title,
        body: opts.body,
        url: opts.url ?? "/",
        payload: opts.payload ?? null,
      }),
    });
  } catch (e) {
    console.warn("[push-mirror] failed (non-blocking):", e);
  }
}

/**
 * Versão curta do utm_campaign para caber no push.
 * Regra: sufixo depois do último " - " se existir; senão o último bracket;
 * senão a string inteira. Trunca em 30 chars com "…".
 */
export function shortenCampaign(utmCampaign?: string | null): string | null {
  const raw = (utmCampaign ?? "").toString().trim();
  if (!raw) return null;
  let out = "";
  const dashIdx = raw.lastIndexOf(" - ");
  if (dashIdx >= 0) out = raw.slice(dashIdx + 3).trim();
  if (!out) {
    const brackets = raw.match(/\[([^\]]+)\]/g);
    if (brackets && brackets.length > 0) {
      out = brackets[brackets.length - 1].replace(/[[\]]/g, "").trim();
    }
  }
  if (!out) out = raw;
  if (!out) return null;
  if (out.length > 30) out = `${out.slice(0, 29)}…`;
  return out;
}

/** Converte qualquer moeda para USD. approx=true quando usou fallback (sem taxa no banco). */
async function toUsd(
  valor: number,
  currency: string,
): Promise<{ usd: number; approx: boolean }> {
  const cur = (currency || "USD").toUpperCase();
  if (cur === "USD") return { usd: valor, approx: false };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const fallbackToBrl: Record<string, number> = { EUR: 6.04, PLN: 1.42, RON: 1.21, BRL: 1 };
  const fallbackUsdBrl = 5.3;

  const rate = async (base: string, target: string): Promise<number | null> => {
    if (!supabaseUrl || !serviceKey) return null;
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/exchange_rates_cache?select=rate&base_currency=eq.${base}` +
          `&target_currency=eq.${target}&order=fetched_at.desc&limit=1`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      if (!res.ok) return null;
      const rows = await res.json();
      const r = Number(rows?.[0]?.rate);
      return Number.isFinite(r) && r > 0 ? r : null;
    } catch {
      return null;
    }
  };

  const direct = await rate(cur, "USD");
  if (direct) return { usd: valor * direct, approx: false };

  // via BRL: valor -> BRL -> USD
  const toBrl = cur === "BRL" ? 1 : await rate(cur, "BRL");
  const usdBrl = await rate("USD", "BRL");
  if (toBrl && usdBrl) return { usd: (valor * toBrl) / usdBrl, approx: false };

  const fb = toBrl ?? fallbackToBrl[cur] ?? 1;
  return { usd: (valor * fb) / (usdBrl ?? fallbackUsdBrl), approx: true };
}

/**
 * Atalho para vendas reais. SEMPRE dispara sale_approved — nunca depende de
 * template Pushcut. Fire-and-forget: nunca lança.
 * Formato: título "Venda aprovada! | <utm_campaign>" / body "Valor: $X.XX".
 */
export async function mirrorSaleToWebPush(sale: {
  operation_id?: string | null;
  order_id?: string | null;
  valor?: number | null;
  currency?: string;
  produto?: string | null;
  afiliado?: string | null;
  canal: string;
  url?: string;
  utm_campaign?: string | null;
  sale_created_at?: string | null;
}): Promise<void> {
  const cur = sale.currency ?? "BRL";
  const valorNum = typeof sale.valor === "number" && Number.isFinite(sale.valor) ? sale.valor : null;
  let valorUsd: number | null = null;
  let approx = false;
  if (valorNum !== null) {
    try {
      const c = await toUsd(valorNum, cur);
      valorUsd = c.usd;
      approx = c.approx;
    } catch {
      valorUsd = null;
    }
  }
  const valorFmt = valorUsd === null ? "" : `${approx ? "~" : ""}$${valorUsd.toFixed(2)}`;
  const campShort = shortenCampaign(sale.utm_campaign);
  const campFull = (sale.utm_campaign ?? "").toString().trim() || null;
  // Formato "estilo Utmify": título "Venda aprovada! | <campanha>" / body "Valor: $X.XX".
  const title = `Venda aprovada!${campFull ? ` | ${campFull}` : ""}`;
  const body = valorFmt
    ? `Valor: ${valorFmt}${approx ? " (fx pending)" : ""}`
    : "(payload incompleto)";

  await mirrorToWebPush({
    operation_id: sale.operation_id ?? null,
    notification_type: "sale_approved",
    title,
    body,
    url: sale.url ?? "/war-room",
    payload: {
      op: sale.operation_id ?? null,
      order_id: sale.order_id ?? null,
      sale_created_at: sale.sale_created_at ?? null,
      valor: sale.valor ?? null,
      currency: cur,
      valor_usd: valorUsd === null ? null : Number(valorUsd.toFixed(2)),
      fx_approx: approx,
      afiliado: sale.afiliado ?? null,
      canal: sale.canal,
      produto: sale.produto ?? null,
      utm_campaign: sale.utm_campaign ?? null,
      utm_campaign_short: campShort,
      valor_usd_display: valorFmt || null,
      fx_tilde: approx ? "~" : null,
      fx_note: approx ? " (fx pending)" : null,
    },
  });
}


