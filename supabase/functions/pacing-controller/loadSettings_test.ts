// Testes pra garantir que loadSettings():
//   1. Override USD_BRL com a cotação mais recente do exchange_rate_log
//   2. Cai no fallback (app_settings + defaults) quando a query do log falha
//
// Roda com: deno test --allow-net --allow-env
//
// Mocka o SupabaseClient com builders fluentes mínimos. Não bate na rede.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadSettings } from "./index.ts";

type Row = Record<string, unknown>;

interface MockOpts {
  pacingRows?: Row[];
  fxRow?: Row | null;
  fxThrows?: boolean;
}

function makeMockSupabase(opts: MockOpts) {
  return {
    from(table: string) {
      if (table === "pacing_settings") {
        return {
          select: (_cols: string) =>
            Promise.resolve({ data: opts.pacingRows ?? [], error: null }),
        };
      }
      if (table === "exchange_rate_log") {
        const chain = {
          select: (_cols: string) => chain,
          order: (_col: string, _opts: unknown) => chain,
          limit: (_n: number) => chain,
          maybeSingle: () => {
            if (opts.fxThrows) {
              return Promise.reject(new Error("network down"));
            }
            return Promise.resolve({ data: opts.fxRow ?? null, error: null });
          },
        };
        return chain;
      }
      throw new Error(`Mock não cobre tabela: ${table}`);
    },
  } as never;
}

Deno.test("loadSettings: override USD_BRL com cotação ao vivo do exchange_rate_log", async () => {
  const supa = makeMockSupabase({
    pacingRows: [
      { key: "exchange_rates", value: { USD_BRL: 5.4, EUR_BRL: 5.9, HUF_BRL: 0.015 } },
    ],
    fxRow: { rate: 5.0903, created_at: "2026-06-18T01:21:43Z" },
  });

  const settings = await loadSettings(supa);
  assertEquals(settings.exchangeRates.USD_BRL, 5.0903, "deve sobrescrever USD_BRL com valor do log");
  assertEquals(settings.exchangeRates.EUR_BRL, 5.9, "EUR_BRL preservado do app_settings");
  assertEquals(settings.exchangeRates.HUF_BRL, 0.015, "HUF_BRL preservado do app_settings");
});

Deno.test("loadSettings: aceita rate como string numérica", async () => {
  const supa = makeMockSupabase({
    pacingRows: [{ key: "exchange_rates", value: { USD_BRL: 5.4 } }],
    fxRow: { rate: "5.25", created_at: "2026-06-18T02:00:00Z" },
  });
  const settings = await loadSettings(supa);
  assertEquals(settings.exchangeRates.USD_BRL, 5.25);
});

Deno.test("loadSettings: ignora rate inválido (zero/NaN) e mantém fallback", async () => {
  const supa = makeMockSupabase({
    pacingRows: [{ key: "exchange_rates", value: { USD_BRL: 5.4 } }],
    fxRow: { rate: 0, created_at: "2026-06-18T02:00:00Z" },
  });
  const settings = await loadSettings(supa);
  assertEquals(settings.exchangeRates.USD_BRL, 5.4, "deve manter app_settings quando rate <= 0");
});

Deno.test("loadSettings: fallback quando exchange_rate_log está vazio", async () => {
  const supa = makeMockSupabase({
    pacingRows: [{ key: "exchange_rates", value: { USD_BRL: 5.4, EUR_BRL: 5.9 } }],
    fxRow: null,
  });
  const settings = await loadSettings(supa);
  assertEquals(settings.exchangeRates.USD_BRL, 5.4, "sem dado → mantém app_settings");
  assertEquals(settings.exchangeRates.EUR_BRL, 5.9);
});

Deno.test("loadSettings: fallback quando query do exchange_rate_log lança erro", async () => {
  const supa = makeMockSupabase({
    pacingRows: [{ key: "exchange_rates", value: { USD_BRL: 5.4 } }],
    fxThrows: true,
  });
  const settings = await loadSettings(supa);
  assertEquals(settings.exchangeRates.USD_BRL, 5.4, "erro → fallback do app_settings");
});

Deno.test("loadSettings: fallback total para SETTINGS_DEFAULTS quando pacing_settings vazio + log vazio", async () => {
  const supa = makeMockSupabase({ pacingRows: [], fxRow: null });
  const settings = await loadSettings(supa);
  assertEquals(settings.exchangeRates.USD_BRL, 5.4, "default 5.4 mantido");
  assertEquals(settings.defaultCurrency, "BRL");
  assert(settings.dryRunGlobal, "dryRunGlobal default = true (safe)");
});
