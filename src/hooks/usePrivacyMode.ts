import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "traffic-os:privacy-mode";
const EVENT = "traffic-os:privacy-mode-change";

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mascara nome mantendo rótulo claro de "oculto" — nunca dado falso. */
export function maskName(index: number): string {
  // A, B, ... Z, A1, B1... (estável)
  const letter = String.fromCharCode(65 + (index % 26));
  const cycle = Math.floor(index / 26);
  return `Operação ${letter}${cycle > 0 ? cycle : ""}`;
}

/** Mantém o mesmo "peso" tipográfico da string original, trocando dígitos por •. */
export function maskDigits(formatted: string): string {
  return formatted.replace(/\d/g, "•");
}

export function maskCount(n: number | string): string {
  return "•".repeat(Math.max(1, String(n).length));
}

export function usePrivacyMode() {
  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const sync = () => setEnabled(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !read();
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* noop */
    }
    setEnabled(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const maskCurrency = useCallback(
    (formatted: string) => (enabled ? maskDigits(formatted) : formatted),
    [enabled],
  );

  return { enabled, toggle, maskName, maskCurrency, maskCount, maskDigits };
}
