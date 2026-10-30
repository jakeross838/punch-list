-- The photos bucket. Photos are private: only active people can read or add them, and the app
-- never deletes one (removing a photo sets removed on its row). Skipped where there is no Supabase
-- storage, as in the local database checks.

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'No Supabase storage here: the photos bucket is skipped';
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
  execute $p$
    create policy photos_bucket_read on storage.objects for select to authenticated
      using (bucket_id = 'photos' and public.is_active_person())
  $p$;
  execute $p$
    create policy photos_bucket_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'photos' and public.is_active_person())
  $p$;
end $$;
