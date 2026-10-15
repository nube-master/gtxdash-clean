---
name: Offer Benchmarks System
description: Benchmark de KPIs (CPC/CPM/CTR/CPI/Conv/Pitch) por nicho aplicado às ofertas, com badge na lista e painel no drawer
type: feature
---
- Tabela `offer_benchmarks` (UNIQUE operation_id+nicho) com 6 metas: cpc_brl, cpm_brl, ctr_pct, cpi_brl, conversion_pct, pitch_retention_pct
- RLS: SELECT por `spy_user_in_operation`; INSERT/UPDATE/DELETE só admin role ou owner/admin em `operation_members`
- Função `get_offers_kpi_metrics(p_operation_id)` retorna métricas reais 7d por oferta: spend/impressions/link_clicks de `traffic_data` (match `[apelido]`), IC + sales de `redtrack_events`, retenção do pitch ponderada por plays de `vturb_performance_daily`
- Comparação em `src/hooks/useOfferBenchmarks.ts`: `compareMetric()` aplica tolerância 10%/25%; CPC/CPM/CPI menor=melhor; CTR/Conv/Pitch maior=melhor
- UI: badge agregado (`BenchmarkBadge`) na coluna apelido da lista + painel detalhado (`BenchmarkPanel`) no `OfferDetailDrawer` (accordion `benchmark`)
- Edição: `OfferBenchmarksDialog` acessado pelo botão 🎯 Benchmarks no header de `/offers`
- Seed inicial: Diabetes (`blood_sugar_glp1`) com CPC R$6,57 / CPM R$242,99 / CTR 3,64% / CPI R$259,84 / Conv 1,40% / Pitch 11,26%
