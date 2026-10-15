import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { installCurrencyPatches, setGlobalCurrencyState, syncCurrencyDom } from "@/lib/currencyPatch";

// Install the global Intl / toLocaleString patches as early as possible.
installCurrencyPatches();

export type CurrencyCode = "BRL" | "USD" | "EUR";

const STORAGE_KEY = "gtx.display-currency";
const FALLBACK_USD_BRL = 5.15;
const FALLBACK_EUR_BRL = 5.60;

export const CURRENCY_META: Record<CurrencyCode, { label: string; symbol: string; flag: string; locale: string }> = {
  BRL: { label: "Real",  symbol: "R$", flag: "🇧🇷", locale: "pt-BR" },
  USD: { label: "Dólar", symbol: "$",  flag: "🇺🇸", locale: "en-US" },
  EUR: { label: "Euro",  symbol: "€",  flag: "🇪🇺", locale: "de-DE" },
};

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  usdBrl: number;
  eurBrl: number;
  /** Convert a BRL value into the currently selected display currency. */
  convertFromBRL: (valueBRL: number) => number;
  /** Format a BRL value using the currently selected display currency. */
  format: (valueBRL: number, opts?: { decimals?: number; compact?: boolean }) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function readStored(): CurrencyCode {
  if (typeof window === "undefined") return "BRL";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "USD" || v === "EUR" || v === "BRL" ? v : "BRL";
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => readStored());

  const setCurrency = (c: CurrencyCode) => {
    setCurrencyState(c);
    try { window.localStorage.setItem(STORAGE_KEY, c); } catch {}
  };

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "BRL" || e.newValue === "USD" || e.newValue === "EUR")) {
        setCurrencyState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const { data: rates } = useQuery({
    queryKey: ["exchange-rates-multi", "USD", "BRL,EUR"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-exchange-rate", {
        body: null,
        // use query string so legacy callers still work
        // @ts-ignore — invoke supports method override via raw url? fallback to direct fetch
      });
      // The edge function in legacy mode returns { rate } (USD->BRL). For EUR we need a 2nd request.
      const usdBrl = (data?.rate ?? data?.rates?.BRL) ?? FALLBACK_USD_BRL;

      // Fetch EUR->BRL via dedicated invocation
      let eurBrl = FALLBACK_EUR_BRL;
      try {
        const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
        if (projectId) {
          const r = await fetch(
            `https://${projectId}.supabase.co/functions/v1/get-exchange-rate?base=EUR&targets=BRL`,
            { headers: { apikey: (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" } },
          );
          const j = await r.json();
          if (j?.rates?.BRL && Number.isFinite(j.rates.BRL)) eurBrl = j.rates.BRL;
        }
      } catch {}

      return { usdBrl, eurBrl };
    },
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
  });

  const usdBrl = rates?.usdBrl ?? FALLBACK_USD_BRL;
  const eurBrl = rates?.eurBrl ?? FALLBACK_EUR_BRL;

  // The global Intl/toLocaleString patch is consulted while children render.
  // Keep it in sync before rendering the subtree; an effect would run too late
  // and could leave values converted only on the next unrelated render.
  setGlobalCurrencyState({ code: currency, usdBrl, eurBrl });

  useEffect(() => {
    syncCurrencyDom();
  }, [currency, usdBrl, eurBrl]);

  const value = useMemo<CurrencyContextValue>(() => {
    const convertFromBRL = (v: number) => {
      if (!Number.isFinite(v)) return 0;
      if (currency === "BRL") return v;
      if (currency === "USD") return usdBrl > 0 ? v / usdBrl : v;
      if (currency === "EUR") return eurBrl > 0 ? v / eurBrl : v;
      return v;
    };

    const format = (v: number, opts?: { decimals?: number; compact?: boolean }) => {
      const converted = convertFromBRL(v);
      const decimals = opts?.decimals ?? 2;
      const meta = CURRENCY_META[currency];
      try {
        return new Intl.NumberFormat(meta.locale, {
          style: "currency",
          currency,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          notation: opts?.compact ? "compact" : "standard",
        }).format(converted);
      } catch {
        return `${meta.symbol} ${converted.toFixed(decimals)}`;
      }
    };

    return { currency, setCurrency, usdBrl, eurBrl, convertFromBRL, format };
  }, [currency, usdBrl, eurBrl]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Safe fallback: identity (BRL) — keeps components rendering even if provider missing.
    return {
      currency: "BRL",
      setCurrency: () => {},
      usdBrl: FALLBACK_USD_BRL,
      eurBrl: FALLBACK_EUR_BRL,
      convertFromBRL: (v) => v,
      format: (v) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0),
    };
  }
  return ctx;
}
