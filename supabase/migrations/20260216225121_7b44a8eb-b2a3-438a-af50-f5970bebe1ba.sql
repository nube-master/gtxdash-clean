
-- Table to store per-user page permissions
CREATE TABLE public.user_page_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allowed_pages text[] NOT NULL DEFAULT '{"/","/analytics","/campaigns","/assets","/creatives","/vsls","/unit-economics","/planning"}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all permissions
CREATE POLICY "Admins can read all page permissions"
ON public.user_page_permissions FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert page permissions"
ON public.user_page_permissions FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update page permissions"
ON public.user_page_permissions FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete page permissions"
ON public.user_page_permissions FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Users can read their own permissions
CREATE POLICY "Users can read own page permissions"
ON public.user_page_permissions FOR SELECT
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_page_permissions_updated_at
BEFORE UPDATE ON public.user_page_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
