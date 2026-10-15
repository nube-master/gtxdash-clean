UPDATE public.feature_flags
SET description = 'Global feature flag lida pelo RPC public._flag_on(key, operation_id). Semântica: enabled=true + operation_ids=[] → TRUE para TODAS operações (incluindo futuras). Campo rollout_pct existe no schema mas é IGNORADO pelo helper — não use pra rollout gradual sem antes alterar _flag_on. Ativado globalmente em 2026-07-13, comprovado por 95k+ chamadas via Vault (7 dias) com zero fallback legacy.',
    updated_at = now()
WHERE key = 'operation_credentials_vault';

ALTER TABLE public.live_events           DROP CONSTRAINT IF EXISTS live_events_operation_id_fkey;
ALTER TABLE public.live_viewers          DROP CONSTRAINT IF EXISTS live_viewers_operation_id_fkey;
ALTER TABLE public.live_sale_attribution DROP CONSTRAINT IF EXISTS live_sale_attribution_operation_id_fkey;