---
name: Offers Module Operational
description: Aba /offers com Insights, Health Score, Sparkline 7d, Bulk actions, Compare, Twins detection, Inline status, CSV export
type: feature
---
# Central de Offers — Tier 1+2+3+4

## Atualização de dados
- Spend Meta hoje: 2-3 min (`sync-meta-fast-every-2min` + `sync-meta-today-3min`)
- Spend Meta 7d/30d: 1h (`sync-meta-hourly-every-hour`)
- Vendas RT: 1-2 min (`redtrack-sync-every-1min` + `sync-redtrack-sales-2min`)
- Vendas CB: real-time IPN + `reconcile-sales-30min`
- UI polling: 120s (regra Core de polling estável)

## Componentes
- `OffersInsightsBanner` — banner topo com winners/no_spend/limbo/top performer (clicável → aplica filtro)
- `OfferSparkline` — mini SVG 7d spend, lazy via `get_offer_traffic_daily`
- `OfferCompareDrawer` — side-by-side 2-4 offers, destaca melhor por linha
- `OffersBulkActionsBar` — fixed bottom: comparar / exportar / arquivar
- `lib/offerHealthScore.ts` — score 0-100: ROI 40% + momentum 30% + lifetime 15% + CPA ratio 15%
- `lib/offerTwins.ts` — detecta gêmeas (mesmo nicho+geo ativas) + suggestKill (ROI<0.7x AND spend>R$5k em 7d)
- `lib/offerExport.ts` — CSV com BOM UTF-8 e KPIs traffic embutidos

## UI features
- Density toggle (comfortable/compact) persistido em localStorage
- Column visibility manager
- Group by: nicho/vendor/geo/status com header colapsável visual
- Inline status edit (badge clicável → dropdown direto, sem drawer)
- Border-left colorido por status (3px) pra leitura visual rápida
- Twin warning icon na coluna Apelido + banner topo
- Skull icon na linha quando suggestKill = true
- Botão Radar na linha → navega para /spy?nicho=X&geo=Y
- "Última atualização há Xmin" no header

## Persistência (localStorage)
- `offers:saved-views:v1` — views nomeadas
- `offers:active-view:v1` — view ativa
- `offers:visible-cols:v1` — colunas visíveis
- `offers:density:v1` — comfortable/compact
- `offers:group-by:v1` — none/nicho/vendor/geo/status
