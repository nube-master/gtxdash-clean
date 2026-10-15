create index if not exists idx_live_viewers_ip_hash_started_at on public.live_viewers (ip_hash, started_at desc);
create index if not exists idx_live_viewers_clickid_last_seen_at on public.live_viewers (clickid, last_seen_at desc) where clickid is not null;
create index if not exists idx_live_sale_attribution_orphan_sale_at on public.live_sale_attribution (is_orphan, sale_at desc);
create index if not exists idx_redtrack_events_purchase_clickid on public.redtrack_events (clickid, occurred_at desc) where event_type = 'purchase';