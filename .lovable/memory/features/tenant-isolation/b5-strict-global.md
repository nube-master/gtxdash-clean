---
name: Bloco 5 — Strict Tenant Isolation Global
description: STRICT tenant isolation ATIVO globalmente (feature_flags.strict_tenant_isolation enabled=true, operation_ids={}); todos os membros filtrados por operation_id via _op_scope_check; Super Admins (is_super_admin) mantêm bypass legacy quando não há op ativa selecionada (fix Opção A)
type: feature
---

# Bloco 5 — STRICT Tenant Isolation (Global)

## Estado
- `feature_flags.strict_tenant_isolation`: `enabled=true`, `operation_ids='{}'` → aplica pra TODAS as operações.
- Selado em 2026-07-22 após canary GTX-only 4/4 métricas verdes.

## Regra ativa (`public._op_scope_check(row_op)`)
- `v_current` = `current_setting('app.active_operation', true)`.
- Se `v_current IS NOT NULL` → só passa `row_op = v_current` (isolamento estrito).
- Se `v_current IS NULL` E `is_super_admin(auth.uid())` → bypass legacy (fix Opção A). Necessário pra dashboards SA que agregam múltiplas ops sem selecionar uma.
- Membros regulares sem op ativa → BLOQUEADOS (linhas vazias).

## Fix Opção A — histórico
Canary GTX-only quebrou 4 métricas (Connect-rate, Pitch, Audiência, Distribuição de oferta) pra Gabriel (SA) porque o GUC `app.active_operation` não era injetado. Fix mínimo: bypass legacy pra SA sem op ativa. Aplicado em migration 2026-07-22.

## Dívida técnica — Bloco 6 (wire-up GUC completo)
Substituir bypass legacy por injeção obrigatória de `app.active_operation` em TODAS as sessões (frontend + edge functions). Quando concluído: remover ramo `is_super_admin` do `_op_scope_check` e forçar SA a selecionar uma op via `/select-operation` antes de qualquer query.
