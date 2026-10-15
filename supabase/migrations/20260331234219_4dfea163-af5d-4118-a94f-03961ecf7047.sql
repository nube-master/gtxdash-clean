
ALTER TABLE public.talent_jobs ADD COLUMN quiz_questions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.talent_applications ADD COLUMN quiz_answers jsonb NOT NULL DEFAULT '[]'::jsonb;
