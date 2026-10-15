-- F9 Bloco 2: security_invoker nas 4 views restantes
ALTER VIEW public.live_viewers_active SET (security_invoker=true);
ALTER VIEW public.live_viewers_geo SET (security_invoker=true);
ALTER VIEW public.v_expiring_credentials SET (security_invoker=true);
ALTER VIEW public.v_offers_active SET (security_invoker=true);

-- F9 Bloco 2: FORCE RLS nas 23 tabelas sensíveis multitenant
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.live_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.live_viewers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.media_channels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meta_account_financials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meta_campaign_status FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meta_payment_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_goals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.offers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.operation_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.operation_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.operations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pacing_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payoneer_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.planning_goals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.redtrack_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales_data FORCE ROW LEVEL SECURITY;
ALTER TABLE public.spy_offers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins FORCE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_data FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;