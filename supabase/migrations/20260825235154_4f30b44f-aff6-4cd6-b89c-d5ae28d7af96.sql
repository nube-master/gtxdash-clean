ALTER TABLE public.traffic_data ADD COLUMN IF NOT EXISTS video_plays numeric NOT NULL DEFAULT 0;
ALTER TABLE public.traffic_data_hourly ADD COLUMN IF NOT EXISTS video_plays numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.traffic_data.video_plays IS 'Meta video_play_actions (reproduções iniciadas / autoplay). NÃO usar para Hook Rate — use video_3s_views (video_3_sec_watched_actions).';
COMMENT ON COLUMN public.traffic_data.video_3s_views IS 'Meta video_3_sec_watched_actions. Hook Rate = video_3s_views / impressions.';