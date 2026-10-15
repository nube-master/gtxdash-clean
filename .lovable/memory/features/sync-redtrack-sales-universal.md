---
name: Sync RedTrack universal de vendas
description: Edge function sync-redtrack-sales lê redtrack_events e popula sales_data automaticamente para CartPanda, BuyGoods, Digistore, Indefinido e tráfegos sem fonte autoritativa (NewsBreak), exigindo amount>0 para evitar vendas fantasma de eventos intermediários
type: feature
---

A edge function `sync-redtrack-sales` é a fonte universal de vendas quando um checkout NÃO tem webhook próprio configurado, OU quando uma fonte de tráfego cai fora da captura do IPN autoritativo. Roda via cron `sync-redtrack-sales-2min` a cada 2 minutos.

**Lógica:**
1. Lê `redtrack_events` (`event_type IN ('purchase','upsell','sale')`) dos últimos 30 min (lookback configurável). Aceita `amount=0` apenas para tráfegos-fallback (NewsBreak).
2. Classifica `store` pelo 2º segmento do `offer_name` ("Source | **Platform** | Project | ..."): `cartpanda`, `clickbank`, `buygoods`, `digistore`, ou `redtrack_unknown`.
3. **Deduplica por receipt** (raw_payload.p_sub1 / receipt / order_id) → transaction_id → clickid → redtrack_id → id, usando `MAX(amount)` entre eventos do mesmo grupo.
4. Resolve `product_name` (NDM/NDR/NDB/LDR/CRT/**MO**) pelo 3º segmento ou por regex no `product_name`. **MO = Memoryon (CartPanda)**. Aceita "MON" como alias legado mas grava sempre como **"MO"**.
5. Converte USD→BRL via última `exchange_rate_log`.
6. Faz upsert em `sales_data` com `order_id = "rt:" + dedupKey`. O prefixo `rt:` garante que NUNCA colida com webhooks oficiais (ClickBank/CartPanda/Digistore continuam autoritativos).
7. **Por padrão pula plataformas com webhook próprio** (`clickbank`, `digistore`) — só processa quando `include_known=1`, em modo backfill (`date=YYYY-MM-DD`), ou quando o tráfego é fallback-traffic.

**REGRA CRÍTICA — exigir amount > 0 para CartPanda:**
O RedTrack envia MUITOS eventos `purchase` intermediários (cliques, postbacks parciais) que carregam o mesmo receipt mas com `amount=0`. Vendas REAIS sempre têm o postback final com amount preenchido. Se aceitarmos `amount=0` para CartPanda, criamos centenas de "vendas fantasma" no `sales_data` (já aconteceu: 99 fantasmas em 23/04/2026 com a regra `allowZeroRevenue` errada).
- ✅ CartPanda: exige `MAX(amount) > 0` no grupo (vendas reais sempre têm valor).
- ✅ Tráfegos-fallback (NewsBreak): aceita `revenue=0` porque o IPN ClickBank de fato não envia amount via aff_sub2/sub3 padrão.

**Tráfegos fallback (`isFallbackTrafficSource`):**
São fontes de tráfego cujo IPN/webhook autoritativo NÃO captura as vendas (porque não usam o aff_sub2/sub3 padrão da operação). Atualmente: **NewsBreak** (`newsbreak`, `news_break`, `news break` no 1º segmento do offer_name).
- Para esses tráfegos, mesmo dentro de ClickBank, processamos via fallback RedTrack.
- O `store` final é reescrito para `newsbreak` (em vez de `clickbank`), permitindo que o War Room exiba como canal de mídia próprio sem duplicar com o IPN ClickBank autoritativo.
- `utm_source` é forçado para `newsbreak` quando ausente.
- Aceita `revenue=0` para registrar contagem de vendas mesmo sem amount no postback.

**Parâmetros aceitos** (query string OU body JSON):
- `lookback_min` (2–1440, default 30)
- `date=YYYY-MM-DD` (backfill, processa o dia BRT inteiro 03:00Z→03:00Z+1)
- `include_known=1` (força sync também para plataformas com webhook)

**Por que existe:** 
- **CartPanda**: Sem webhook configurado, vendas existem no RedTrack mas sumiriam do War Room. Basta a tag `| CartPanda |` estar correta no offer_name. **Vendas precisam de amount>0 para serem registradas.**
- **NewsBreak**: O ClickBank IPN não captura essas vendas (usam aff diferente). Sem fallback, 80+ vendas/dia desapareciam do dashboard.

**Códigos de produto canônicos** (gravados em `sales_data.product_name`):
- `NDM` (NeuroDyne Master), `NDR` (NeuroDyne Retargeting), `NDB` (NeuroDyne B)
- `LDR` (LeanDrops, alias de LDG)
- `CRT` (Core Strength, alias de AILULA)
- **`MO`** (Memoryon — produto próprio CartPanda). Renomeado de `MON` → `MO` em 23/04/2026; regex de detecção continua aceitando ambas as grafias para compatibilidade com offer_names legados.
