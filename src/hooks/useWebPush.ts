import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { isPushSupported, PUSH_SW_URL } from "@/lib/pushServiceWorker";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1)
  );
}

function shortDeviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Dispositivo";
  const browser = /CriOS|Chrome/.test(ua)
    ? "Chrome"
    : /Firefox/.test(ua)
      ? "Firefox"
      : /Edg/.test(ua)
        ? "Edge"
        : /Safari/.test(ua)
          ? "Safari"
          : "Navegador";
  return `${os} · ${browser}`;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
  if (existing) return existing;
  const reg = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

export function useWebPush() {
  const { operation } = useOperation();
  const [supported] = useState(() => isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => (isPushSupported() ? Notification.permission : "unsupported"),
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [devices, setDevices] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) return;
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }

    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes?.user?.id;
    if (!uid) return setDevices(0);
    let q = supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("enabled", true);
    if (operation?.id) q = q.eq("operation_id", operation.id);
    const { count } = await q;
    setDevices(count ?? 0);
  }, [supported, operation?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fetchVapidKey = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("push-vapid-public", { method: "GET" });
    if (error) throw error;
    const key = (data as { publicKey?: string })?.publicKey;
    if (!key) throw new Error("Chave VAPID indisponível");
    return key;
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported) throw new Error("Push não suportado neste navegador");
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") throw new Error("Permissão negada");

      const reg = await getRegistration();
      const key = await fetchVapidKey();

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        });
      }

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const { error } = await supabase.functions.invoke("push-subscribe", {
        body: {
          subscription: { endpoint: json.endpoint, keys: json.keys },
          operation_id: operation?.id ?? null,
          device_label: shortDeviceLabel(),
        },
      });
      if (error) throw error;
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [supported, fetchVapidKey, operation?.id, refresh]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();
      if (endpoint) {
        const { error } = await supabase.functions.invoke("push-unsubscribe", { body: { endpoint } });
        if (error) throw error;
      }
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const test = useCallback(async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.functions.invoke("push-send", {
      body: {
        operation_id: operation?.id ?? null,
        notification_type: "test",
        title: "Traffic OS",
        body: "Teste de notificação — está funcionando!",
        url: "/notifications",
        target_user_ids: userRes?.user?.id ? [userRes.user.id] : undefined,
      },
    });
    if (error) throw error;
  }, [operation?.id]);

  return {
    isSupported: supported,
    permission,
    isSubscribed,
    devices,
    loading,
    subscribe,
    unsubscribe,
    test,
    refresh,
    fetchVapidKey,
  };
}
