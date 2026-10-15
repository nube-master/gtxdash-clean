
-- Academy Modules
CREATE TABLE public.academy_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'BookOpen',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read academy_modules" ON public.academy_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert academy_modules" ON public.academy_modules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update academy_modules" ON public.academy_modules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete academy_modules" ON public.academy_modules FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Academy Lessons
CREATE TABLE public.academy_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  video_url text DEFAULT '',
  content text NOT NULL DEFAULT '',
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read academy_lessons" ON public.academy_lessons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert academy_lessons" ON public.academy_lessons FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update academy_lessons" ON public.academy_lessons FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete academy_lessons" ON public.academy_lessons FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Academy Playbooks
CREATE TABLE public.academy_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'geral',
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read academy_playbooks" ON public.academy_playbooks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert academy_playbooks" ON public.academy_playbooks FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update academy_playbooks" ON public.academy_playbooks FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete academy_playbooks" ON public.academy_playbooks FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Academy Knowledge Base
CREATE TABLE public.academy_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'conceito',
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read academy_knowledge" ON public.academy_knowledge FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert academy_knowledge" ON public.academy_knowledge FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update academy_knowledge" ON public.academy_knowledge FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete academy_knowledge" ON public.academy_knowledge FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
