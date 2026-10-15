---
name: Spy Emerging Growth Alert (5d/10k/+15%)
description: Alerta "📈 Emergindo" — 5d consecutivos BRT com ≥10k ads E crescimento dia5/dia1 ≥+15% obrigatório. Cooldown 5d. Independente do constant_growth.
type: feature
---
- Critério (PO 24/05): 5 dias BRT consecutivos com `active_ads_count ≥ 10.000` em TODOS os dias **E** crescimento dia5/dia1 `≥ +15%` (obrigatório, diferente do constant_growth).
- Edge function `spy-detect-emerging-growth` encadeada em `spy-sync-cron` (após constant-growth, antes de dead-offers).
- Cooldown próprio 5d via `spy_offers.last_emerging_growth_alert_at` + `last_emerging_growth_pct`.
- Coexiste com `constant_growth` (7d/20k) — capturam fases diferentes (emergindo vs em escala consolidada).
- CHECK de `spy_alerts.event_type` agora aceita: escalando, new_ads, score_jump, new_offer, constant_growth, daily_digest, dead_offer, **emerging_growth**.
- UI: ícone `LineChart` cyan no `SpyAlertsBell`. Pushcut reusa `spy-pushcut-notify` (recipients SPY/TODOS).
