---
name: Dashboard Totals Deduped Revenue Authority
description: dashboard-totals soma vendas distintas por origem autoritativa, isolando dedup por (data + utm_campaign + store) e usando MAX só sem CB
type: feature
---

A mesma venda RedTrack é gravada em DUAS tabelas com identificadores diferentes:
- `sales_data` via `sync-redtrack-sales`: order_id = `rt:<sub_id>`
- `redtrack_events` via `pull-conversions`: clickid

`dashboard-totals` (`supabase/functions/dashboard-totals/index.ts`) aplica consolidação:

```ts
// Com clickbank_audit: cp (sales_data não-CB) + cbDay (CB audit) + rtExtra (RT não duplicada)
const dayRevenue = cp.brl + cbDay.brl + rtExtra.brl;
// Sem CB audit
const dayRevenue = Math.max(cp.brl, rt.brl);
```

**rtExtraByDay** inclui apenas RT purchases que são vendas extras reais:
1. Não têm receipt já em `clickbank_audit`.
2. Não têm `receipt/transaction_id/clickid` já em `sales_data`.
3. Para non-CB (CartPanda/BuyGoods/Digistore/H&W), só entra quando excede contagem oficial por **(dia, campanha, STORE)** — isolando por plataforma de checkout.

**REGRA CRÍTICA — dedup isolada por plataforma:**
A chave de dedup CP-vs-RT é `${date}||${utm_campaign}||${store}`. H&W, Digistore24, CartPanda e BuyGoods são checkouts DIFERENTES; a mesma campanha pode legitimamente gerar 1 venda em cada plataforma (split de tráfego). Sem o `store` no key, vendas reais Digistore eram colapsadas contra vendas H&W com mesma utm_campaign no mesmo dia.

Bugs históricos corrigidos:
- **2026-04-30**: venda única NDM Newsbreak duplicada → introduziu MAX.
- **2026-05-01**: 2 vendas CB (1 auditada + 1 nova) apareciam como 1 → incluir RT clickbank-platform sem match em cbReceiptMap.
- **2026-05-02**: 3 vendas (BuyGoods + CB + Newsbreak) apareciam como 2 → somar cp + cb + rtExtra após dedup por ID.
- **2026-06-06**: 25 vendas reais (11 CB + 7 H&W + 7 Digistore) apareciam como 23 porque RT Digistore colidia com H&W na mesma utm_campaign → adicionado `store` no key de dedup `officialCpCountByKey`/`rtNonCbUsedByKey`.
