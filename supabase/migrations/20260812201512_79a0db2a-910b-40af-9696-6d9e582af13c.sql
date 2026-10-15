-- sales_data
ALTER TABLE public.sales_data DROP CONSTRAINT IF EXISTS fk_sales_data_operation;
ALTER TABLE public.sales_data DROP CONSTRAINT IF EXISTS sales_data_operation_id_fkey;
ALTER TABLE public.sales_data ADD CONSTRAINT sales_data_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- traffic_data
ALTER TABLE public.traffic_data DROP CONSTRAINT IF EXISTS fk_traffic_data_operation;
ALTER TABLE public.traffic_data DROP CONSTRAINT IF EXISTS traffic_data_operation_id_fkey;
ALTER TABLE public.traffic_data ADD CONSTRAINT traffic_data_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- traffic_breakdowns
ALTER TABLE public.traffic_breakdowns DROP CONSTRAINT IF EXISTS fk_traffic_breakdowns_operation;
ALTER TABLE public.traffic_breakdowns DROP CONSTRAINT IF EXISTS traffic_breakdowns_operation_id_fkey;
ALTER TABLE public.traffic_breakdowns ADD CONSTRAINT traffic_breakdowns_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- redtrack_events
ALTER TABLE public.redtrack_events DROP CONSTRAINT IF EXISTS redtrack_events_operation_id_fkey;
ALTER TABLE public.redtrack_events ADD CONSTRAINT redtrack_events_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- meta_country_insights
ALTER TABLE public.meta_country_insights DROP CONSTRAINT IF EXISTS meta_country_insights_operation_id_fkey;
ALTER TABLE public.meta_country_insights ADD CONSTRAINT meta_country_insights_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- operation_members
ALTER TABLE public.operation_members DROP CONSTRAINT IF EXISTS operation_members_operation_id_fkey;
ALTER TABLE public.operation_members ADD CONSTRAINT operation_members_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- meta_ad_accounts
ALTER TABLE public.meta_ad_accounts DROP CONSTRAINT IF EXISTS meta_ad_accounts_operation_id_fkey;
ALTER TABLE public.meta_ad_accounts ADD CONSTRAINT meta_ad_accounts_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- newsbreak_traffic_data
ALTER TABLE public.newsbreak_traffic_data DROP CONSTRAINT IF EXISTS newsbreak_traffic_data_operation_id_fkey;
ALTER TABLE public.newsbreak_traffic_data ADD CONSTRAINT newsbreak_traffic_data_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- mgid_traffic_data
ALTER TABLE public.mgid_traffic_data DROP CONSTRAINT IF EXISTS mgid_traffic_data_operation_id_fkey;
ALTER TABLE public.mgid_traffic_data ADD CONSTRAINT mgid_traffic_data_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- daily_card_charges
ALTER TABLE public.daily_card_charges DROP CONSTRAINT IF EXISTS daily_card_charges_operation_id_fkey;
ALTER TABLE public.daily_card_charges ADD CONSTRAINT daily_card_charges_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- reconciliation_alerts
ALTER TABLE public.reconciliation_alerts DROP CONSTRAINT IF EXISTS reconciliation_alerts_operation_id_fkey;
ALTER TABLE public.reconciliation_alerts ADD CONSTRAINT reconciliation_alerts_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- pacing_settings
ALTER TABLE public.pacing_settings DROP CONSTRAINT IF EXISTS fk_pacing_settings_operation;
ALTER TABLE public.pacing_settings DROP CONSTRAINT IF EXISTS pacing_settings_operation_id_fkey;
ALTER TABLE public.pacing_settings ADD CONSTRAINT pacing_settings_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- product_margin_settings
ALTER TABLE public.product_margin_settings DROP CONSTRAINT IF EXISTS fk_product_margin_settings_operation;
ALTER TABLE public.product_margin_settings ADD CONSTRAINT product_margin_settings_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

-- operation_credentials already has CASCADE but let's be safe
ALTER TABLE public.operation_credentials DROP CONSTRAINT IF EXISTS operation_credentials_operation_id_fkey;
ALTER TABLE public.operation_credentials ADD CONSTRAINT operation_credentials_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;
