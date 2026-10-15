UPDATE public.talent_jobs
SET quiz_questions = jsonb_set(
  quiz_questions,
  '{4,options}',
  '["Até R$ 5.000", "R$ 5.000 a R$ 20.000", "R$ 20.000 a R$ 50.000", "R$ 50.000 a R$ 100.000", "R$ 100.000 a R$ 150.000", "Acima de R$ 150.000"]'::jsonb
)
WHERE id = 'e070e5d2-a1f9-4d90-b625-c6baa1b9e16e';