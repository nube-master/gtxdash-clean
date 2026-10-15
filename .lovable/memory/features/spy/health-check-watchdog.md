---
name: Spy Health Check Watchdog
description: spy-health-check roda 10h e 22h BRT; cria alerta sync_stalled + Pushcut quando spy_history fica >36h sem snapshot por operação (cooldown 24h)
type: feature
---
- Edge function `spy-health-check`: itera operações com ofertas que têm `ad_library_url`, checa último `snapshot_at` em `spy_history`. Se >36h, insere `spy_alerts.event_type='sync_stalled'` e dispara `spy-pushcut-notify`.
- Cron `spy-health-check-watchdog`: `0 1,13 * * *` UTC (10h e 22h BRT).
- Cooldown: pula op que já recebeu alerta sync_stalled nas últimas 24h.
- Constraint `spy_alerts_event_type_check` agora aceita `sync_stalled`.
- Causa raiz que motivou: 28/05-01/06 Apify quebrou, handler dava erro antes de gravar snapshot, daily_digest/constant_growth ficaram mudos sem ninguém saber.
