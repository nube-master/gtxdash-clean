---
name: EDD Daily Meta Sync Fix
description: Por que o sync diário Meta da Escola do Dólar (traffic_data + meta_ad_status) parou em 20/08 e como foi corrigido
type: feature
---

Operação EDD (Escola do Dólar) = `1dd606e3-dac2-4064-b863-9784307c9e98`.

Root causes do daily zerado (aba Criativos vazia):
1. `sync-meta-today` usava só o token único de `app_settings` (bloqueado pela Meta: OAuthException 200 "API access blocked"). Agora federa tokens via `getAllMetaTokensForOperation` + fallback legado, tentando cada token por conta (mesmo padrão do `sync-meta-hourly`).
2. O filtro hardcoded `campaign.name CONTAIN (top/xxx/EDD/GTX/F1/F2/F3/BM)` zera a EDD, que não usa essa nomenclatura. Para a EDD o filtro é ignorado (`skipNameFilter`).
3. `onConflict` do upsert em `traffic_data` estava errado; a única constraint válida é
   `operation_id,account_id,campaign_name,adset_name,ad_name,date`.
4. `sync-meta-today` agora também popula `meta_ad_status` (ad_id/adset_id/campaign_id NOT NULL + spend_brl), que nunca tinha sido populada na EDD.
5. O cron `sync-meta-today-5min` manda `body:'{}'` (sem operation_id) → a função lança "Missing operation_id". Criado cron dedicado `sync-meta-today-edd-15min` com `operation_id` da EDD.

Colunas que NÃO existem (evitar em selects/filtros no front): `clickbank_audit.project_slug`,
`redtrack_events.type`, `.conv_time`, `.is_transaction`.
