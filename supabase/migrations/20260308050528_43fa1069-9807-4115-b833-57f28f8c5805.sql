
CREATE TABLE public.monthly_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,
  goal_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read monthly_goals" ON public.monthly_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert monthly_goals" ON public.monthly_goals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update monthly_goals" ON public.monthly_goals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete monthly_goals" ON public.monthly_goals FOR DELETE TO authenticated USING (true);
