
DELETE FROM public.profiles
WHERE id = '33701f23-fb21-4f3e-926e-394f5a4cb984'
  AND email = 'gui2pp@gmail.com';

INSERT INTO public.profiles (id, user_id, email)
VALUES (
  '7d74a635-630c-4d22-a752-a3b33650daed',
  '7d74a635-630c-4d22-a752-a3b33650daed',
  'gui2pp@gmail.com'
)
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email;

INSERT INTO public.user_roles (user_id, role)
VALUES ('7d74a635-630c-4d22-a752-a3b33650daed', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.operation_members (operation_id, user_id, role)
VALUES (
  '0b758a2b-1b92-4769-b47b-416c567e320d',
  '7d74a635-630c-4d22-a752-a3b33650daed',
  'admin'
)
ON CONFLICT (operation_id, user_id) DO UPDATE SET role = EXCLUDED.role;

DELETE FROM public.super_admins
WHERE user_id IN (
  '33701f23-fb21-4f3e-926e-394f5a4cb984',
  '7d74a635-630c-4d22-a752-a3b33650daed'
);

DELETE FROM public.operation_members
WHERE user_id = '7d74a635-630c-4d22-a752-a3b33650daed'
  AND operation_id <> '0b758a2b-1b92-4769-b47b-416c567e320d';
