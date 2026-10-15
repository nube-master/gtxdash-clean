
-- Table for persisting planning goals
CREATE TABLE public.planning_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  revenue_goal NUMERIC NOT NULL DEFAULT 0,
  sales_goal INTEGER NOT NULL DEFAULT 0,
  cpa_goal NUMERIC NOT NULL DEFAULT 0,
  average_product_price NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.planning_goals ENABLE ROW LEVEL SECURITY;

-- Public read/write since there's no auth in this app
CREATE POLICY "Allow public read planning_goals" ON public.planning_goals FOR SELECT USING (true);
CREATE POLICY "Allow public insert planning_goals" ON public.planning_goals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update planning_goals" ON public.planning_goals FOR UPDATE USING (true);
CREATE POLICY "Allow public delete planning_goals" ON public.planning_goals FOR DELETE USING (true);

-- Timestamp trigger
CREATE TRIGGER update_planning_goals_updated_at
  BEFORE UPDATE ON public.planning_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
