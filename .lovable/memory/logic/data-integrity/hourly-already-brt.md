---
name: traffic_data_hourly já está em horário de Brasília
description: sync-meta-hourly grava traffic_data_hourly (date/hour) já convertido para BRT; RPCs NUNCA devem reconverter com AT TIME ZONE a.timezone
type: constraint
---

`sync-meta-hourly` chama `convertLocalHourToBrt()` **antes** do insert, então
`traffic_data_hourly.date` e `.hour` já são **BRT**. `traffic_data.date` continua
sendo a data **local da conta** (fuso do ad account na Meta).

**Proibido:** aplicar `... AT TIME ZONE a.timezone AT TIME ZONE 'America/Sao_Paulo'`
sobre `traffic_data_hourly` — isso gera dupla conversão e joga o gasto do dia atual
para o dia anterior (contas Sydney/HK perdem ~99% do spend de "hoje").

**Correto:**
- `brt_date = h.date`
- Para casar com `traffic_data` (data local): derive a local via
  `(make_timestamp(...,h.hour,30,0) AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE a.timezone)::date`

Bug histórico (31/07/2026): aba Criativos mostrava CAC R$ 2,51 e ROI 166x para
`[H1B01] [VIT-RRT] [ITA]` (conta Australia/Sydney) porque `get_creative_traffic_normalized_sp`
e `get_traffic_spend_by_account_normalized` reconvertiam o fuso — spend do dia caía de
R$ 1.431 para R$ 25 enquanto as 10 vendas BRT continuavam contadas.
