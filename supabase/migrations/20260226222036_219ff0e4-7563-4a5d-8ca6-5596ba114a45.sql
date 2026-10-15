
-- Table to store AI-generated duplication plans
CREATE TABLE public.scale_radar_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  project_filter TEXT NOT NULL DEFAULT 'TODOS',
  snapshot JSONB NOT NULL DEFAULT '{}',
  recommendations JSONB NOT NULL DEFAULT '[]',
  total_creatives_analyzed INTEGER NOT NULL DEFAULT 0,
  total_weak_accounts INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.scale_radar_plans ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all plans
CREATE POLICY "Authenticated users can read scale_radar_plans"
  ON public.scale_radar_plans FOR SELECT
  USING (true);

-- Authenticated users can insert plans
CREATE POLICY "Authenticated users can insert scale_radar_plans"
  ON public.scale_radar_plans FOR INSERT
  WITH CHECK (true);

-- Authenticated users can delete their own plans
CREATE POLICY "Authenticated users can delete own scale_radar_plans"
  ON public.scale_radar_plans FOR DELETE
  USING (auth.uid() = created_by);
