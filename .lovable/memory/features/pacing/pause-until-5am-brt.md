---
name: Pause Until 5am BRT
description: Modalidade opcional de pausa manual que cria cooldown auto-expirável no próximo 05h BRT (set_by='manual_until'), permitindo que regras de activate (ex.: ATIVAR|TOP) religuem
type: feature
---
Duas modalidades de pausa manual coexistem:

- **Sticky (padrão)**: `set_by='manual'`, snoozed_until = +100 anos. Bloqueia TODAS regras automáticas até RESUME manual.
- **Until 5am BRT**: `set_by='manual_until'`, snoozed_until = próximo 05:00 BRT (08:00 UTC). O `pacing-controller.isOnCooldown` trata `manual_until` idêntico a `reactivation_lock`: bloqueia só `pause`/`reduce_budget`, LIBERA `activate` e `increase_budget`. Isso permite que `📌 ATIVAR | TOP` religue às 04h/05h BRT.

Onde aparece na UI:
- `BulkToggleDialog`: quando ação=PAUSED, mostra 2 botões de modalidade.
- `CampaignTable` AlertDialog (confirmação de pausa individual): mesmos 2 botões.
- Switch rápido da tabela permanece sticky (segurança).

Hook `useToggleCampaign` aceita `pause_mode: 'sticky' | 'until_5am_brt'` e repassa ao edge `pacing-toggle-campaign`.

Guarda anti-guard: `protectExternallyPausedCampaigns` trata `manual_until` como bloqueio manual válido — não sobrescreve com sticky de 100 anos enquanto snoozed_until estiver ativo. Após expirar, o cooldown vira resíduo que é limpo naturalmente pelo smart re-enable.
