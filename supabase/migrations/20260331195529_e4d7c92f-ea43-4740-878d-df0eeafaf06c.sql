
-- Drop the old 2-parameter version to resolve overloading conflict
DROP FUNCTION IF EXISTS public.get_spend_normalized_sp(date, date);
