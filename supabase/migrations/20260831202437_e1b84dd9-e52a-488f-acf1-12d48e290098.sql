CREATE INDEX IF NOT EXISTS idx_live_viewers_op_started_sess
  ON public.live_viewers (operation_id, started_at DESC) INCLUDE (session_id);
ANALYZE public.live_viewers;