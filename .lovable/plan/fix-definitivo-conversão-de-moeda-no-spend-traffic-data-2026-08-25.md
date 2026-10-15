# Fix definitivo: conversão de moeda no spend (traffic_data)

## Diagnóstico resumido
`traffic_data.spend` guarda o valor **cru da conta de anúncio**, sem moeda. Hoje: 318 contas USD, 105 BRL, 8 EUR, 1 GBP. Todo dashboard que soma `traffic_data.spend` mistura moedas e subestima o investimento das contas USD/EUR em ~5,1x → ROI/CAC/CPC absurdos (caso [AD64] EDD: ROI 20x exibido vs 3,97x real).

Agravante: as tabelas de câmbio estão paradas. `exchange_rates_daily` tem último registro em **2026-04-26** (61 linhas no total, fontes misturadas: bcb_ptax, fawazahmed0, open.er-api). Sem FX vivo nenhum fix se sustenta.

---

## 1) Fonte de câmbio viva

- **Fonte primária:** BCB PTAX (série oficial USD/BRL, dias úteis) — já existe a função `sync-ptax-daily`.
- **Fonte secundária (EUR, GBP e fallback de feriado/fim de semana):** `open.er-api` + `fawazahmed0` com média — já existe `sync-multi-fx`.
- **Frequência:** cron diário **09:15 BRT (seg–sex)** para PTAX + cron **a cada 6h** para multi-FX (cobre EUR/GBP e dias sem PTAX).
- **Regra de gravação:** 1 linha por (`rate_date`, `currency_from`, `currency_to`, `source`) em `exchange_rates_daily`; `rate_avg` é o valor canônico.
- **Regra de leitura:** para uma data D usa o rate de D; se ausente (fim de semana/feriado), usa o **último rate ≤ D** (carry-forward), nunca o rate de hoje para datas passadas.

---

## 2) Onde converter — trade-off

### A) RPC lê `meta_ad_status.spend_brl`
- ✅ Valor já convertido na origem pelo sync; zero backfill de FX.
- ❌ `meta_ad_status` só cobre nível **ad** e janela recente — não tem histórico completo nem granularidade campanha/adset/dia usada por Pacing, Analytics, COD.
- ❌ Amarra ~15 RPCs a uma tabela de status operacional (que é sobrescrita por sync), quebrando o histórico imutável.
- **Veredito:** serve só para a aba Criativos; não resolve o sistêmico.

### B) Coluna `spend_brl` em `traffic_data` (materializada)
- ✅ Ponto único, uma vez convertido vale para **todas** as ~20 RPCs e ~30 hooks.
- ✅ Backfill histórico com FX do dia da linha, congelado (histórico imutável, mesma filosofia dos snapshots diários).
- ✅ Custo zero de query: sem JOIN em FX a cada leitura; Pacing/War Room continuam rápidos.
- ❌ Exige migração + backfill de todas as linhas + atualizar todos os writers de sync (`sync-meta-today`, `sync-meta-fast`, `sync-meta-hourly`, `sync-meta-ads-fahto`, MGID, Newsbreak, Taboola).
- ❌ Dado duplicado: se um rate for corrigido, precisa reprocessar (aceitável — é o comportamento desejado).

### C) Converter em runtime (JOIN FX na RPC ou no front)
- ✅ Sem migração; correção instantânea de rates.
- ❌ JOIN com `exchange_rates_daily` + `meta_ad_accounts.currency` em **toda** RPC pesada → latência (já houve timeout de 8s no dashboard).
- ❌ Precisa alterar as mesmas ~20 RPCs de qualquer forma, e ainda deixa o front livre para somar cru (regressão silenciosa volta).
- ❌ Rate mutável = número histórico muda retroativamente → quebra a regra de imutabilidade financeira.

### ➜ Recomendação: **B**, com A como atalho de validação
Materializar `traffic_data.spend_brl` (+ colunas `currency` e `fx_rate` para auditoria), preenchido no write e no backfill com o FX do dia. Todas as RPCs passam a somar `spend_brl`. Usar `meta_ad_status.spend_brl` apenas como cross-check de validação do backfill nas contas que têm ambos.

Detalhe de implementação:
- `traffic_data.currency` (denormalizado de `meta_ad_accounts` no momento do sync), `fx_rate numeric`, `spend_brl numeric GENERATED`-não (coluna normal, gravada pelo writer/backfill).
- Contas BRL: `fx_rate = 1`, `spend_brl = spend`.
- Função helper `public.fx_to_brl(_amount, _currency, _date)` com carry-forward, usada por backfill e writers.

---

## 3) Escopo
Aplicar em **todas as operações** (EDD, FAHTO, GTX, SPACE, Xperia) — a coluna é da tabela, não da op. Nenhum filtro por operação em nenhuma etapa.

---

## 4) Backfill com FX do dia da venda
1. Popular `exchange_rates_daily` retroativamente: série histórica PTAX USD/BRL por dia útil desde a menor `traffic_data.date`, + EUR/GBP via API histórica; carry-forward para fins de semana/feriados.
2. Rodar backfill de `traffic_data` em lotes por mês (`UPDATE ... FROM fx_to_brl(spend, currency, date)`), do mais antigo para o mais recente, para não travar a tabela.
3. Validação por amostragem: comparar `SUM(spend_brl)` vs `meta_ad_status.spend_brl` / `meta_account_financials` no mesmo período — tolerância ±2%.
4. Snapshots já congelados (`daily_totals_snapshot`, `system_daily_snapshot`) são recalculados só se divergirem >2%; caso contrário permanecem intocados.

---

## 5) Alerta de FX velho
- Coluna/consulta canônica: `MAX(rate_date)` em `exchange_rates_daily` por par de moeda.
- Cron horário verifica se o rate mais recente é **> 24h** (ou > 72h em fim de semana prolongado) → dispara notificação `fx_stale` via Pushcut + Web Push (reusa `notification_templates`, mesmo caminho dos demais alertas).
- UI: badge âmbar "FX desatualizado (Xd)" no header e nos cards que exibem spend convertido.
- Fallback de segurança: writer nunca grava `fx_rate = null` silenciosamente — usa carry-forward e marca a linha com `fx_stale = true` para auditoria.

---

## 6) Impacto downstream (tudo que soma `traffic_data.spend` cru)

**RPCs (todas precisam trocar para `spend_brl`):**
`get_spend_normalized_sp`, `get_spend_normalized_sp_v2`, `get_traffic_spend_total`, `get_traffic_spend_by_account` (+ `_v2`, `_normalized`), `get_traffic_aggregated`, `get_traffic_by_campaign`, `get_traffic_by_campaign_day`, `get_total_traffic_metrics` (+ `_v2`), `get_creative_traffic_aggregated`, `get_creative_traffic_normalized_sp`, `get_ad_performance_metrics`, `get_campaign_performance_metrics`, `get_leaderboard_traffic` (+ `_v2`), `get_live_pacing_campaigns`, `get_pacing_campaigns_for_range`, `get_offer_traffic_daily`, `get_offers_kpi_metrics` (+ `_range`), `get_offers_today_traffic`, `get_offers_traffic_stats`, `get_vsl_advanced_metrics`, `get_vsl_spend_breakdown`, `get_vsl_top_creatives`, `get_cod_daily_pnl` (+ v2/v13), `refresh_daily_snapshot`, `resolve_pacing_sales_attribution`, `dashboard_consolidated`.

**Telas/hooks afetados:** Dashboard (`useDashboardTotals`, `useDashboardConsolidated`, `useSpendTodayBrt`, `useRealtimeSpend`, `useSpendByAccount`), Analytics (`useDailyPerformanceData`, `useTrafficData`, `useTrafficByCampaign`, `useCountryPerformance`), Criativos (`useCreativeTrafficData`, `useCreativeWeeklyReport`), Pacing (`useLivePacingCampaigns`, `usePacingScopePreview`, `useSimulateRule`, `usePacingRealtimeWatcher`), War Room, Ofertas (`useOffersTraffic`, `useOffersDayMetrics`, `useOffersTodayStats`), VSL (`useVslSpendMap`, `useVslTopCreatives`), Fluxo de Caixa (`useCashflowData`), Leaderboard, COD.

**Edge functions que decidem com spend:** `pacing-controller` (regras de corte/escala por ROAS — hoje comparando receita BRL com spend USD), `notify-*`/`pulse-1h` (relatórios), `sync-*` (writers).

---

## Riscos
- **Alto:** o `pacing-controller` hoje calcula ROAS com spend subestimado → ao corrigir, ROAS cai ~5x nas contas USD e regras de corte podem pausar campanhas em massa. Mitigação: rodar em **dry-run obrigatório** por 24h após o fix e revisar thresholds em `product_margin_settings`.
- **Médio:** números históricos de todos os dashboards mudam (lucro cai, ROI cai) — comunicar antes; é correção, não regressão.
- **Médio:** série histórica de FX pode ter buracos em datas antigas → carry-forward + flag de auditoria.
- **Baixo:** duplicidade de dado (`spend` vs `spend_brl`) exige que todo writer novo preencha a coluna; mitigar com trigger de segurança que calcula `spend_brl` se vier nulo.

---

**Próximo passo:** confirmar a opção (recomendo **B**) e eu executo em 4 etapas: FX histórico + cron → migração de colunas → backfill validado → troca das RPCs + dry-run do pacing.
