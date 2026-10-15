ALTER TABLE public.variable_costs ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);

UPDATE public.variable_costs SET operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d' WHERE operation_id IS NULL;