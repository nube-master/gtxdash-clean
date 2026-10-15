DROP POLICY IF EXISTS "Admins can delete creative_team_overrides" ON public.creative_team_overrides;
DROP POLICY IF EXISTS "Admins can insert creative_team_overrides" ON public.creative_team_overrides;
DROP POLICY IF EXISTS "Admins can update creative_team_overrides" ON public.creative_team_overrides;
DROP POLICY IF EXISTS "Authenticated can read creative_team_overrides" ON public.creative_team_overrides;

CREATE POLICY "Super admins can read creative_team_overrides"
ON public.creative_team_overrides
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY "Super admins can insert creative_team_overrides"
ON public.creative_team_overrides
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY "Super admins can update creative_team_overrides"
ON public.creative_team_overrides
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY "Super admins can delete creative_team_overrides"
ON public.creative_team_overrides
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));