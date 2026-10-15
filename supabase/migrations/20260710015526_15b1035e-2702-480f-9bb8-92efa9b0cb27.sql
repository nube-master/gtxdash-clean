-- Fase F-1: Backup interno aditivo (snapshot pré-migração multi-tenant)
-- Sem GRANTs e com RLS ligado sem policies => só service_role acessa

CREATE TABLE public.backup_20260710_operations AS SELECT * FROM public.operations;
ALTER TABLE public.backup_20260710_operations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_operation_members AS SELECT * FROM public.operation_members;
ALTER TABLE public.backup_20260710_operation_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_operation_invites AS SELECT * FROM public.operation_invites;
ALTER TABLE public.backup_20260710_operation_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_super_admins AS SELECT * FROM public.super_admins;
ALTER TABLE public.backup_20260710_super_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_user_roles AS SELECT * FROM public.user_roles;
ALTER TABLE public.backup_20260710_user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_profiles AS SELECT * FROM public.profiles;
ALTER TABLE public.backup_20260710_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_offers AS SELECT * FROM public.offers;
ALTER TABLE public.backup_20260710_offers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_offer_status_history AS SELECT * FROM public.offer_status_history;
ALTER TABLE public.backup_20260710_offer_status_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_spy_ads AS SELECT * FROM public.spy_ads;
ALTER TABLE public.backup_20260710_spy_ads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_spy_lps AS SELECT * FROM public.spy_lps;
ALTER TABLE public.backup_20260710_spy_lps ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_spy_copywriters AS SELECT * FROM public.spy_copywriters;
ALTER TABLE public.backup_20260710_spy_copywriters ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_spy_favorites AS SELECT * FROM public.spy_favorites;
ALTER TABLE public.backup_20260710_spy_favorites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_pacing_rules AS SELECT * FROM public.pacing_rules;
ALTER TABLE public.backup_20260710_pacing_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_pacing_settings AS SELECT * FROM public.pacing_settings;
ALTER TABLE public.backup_20260710_pacing_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_pacing_cooldowns AS SELECT * FROM public.pacing_cooldowns;
ALTER TABLE public.backup_20260710_pacing_cooldowns ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_pacing_evaluation_log AS SELECT * FROM public.pacing_evaluation_log;
ALTER TABLE public.backup_20260710_pacing_evaluation_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_pacing_budget_groups AS SELECT * FROM public.pacing_budget_groups;
ALTER TABLE public.backup_20260710_pacing_budget_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_producers AS SELECT * FROM public.producers;
ALTER TABLE public.backup_20260710_producers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.backup_20260710_user_page_permissions AS SELECT * FROM public.user_page_permissions;
ALTER TABLE public.backup_20260710_user_page_permissions ENABLE ROW LEVEL SECURITY;