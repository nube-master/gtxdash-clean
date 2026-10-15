
-- Talent Jobs table
CREATE TABLE public.talent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid REFERENCES public.operations(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT 'geral',
  work_model text NOT NULL DEFAULT 'remoto',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.talent_jobs ENABLE ROW LEVEL SECURITY;

-- Public can read active jobs (for public careers page)
CREATE POLICY "Anyone can read active talent_jobs" ON public.talent_jobs
  FOR SELECT TO anon, authenticated USING (is_active = true);

-- Admins can manage jobs
CREATE POLICY "Admins can insert talent_jobs" ON public.talent_jobs
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update talent_jobs" ON public.talent_jobs
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete talent_jobs" ON public.talent_jobs
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can also read inactive jobs
CREATE POLICY "Admins can read all talent_jobs" ON public.talent_jobs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Talent Applications table
CREATE TABLE public.talent_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid REFERENCES public.operations(id) ON DELETE CASCADE NOT NULL,
  job_id uuid REFERENCES public.talent_jobs(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  area_of_interest text NOT NULL DEFAULT '',
  portfolio_url text NOT NULL DEFAULT '',
  resume_url text NOT NULL DEFAULT '',
  cover_letter text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'novo',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.talent_applications ENABLE ROW LEVEL SECURITY;

-- Anyone can submit applications (public form)
CREATE POLICY "Anyone can insert talent_applications" ON public.talent_applications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Only authenticated admins can read/manage applications
CREATE POLICY "Admins can read talent_applications" ON public.talent_applications
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update talent_applications" ON public.talent_applications
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete talent_applications" ON public.talent_applications
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
