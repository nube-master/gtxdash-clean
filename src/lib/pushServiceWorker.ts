/**
 * Registro do service worker de mensageria (Web Push).
 * Não faz cache de app-shell — só notificações.
 * Nunca registra em dev/preview Lovable/iframe.
 */

export const PUSH_SW_URL = "/push-sw.js";

function isBlockedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  const host = window.location.hostname;
  const blocked =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");

  if (blocked) return true;
  return new URLSearchParams(window.location.search).get("sw") === "off";
}

async function unregisterPushSw() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => r.active?.scriptURL?.endsWith(PUSH_SW_URL) || r.installing?.scriptURL?.endsWith(PUSH_SW_URL))
      .map((r) => r.unregister()),
  );
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;

  if (isBlockedContext()) {
    await unregisterPushSw();
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.warn("[push] falha ao registrar service worker", error);
    return null;
  }
}
