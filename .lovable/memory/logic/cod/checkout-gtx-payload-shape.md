---
name: Payload plataforma Checkout GTX (COD)
description: Payload aninhado em data{} com commission{} e attribution{}; moeda do pedido (PLN) difere da comissão (EUR); push usa commission_value_brl
type: feature
---

A plataforma que envia para `cod-webhook-gtx` (source `checkout_gtx`, op GTX MIDIA) manda:

```json
{ "event": "pedido.criado", "occurred_at": "...",
  "data": { "order_id","offer","amount","currency":"PLN","country",
            "commission": {"value","currency":"EUR","status"},
            "attribution": {"utm_campaign","utm_source",...} } }
```

Regras aplicadas em `_shared/cod-ingest.ts`:
- `comissao` faz fallback para `data.commission` (antes o pick pegava o objeto inteiro → `commission_value` NULL → push "Valor: $0.00").
- Moeda do pedido (`orderCurrency`) é separada da moeda da comissão — pedido PLN, comissão EUR; converter cada um com sua taxa.
- `utm_campaign` do push vem de `data.attribution.utm_campaign` (prioridade máxima).
- `offer` alimenta `product_key` / `product_name`.
