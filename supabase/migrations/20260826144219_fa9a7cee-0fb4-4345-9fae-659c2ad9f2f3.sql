REVOKE ALL ON FUNCTION public.admin_list_push_users(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_copy_push_prefs(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_push_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_copy_push_prefs(uuid, uuid, uuid) TO authenticated;