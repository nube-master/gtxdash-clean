---
name: Spy v2.2 — Digest, Dead Offers, Similar, Pulse, Replicar
description: 5 melhorias do Spy aprovadas 23/05 — daily digest 22h, alerta de oferta morta, painel concorrentes diretos, pulse 7d, botão Replicar pra /offers
type: feature
---
## Edge functions
- `spy-daily-digest`: roda 22h BRT (01:00 UTC, cron `spy-daily-digest-22h-brt`). Monta 1 alerta `daily_digest` por operação com novas/escalando/crescendo/caindo/sumiram (janela 24h). Insere em spy_alerts + dispara pushcut direto. Skipa op sem novidades.
- `spy-detect-dead-offers`: roda no fim de `spy-sync-cron` (junto com constant-growth). Alerta `dead_offer` se oferta tinha ≥100 ads em algum dia 3-7d atrás E está com 0 ads nos 2 últimos dias BRT consecutivos. Cooldown 14d (`spy_offers.last_dead_alert_at`).
- `spy-sync-cron`: agora encadeia constant-growth + dead-offers em sequência.

## Migração
- CHECK constraint `spy_alerts.event_type` aceita: escalando, score_jump, new_ads, new_offer, constant_growth, **daily_digest**, **dead_offer**.
- `spy_offers.last_dead_alert_at timestamptz`.

## UI
- `SpyWeeklyPulse` no topo de /spy: novas/escalando/sumiram nos últimos 7d + top nicho + total ads ativos. Card gradient sutil; só renderiza se houver algo.
- `SpySimilarOffers` no /spy/:id após pastas: top 8 ofertas mesmo subnicho (fallback nicho) + mesmo idioma, ordenadas por active_ads_count desc.
- Botão **🚀 Replicar oferta** no top do /spy/:id navega pra `/offers?prefill_from_spy=<id>`.

## Replicar flow (/offers)
- `OfferWizardDialog` aceita prop `prefill?: Partial<FormState>` (merge com EMPTY quando não há editing).
- `/offers` lê `?prefill_from_spy=<spyId>` no `useSearchParams`, busca spy_offers e abre wizard com: `apelido_interno = <slug>-replica`, `produto_real`, `sales_page_url` (funnel_urls[0]), `link_checkout` (checkout_urls[0]), `geo`, `notas` com origem + ad library + briefing_md truncado em 4000 chars, `tags: ["spy-replica"]`, `status: em_teste`. Remove o param da URL após abrir.

## Pushcut audience
- Daily digest e dead_offer reusam `spy-pushcut-notify` (mesma audiência: notification_recipients com project_filter SPY ou TODOS). Hoje: Gabriel + Gui.
