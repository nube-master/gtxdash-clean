---
name: Push sale_approved formato Utmify
description: Título "Venda aprovada! | {{utm_campaign}}" + body "Valor: ${{valor_usd}}" em todos templates e no legado; sem emoji, use_legacy=false
type: design
---

Formato único para push de venda (`sale_approved`), estilo Utmify:

- Título: `Venda aprovada! | {{utm_campaign}}` (UTM completa, sem encurtar; sem UTM → só "Venda aprovada!")
- Body: `Valor: {{fx_tilde}}${{valor_usd}}{{fx_note}}` → "Valor: $92.45" ou "Valor: ~$92.45 (fx pending)"
- Sem valor resolvido: body = "(payload incompleto)"
- **Proibido** emoji 💰 no título; `use_legacy = false` em todos os templates.
- Um único template `sale_approved` ativo por operação (5 ops incl. ESCALIFY).

Implementação: `_shared/push-mirror.ts` (título/body legado + payload com `valor_usd`,
`fx_tilde`, `fx_note`) e `push-send` (`valor_usd` sempre `toFixed(2)`; `cleanUnresolved`
remove `| {{...}}` órfão sem apagar a linha toda — o filtro de linha exige `:` antes do placeholder).
