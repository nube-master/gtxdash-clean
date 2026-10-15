# Auditoria de Congruência de Métricas — /pacing + /dashboard

> Atualizado: 26/06/2026 — varredura completa dos cálculos exibidos no /pacing (CampaignTable) e /dashboard.

## ✅ /pacing — Tabela de Campanhas

| Coluna | Fórmula no código | Fonte | Status |
|---|---|---|---|
| Gasto | `SUM(traffic_data.spend)` em BRL (pure FX) | `useTrafficData` → `traffic_data` | ✅ |
| Impr. | `SUM(traffic_data.impressions)` | `traffic_data.impressions` | ✅ |
| Cliques (link) | `SUM(traffic_data.inline_link_clicks)` | `traffic_data.inline_link_clicks` | ✅ **ajustado** |
| CPM | `(spend / impressions) * 1000` | calc | ✅ |
| CTR | `(linkClicks / impressions) * 100` | calc | ✅ **ajustado** (antes usava `clicks` total) |
| CPC | `spend / linkClicks` | calc | ✅ **ajustado** (antes usava `clicks` total) |
| IC | `COUNT(redtrack_events WHERE event_type='InitiateCheckout')` por `meta_campaign_id` | `usePacingICs` | ✅ |
| Custo IC | `spend / ic` | calc | ✅ |
| Vendas | front-end only ($200–260 USD, exclui upsell/bump) | `useRealSales` + `useCbAuditExtraSales` + RT | ✅ |
| Conv. Checkout | `(vendas / ic) * 100` | calc | ✅ |
| Faturamento | `SUM(commission FE)` USD→BRL (dual-source MAX) | `useRealSales` | ✅ |
| ROAS | `revenue / spend` (BRUTO) | calc | ✅ |
| CPA | `spend / vendas` | calc | ✅ |
| Lucro | `revenue − spend` (BRUTO — sem deduções no /pacing) | calc | ✅ ([memória](mem://logic/financial/pacing-gross-profit)) |
| Margem | `(revenue − spend) / revenue` (BRUTO) | calc | ✅ |
| Score | GTX score (ROAS/lucro/consistência/volume) | `useGtxMetaData` | ✅ |
| Lucro 3D | `SUM(revenue − spend)` janela fixa 3 dias BRT, com `matchSpendName` tolerante a rename | `trafficByDay` + `salesByDay` | ✅ |
| Trend | Hoje vs média 2 dias anteriores (3D fixos) | calc | ✅ |

## ✅ /dashboard — KPIs operacionais

| KPI | Fórmula | Fonte | Status |
|---|---|---|---|
| Faturamento | `MAX(cp, rt+cb)` por dia, front-end only | `dashboard-totals` | ✅ ([dual-source MAX](mem://logic/financial/dashboard-totals-dual-source-max)) |
| Investimento | `SUM(spend)` traffic_data BRL + Newsbreak USD→BRL | `dashboard-totals` + `useTrafficData` | ✅ |
| Meta Tax | `12,15% * spend` | calc | ✅ |
| Aluguel | `5–6% * spend` (por conta) | `meta_account_financials` | ✅ |
| Lucro Líquido | `revenue − spend − tax − rent` (dedução só aqui) | calc | ✅ |
| Margem | `lucro / revenue` | calc | ✅ |
| ROI | `lucro / spend` | calc | ✅ |
| CPA | `spend / vendas` | calc | ✅ |

## 🔍 Cross-check de hoje (26/06/2026, BRT)

```
spend total traffic_data .......... R$ 25.492,60
impressions ....................... 64.992
inline_link_clicks ................ 4.264   ← usado em CTR/CPC
total clicks (legacy) ............. 5.527   ← inflava CTR ~30%
ICs hoje (RedTrack) ............... 0       (virada de dia)
vendas front-end hoje ............. 0       (virada de dia)
faturamento FE hoje ............... 0
```

CTR antes (errado): `5527/64992 = 8,50%`  
CTR agora (correto): `4264/64992 = 6,56%`  
CPC antes (errado): `25.492,60/5527 = R$ 4,61`  
CPC agora (correto): `25.492,60/4264 = R$ 5,98`

## 🛠️ Fix aplicado nesta auditoria

**`src/hooks/useGtxMetaData.ts`** — `campMap` agora agrega `linkClicks` (inline_link_clicks).  
CPC, CTR e a coluna "Cliques" no /pacing passam a refletir cliques de link (padrão da operação documentado em [mem://logic/meta-ads/cpc-standardization](mem://logic/meta-ads/cpc-standardization)). Sem isso, CTR aparecia ~30% inflado e CPC ~25% subestimado em todas as campanhas Meta.

## 📐 Regras mantidas (já validadas)

- **Front-end only:** vendas `$200–260` USD, ignora upgrade/upsell/last chance/bump (`isFrontEndCbSale`).
- **Dual-source MAX:** dashboard-totals usa `MAX(cp, rt+cb)` por dia — nunca soma.
- **RedTrack cap:** vendas RT com `amount > $300` são travadas em `$235` via trigger.
- **Lucro/Margem brutos no /pacing**, deduções só no /dashboard.
- **Pure FX:** spend BRL via `exchange_rate_log` (sem spread bancário).
- **Newsbreak USD → BRL:** convertido antes de somar com Meta.

## Próximos passos (opcionais)

- Criar modal "Sanity Check" no header do /pacing comparando fonte vs UI em tempo real, com flag ❌ quando divergir >1%.
- Adicionar teste automatizado (Vitest) que recomputa CPM/CTR/CPC/ROAS a partir de fixtures e compara com `useGtxMetaData`.
