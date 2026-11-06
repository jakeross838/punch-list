-- Many companies. Anyone signs in with their email, names their company and becomes its admin,
-- then adds their people by email. Every row already carries org; from here on each company sees
-- only its own rows, the database fills in org itself (from the job, or from whoever is signed in),
-- names that must be unique are unique within a company, and someone can delete their account.
-- The company pages reached through a link are out of the app for now, so their functions are
-- closed to the app and to anyone not signed in.

-- ---------- the companies ----------

create table public.orgs (
  id text primary key,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table public.orgs enable row level security;
grant select, update on public.orgs to authenticated;

insert into public.orgs (id, name) values ('ross_built', 'Ross Built') on conflict (id) do nothing;
insert into public.orgs (id, name)
  select distinct p.org, p.org from public.people p where not exists (select 1 from public.orgs o where o.id = p.org);

create function public.orgs_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger orgs_before_write before insert or update on public.orgs for each row execute function public.orgs_before_write();

/** The company of whoever is signed in: null for someone who is not an active person anywhere. */
create function public.current_org() returns text
language sql stable security definer set search_path = public as $$
  select p.org from public.people p where p.email = public.current_email() and p.active
$$;
revoke execute on function public.current_org() from public, anon;
grant execute on function public.current_org() to authenticated;

create policy orgs_read on public.orgs for select to authenticated using (id = (select public.current_org()));
create policy orgs_update on public.orgs for update to authenticated
  using (id = (select public.current_org()) and public.is_admin())
  with check (id = (select public.current_org()) and public.is_admin());

alter table public.people add constraint people_org_fkey foreign key (org) references public.orgs (id);
alter table public.jobs add constraint jobs_org_fkey foreign key (org) references public.orgs (id);

-- ---------- org is filled in by the database ----------

-- No default company: a row gets its company from its job, or from whoever is signed in.
do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'org' and c.table_name <> 'orgs'
  loop
    execute format('alter table public.%I alter column org drop default', t);
  end loop;
end $$;

/** A job's rows belong to the job's company, and stay there. */
create function public.org_follows_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.org := old.org;
    if new.job_id is distinct from old.job_id and not exists (select 1 from public.jobs j where j.id = new.job_id and j.org = old.org) then
      raise exception 'That job is not one of your company''s' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  new.org := coalesce((select j.org from public.jobs j where j.id = new.job_id), new.org);
  return new;
end $$;

/** A company's own rows (jobs, people, companies, trades and the rest) belong to whoever adds them. */
create function public.org_follows_person() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.org := old.org;
    return new;
  end if;
  new.org := coalesce(public.current_org(), new.org);
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['comments', 'company_links', 'item_history', 'items', 'job_access', 'job_activity', 'job_companies',
                           'job_team', 'job_waiting_on', 'list_sends', 'locations', 'photos', 'plan_sheets', 'visits'] loop
    execute format('create trigger org_follows_job before insert or update on public.%I for each row execute function public.org_follows_job()', t);
  end loop;
  foreach t in array array['companies', 'custom_fields', 'jobs', 'people', 'person_settings', 'templates', 'title_library', 'trades'] loop
    execute format('create trigger org_follows_person before insert or update on public.%I for each row execute function public.org_follows_person()', t);
  end loop;
end $$;
-- A company's people (company_contacts) and a template's tasks (template_items) already take their
-- org from the company and the template.

-- ---------- names unique within a company ----------

drop index public.companies_name;
create unique index companies_name on public.companies (org, lower(name));
drop index public.trades_name;
create unique index trades_name on public.trades (org, lower(name));
drop index public.title_library_title;
create unique index title_library_title on public.title_library (org, lower(title), coalesce(trade_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------- who sees what: only their own company ----------

/**
 * Whether whoever is signed in sees a job of this company: an admin there, someone there who sees
 * every job, or someone on the job's team. The jobs table asks this with the row's own company, so a
 * job being added is seen by whoever adds it.
 */
create function public.can_see_job_of(p_job uuid, p_org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.people p
    where p.email = public.current_email() and p.active and p.org = p_org
      and (p.role = 'admin' or p.sees = 'all' or exists (select 1 from public.job_team t where t.job_id = p_job and t.person_id = p.id))
  )
$$;
revoke execute on function public.can_see_job_of(uuid, text) from public, anon;
grant execute on function public.can_see_job_of(uuid, text) to authenticated;

/** The same for a row on a job: the job's company is looked up. */
create or replace function public.can_see_job(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_see_job_of(p_job, (select j.org from public.jobs j where j.id = p_job))
$$;

do $$
declare
  t text;
begin
  -- What the whole company shares: everyone reads it, admins change it.
  foreach t in array array['people', 'trades', 'companies', 'company_contacts', 'custom_fields', 'templates', 'template_items', 'title_library'] loop
    execute format('drop policy %I on public.%I', t || '_read', t);
    execute format('drop policy %I on public.%I', t || '_insert', t);
    execute format('drop policy %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for select to authenticated using (org = (select public.current_org()))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin() and org = (select public.current_org()))', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_admin() and org = (select public.current_org())) with check (public.is_admin() and org = (select public.current_org()))',
      t || '_update', t);
  end loop;
end $$;
drop policy title_library_delete on public.title_library;
create policy title_library_delete on public.title_library for delete to authenticated using (public.is_admin() and org = (select public.current_org()));

drop policy jobs_read on public.jobs;
create policy jobs_read on public.jobs for select to authenticated using (public.can_see_job_of(id, org));
drop policy jobs_insert on public.jobs;
create policy jobs_insert on public.jobs for insert to authenticated with check (public.is_admin() and org = (select public.current_org()));
drop policy jobs_update on public.jobs;
create policy jobs_update on public.jobs for update to authenticated
  using (public.is_admin() and org = (select public.current_org()))
  with check (public.is_admin() and org = (select public.current_org()));

do $$
declare
  t text;
begin
  foreach t in array array['job_companies', 'job_team'] loop
    execute format('drop policy %I on public.%I', t || '_insert', t);
    execute format('drop policy %I on public.%I', t || '_update', t);
    execute format('drop policy %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin() and public.can_see_job(job_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin() and public.can_see_job(job_id)) with check (public.is_admin() and public.can_see_job(job_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin() and public.can_see_job(job_id))', t || '_delete', t);
  end loop;
end $$;

drop policy locations_insert on public.locations;
create policy locations_insert on public.locations for insert to authenticated with check (public.is_admin() and public.can_see_job(job_id));

drop policy job_access_read on public.job_access;
create policy job_access_read on public.job_access for select to authenticated
  using (org = (select public.current_org()) and (public.is_admin() or person_id = public.current_person_id()));

-- ---------- photos: only the company whose job they are on ----------

/** The job a stored photo belongs to: the first part of its path, "<job>/<photo>.jpg" or "<job>/plans/<plan>.jpg". */
create function public.job_of_path(p_name text) returns uuid
language plpgsql immutable set search_path = public as $$
begin
  return split_part(coalesce(p_name, ''), '/', 1)::uuid;
exception when others then
  return null;
end $$;
revoke execute on function public.job_of_path(text) from public, anon;
grant execute on function public.job_of_path(text) to authenticated;

/** Signed in, and nobody else at the company is switched on. */
create function public.alone_in_company() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.people me
    where me.email = public.current_email() and me.active
      and not exists (select 1 from public.people p where p.org = me.org and p.active and p.id <> me.id)
  )
$$;
revoke execute on function public.alone_in_company() from public, anon;
grant execute on function public.alone_in_company() to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'No Supabase storage here: the photo rules are skipped';
    return;
  end if;
  execute 'drop policy if exists photos_bucket_read on storage.objects';
  execute 'drop policy if exists photos_bucket_insert on storage.objects';
  execute $p$
    create policy photos_bucket_read on storage.objects for select to authenticated
      using (bucket_id = 'photos' and public.can_see_job(public.job_of_path(name)))
  $p$;
  execute $p$
    create policy photos_bucket_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'photos' and public.can_see_job(public.job_of_path(name)))
  $p$;
  -- Someone deleting their account who is the last one at their company takes its photos with it.
  execute $p$
    create policy photos_bucket_delete on storage.objects for delete to authenticated
      using (bucket_id = 'photos' and public.alone_in_company() and public.can_see_job(public.job_of_path(name)))
  $p$;
end $$;

-- ---------- signing up ----------

-- The Before User Created hook keeps its name, which the Auth settings point at. Anyone may sign up
-- and start a company now; someone switched off at their company is told so.
create or replace function public.hook_only_ross_built_people(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
  v_company text;
begin
  if v_email = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Enter your email.'));
  end if;
  select o.name into v_company from public.people p join public.orgs o on o.id = p.org where p.email = v_email and not p.active;
  if found then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', format('That email is switched off at %s. Ask an admin there to switch it back on.', v_company)
    ));
  end if;
  return '{}'::jsonb;
end $$;
comment on function public.hook_only_ross_built_people(jsonb) is
  'Before User Created hook: anyone may sign up and start a company; someone switched off at their company is turned away.';

/** Where whoever is signed in stands: active at a company, switched off at one, or not with one yet. */
create function public.my_account() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('state', case when p.active then 'active' else 'off' end, 'company', o.name)
       from public.people p join public.orgs o on o.id = p.org
      where p.email = public.current_email() and public.current_email() <> ''),
    jsonb_build_object('state', 'none')
  )
$$;
revoke execute on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

/**
 * A new company for whoever is signed in, with them as its admin and the usual trades to start.
 * Returns the company's id. An email is with one company at most.
 */
create function public.start_company(p_company text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := public.current_email();
  v_company text := btrim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g'));
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_org text := gen_random_uuid()::text;
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.people p where p.email = v_email) then
    raise exception 'That email is with a company already' using errcode = 'unique_violation';
  end if;
  if v_company = '' or char_length(v_company) > 80 then
    raise exception 'Enter the company name' using errcode = 'check_violation';
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'Enter your name' using errcode = 'check_violation';
  end if;
  insert into public.orgs (id, name) values (v_org, v_company);
  insert into public.people (org, email, name, role, sees) values (v_org, v_email, v_name, 'admin', 'all');
  insert into public.trades (org, name, sort_order)
  select v_org, t.name, t.n
  from unnest(array[
    'Site Work', 'Concrete', 'Framing', 'Roofing', 'Windows and Doors', 'Plumbing', 'Electrical', 'HVAC',
    'Insulation', 'Drywall', 'Trim Carpentry', 'Cabinets', 'Countertops', 'Tile', 'Flooring', 'Painting',
    'Appliances', 'Landscaping', 'Cleaning'
  ]) with ordinality as t(name, n);
  return v_org;
end $$;
revoke execute on function public.start_company(text, text) from public, anon;
grant execute on function public.start_company(text, text) to authenticated;

-- ---------- a company keeps an admin ----------

create or replace function public.people_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := coalesce(public.current_person_id(), new.added_by);
    new.created_at := coalesce(new.created_at, now());
  else
    new.added_by := old.added_by;
    new.created_at := old.created_at;
    new.org := old.org;
    -- A company always keeps an admin who can sign in.
    if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) and not exists (
      select 1 from public.people p where p.org = old.org and p.id <> old.id and p.role = 'admin' and p.active
    ) then
      raise exception 'Your company needs at least one admin' using errcode = 'check_violation';
    end if;
  end if;
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  return new;
end $$;

create or replace function public.items_assigned_join_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    if not exists (select 1 from public.people p where p.id = new.assigned_to and p.active and p.org = new.org) then
      raise exception 'Assign it to someone at your company' using errcode = 'check_violation';
    end if;
    insert into public.job_team (org, job_id, person_id, part)
      values (new.org, new.job_id, new.assigned_to, 'field')
      on conflict (job_id, person_id) do nothing;
  end if;
  return null;
end $$;

-- ---------- deleting an account ----------

-- Rows are never deleted, except when the last person at a company deletes their account: then the
-- whole company goes, and only the function below can say so.
create or replace function public.comments_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Comments are never deleted; set removed' using errcode = 'restrict_violation';
end $$;
create or replace function public.company_contacts_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Contacts are never deleted; switch them off' using errcode = 'restrict_violation';
end $$;
create or replace function public.company_links_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Links are never deleted; set revoked' using errcode = 'restrict_violation';
end $$;
create or replace function public.items_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Items are never deleted; set the status to removed' using errcode = 'restrict_violation';
end $$;
create or replace function public.job_activity_never_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Activity is never changed or deleted' using errcode = 'restrict_violation';
end $$;
create or replace function public.list_sends_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Sent lists are never deleted; set removed' using errcode = 'restrict_violation';
end $$;
create or replace function public.people_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'People are never deleted; switch them off' using errcode = 'restrict_violation';
end $$;
create or replace function public.photos_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Photos are never deleted; set removed' using errcode = 'restrict_violation';
end $$;
create or replace function public.plan_sheets_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Plans are never deleted; take them off instead' using errcode = 'restrict_violation';
end $$;
create or replace function public.templates_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Templates and their tasks are never deleted; switch them off' using errcode = 'restrict_violation';
end $$;
create or replace function public.visits_never_delete() returns trigger language plpgsql as $$
begin
  if current_setting('punch.purging', true) = 'on' then return old; end if;
  raise exception 'Visits are never deleted; set removed' using errcode = 'restrict_violation';
end $$;

/** Everything a company has, gone: for the last person there deleting their account. */
create function public.purge_company(p_org text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('punch.purging', 'on', true);
  -- Teams and companies on jobs first: taking them off writes to the activity, which goes next.
  delete from public.job_team where org = p_org;
  delete from public.job_companies where org = p_org;
  delete from public.job_activity where org = p_org;
  delete from public.item_history where org = p_org;
  delete from public.comments where org = p_org;
  delete from public.list_sends where org = p_org;
  delete from public.company_links where org = p_org;
  delete from public.photos where org = p_org;
  delete from public.items where org = p_org;
  delete from public.visits where org = p_org;
  delete from public.plan_sheets where org = p_org;
  delete from public.job_waiting_on where org = p_org;
  delete from public.locations where org = p_org;
  delete from public.job_access where org = p_org;
  delete from public.jobs where org = p_org;
  delete from public.company_contacts where org = p_org;
  delete from public.template_items where org = p_org;
  delete from public.templates where org = p_org;
  delete from public.title_library where org = p_org;
  delete from public.custom_fields where org = p_org;
  delete from public.companies where org = p_org;
  delete from public.trades where org = p_org;
  delete from public.person_settings where org = p_org;
  delete from public.people where org = p_org;
  delete from public.orgs where id = p_org;
  perform set_config('punch.purging', '', true);
end $$;
revoke execute on function public.purge_company(text) from public, anon, authenticated;

/**
 * Deletes the signed-in person's account. Their sign in goes, and their name, email and phone are
 * taken off what they did; the company keeps its records. The last one at a company takes the whole
 * company with it (the app deletes its photos first). An admin with people still at the company
 * makes someone else an admin first.
 */
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_me public.people;
  v_others integer;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  select * into v_me from public.people p where p.email = public.current_email();
  if found then
    select count(*) into v_others from public.people p where p.org = v_me.org and p.id <> v_me.id and p.active;
    if v_others = 0 then
      perform public.purge_company(v_me.org);
    else
      if v_me.active and v_me.role = 'admin' and not exists (
        select 1 from public.people p where p.org = v_me.org and p.id <> v_me.id and p.active and p.role = 'admin'
      ) then
        raise exception 'Make someone else an admin first: your company needs one' using errcode = 'check_violation';
      end if;
      update public.items set assigned_to = null where assigned_to = v_me.id;
      delete from public.job_team where person_id = v_me.id;
      delete from public.person_settings where person_id = v_me.id;
      update public.people
        set active = false, role = 'team', name = 'Deleted Account', email = 'deleted-' || v_me.id || '@deleted.invalid', phone = null
        where id = v_me.id;
    end if;
  end if;
  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- the company pages are out of the app ----------

revoke execute on function public.trade_page(text) from anon, authenticated;
revoke execute on function public.trade_comment(text, uuid, text, text) from anon, authenticated;
revoke execute on function public.trade_confirm_visit(text, uuid, text) from anon, authenticated;
revoke execute on function public.trade_ask_visit(text, uuid, date, integer, text) from anon, authenticated;
revoke execute on function public.trade_mark_done(text, uuid, boolean, text) from anon, authenticated;

-- ---------- the phones ----------

alter publication powersync add table public.orgs;
