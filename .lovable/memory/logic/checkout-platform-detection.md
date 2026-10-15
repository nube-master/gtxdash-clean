---
name: Checkout Platform Detection
description: Detect checkout platform (CartPanda/ClickBank/BuyGoods/Digistore/H&W) from RedTrack offer_name "Offer Source" segment, not from store field
type: feature
---

A plataforma de checkout de uma venda DEVE ser detectada via o campo `offer_name` do RedTrack (RedTrack "Offer Source"), não pelo campo `store`.

**Por quê:** O `store` do RedTrack vem sempre como "redtrack" para todas as plataformas (CartPanda, ClickBank, BuyGoods, Digistore), o que causa rotulação incorreta. A informação real da plataforma fica no 2º segmento do `offer_name`.

**Convenção do offer_name (RedTrack):**
```
"Traffic | Platform | Project | Variant"
ex: "Facebook | CartPanda | MO | 3 Potes"
ex: "Facebook | Clickbank | NDM | ..."
ex: "Facebook | BuyGoods | LDR | ..."
```

**Como aplicar:**
```typescript
function resolveCheckoutPlatform(sale: { offer_name?: string | null; store?: string | null }): string {
  const offer = (sale.offer_name || "").trim();
  if (offer) {
    const segments = offer.split("|").map((s) => s.trim().toLowerCase());
    const platformSeg = segments[1] || "";
    if (platformSeg.includes("cartpanda")) return "CartPanda";
    if (platformSeg.includes("buygoods")) return "BuyGoods";
    if (platformSeg.includes("digistore")) return "Digistore24";
    if (platformSeg.includes("clickbank")) return "ClickBank";
    if (platformSeg.includes("h&w") || platformSeg.includes("h & w") || platformSeg === "hw") return "H&W";
  }
  // Fallback para registros de auditoria sem offer_name
  return sale.store === "cartpanda" ? "CartPanda" : "ClickBank";
}
```

**Aplicar em:**
- War Room / Live Sales (feed, painel de detalhes, filtro de plataforma)
- Página de Vendas (rótulos de origem)
- Notificações Pushcut (campos de plataforma)
- Qualquer relatório/UI que precise distinguir checkout

**Impacto financeiro (dashboard-totals):**
A função `dashboard-totals` usa essa MESMA regra para classificar eventos RedTrack como "non-ClickBank" (CartPanda/BuyGoods/Digistore) e somá-los ao faturamento como backup quando a plataforma não tem webhook próprio. Sem essa classificação, vendas CartPanda eram descartadas em dias com auditoria ClickBank presente.
