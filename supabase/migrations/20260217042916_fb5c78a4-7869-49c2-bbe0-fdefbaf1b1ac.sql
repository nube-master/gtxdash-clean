
-- Variable costs configuration
CREATE TABLE public.variable_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  calc_base TEXT NOT NULL DEFAULT 'pct_spend', -- pct_spend, pct_revenue, pct_profit, fixed_value
  percentage NUMERIC NOT NULL DEFAULT 0,
  fixed_value NUMERIC NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT 'all', -- all, brl_only, usd_only, specific_account, specific_campaign, specific_creative
  scope_ref TEXT, -- account_id, campaign name, or creative name when scope is specific
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.variable_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read variable_costs" ON public.variable_costs FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert variable_costs" ON public.variable_costs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update variable_costs" ON public.variable_costs FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete variable_costs" ON public.variable_costs FOR DELETE USING (true);

CREATE TRIGGER update_variable_costs_updated_at
  BEFORE UPDATE ON public.variable_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Team members / commissions
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '',
  commission_type TEXT NOT NULL DEFAULT 'pct_profit', -- pct_profit, pct_revenue, pct_spend, pct_creative_revenue, fixed_salary, fixed_period
  percentage NUMERIC NOT NULL DEFAULT 0,
  fixed_value NUMERIC NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT 'all', -- all, specific_creative, specific_campaign, specific_account
  scope_ref TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read team_members" ON public.team_members FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert team_members" ON public.team_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update team_members" ON public.team_members FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete team_members" ON public.team_members FOR DELETE USING (true);

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fixed costs
CREATE TABLE public.fixed_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral',
  monthly_value NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fixed_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read fixed_costs" ON public.fixed_costs FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert fixed_costs" ON public.fixed_costs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update fixed_costs" ON public.fixed_costs FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete fixed_costs" ON public.fixed_costs FOR DELETE USING (true);

CREATE TRIGGER update_fixed_costs_updated_at
  BEFORE UPDATE ON public.fixed_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
