---
name: Kill Squad — matar candidatas em batch
description: Filtros 🇪🇺/🇺🇸 em /pacing + botão "Matar → xxx" que renomeia [top]→[xxx] e pausa campanhas COD/Nutra irrecuperáveis
type: feature
---

Módulo pra matar campanhas irrecuperáveis em lote a partir da tabela /pacing:

**Critérios (função `killReason` em `src/lib/killSquad.ts`):**
- Pré-condições: nome contém `[top]` (case-insensitive) + status ≠ paused
- 🇪🇺 EU (BS-COD/DA-COD/TDM-COD/CB-COD/VIT-RRT*): sem venda 3d + spend ≥ R$220 OR CPA 3d > R$400
- 🇺🇸 US (NDM/NDR/NDB/MMP/MMPB/LDR/CRT/CST/AILULA/NEURO): sem venda 3d + spend ≥ R$800 OR CPA 3d > R$800

**Fluxo:**
1. Chips 🇪🇺/🇺🇸 nos filtros rápidos (`CampaignFilters.tsx`) filtram só candidatas + mostram contagem
2. Usa seleção múltipla existente (checkbox por linha)
3. Botão destrutivo "🔪 Matar → xxx" no bulk bar abre `KillSquadDialog`
4. Confirma digitando "MATAR" → chama edge fn `kill-squad-batch`
5. Por campanha: rename `[top]`→`[xxx]` + status=PAUSED no Meta + sticky cooldown 100 anos (bloqueia religar automático)
6. Log em `pacing_action_log.action_type='kill_squad'` com snapshot (spend/sales/cpa/nome_anterior/killed_by)

**Guard-rails:**
- Só super_admin (validado em `kill-squad-batch`)
- Batch cap 100 campanhas
- Kill switch global: `app_settings.kill_squad_disabled=true` retorna 423
- GtxOverlay expõe `sales3DCount` e `cpa3D` pra critério funcionar (populado em `Pacing.tsx` a partir de `gtxCampaigns.sales3D[]`)

**Reversão manual:** renomear `[xxx]`→`[top]` no Meta + religar. Sem UI de undo nesta versão.
