ALTER TABLE public.vsl_data ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);

UPDATE public.vsl_data SET operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d' WHERE operation_id IS NULL;

UPDATE public.redtrack_events SET operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d' WHERE operation_id IS NULL;