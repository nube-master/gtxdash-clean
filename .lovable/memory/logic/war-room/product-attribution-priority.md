---
name: War Room product/project attribution priority
description: O War Room (página Vendas + componente SalesIntelligence) prioriza o campo product_name padronizado da sales_data antes de cair em fallbacks (offer_name, utm_campaign, store). Vendas vindas do sync-redtrack-sales já chegam com product_name normalizado (NDM/NDR/NDB/LDR/CRT/MON), garantindo classificação correta por projeto e produto sem precisar de offer_name (que sales_data não armazena).
type: logic
---

## Regra

Em `src/components/dashboard/SalesIntelligence.tsx` (`detectProject` / `resolveBrand`) e em `src/pages/Vendas.tsx` (`resolveProduct`), a ordem de detecção é:

1. **`product_name` exato** (NDM, NDR, NDB, LDR, LDG→LDR, CRT, MON, NeuroDyne, Core Strength, Memoryon) — fonte primária quando vier de `sales_data` (webhooks oficiais ou sync RedTrack).
2. Regex em `store` / `product_name` (CRT/AILULA/CoreStrength).
3. `resolveProductName(offer_name)` — só funciona quando o `offer_name` existe (RedTrack via `useRedTrackSales`).
4. Fallbacks por `utm_campaign` e por substring.

## Por que importa

A tabela `sales_data` **não tem** as colunas `offer_name`, `event_type` ou `currency`. Sem priorizar `product_name`, o detector caía sempre no fallback final (`return sale.product_name || "Outros"`) — o que devolvia o código bruto (NDM) em vez do nome normalizado (NeuroDyne), bagunçando os cards "Faturamento por Projeto / Produto" e "Vendas por Produto".

## Componente de prevenção

`UnknownPlatformAlert` (em `src/components/dashboard/UnknownPlatformAlert.tsx`) exibe no topo do War Room um aviso amarelo quando aparecem vendas com `store = 'redtrack_unknown'` — sinal de que o `offer_name` no RedTrack não tem a tag de plataforma na 2ª posição (`Source | Plataforma | Project | ...`). Mostra `utm_campaign` + produto detectado + receita, com botão para abrir o RedTrack e corrigir o offer_name.
