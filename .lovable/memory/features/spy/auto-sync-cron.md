---
name: Spy Auto-Sync 2x/dia + History Snapshot
description: spy-sync-cron roda 09h e 21h BRT (12h/00h UTC) via pg_cron; spy-sync-offer grava snapshot em spy_history (active_ads_count da biblioteca) pra comparar hoje vs ontem
type: feature
---
- Jobs `spy-sync-morning` (12 UTC) e `spy-sync-evening` (0 UTC) chamam `spy-sync-cron`, que itera ofertas com `ad_library_url` e dispara `spy-sync-offer` por oferta (1.5s entre cada).
- `spy-sync-offer` é COUNT-ONLY: scrape leve da URL da Ad Library extrai o total exibido ("~50.000 results") e amostra 50 ads pra AI/Copy Intel — NÃO varremos 50k.
- Ao final, grava 1 linha em `spy_history` (operation_id, offer_id, snapshot_at, active_ads_count, total_ads_count, raw_snapshot jsonb com library_total + sample). Base do gráfico de Evolução e do delta hoje vs ontem.
