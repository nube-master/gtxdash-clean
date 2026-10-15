---
name: Spy Constant Growth Alert
description: Alerta "🚀 Em escala" pra ofertas com ≥20k ads por 7d consecutivos BRT (crescimento opcional). Encadeado com dead-offers em spy-sync-cron.
type: feature
---
- Critério (PO 23/05): `active_ads_count ≥ 20.000` em 7d BRT consecutivos. **Crescimento NÃO é obrigatório**. Se `dia7/dia1 ≥ +30%` destaca "crescendo +X%".
- `spy-detect-constant-growth` + `spy-detect-dead-offers` rodam ambos no fim de `spy-sync-cron` (loop sequencial).
- Cooldown anti-spam: `spy_offers.last_constant_growth_alert_at` + `last_constant_growth_pct` (7d). Dead tem `last_dead_alert_at` (14d).
- UI: badge rose 🚀 "Em escala · 7d [· +X% | · estável]" no `SpyOfferCard` por 3d.
- CHECK constraint de `spy_alerts.event_type` inclui `constant_growth`, `dead_offer`, `daily_digest`.
