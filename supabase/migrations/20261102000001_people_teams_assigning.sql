-- People, roles, job teams and assigning.
--
-- Two roles. An admin adds people, makes and closes jobs, and changes the setup: a job's locations,
-- companies and team, the companies and trades, the standard titles and the added fields. The team
-- walks jobs, adds items, checks them off, schedules and sends lists.
--
-- Who sees which jobs is set for each person: every job, or only the jobs they are on. Admins see
-- every job. A job's team is who is on it and as what: Project Manager, Superintendent or Field.
-- An item can be assigned to one person; assigning it to someone puts them on the job's team, so
-- they always see what is theirs.
--
-- job_access is who can see each job, kept by the database from the people and the teams. The
-- access rules work it out directly; the phones' sync reads this table, since the sync does not go
-- through the access rules.

-- ---------- people ----------

alter table public.people add column role text not null default 'team' check (role in ('admin', 'team'));
alter table public.people add column sees text not null default 'all' check (sees in ('all', 'assigned'));
alter table public.people add column phone text;
alter table public.people add column added_by uuid references public.people (id);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people p where p.email = public.current_email() and p.active and p.role = 'admin')
$$;

create function public.people_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := coalesce(public.current_person_id(), new.added_by);
    new.created_at := coalesce(new.created_at, now());
  else
    new.added_by := old.added_by;
    new.created_at := old.created_at;
    new.org := old.org;
    -- Ross Built always keeps an admin who can sign in.
    if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) and not exists (
      select 1 from public.people p where p.org = old.org and p.id <> old.id and p.role = 'admin' and p.active
    ) then
      raise exception 'Ross Built needs at least one admin' using errcode = 'check_violation';
    end if;
  end if;
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  return new;
end $$;

create trigger people_before_write before insert or update on public.people
  for each row execute function public.people_before_write();

create function public.people_never_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'People are never deleted; switch them off' using errcode = 'restrict_violation';
end $$;

create trigger people_never_delete before delete on public.people
  for each row execute function public.people_never_delete();

-- ---------- job teams ----------

create table public.job_team (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  person_id uuid not null references public.people (id),
  part text not null default 'field' check (part in ('project_manager', 'superintendent', 'field')),
  added_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  unique (job_id, person_id)
);
create index job_team_person on public.job_team (person_id);

create function public.job_team_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := coalesce(public.current_person_id(), new.added_by);
    new.org := coalesce((select j.org from public.jobs j where j.id = new.job_id), new.org);
  else
    new.job_id := old.job_id;
    new.person_id := old.person_id;
    new.added_by := old.added_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create trigger job_team_before_write before insert or update on public.job_team
  for each row execute function public.job_team_before_write();

-- ---------- assigning items ----------

alter table public.items add column assigned_to uuid references public.people (id);
create index items_assigned on public.items (assigned_to) where assigned_to is not null;

-- Assigned to someone not on the job's team: they join it, so the item is always theirs to see.
create function public.items_assigned_join_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    if not exists (select 1 from public.people p where p.id = new.assigned_to and p.active and p.org = new.org) then
      raise exception 'Assign it to someone at Ross Built' using errcode = 'check_violation';
    end if;
    insert into public.job_team (org, job_id, person_id, part)
      values (new.org, new.job_id, new.assigned_to, 'field')
      on conflict (job_id, person_id) do nothing;
  end if;
  return null;
end $$;

create trigger items_assigned_join_team after insert or update of assigned_to on public.items
  for each row execute function public.items_assigned_join_team();

-- A standard title used again moves up the suggestions; counted here, so nobody needs to change the library to add an item.
create function public.items_title_uses() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.title_library set uses = uses + 1 where org = new.org and lower(title) = lower(btrim(new.title)) and btrim(new.title) <> '';
  return null;
end $$;

create trigger items_title_uses after insert on public.items
  for each row execute function public.items_title_uses();

-- ---------- who can see which job ----------

-- Worked out from the person alone, so a job just made (not visible to its own statement yet) is seen by whoever made it.
create function public.can_see_job(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.people p
    where p.email = public.current_email() and p.active
      and (p.role = 'admin' or p.sees = 'all' or exists (select 1 from public.job_team t where t.job_id = p_job and t.person_id = p.id))
  )
$$;

create table public.job_access (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  person_id uuid not null references public.people (id),
  email text not null,
  unique (job_id, person_id)
);
create index job_access_email on public.job_access (email);

-- Brings job_access in line with the people and the teams: who may see what, nothing more.
create function public.refresh_job_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.job_access a
  where not exists (
    select 1 from public.people p join public.jobs j on j.org = p.org
    where p.id = a.person_id and j.id = a.job_id and p.active and p.email = a.email
      and (p.role = 'admin' or p.sees = 'all' or exists (select 1 from public.job_team t where t.job_id = j.id and t.person_id = p.id))
  );
  insert into public.job_access (org, job_id, person_id, email)
  select j.org, j.id, p.id, p.email
  from public.people p join public.jobs j on j.org = p.org
  where p.active and (p.role = 'admin' or p.sees = 'all' or exists (select 1 from public.job_team t where t.job_id = j.id and t.person_id = p.id))
  on conflict (job_id, person_id) do nothing;
  return null;
end $$;

create trigger people_job_access after insert or update of role, sees, active, email on public.people
  for each statement execute function public.refresh_job_access();
create trigger jobs_job_access after insert on public.jobs
  for each statement execute function public.refresh_job_access();
create trigger job_team_job_access after insert or update or delete on public.job_team
  for each statement execute function public.refresh_job_access();

insert into public.job_access (org, job_id, person_id, email)
select j.org, j.id, p.id, p.email
from public.people p join public.jobs j on j.org = p.org
where p.active and (p.role = 'admin' or p.sees = 'all')
on conflict (job_id, person_id) do nothing;

-- ---------- a job's locations: setup for admins; marking one walked for everyone on it ----------

create function public.locations_setup_by_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (new.name, new.number, new.label, new.floor, new.kind, new.sort_order, new.active, new.job_id)
     is distinct from (old.name, old.number, old.label, old.floor, old.kind, old.sort_order, old.active, old.job_id) then
    raise exception 'Only an admin changes the job''s locations' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger locations_setup_by_admin before update on public.locations
  for each row execute function public.locations_setup_by_admin();

-- ---------- activity: who joined or left a job's team ----------

alter table public.job_activity drop constraint job_activity_kind_check;
alter table public.job_activity add constraint job_activity_kind_check check (kind in (
  'photo_added', 'photo_marked', 'photo_removed',
  'visit_added', 'visit_changed', 'visit_removed', 'visit_confirmed_by_company', 'visit_change_asked',
  'list_sent', 'list_undone',
  'location_added', 'location_renamed', 'location_removed', 'location_restored',
  'company_added', 'company_renamed', 'company_trade_changed', 'company_removed',
  'job_renamed', 'job_address_changed', 'job_closed', 'job_reopened',
  'team_added', 'team_changed', 'team_removed',
  'comment_added'
));

create function public.job_team_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.job_id, null, 'team_added', jsonb_build_object('person_id', new.person_id, 'part', new.part));
  elsif tg_op = 'DELETE' then
    perform public.log_activity(old.job_id, null, 'team_removed', jsonb_build_object('person_id', old.person_id, 'part', old.part));
  elsif new.part is distinct from old.part then
    perform public.log_activity(new.job_id, null, 'team_changed', jsonb_build_object('person_id', new.person_id, 'part', new.part, 'was_part', old.part));
  end if;
  return null;
end $$;

create trigger job_team_activity after insert or update or delete on public.job_team
  for each row execute function public.job_team_activity();

create function public.jobs_closed_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.archived is distinct from old.archived then
    perform public.log_activity(new.id, null, case when new.archived then 'job_closed' else 'job_reopened' end, '{}'::jsonb);
  end if;
  return null;
end $$;

create trigger jobs_closed_activity after update of archived on public.jobs
  for each row execute function public.jobs_closed_activity();

-- ---------- access rules ----------

-- The rules made before are changed in place (alter policy), never dropped and made again, so
-- nothing here takes anything away from the database.

alter table public.job_team enable row level security;
alter table public.job_access enable row level security;

grant select, insert, update on public.people to authenticated;
grant update (name, address, archived) on public.jobs to authenticated;
grant select, insert, update, delete on public.job_team to authenticated;
grant select on public.job_access to authenticated;

-- People: everyone sees the people list; admins add and change people.
create policy people_insert on public.people for insert to authenticated with check (public.is_admin());
create policy people_update on public.people for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Org-wide setup: everyone reads, admins change.
alter policy trades_insert on public.trades with check (public.is_admin());
alter policy trades_update on public.trades using (public.is_admin()) with check (public.is_admin());

alter policy companies_insert on public.companies with check (public.is_admin());
alter policy companies_update on public.companies using (public.is_admin()) with check (public.is_admin());

alter policy title_library_insert on public.title_library with check (public.is_admin());
alter policy title_library_update on public.title_library using (public.is_admin()) with check (public.is_admin());
alter policy title_library_delete on public.title_library using (public.is_admin());

alter policy custom_fields_insert on public.custom_fields with check (public.is_admin());
alter policy custom_fields_update on public.custom_fields using (public.is_admin()) with check (public.is_admin());

-- Jobs: seen as each person's access says; made, renamed and closed by admins.
alter policy jobs_read on public.jobs using (public.can_see_job(id));
alter policy jobs_insert on public.jobs with check (public.is_admin());
alter policy jobs_update on public.jobs using (public.is_admin()) with check (public.is_admin());

-- A job's setup: seen by whoever sees the job; changed by admins (locations also take Done Here, above).
alter policy locations_read on public.locations using (public.can_see_job(job_id));
alter policy locations_insert on public.locations with check (public.is_admin());
alter policy locations_update on public.locations using (public.can_see_job(job_id)) with check (public.can_see_job(job_id));

alter policy job_companies_read on public.job_companies using (public.can_see_job(job_id));
alter policy job_companies_insert on public.job_companies with check (public.is_admin());
alter policy job_companies_update on public.job_companies using (public.is_admin()) with check (public.is_admin());
alter policy job_companies_delete on public.job_companies using (public.is_admin());

create policy job_team_read on public.job_team for select to authenticated using (public.can_see_job(job_id));
create policy job_team_insert on public.job_team for insert to authenticated with check (public.is_admin());
create policy job_team_update on public.job_team for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy job_team_delete on public.job_team for delete to authenticated using (public.is_admin());

create policy job_access_read on public.job_access for select to authenticated
  using (public.is_admin() or person_id = public.current_person_id());

-- What it waits on: anyone on the job adds a choice from the Not Ready box.
alter policy job_waiting_on_read on public.job_waiting_on using (public.can_see_job(job_id));
alter policy job_waiting_on_insert on public.job_waiting_on with check (public.can_see_job(job_id));
alter policy job_waiting_on_update on public.job_waiting_on using (public.can_see_job(job_id)) with check (public.can_see_job(job_id));
alter policy job_waiting_on_delete on public.job_waiting_on using (public.can_see_job(job_id));

-- The work itself: anyone who sees the job.
alter policy items_read on public.items using (public.can_see_job(job_id));
alter policy items_insert on public.items with check (public.can_see_job(job_id));
alter policy items_update on public.items using (public.can_see_job(job_id)) with check (public.can_see_job(job_id));

alter policy item_history_read on public.item_history using (public.can_see_job(job_id));

alter policy job_activity_read on public.job_activity using (public.can_see_job(job_id));

alter policy photos_read on public.photos using (public.can_see_job(job_id));
alter policy photos_insert on public.photos with check (public.can_see_job(job_id));
alter policy photos_update on public.photos using (public.can_see_job(job_id)) with check (public.can_see_job(job_id));

alter policy visits_read on public.visits using (public.can_see_job(job_id));
alter policy visits_insert on public.visits with check (public.can_see_job(job_id));
alter policy visits_update on public.visits using (public.can_see_job(job_id)) with check (public.can_see_job(job_id));

alter policy list_sends_read on public.list_sends using (public.can_see_job(job_id));
alter policy list_sends_insert on public.list_sends with check (public.can_see_job(job_id));
alter policy list_sends_update on public.list_sends using (public.can_see_job(job_id)) with check (public.can_see_job(job_id));

alter policy comments_read on public.comments using (public.can_see_job(job_id));
alter policy comments_insert on public.comments with check (public.can_see_job(job_id) and not from_company);
alter policy comments_update on public.comments
  using (public.can_see_job(job_id) and person_id = public.current_person_id())
  with check (public.can_see_job(job_id) and person_id = public.current_person_id());

alter policy company_links_read on public.company_links using (public.can_see_job(job_id));
alter policy company_links_insert on public.company_links with check (public.can_see_job(job_id));
alter policy company_links_update on public.company_links using (public.can_see_job(job_id)) with check (public.can_see_job(job_id));

alter publication powersync add table public.job_team, public.job_access;
