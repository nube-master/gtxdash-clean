---
name: Dashboard COD GTX v1
description: cod_orders isolado (não alimenta sales_data/redtrack_events); view cod_daily_pnl_by_origin com accrual por order_date; webhook Shphere; UI /dashboard/cod só GTX
type: feature
---

# Dashboard COD GTX v1

## Isolamento absoluto
- `cod_orders` NÃO alimenta `sales_data` nem `redtrack_events`. Vendas COD já entram no sistema atual por outro caminho — se cruzar, duplica.
- `/dashboard/cod` é a ÚNICA visão dos dados de `cod_orders`.
- Dashboard geral, Analytics, War Room, Vendas não devem ler `cod_orders`.

## Modelo de atribuição — ACCRUAL PURO (competência)
Comissão SEMPRE atribuída à **data de origem do pedido** (`order_date`), não à data de recebimento (`payment_date`). Mostra ROI real da campanha do dia.

## Arquitetura
- **Tabela** `cod_orders`: platform, external_order_id, order_date, delivery_date, payment_date, status enum, order_value, commission_value, raw_payload jsonb. UNIQUE (platform, external_order_id) → idempotência.
- **RLS** strict_op_scope (padrão F9).
- **Webhook** `cod-webhook-shphere` (verify_jwt=false): recebe 4 eventos Shphere (pedido criado/expirado/comissão aprovada/paga), UPSERT idempotente, raw_payload preservado, header opcional `X-Shphere-Signature` (secret em `SHPHERE_WEBHOOK_SECRET`).
- **View** `cod_daily_pnl_by_origin` (security_invoker=true): agrega por order_date, join com `traffic_data` filtrado por `campaign_name ILIKE '%COD%'` para invest, calcula delivery_rate/profit/day_status.
- **Status do dia**: closed >=95% resolvidos, partial 60-95%, open <60%. Ciclo médio de entrega 3-4 dias.

## Sidebar
Item "Dashboard COD" aparece SÓ quando `operation.slug === 'gtx'`. Não vaza pra outras ops.

## Prerequisites pendentes (v1.1)
- Payload real Shphere para calibrar parser (hoje é defensivo com múltiplos aliases de campo)
- Secret / método de assinatura definitivo
- CSV backfill (`received_via='csv_import'`) — rota `/admin/cod-import` só super_admin
- Alertas quando delivery_rate cair abaixo de X%
