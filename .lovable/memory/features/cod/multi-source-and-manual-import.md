---
name: COD multi-source + import manual
description: cod_orders.source distingue origem (sphere | fahto | manual); webhook genérico cod-webhook-platform?source=; import retroativo em /dashboard-cod/import com dry-run, batch e undo
type: feature
---

# COD — múltiplas origens e import manual

## Origem (`cod_orders.source`)
- Default `sphere`; histórico backfillado. Índice `(operation_id, source, order_date)`.
- Filtro global no Dashboard COD via `useCODSourceFilter` (estado em `?source=` na URL) + `applySourceFilter` aplicado nos hooks (`useCODPipeline`, `useCODProductRanking`) e na lista de pedidos.

## Segundo webhook
- Núcleo compartilhado em `supabase/functions/_shared/cod-ingest.ts` (parser, resolução de tenant, FX, push-mirror).
- `cod-webhook-fahto` é o endpoint da segunda plataforma (source `fahto`, secret opcional `FAHTO_WEBHOOK_SECRET`); `cod-webhook-platform?source=<nome>` fica como genérico para plataformas futuras. Doc para repassar: `system_docs.doc_key = 'cod-webhook-nova-plataforma'`.
- `cod-webhook-shphere` foi mantido intacto (tem re-roteamento FAHTO→GTX por `programa_id`); não refatorar sem revalidar esse caso.

## Import manual retroativo
- Página `/dashboard-cod/import` (admin/super admin), edge function `cod-import-orders` com ações `validate` | `import` | `undo`.
- Antileak SEMPRE ativo: erro do trigger vira erro da linha, sem bypass.
- Regras: order_id duplicado = skip; afiliado sem mapping em `affiliate_operation_mapping` = importa como órfão com alerta; operation_id/data/valor inválidos = erro bloqueante.
- Moeda: se `currency` != BRL, converte `order_total`/`commission_value` pela `exchange_rates_cache`.
- Push `sale_approved` só quando não-retroativo e `created_at` < 24h.
- Lotes em `cod_manual_imports` (snapshot quando > 10 linhas) e linhas em `cod_manual_import_rows`; undo apaga por `cod_orders.import_batch_id`.
