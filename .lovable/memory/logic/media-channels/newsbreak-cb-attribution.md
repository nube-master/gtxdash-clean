---
name: Newsbreak CB Attribution
description: Cross-attribuição MMP/CB → Newsbreak é proibida sem venda real store=newsbreak em sales_data. Nunca inferir por aff_sub2.
type: constraint
---

`useMediaChannelsData` deve contar Newsbreak apenas quando a venda já está em `sales_data` com `store='newsbreak'` via postback/sync RedTrack.

**Proibido:** cruzar vendas ClickBank/MMP para Newsbreak por `aff_sub2`, `aff_sub3`, receipt hint ou por "não parece Meta".

**Why:** IDs como `6972414100610`, `6972419808210`, `6973094638410` e similares são IDs internos da loja/afiliado (`guipiresp`), não tracking Newsbreak. Em 10/05/2026 essa heurística antiga inflou Newsbreak em 5 vendas/R$ 6.139,86; em 11/05/2026 o real era 1 venda em `sales_data`, não as 5 vendas MMP do Facebook.
