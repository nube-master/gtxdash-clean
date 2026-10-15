# Fix: Popular push_notification_recipients para Gabriel

## Objetivo
Resolver a falta de notificações Web Push no iPhone do Gabriel populando a tabela `push_notification_recipients` com todas as combinações de operação × tipo de notificação, e validar com um disparo de teste.

## Passos
1. Executar o INSERT em `push_notification_recipients` para:
   - Usuário: Gabriel (`gabrielvidal156@gmail.com`)
   - Operações: FAHTO, GTX, EDD, SPACE, ESCALIFY
   - Tipos: 26 notification_types listados (vendas, COD, pulse, status, rankings, criativos, Meta, reconcile, Spy, etc.)
2. Confirmar a contagem final (~130 linhas, 5 ops × 26 tipos).
3. Disparar notificação de teste via `push-send` para `operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'` com `notification_type = 'test'`.
4. Reportar o resultado no chat.

## Nota
A UI admin para gerenciar recipients será tratada em sessão futura, conforme solicitado.
