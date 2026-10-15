---
name: traffic_data duplica gasto quando campanha/ad é renomeado na Meta
description: unique key de traffic_data é por NOME (campaign_name/adset_name/ad_name); rename na Meta cria linha nova e infla INVESTIDO. Trigger traffic_data_dedupe_renamed limpa por IDs
type: constraint
---

`traffic_data_unique_key` = (operation_id, account_id, campaign_name, adset_name, ad_name, date).
Quando o time renomeia uma campanha/adset/ad na Meta (ex.: `[CBO][ED-POL]...` → `... top`),
o upsert dos syncs cria uma **linha nova** e a antiga continua lá → o mesmo ad é somado 2x
no INVESTIDO (Painel Executivo, Dashboard COD, Detalhamento por conta).

Fix (31/08/2026): trigger `BEFORE INSERT` `trg_traffic_data_dedupe_renamed` apaga a linha
antiga com os MESMOS `campaign_id/adset_id/ad_id` (mesmo dia/conta/op) antes de inserir a
renomeada. Limpeza retroativa removeu 132 grupos duplicados (~R$ 14k em 30 dias).

Sintoma clássico: GTX hoje mostrava R$ 14.625 vs R$ 12.838 real (~+R$ 2k).
Antes de culpar fuso (Dubai) ou hourly vs daily, checar duplicidade por IDs:
`GROUP BY operation_id,account_id,date,campaign_id,adset_id,ad_id HAVING count(*)>1`.

Nota: `traffic_data_hourly` é account-level e frequentemente incompleto (gaps de sync),
então divergência daily > hourly em conta BRT normalmente é lag do hourly, não inflação.
