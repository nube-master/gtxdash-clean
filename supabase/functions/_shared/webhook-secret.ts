/**
 * Validação de secret de webhook COD.
 *
 * Suporta secrets gerados pelo Traffic OS (comparação direta) e secrets
 * gerados pela própria plataforma (whsec_..., assinatura HMAC-SHA256 do body).
 */

function normalizeSig(raw: string): string {
  let s = raw.trim();
  if (s.toLowerCase().startsWith("sha256=")) s = s.slice(7);
  return s;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacVariants(secret: string, body: string): Promise<string[]> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = btoa(String.fromCharCode(...bytes));
  return [hex, b64];
}

export function extractSignature(req: Request, url: URL): string {
  return (
    req.headers.get("x-signature") ||
    req.headers.get("x-fahto-signature") ||
    req.headers.get("x-shphere-signature") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-hub-signature-256") ||
    url.searchParams.get("secret") ||
    ""
  );
}

export type SecretCheck = { ok: true } | { ok: false; reason: "integration_incomplete" | "invalid_signature" };

/**
 * @param rawBody corpo cru da requisição (para validação HMAC). Passe null se indisponível.
 */
export async function verifyWebhookSecret(
  signature: string,
  storedSecret: string | null | undefined,
  rawBody: string | null,
): Promise<SecretCheck> {
  const secret = (storedSecret ?? "").trim();
  if (!secret) return { ok: false, reason: "integration_incomplete" };

  const sig = normalizeSig(signature ?? "");
  if (!sig) return { ok: false, reason: "invalid_signature" };

  // 1) secret compartilhado enviado em texto puro (nunca para secrets whsec_)
  if (!secret.startsWith("whsec_") && timingSafeEqual(sig, secret)) return { ok: true };

  // 2) assinatura HMAC-SHA256 do corpo, com o secret salvo
  if (rawBody !== null) {
    const candidates = [
      ...(await hmacVariants(secret, rawBody)),
      // alguns provedores assinam com o secret sem o prefixo whsec_
      ...(secret.startsWith("whsec_") ? await hmacVariants(secret.slice(6), rawBody) : []),
    ];
    for (const c of candidates) if (timingSafeEqual(sig, c)) return { ok: true };
  }

  return { ok: false, reason: "invalid_signature" };
}

/* ------------------------------------------------------------------ */
/* Svix-style (whsec_...) signature verification                       */
/* ------------------------------------------------------------------ */

export type SvixReason =
  | "integration_incomplete"
  | "missing_svix_headers"
  | "timestamp_expired"
  | "signature_mismatch";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacB64(keyBytes: Uint8Array, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  return btoa(String.fromCharCode(...sig));
}

export function isSvixSecret(secret: string | null | undefined): boolean {
  return (secret ?? "").trim().startsWith("whsec_");
}

/**
 * Valida assinatura no padrão Svix (headers svix-id / svix-timestamp / svix-signature).
 * Aceita também os aliases webhook-id / webhook-timestamp / webhook-signature.
 */
export async function verifySvixSignature(
  req: Request,
  storedSecret: string | null | undefined,
  rawBody: string | null,
): Promise<{ ok: true } | { ok: false; reason: SvixReason; detail?: string }> {
  const secret = (storedSecret ?? "").trim();
  if (!secret) return { ok: false, reason: "integration_incomplete" };

  const h = (n: string) => req.headers.get(n) || req.headers.get(`webhook-${n.slice(5)}`) || "";
  const id = h("svix-id");
  const ts = h("svix-timestamp");
  const sigHeader = h("svix-signature");

  if (!id || !ts || !sigHeader) {
    return {
      ok: false,
      reason: "missing_svix_headers",
      detail: `svix-id=${id ? "ok" : "faltando"} svix-timestamp=${ts ? "ok" : "faltando"} svix-signature=${sigHeader ? "ok" : "faltando"}`,
    };
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: "timestamp_expired", detail: `timestamp invalido: ${ts}` };
  }
  const skew = Math.abs(Date.now() / 1000 - tsNum);
  if (skew > 300) {
    return { ok: false, reason: "timestamp_expired", detail: `${Math.round(skew)}s de diferenca (limite 300s)` };
  }

  const signedPayload = `${id}.${ts}.${rawBody ?? ""}`;
  const raw = secret.replace(/^whsec_/, "");

  const expected: string[] = [];
  try {
    expected.push(await hmacB64(b64ToBytes(raw), signedPayload));
  } catch {
    /* secret nao e base64 valido */
  }
  // fallback: alguns emissores usam o secret como texto puro
  expected.push(await hmacB64(new TextEncoder().encode(raw), signedPayload));

  const provided = sigHeader
    .split(" ")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.includes(",") ? p.slice(p.indexOf(",") + 1) : p));

  for (const p of provided) for (const e of expected) if (timingSafeEqual(p, e)) return { ok: true };

  return { ok: false, reason: "signature_mismatch", detail: `assinaturas recebidas: ${provided.length}` };
}

/* ------------------------------------------------------------------ */
/* Fahto / Stripe-style: header "t=<unix>,v1=<hex|base64>"             */
/* ------------------------------------------------------------------ */

export type TsSigReason =
  | "integration_incomplete"
  | "malformed_signature"
  | "timestamp_expired"
  | "signature_mismatch";

function keyVariants(secret: string): Uint8Array[] {
  const enc = new TextEncoder();
  const bare = secret.replace(/^whsec_/, "");
  const out: Uint8Array[] = [enc.encode(secret), enc.encode(bare)];
  try {
    out.push(b64ToBytes(bare));
  } catch {
    /* nao e base64 */
  }
  return out;
}

async function hmacBoth(keyBytes: Uint8Array, msg: string): Promise<string[]> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = btoa(String.fromCharCode(...bytes));
  return [hex, b64];
}

/**
 * Valida assinatura no formato usado pela Fahto:
 *   x-fahto-signature: t=<unix>,v1=<hmac>
 * Payloads testados: `${t}.${body}` (Stripe), `${id}.${t}.${body}` (Svix) e `${body}`.
 */
export async function verifyTimestampedSignature(
  sigHeader: string,
  storedSecret: string | null | undefined,
  rawBody: string | null,
  messageId?: string | null,
): Promise<{ ok: true } | { ok: false; reason: TsSigReason; detail?: string }> {
  const secret = (storedSecret ?? "").trim();
  if (!secret) return { ok: false, reason: "integration_incomplete" };

  const parts = (sigHeader ?? "").split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
  let ts = "";
  const provided: string[] = [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) { provided.push(p); continue; }
    const k = p.slice(0, eq).toLowerCase();
    const v = p.slice(eq + 1);
    if (k === "t" || k === "timestamp") ts = v;
    else provided.push(v);
  }
  if (!ts || provided.length === 0) {
    return { ok: false, reason: "malformed_signature", detail: `t=${ts ? "ok" : "faltando"} assinaturas=${provided.length}` };
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "timestamp_expired", detail: `timestamp invalido: ${ts}` };
  const skew = Math.abs(Date.now() / 1000 - tsNum);
  if (skew > 300) return { ok: false, reason: "timestamp_expired", detail: `${Math.round(skew)}s de diferenca (limite 300s)` };

  const body = rawBody ?? "";
  const payloads = [`${ts}.${body}`, body];
  if (messageId) payloads.unshift(`${messageId}.${ts}.${body}`);

  for (const key of keyVariants(secret)) {
    for (const payload of payloads) {
      const expected = await hmacBoth(key, payload);
      for (const p of provided) for (const e of expected) if (timingSafeEqual(p, e)) return { ok: true };
    }
  }

  return { ok: false, reason: "signature_mismatch", detail: `testados ${payloads.length} payloads x 3 chaves (hex/base64)` };
}
