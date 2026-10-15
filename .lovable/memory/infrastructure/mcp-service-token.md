---
name: MCP service token (/mcp)
description: Endpoint /mcp aceita token estático de serviço (read-only, escopo FAHTO) além do OAuth; arquivo da edge function é owned, não regenerado
type: feature
---
- `supabase/functions/mcp/index.ts` deixou de ser auto-gerado (banner removido). O plugin do Vite passou a gerar o bundle de referência em `.lovable/mcp-generated/mcp/index.ts` (opção `functionsDir` em vite.config.ts). Ao mudar `src/lib/mcp/index.ts`, copiar esse bundle por cima do arquivo owned e reaplicar o wrapper do fim do arquivo.
- Wrapper no fim do arquivo: se `Authorization: Bearer` bater (comparação em tempo constante) com `MCP_SERVICE_TOKEN` ou `MCP_SERVICE_TOKEN_NEXT` (rotação sem downtime), responde JSON-RPC direto com escopo somente-leitura e apenas as tools `health_check` e `list_orders`, forçando `operation_id = 8707b3f8-ab41-4a63-902c-9ab97fe50c8a` (FAHTO). Qualquer outro caso cai no handler OAuth original, inalterado.
- `canReadOperation` em `src/lib/mcp/index.ts` reconhece o principal `service:<operation_id>`.
- `list_orders`: filtro `program` (AND, case-insensitive, program_id ou raw_payload.afiliado.programa_id); entrega exposta como `delivered_date` (data pura, sem hora) — nunca como timestamp meia-noite UTC.
- A edge function `mcp` só é publicada no publish do projeto, não no deploy de dev.
