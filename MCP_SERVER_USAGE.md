# 🔌 MCP Server — GTX Dash (Pacing Controller)

Servidor MCP (Model Context Protocol) que expõe o Pacing Controller via Edge Function. Permite que Claude.ai, scripts ou outros clientes MCP leiam regras, manipulem budget groups, consultem logs e até forcem pause/resume de campanhas.

## Endpoint

```
POST https://<seu-projeto>.supabase.co/functions/v1/mcp-server
```

Headers obrigatórios:

```
Authorization: Bearer gtx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
Accept: application/json
```

## Como criar um token

1. Abra **Pacing → Configurações** no app.
2. Role até a seção **🔌 MCP Tokens**.
3. Clique em **Gerar novo token** → defina nome (ex.: `Claude.ai — Gabriel`) e marque os scopes desejados.
4. Copie o token mostrado no modal. **Ele só aparece uma vez.**

## Scopes

| Scope             | Tools cobertas                                                  |
| ----------------- | --------------------------------------------------------------- |
| `rules:read`      | `gtx_list_pacing_rules`, `gtx_get_pacing_rule`                  |
| `rules:write`     | `gtx_create_pacing_rule`, `gtx_update_pacing_rule`, `gtx_delete_pacing_rule`, `gtx_toggle_pacing_rule` |
| `groups:read`     | `gtx_list_budget_groups`                                        |
| `groups:write`    | `gtx_create_budget_group`, `gtx_update_budget_group`, `gtx_delete_budget_group` |
| `log:read`        | `gtx_get_action_log`, `gtx_get_action_log_stats`                |
| `campaigns:write` | `gtx_force_pause_campaign`, `gtx_force_resume_campaign`         |
| `settings:read`   | `gtx_get_settings`                                              |

Toda chamada `gtx_*` é registrada em `pacing_action_log` com `action_type='mcp_call'`.

## Teste rápido (curl)

```bash
TOKEN="gtx_..."
URL="https://<seu-projeto>.supabase.co/functions/v1/mcp-server"

# Lista todas as tools disponíveis
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Lista regras de pacing ativas
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"gtx_list_pacing_rules","arguments":{"enabled":true,"limit":20}}}'
```

## Conectar ao Claude.ai

Settings → Connectors → **Add custom connector**:

- **Name:** `GTX Dash`
- **Type:** Streamable HTTP (não SSE)
- **URL:** `https://<seu-projeto>.supabase.co/functions/v1/mcp-server`
- **Authentication:** Bearer Token → cole o token gerado

Após reiniciar o Claude, ele expõe as tools `mcp__GTX_Dash__gtx_*` na conversa.

## Lista completa de tools

**Pacing Rules (6):** `gtx_list_pacing_rules`, `gtx_get_pacing_rule`, `gtx_create_pacing_rule`, `gtx_update_pacing_rule`, `gtx_delete_pacing_rule`, `gtx_toggle_pacing_rule`

**Budget Groups (4):** `gtx_list_budget_groups`, `gtx_create_budget_group`, `gtx_update_budget_group`, `gtx_delete_budget_group`

**Action Log (2):** `gtx_get_action_log`, `gtx_get_action_log_stats`

**Campaign Actions (2):** `gtx_force_pause_campaign`, `gtx_force_resume_campaign`

**Settings (1):** `gtx_get_settings`

> Além das 15 GTX, o mesmo endpoint já expõe ~30 tools de Dashboard / Spy / VSL (`get_dashboard`, `get_campaigns`, `spy_*`, etc.) — todas disponíveis no mesmo token, sem restrição de scope (legado).

## Segurança

- O token NUNCA é armazenado em texto — só o hash SHA-256.
- Revogar = deletar a linha em `mcp_tokens` (botão 🗑 na UI).
- Tokens expirados (`expires_at < now()`) são rejeitados automaticamente.
- Todas as chamadas `gtx_*` são auditadas em `pacing_action_log` com nome do token.
