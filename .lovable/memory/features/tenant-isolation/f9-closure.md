---
name: F9 — Encerramento (multitenancy hardening)
description: F9 encerrado 2026-07-22 com Bloco 5 (STRICT global) + fix Opção A (bypass SA sem op ativa); Bloco 6 em aberto como dívida técnica (wire-up GUC completo)
type: feature
---

# F9 — Encerramento

## Blocos entregues
- **Bloco 1** — RLS FORCE + security_invoker em 23 tabelas; REVOKE anon em 35 RPCs.
- **Bloco 1.5** — Guards `require_op_access` em 29 SECURITY DEFINER RPCs classe A.
- **Bloco 4** — Realtime tenant guard cliente-lateral em 12/12 channels (`src/lib/realtimeTenantGuard.ts`).
- **Bloco 5** — STRICT tenant isolation flag ativa globalmente (ver `features/tenant-isolation/b5-strict-global.md`).

## Fix Opção A (aplicado em B5)
`_op_scope_check` permite bypass pra SA quando `app.active_operation` GUC não estiver setado. Evita quebrar dashboards SA que agregam múltiplas ops. Documentado como dívida.

## Testes
- F10 estendido: 34/34 assertions PASS (cross-op leakage, RPC guards, REVOKE checks, view flip).
- Canary GTX-only: 4/4 métricas críticas verdes antes do flip global.

## Dívida técnica em aberto — Bloco 6
Wire-up completo do GUC `app.active_operation` em frontend + edge functions. Ao concluir, remover bypass SA do `_op_scope_check`.
