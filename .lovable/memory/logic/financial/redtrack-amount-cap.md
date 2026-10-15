---
name: RedTrack Amount Cap (USD 235 Front-End)
description: Vendas RedTrack com amount > USD 300 são travadas em USD 235 (comissão padrão front-end) tanto na ingestão (pull-conversions + trigger fix_redtrack_amount) quanto retroativamente, evitando que payloads inflados com upsells/order bumps poluam o faturamento.
type: feature
---

## Regra

Toda venda RedTrack (`event_type = 'purchase'`) com `amount > USD 300` é automaticamente travada em **USD 235** (comissão padrão de front-end).

## Por quê

CartPanda às vezes envia ao RedTrack o `total_order_value` (pedido inteiro com upsells e order bumps) em vez do `prod_value` (só front-end). O RedTrack repassa esse valor inflado no campo `payout_default`, e nosso `pull-conversions` gravava como uma única purchase de USD 1000+, gerando vendas fantasma de R$ 5.000+ no faturamento.

Isso violava a regra Core: "Only count front-end commissions ($200-$260 USD) for revenue and rankings. Exclude upsells and order bumps."

## Onde está aplicado (defesa em profundidade)

1. **`supabase/functions/pull-conversions/index.ts`** (linha ~180): após calcular `amount = payoutDefault > 0 ? payoutDefault : payout`, se `amount > 300` força `amount = 235` e loga warning com `clickid` e `offer`.

2. **Trigger DB `public.fix_redtrack_amount()`** (em `redtrack_events` BEFORE INSERT/UPDATE): além de extrair `payout_default` do `raw_payload`, aplica o mesmo cap quando `event_type = 'purchase' AND amount > 300`.

## Threshold rationale

- Front-end comissões variam **USD 200-260** (regra Core).
- USD 300 é o limite seguro acima do qual o valor é certamente upsell/order bump somado.
- USD 235 é o midpoint da faixa, usado como valor padrão da comissão front-end.

## Backfill aplicado

Em 2026-04-29, atualizamos 2 vendas dos últimos 30 dias que estavam infladas:
- `clickid 69f27865b0d175845eb1068d`: USD 1.154,69 → 235 (NDM, oferta CartPanda MO marcada errado)
- `clickid 69ea46836c458e6eca6cb924`: USD 317,49 (GBP) → 235 (NDM)

## Quando NÃO aplicar

Se algum dia tivermos produto com front-end legítimo > USD 300, ajustar o threshold ou whitelist por `offer_id` antes que o cap atinja vendas válidas.
