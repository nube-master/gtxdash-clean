-- Permite múltiplos cooldowns por campanha (um por regra), pra cada regra ter seu próprio timer de auto-resume
ALTER TABLE public.pacing_cooldowns DROP CONSTRAINT pacing_cooldowns_pkey;
ALTER TABLE public.pacing_cooldowns ALTER COLUMN rule_id SET NOT NULL;
ALTER TABLE public.pacing_cooldowns ADD CONSTRAINT pacing_cooldowns_pkey PRIMARY KEY (campaign_id, rule_id);