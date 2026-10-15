
insert into storage.buckets (id, name, public)
values ('spy-offer-covers', 'spy-offer-covers', true)
on conflict (id) do nothing;

create policy "spy_covers_public_read"
on storage.objects for select
using (bucket_id = 'spy-offer-covers');

create policy "spy_covers_admin_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'spy-offer-covers' and public.has_role(auth.uid(), 'admin'));

create policy "spy_covers_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'spy-offer-covers' and public.has_role(auth.uid(), 'admin'));

create policy "spy_covers_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'spy-offer-covers' and public.has_role(auth.uid(), 'admin'));
