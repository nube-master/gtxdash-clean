---
name: GTX Spy Module
description: Módulo de spy de concorrentes — Sprint 1 (Radar) + Sprint 2 (Meta Ad Library API real, criativos, transcrição IA, Pushcut)
type: feature
---

**Tabelas (todas com operation_id + RLS via spy_user_in_operation):**
- spy_project
- spy_advertiser (+ Sprint 2: meta_page_id, meta_search_term)
- spy_advertiser_history (UNIQUE advertiser_id+date)
- spy_alert (surge_50, stopped, started, sync_error)
- spy_creative (Sprint 2): UNIQUE advertiser_id+meta_ad_archive_id; guarda copy, snapshot_url, media_type, transcript da IA, is_active

**Edge Functions:**
- spy-sync-advertiser — usa Meta Ad Library API REAL (graph.facebook.com/v21.0/ads_archive) quando META_AD_LIBRARY_TOKEN existe + advertiser tem meta_page_id OU meta_search_term. Senão cai no mock. Faz upsert em spy_creative (marca não vistos como is_active=false). Dispara Pushcut nos alertas surge_50/stopped/started usando PUSHCUT_WEBHOOK_URL.
- spy-sync-cron — pg_cron 'spy-sync-daily-08-utc' (08:00 UTC), 10 advertisers em paralelo.
- spy-transcribe-creative (Sprint 2) — recebe creative_id, manda copy+snapshot pro Lovable AI Gateway (google/gemini-2.5-flash) com prompt fixo de análise (ângulo/gancho/público/CTA/tom) e salva JSON em spy_creative.transcript. Trata 429/402.

**Storage:** bucket `spy-creatives` (privado). RLS por operation_id no path `{operation_id}/{advertiser_id}/{ad_archive_id}.{ext}` via spy_user_in_operation.

**UI:** /spy, /spy/radar, /spy/radar/:id em src/pages/Spy*.tsx. Hook único em src/hooks/useSpy.ts. Item "Spy" no operacaoNav do AppSidebar. Dialog de cadastro auto-extrai view_all_page_id, q e country da URL colada da Library.

**Multitenancy:** estritamente por operation_id (RLS bloqueia cross-operation).

**Secrets envolvidos:** META_AD_LIBRARY_TOKEN, PUSHCUT_WEBHOOK_URL, LOVABLE_API_KEY.
