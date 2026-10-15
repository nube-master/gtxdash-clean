# Infra COD — Segundo webhook + Import manual retroativo

Falta 1 dado: o **nome da nova plataforma**. No plano ele aparece como `<PLATAFORMA>`; me diz o nome e eu troco em todos os pontos (slug do webhook, valor de `source`, filtro da UI, doc).

## Feature A — Segundo webhook COD

### Banco
- Nova coluna `cod_orders.source` (texto, default `sphere`), com backfill: tudo que existe hoje vira `sphere`.
- Índice em `(operation_id, source, order_date)` para o filtro do dashboard.

### Edge function `cod-webhook-<plataforma>`
Réplica da lógica do webhook Sphere, com identidade própria:
- Mesmo parser defensivo de payload (pedido, produto, valor, moeda, afiliado, país, status).
- Mesma resolução de tenant (mapping de afiliado → operação, fallback por conta Meta, histórico, senão `orphan_orders`).
- Mesmo antileak (`trg_check_cod_order_leak` continua ativo no INSERT).
- Mesma conversão FX (EUR→BRL via `exchange_rates_cache`) e mesmo cálculo de comissão.
- Mesmo push-mirror de venda aprovada.
- Grava `platform='<plataforma>'` e `source='<plataforma>'`; `verify_jwt=false` + secret opcional próprio.

A parte comum (parse, FX, resolução de operação, upsert) vai para `supabase/functions/_shared/cod-ingest.ts`, e os dois webhooks passam a ser cascas finas — evita os dois arquivos divergirem com o tempo.

### Dashboard COD
Filtro no topo: **Todos | Sphere | \<plataforma\> | Manual**, aplicado a todos os hooks COD (hoje, pipeline, ranking de produto, listas e sheets). Estado na URL para poder compartilhar link filtrado.

### Documentação
Registro em `system_docs` com a URL do endpoint, formato de payload esperado, header de assinatura e exemplos de evento, para o Gabriel repassar à plataforma.

## Feature B — Import manual de pedidos retroativos

### Tela `/dashboard-cod/import` (só admin)

```text
┌──────────────────────────────────────────────────────────┐
│  Importar pedidos COD           [ Baixar template CSV ]  │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │      Arraste o CSV/XLSX aqui ou clique             │  │
│  │      pedidos_agosto.csv · 214 linhas               │  │
│  └────────────────────────────────────────────────────┘  │
│  [x] Importação retroativa (não dispara notificações)    │
├──────────────────────────────────────────────────────────┤
│  Prévia (10 primeiras linhas)                            │
│  order_id │ plat │ produto │ total │ comissão │ status   │
│  ...                                                     │
├──────────────────────────────────────────────────────────┤
│  [ Validar sem importar ]            [ Importar 214 ]    │
├──────────────────────────────────────────────────────────┤
│  Resultado: 198 ok · 9 duplicados · 5 órfãos · 2 erros   │
│  Linha 34 — operation_id inválido                        │
│  Linha 87 — data inválida (2026-13-02)                   │
│                        [ Baixar erros ] [ Desfazer lote ]│
└──────────────────────────────────────────────────────────┘
```

Abaixo, aba **Histórico de importações**: data, arquivo, usuário, linhas ok/falha, botão Desfazer por `batch_id`.

### Template CSV
Colunas obrigatórias:
`order_id, platform, product_name, product_slug, quantity, order_total_brl, commission_value_brl, affiliate_username, operation_id, status, created_at`

Opcionais: `delivered_at, customer_state, currency, order_total, commission_value`

Sobre moeda (conforme escolhido): se `currency` vier preenchido e diferente de BRL, uso `order_total`/`commission_value` na moeda original e converto para BRL com a taxa do dia do pedido; se vier vazio, uso os campos `_brl` direto.

`operation_id` aceita o nome da operação (FAHTO, GTX…) ou o UUID — resolvo os dois.

### Validação por linha (dry-run e import usam a mesma rotina)
- `order_id` já existente → **skip** com aviso (não conta como erro).
- Afiliado sem mapping → linha importada como **orphan** + alerta no relatório.
- `operation_id` inválido → **erro bloqueante** da linha.
- Data inválida ou fora do ISO 8601 → **erro bloqueante**.
- Valor negativo, quantidade ≤ 0 ou status fora da lista → **erro bloqueante**.
- **Antileak sempre validado**: linha que dispara `trg_check_cod_order_leak` falha e aparece no relatório com o motivo (sem flag de bypass).

### Importação
- INSERT em `cod_orders` com `received_via='manual_import'`, `source` = platform escolhido (ou `manual`), `raw_payload` guardando a linha original.
- Push `sale_approved` só quando `created_at` está nas últimas 24h e a caixa "retroativa" não está marcada.
- Linhas inseridas em blocos, com contagem de sucesso/falha devolvida à UI.

### Segurança e rollback
- Nova tabela `cod_manual_imports` (batch): usuário, arquivo, contagens, timestamp, status, snapshot dos ids inseridos.
- Nova tabela `cod_manual_import_rows` com o resultado por linha (para baixar o relatório de erros).
- Lote com mais de 10 linhas grava snapshot dos registros afetados antes do INSERT.
- **Desfazer lote**: remove exatamente os pedidos criados naquele `batch_id` (restaura o estado anterior nos casos de update).
- Tudo roda em edge function com validação de admin no servidor; a UI só chama.

## Detalhes técnicos
- Edge functions novas: `cod-webhook-<plataforma>`, `cod-import-orders` (ações `validate`, `import`, `undo`).
- Compartilhado: `supabase/functions/_shared/cod-ingest.ts`.
- Frontend: `src/pages/CODImport.tsx`, componentes em `src/components/cod/import/`, parser XLSX com a lib já usada no projeto (ou `xlsx` se ausente), rota protegida por admin em `App.tsx`.
- Migrações: coluna `source` + índice, tabelas de batch/linhas com GRANTs e RLS por `operation_id`/admin.
