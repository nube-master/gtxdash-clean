
-- Drop the current constraint
ALTER TABLE public.traffic_data DROP CONSTRAINT traffic_data_date_account_campaign_ad_key;

-- Create new unique constraint including adset_name
ALTER TABLE public.traffic_data ADD CONSTRAINT traffic_data_unique_key 
  UNIQUE (date, account_id, campaign_name, adset_name, ad_name);
