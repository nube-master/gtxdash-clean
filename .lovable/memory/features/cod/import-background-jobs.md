---
name: Import COD em background job
description: Importador de pedidos COD roda via cod_import_jobs + edge function cod-import-worker em batches de 500; nunca síncrono
type: feature
---

- `cod-import-orders` só enfileira (`action: import` → cria `cod_import_jobs` com `rows_payload` e retorna `job_id`); nunca processar CSV síncrono (timeout da edge function com >1k linhas).
- `cod-import-worker` (verify_jwt=false, invocado com service role) processa batches de 500, faz bulk insert de 200 com fallback linha-a-linha, grava falhas em `cod_import_job_errors` e continua (sem rollback do job).
- Auto-encadeamento após ~45s; jobs sem `heartbeat_at` há >5min são retomados a partir de `last_batch_index`; `status='cancelled'` é checado antes de cada batch.
- `cod_orders.import_job_id` permite desfazer o lote inteiro. Push só dispara quando `is_retroactive=false`.
- UI `/dashboard-cod/import`: polling 2s, barra de progresso + ETA, cancelar/retomar, histórico e download de erros.
