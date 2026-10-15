
-- Courses table (top level)
CREATE TABLE public.academy_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read academy_courses" ON public.academy_courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert academy_courses" ON public.academy_courses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update academy_courses" ON public.academy_courses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete academy_courses" ON public.academy_courses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Add course_id to modules
ALTER TABLE public.academy_modules ADD COLUMN course_id uuid REFERENCES public.academy_courses(id) ON DELETE CASCADE;

-- Lesson progress per user
CREATE TABLE public.academy_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

ALTER TABLE public.academy_lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own progress" ON public.academy_lesson_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON public.academy_lesson_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON public.academy_lesson_progress FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own progress" ON public.academy_lesson_progress FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Comments on lessons
CREATE TABLE public.academy_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read academy_comments" ON public.academy_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own comments" ON public.academy_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.academy_comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Add links field to lessons
ALTER TABLE public.academy_lessons ADD COLUMN links jsonb NOT NULL DEFAULT '[]'::jsonb;
