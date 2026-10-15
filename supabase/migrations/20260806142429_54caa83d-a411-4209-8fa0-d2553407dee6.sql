ALTER TABLE traffic_data ADD COLUMN IF NOT EXISTS purchase_count bigint DEFAULT 0;
GRANT ALL ON traffic_data TO authenticated, service_role;
ALTER TABLE meta_spend_realtime_safe ADD COLUMN IF NOT EXISTS purchase_count bigint DEFAULT 0;
GRANT ALL ON meta_spend_realtime_safe TO authenticated, service_role;