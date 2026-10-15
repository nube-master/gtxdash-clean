-- Add revenue column to vsl_data to store Vturb's per-player revenue (total_amount_brl)
ALTER TABLE public.vsl_data ADD COLUMN revenue numeric NOT NULL DEFAULT 0;