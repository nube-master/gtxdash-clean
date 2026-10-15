---
name: RBAC Fail-Closed
description: canAccessPage nega tudo até permsLoaded; sem linha de permissão para a op ativa = acesso negado (não full access)
type: constraint
---

- `AuthContext` expõe `permsLoaded` (false até `fetchUserMeta` resolver). `canAccessPage()` retorna **false** enquanto `!permsLoaded`, exceto `/notifications` e `/profile`.
- `ProtectedRoute` renderiza loader enquanto `!permsLoaded` — nunca renderiza sidebar/dashboard antes das permissões (evitava flash de INVESTIDO/LUCRO/ROAS para user restrito).
- `deriveAllowedPages`: se o usuário tem linhas em `user_page_permissions` mas **nenhuma** para a operação ativa → retorna `[]` (nega tudo). Só retorna `null` (full access legado) quando não existe nenhuma linha.
- **Nunca** reverter para "mostra tudo e filtra depois" — é vazamento de dados (LGPD).
