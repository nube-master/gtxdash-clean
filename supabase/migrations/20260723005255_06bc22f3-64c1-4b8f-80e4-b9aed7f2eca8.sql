ALTER TABLE public.vsl_data DROP CONSTRAINT IF EXISTS vsl_data_video_id_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS vsl_data_video_id_date_op_key ON public.vsl_data (video_id, date, operation_id);