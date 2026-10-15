# Push multi-usuário — self-service + controle admin

## Diagnóstico da infra atual

O que **já existe** e não precisa ser criado:

- `push_subscriptions` — já tem `user_id`, `operation_id`, `device_label`, `enabled`, `endpoint`, `last_used_at`.
- `push_notification_recipients` — **já tem `user_id` + `operation_id` + `notification_type` + `enabled`**. Ou seja, a matriz `user × operação × tipo` do Bloco B já cabe na tabela como está. Nada de novo campo aqui.
- `push_notification_history` — já registra `user_id`, `operation_id`, `notification_type`, `status`, `error`.
- Página `/notifications` + hook `useWebPush` — já fazem permissão, subscribe, unsubscribe, teste e contagem de dispositivos do usuário logado.
- Página `/notificacoes-pushcut` — destinatários **Pushcut** (webhooks), separada. Não mexemos nela; a nova aba é para push nativo/PWA.

O que **falta** (o trabalho real):

1. `push_subscriptions.deleted_at` (soft delete) — hoje só existe `enabled=false`.
2. Listagem de usuários com JOIN em `auth.users` — o cliente não pode ler `auth.users`. Precisa de uma RPC security-definer.
3. UI de matriz para o admin (não existe).
4. Onboarding do usuário novo (banner + popup) — não existe.
5. **Risco atual a corrigir:** o `push-send` tem fallback em cascata para `sale_approved` que, se não achar recipient exato, manda para *qualquer* recipient cadastrado — inclusive de outra operação. Com um usuário isso era rede de segurança; com Bruno/David/Judani vira vazamento cross-op. Vou trocar o último nível (`any_recipient`) por: cai só para "admins/owners da própria operação".

---

## Bloco A — `/notifications` (qualquer usuário logado)

Evoluir a página existente, sem nova rota.

```text
┌ Meu Dispositivo ───────────────────────────────────────────┐
│  [ícone]  Notificações neste dispositivo                   │
│           Status: ATIVO / DESATIVADO / BLOQUEADO           │
│                                                            │
│   ┌──────────────────────────────────────────────┐         │
│   │  🔔  ATIVAR NOTIFICAÇÕES NESTE DISPOSITIVO   │         │
│   └──────────────────────────────────────────────┘         │
│   (se permission = denied → card "Como liberar             │
│    manualmente" com passos iOS / Android / Chrome)         │
│                                                            │
│   [ Enviar teste ]        [ Desativar neste dispositivo ]  │
└────────────────────────────────────────────────────────────┘

┌ Meus dispositivos (3) ─────────────────────────────────────┐
│  iPhone · Safari     •ESTE   ativo desde 12/08   [Remover] │
│  Mac · Chrome                ativo desde 03/08   [Remover] │
│  Android · Chrome            inativo (expirado)            │
└────────────────────────────────────────────────────────────┘

┌ O que eu recebo hoje ──────────────────────────────────────┐
│  GTX      Vendas aprovadas · Pulse 1h                      │
│  FAHTO    (nada — pedir ao admin)                          │
│  → somente leitura; quem liga/desliga é o admin            │
└────────────────────────────────────────────────────────────┘

┌ Últimas notificações recebidas (histórico próprio) ────────┐
```

- Botão "Ativar" → `Notification.requestPermission()` → `push-subscribe` (já grava `user_id` do JWT).
- Rejeição → CTA com instruções por plataforma (iOS exige PWA instalado — já detectado por `isIOS`/`isStandalone`).
- "Remover" em outro dispositivo → soft-delete (`deleted_at`, `enabled=false`) via `push-unsubscribe` por `subscription_id`.
- "Enviar teste" → `push-send` com `notification_type: "test_notification"`, `target_user_ids: [eu]`. Registra em `push_notification_history` para o usuário conferir entrega.

## Bloco B — `/notifications-usuarios` (admin/owner)

Nova rota + item de sidebar atrás de checagem de papel (`admin`/owner via `has_role`), não de flag de UI.

```text
┌ Notificações & Usuários ───────────────── Operação: GTX ▾ ┐
│  Usuários da operação                                     │
│  ┌───────────────────────────────────────────────────────┐│
│  │ Gabriel   2 dispositivos   8 tipos ativos       ▸     ││
│  │ Bruno     1 dispositivo    0 tipos  ⚠ silencioso ▸    ││
│  │ David     sem dispositivo  —        ⚠ pendente  ▸     ││
│  │ Judani    1 dispositivo    3 tipos ativos       ▸     ││
│  └───────────────────────────────────────────────────────┘│
│                                                           │
│  ▾ Bruno — bruno@…                                        │
│    [ Ativar tudo ]  [ Copiar do Gabriel ]  [ Limpar tudo ]│
│    ┌──────────────────────┬───────┬────────┬──────┐       │
│    │ Tipo                 │  GTX  │ FAHTO  │ EDD  │       │
│    ├──────────────────────┼───────┼────────┼──────┤       │
│    │ Venda aprovada       │  [on] │  [off] │ [off]│       │
│    │ Pulse 1h             │  [off]│  [off] │ [off]│       │
│    │ Conta caiu (status)  │  [on] │  [on]  │ [off]│       │
│    │ Pacing / Liga Tudo   │  [off]│  [off] │ [off]│       │
│    │ …                    │       │        │      │       │
│    └──────────────────────┴───────┴────────┴──────┘       │
│    Dispositivos: iPhone · Safari (12/08)                  │
└───────────────────────────────────────────────────────────┘
```

- Colunas = operações onde o **admin logado** tem acesso (nunca todas as ops do sistema).
- Toggle on → `upsert` em `push_notification_recipients` (`enabled=true`); off → `delete` da linha (o pedido é INSERT/DELETE; mantenho `enabled` só para pausa futura).
- Bulk: "ativar tudo pra este user" (todos os tipos da op visível) e "copiar preferências do Gabriel" (lê as linhas dele na op e replica).
- Linha com aviso quando: sem dispositivo, ou com dispositivo e zero recipients (silencioso).

## Bloco C — usuário novo: os 3 estados

```text
Estado 1 — SEM SUBSCRIPTION
  Login → popup de boas-vindas ("O que você vai receber": vendas,
  quedas de conta, pulse) + banner fixo no topo do app:
  "Ative as notificações no seu dispositivo →" (link /notifications)
  Banner persiste até existir subscription ativa. Dispensável por sessão.

Estado 2 — SUB ATIVA, SEM RECIPIENTS  (default silencioso)
  Banner muda de tom: "Dispositivo pronto. Aguardando o admin liberar
  os alertas." + o admin vê esse user marcado ⚠ silencioso no Bloco B.
  Nenhum push é enviado — comportamento intencional, sem opt-in automático.

Estado 3 — SUB ATIVA + RECIPIENTS
  Sem banner. /notifications mostra o resumo "O que eu recebo hoje".
```

Estado detectado por um hook único (`usePushOnboardingState`) que consulta subscriptions próprias + recipients próprios, cacheado por sessão para não pesar em toda navegação.

---

## Detalhes técnicos

**Migração (uma só):**
- `ALTER TABLE push_subscriptions ADD COLUMN deleted_at timestamptz`; índice parcial em `(user_id) WHERE deleted_at IS NULL`; queries de envio passam a filtrar `deleted_at IS NULL`.
- `push_subscriptions.user_id` → `NOT NULL` (após limpar/soft-deletar linhas órfãs legadas) + FK para `auth.users`.
- RLS: usuário lê/apaga só as próprias subscriptions; admin da op lê as dos membros. `push_notification_recipients`: leitura própria para todos, escrita só para admin da op. GRANTs para `authenticated` + `service_role`.
- RPC `admin_list_push_users(p_operation_id uuid)` — security definer, checa `has_role(auth.uid(),'admin')` + membership na op, retorna `user_id, email, nome, device_count, last_used_at, recipient_count`. É o único caminho para `auth.users`.
- RPC `admin_copy_push_prefs(p_from uuid, p_to uuid, p_operation_id uuid)` para o bulk "copiar do Gabriel", em uma transação.

**Edge functions:**
- `push-subscribe`: exigir JWT válido e gravar `user_id` do token (nunca do body); reativar linha soft-deletada no mesmo endpoint.
- `push-unsubscribe`: aceitar `endpoint` **ou** `subscription_id`, aplicar `deleted_at` + `enabled=false`, e validar que a sub é do usuário do JWT.
- `push-send`: filtrar `deleted_at IS NULL`; substituir o fallback `sale_fallback:any_recipient` por fallback restrito a admins da própria operação (fecha o risco cross-op).

**Frontend:**
- `src/pages/Notifications.tsx` — reescrita da UI do Bloco A, reusando `useWebPush`.
- `src/pages/NotificationUsers.tsx` + `src/components/notifications/PushRecipientMatrix.tsx` — Bloco B.
- `src/hooks/usePushDevices.ts`, `src/hooks/usePushRecipients.ts`, `src/hooks/usePushOnboardingState.ts`.
- `src/components/notifications/PushOnboardingBanner.tsx` + `PushWelcomeDialog.tsx` — montados no layout autenticado.
- Rota `/notifications-usuarios` protegida por papel; sidebar mostra o item só para admin/owner.

**Fora de escopo:** Pushcut/webhooks (`/notificacoes-pushcut`) e os 19 `notify-*` continuam iguais — eles chamam `push-send`, que resolve destinatários pela mesma tabela, então passam a atender todos os usuários automaticamente.
