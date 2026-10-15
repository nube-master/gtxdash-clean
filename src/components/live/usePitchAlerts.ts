import { useEffect, useState } from "react";

export type PitchAlertConfig = {
  enabled: boolean;
  sound: boolean;
  browserNotif: boolean;
  volume: number; // 0..1
};

const DEFAULTS: PitchAlertConfig = {
  enabled: true,
  sound: true,
  browserNotif: false,
  volume: 0.6,
};

const STORAGE_KEY = "ao-vivo:pitch-alerts:v1";

export function usePitchAlertConfig() {
  const [cfg, setCfg] = useState<PitchAlertConfig>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PitchAlertConfig>) };
    } catch {
      // ignore
    }
    return DEFAULTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {
      // ignore
    }
  }, [cfg]);

  return [cfg, setCfg] as const;
}

let cachedAudio: HTMLAudioElement | null = null;

/** Sintetiza um "ding" curto via WebAudio sem assets externos. */
export function playPitchSound(volume: number) {
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    gain.connect(ctx.destination);

    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      osc.connect(gain);
      osc.start(now + i * 0.08);
      osc.stop(now + 0.5);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 700);
  } catch {
    // ignore
  }
  void cachedAudio;
}

export async function ensureBrowserNotifPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function showBrowserNotif(title: string, body: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification(title, { body, icon: "/favicon.ico", tag: "ao-vivo-pitch", silent: true });
    setTimeout(() => n.close(), 6000);
  } catch {
    // ignore
  }
}
