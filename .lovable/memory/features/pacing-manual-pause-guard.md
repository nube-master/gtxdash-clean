---
name: Pacing Manual Pause Guard
description: Pausa manual ou externa em campanhas deve bloquear qualquer regra automática de religar até resume manual
type: feature
---
Quando uma campanha for pausada manualmente pela UI, por MCP ou diretamente fora do app/Meta, o sistema deve tratar essa pausa como soberana.

Regra operacional:
- Pausa manual/externa cria `pacing_cooldowns.set_by = 'manual'`, `rule_id = null` e expiração efetivamente permanente.
- Nenhuma regra automática de RELIGAR/ATIVAR pode reativar essa campanha enquanto esse bloqueio existir.
- Apenas um religamento manual limpa o bloqueio e devolve a campanha ao fluxo normal de regras automáticas.
- O pacing-controller deve detectar campanhas `PAUSED` sem cooldown automático ativo e criar automaticamente esse bloqueio manual sticky.