# F10 — Testes de Isolamento (Opção D)

Roda 6 cenários (C1–C6) em 2 modos: baseline (`strict_op_scope=OFF`) e strict (`ON`).

## Cenários

| # | Persona | O que valida | Arquivo |
|---|---|---|---|
| C1 | copyperes (viewer GTX) | RLS bloqueia leitura cross-op em 10+ tabelas strict | `c1_user_cross_op.sql` |
| C2 | gabrielvidal156 (SA sem op) | UI redireciona `/select-operation`; PostgREST retorna `[]` | `c2_sa_no_op.md` (Playwright) |
| C3 | gabrielvidal156 (SA + GTX) | 10+ tabelas retornam apenas rows GTX | `c3_sa_op_active.sql` |
| C4 | gabrielvidal156 + `cross_op_intent` | DISTINCT operation_id >= 2; audit em system_logs | `c4_cross_op_intent.sql` |
| C5 | gabrielvidal156 → dashboard_consolidated() | agregados N ops (SECURITY DEFINER); user comum → 42501 | `c5_dashboard_consolidated.sql` |
| C6 | anon | `/dashboard`→`/login`; `talent_jobs` retorna ativas; `offers` retorna `[]` | `c6_anon.md` (Playwright) |

## Execução

```bash
# baseline
psql "$DATABASE_URL" -v strict_scope=off -f c1_user_cross_op.sql
# strict
psql "$DATABASE_URL" -v strict_scope=on  -f c1_user_cross_op.sql
```

Runner: `scripts/f10-run.ts` orquestra tudo, gera JSON + Markdown em `/mnt/documents/f9_dia1b/F10_TESTS.md`.

## Sinal verde para canary

- 6/6 pass em modo strict
- 0 leaks nos loops de C1 e C3
- C4 registra audit corretamente
