---
name: COD Revenue Exclusion
description: Pedidos COD (Cash on Delivery, ex apelido CB-COD) aparecem no War Room para visibilidade mas são bloqueados no faturamento — só viram receita quando/se entregador coleta, fora do fluxo CB/CartPanda.
type: feature
---

dashboard-totals tem `COD_APELIDOS = ["CB-COD"]` + helper `isCodSale(product_name, utm_campaign, offer_name)`. Filtro aplicado em:
- loop principal de `sales_data` (CartPanda/H&W/etc)
- loop de fallback `redtrack_events` (RT)
- segundo loop de CP por dia (cpByDay)

Não filtra `clickbank_audit` porque IPN não dispara em pedido não pago — COD nunca chega lá.

Para incluir novas operações COD, basta adicionar o apelido em `COD_APELIDOS` no topo de `supabase/functions/dashboard-totals/index.ts`.
