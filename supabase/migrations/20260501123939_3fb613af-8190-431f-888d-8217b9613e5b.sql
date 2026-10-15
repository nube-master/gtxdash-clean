CREATE TABLE IF NOT EXISTS public.spy_swipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  creative_id uuid NOT NULL REFERENCES public.spy_creative(id) ON DELETE CASCADE,
  tags text[] DEFAULT '{}',
  note text,
  saved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, creative_id)
);

CREATE INDEX IF NOT EXISTS spy_swipe_operation_idx ON public.spy_swipe(operation_id);
CREATE INDEX IF NOT EXISTS spy_swipe_creative_idx ON public.spy_swipe(creative_id);
CREATE INDEX IF NOT EXISTS spy_swipe_tags_idx ON public.spy_swipe USING GIN(tags);

ALTER TABLE public.spy_swipe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spy_swipe select by operation"
  ON public.spy_swipe FOR SELECT
  USING (public.spy_user_in_operation(auth.uid(), operation_id));

CREATE POLICY "spy_swipe insert by operation"
  ON public.spy_swipe FOR INSERT
  WITH CHECK (public.spy_user_in_operation(auth.uid(), operation_id));

CREATE POLICY "spy_swipe update by operation"
  ON public.spy_swipe FOR UPDATE
  USING (public.spy_user_in_operation(auth.uid(), operation_id));

CREATE POLICY "spy_swipe delete by operation"
  ON public.spy_swipe FOR DELETE
  USING (public.spy_user_in_operation(auth.uid(), operation_id));