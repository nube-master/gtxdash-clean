
## Taxa de entrega (COD)
`space_commission_config.is_cod_operation` + `delivery_rate_pct` (default 60). Quando ligado:
Base = (Receita × taxa_entrega) − Spend − Impostos(12,15% sobre receita entregue) − Aluguel(5,5% spend) − Outros.
Desligado = taxa 100% (digital). Cálculo único em `src/lib/spaceCommission.ts` usado no card, coluna diária do drill-down e CSV do consolidado. Como o cálculo é client-side por período, ligar o toggle já reflete retroativamente (ex.: FAHTO).
