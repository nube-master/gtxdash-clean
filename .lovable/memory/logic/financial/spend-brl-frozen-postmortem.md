---
name: spend_brl congelado — post-mortem e guard rails
description: Bug do spend_brl travado no primeiro upsert do dia (25-26/08/2026), fix dos triggers e guard rails (ratio 0.98-1.02, RPC get_spend_brl_consistency, cron 00h30 BRT)
type: constraint
---

**Bug:** triggers `traffic_data_fill_spend_brl` / `traffic_hourly_fill_spend_brl` /
`traffic_breakdowns_fill_spend_brl` só calculavam `spend_brl` quando era NULL.
Como os syncs fazem UPSERT sem mandar `spend_brl`, o valor ficava congelado no
primeiro sync do dia enquanto `spend` crescia → INVESTIDO subnotificado em todas as ops.

- Criado: 25/08/2026 ~16:35 BRT (migrações `2026082522*`). Corrigido: 26/08/2026 13:25 BRT.
- Janela afetada: apenas ~15h de updates intradia; backfill de 4 dias já cobre 100% do range.

**Regras permanentes:**
1. Todo trigger de fill DEVE recalcular `spend_brl` quando `spend` muda no UPDATE e o
   writer não enviou novo BRL. Nunca voltar a condição "só se NULL".
2. `assert_spend_brl_ratio()` (BEFORE INSERT/UPDATE em `traffic_data`,
   `traffic_data_hourly`, `traffic_breakdowns`) recusa gravação com
   `spend_brl / (spend*fx_rate)` fora de 0.98–1.02 quando `spend > 1`.
   Writer novo que gravar BRL errado falha na hora — não silenciosamente.
3. `get_spend_brl_consistency()` = health check por op × dia (últimas 24h/2 dias):
   status BUG (spend>1 e brl<0.1), SUSPEITO (ratio<0.5), DRIFT (>2% no agregado), OK.
4. Correções materiais (>R$1) do trigger vão para `system_logs` tipo `spend_brl_corrected`.
5. Cron `spend-brl-health-daily` (`30 3 * * *` UTC = 00h30 BRT) → edge function
   `spend-brl-health` → Web Push `data_health_report` se qualquer op sair de OK.

**Nota de leitura de diff:** o INVESTIDO do dashboard não é só `traffic_data`.
`get_total_traffic_metrics` soma Meta (BRL) + Newsbreak (USD, convertido) + MGID.
Divergência vs `SUM(traffic_data.spend_brl)` costuma ser Newsbreak convertido, não bug.
