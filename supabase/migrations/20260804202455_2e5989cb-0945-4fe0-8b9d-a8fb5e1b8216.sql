-- Add is_restricted to super_admins to allow technical access (Edge Functions) without UI visibility of all operations
ALTER TABLE public.super_admins ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN DEFAULT FALSE;

-- Restrict Gui Pires (gui2pp@gmail.com)
UPDATE public.super_admins SET is_restricted = TRUE WHERE user_id = '7d74a635-630c-4d22-a752-a3b33650daed';
