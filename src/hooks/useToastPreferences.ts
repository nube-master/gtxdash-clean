import { useState, useCallback, useEffect } from "react";
import { useOperation } from "@/contexts/OperationContext";

export type ToastLogo = "gtx" | "fire" | "dollar" | "rocket" | "check" | "bolt" | "custom";
export type ToastSound = "none" | "cash-register" | "coin" | "bell" | "success" | "chime";
export type ToastAnimation = "default" | "slide-up" | "slide-right" | "fade" | "bounce" | "scale";

export interface ToastPreferences {
  position: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
  duration: number; // seconds
  /** Template string with variables: {{titulo}}, {{projeto}}, {{sigla}}, {{contador}}, {{flag}}, {{valor}} */
  titleTemplate: string;
  /** Template for the subtitle line */
  subtitleTemplate: string;
  logo: ToastLogo;
  bgColor: string;
  textColor: string;
  soundEnabled: boolean;
  sound: ToastSound;
  /** Entry animation style */
  animation: ToastAnimation;
  /** Custom logo URL (from storage upload) */
  customLogoUrl: string;
  /** Project name used in preview */
  previewProject: string;
}

const LEGACY_KEY = "gtx-toast-prefs";
const keyFor = (opId?: string | null) =>
  opId ? `gtx-toast-prefs::${opId}` : LEGACY_KEY;

const DEFAULTS: ToastPreferences = {
  position: "bottom-right",
  duration: 8,
  titleTemplate: "Venda Aprovada! | {{projeto}}",
  subtitleTemplate: "Valor: {{valor}}",
  logo: "gtx",
  bgColor: "#1c1c1e",
  textColor: "#ffffff",
  soundEnabled: true,
  sound: "cash-register",
  animation: "default",
  customLogoUrl: "",
  previewProject: "GTX Mídia",
};

function load(storageKey: string): ToastPreferences {
  try {
    let raw = localStorage.getItem(storageKey);
    // Fallback: seed from legacy global key on first load per operation
    if (!raw && storageKey !== LEGACY_KEY) {
      raw = localStorage.getItem(LEGACY_KEY);
    }
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (parsed.title && !parsed.titleTemplate) {
      parsed.titleTemplate = `${parsed.title} | {{projeto}}`;
      delete parsed.title;
    }
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(storageKey: string, prefs: ToastPreferences) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch {}
}

export function useToastPreferences() {
  const { operation } = useOperation();
  const storageKey = keyFor(operation?.id);
  const [prefs, setPrefs] = useState<ToastPreferences>(() => load(storageKey));

  // Reload when active operation changes
  useEffect(() => {
    setPrefs(load(storageKey));
  }, [storageKey]);

  const update = useCallback((partial: Partial<ToastPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial };
      save(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const reset = useCallback(() => {
    setPrefs({ ...DEFAULTS });
    save(storageKey, { ...DEFAULTS });
  }, [storageKey]);

  return { prefs, update, reset };
}

/** Read-only version for consumers (no state, just reads localStorage) */
export function getToastPreferences(operationId?: string | null): ToastPreferences {
  return load(keyFor(operationId));
}

/** Resolve a template string by replacing {{variable}} with actual values */
export function resolveTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/** Play a notification sound using Web Audio API */
export function playToastSound(sound: ToastSound) {
  if (sound === "none") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);

    switch (sound) {
      case "cash-register":
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.08);
        osc.frequency.setValueAtTime(1600, ctx.currentTime + 0.16);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
        break;
      case "coin":
        osc.frequency.setValueAtTime(1400, ctx.currentTime);
        osc.frequency.setValueAtTime(1800, ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        break;
      case "bell":
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
        break;
      case "success":
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        break;
      case "chime":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1047, ctx.currentTime);
        osc.frequency.setValueAtTime(1319, ctx.currentTime + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
        break;
    }
  } catch {}
}
