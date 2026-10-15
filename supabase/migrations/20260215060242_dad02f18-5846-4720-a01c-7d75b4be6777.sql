
-- Drop the old unique constraint that doesn't include account_id
ALTER TABLE public.traffic_data DROP CONSTRAINT traffic_data_date_campaign_name_ad_name_key;

-- Create new unique constraint including account_id
ALTER TABLE public.traffic_data ADD CONSTRAINT traffic_data_date_account_campaign_ad_key 
  UNIQUE (date, account_id, campaign_name, ad_name);
