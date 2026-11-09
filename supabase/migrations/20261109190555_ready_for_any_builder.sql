-- Round 5: ready for any builder.
--
-- The builder's logo: a small picture kept on the company's own row (a PNG or JPEG, made small on the
-- phone first), so every phone has it with no signal for the printed lists, and the pages' function
-- adds it to the companies', the owner's and the station's pages. An admin changes it, like the name.

alter table public.orgs add column logo text
  check (logo is null or (char_length(logo) <= 400000 and logo ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$'));

/**
 * For the pages' function: the builder's logo for a page, from any of its links (a company's, the
 * owner's or the job's station). Nothing for a link taken back.
 */
create function public.page_logo(p_token text) returns text
language sql stable security definer set search_path = public as $$
  select o.logo from public.orgs o
  where o.id = (
    select x.org from (
      select l.org from public.company_links l where l.token = p_token and not l.revoked
      union all
      select l.org from public.owner_links l where l.token = p_token and not l.revoked
      union all
      select s.org from public.job_stations s where s.token = p_token and not s.revoked
    ) x
    limit 1
  )
$$;
revoke execute on function public.page_logo(text) from public, anon, authenticated;
grant execute on function public.page_logo(text) to service_role;

-- ---------- roles ----------
--
-- Admin runs the company: its people, companies, templates, item form, name and logo, and every job.
-- Project Manager makes jobs and sets them up (locations, the companies on the job, the team) and sees
-- every job. Superintendent (kept as 'team', which the phones already know) walks jobs, adds items,
-- sends lists and checks the work off. View Only sees the jobs and comments, and changes nothing.

alter table public.people drop constraint people_role_check;
alter table public.people add constraint people_role_check check (role in ('admin', 'project_manager', 'team', 'view_only'));

/** Signed in as an admin or a project manager, switched on: they set up jobs. */
create function public.can_set_up_jobs() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people p where p.email = public.current_email() and p.active and p.role in ('admin', 'project_manager'))
$$;

/** Signed in as View Only: they look and comment. */
create function public.is_view_only() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people p where p.email = public.current_email() and p.active and p.role = 'view_only')
$$;
revoke execute on function public.can_set_up_jobs(), public.is_view_only() from public, anon;
grant execute on function public.can_set_up_jobs(), public.is_view_only() to authenticated;

-- A project manager sees every job, like an admin: their Sees is always Every Job.
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
  if new.role in ('admin', 'project_manager') then
    new.sees := 'all';
  end if;
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  return new;
end $$;

-- Making a job, renaming, closing and opening it again: an admin, or a project manager. (Each rule
-- is changed in place, as the roles migration did, rather than dropped and made again.)
alter policy jobs_insert on public.jobs to authenticated with check (public.can_set_up_jobs() and org = (select public.current_org()));
alter policy jobs_update on public.jobs to authenticated
  using (public.can_set_up_jobs() and org = (select public.current_org()))
  with check (public.can_set_up_jobs() and org = (select public.current_org()));

-- The job's team, and the companies on it: an admin, or a project manager.
alter policy job_team_insert on public.job_team to authenticated with check (public.can_set_up_jobs() and public.can_see_job(job_id));
alter policy job_team_update on public.job_team to authenticated using (public.can_set_up_jobs() and public.can_see_job(job_id)) with check (public.can_set_up_jobs() and public.can_see_job(job_id));
alter policy job_team_delete on public.job_team to authenticated using (public.can_set_up_jobs() and public.can_see_job(job_id));
alter policy job_companies_update on public.job_companies to authenticated using (public.can_set_up_jobs() and public.can_see_job(job_id)) with check (public.can_set_up_jobs() and public.can_see_job(job_id));
alter policy job_companies_delete on public.job_companies to authenticated using (public.can_set_up_jobs() and public.can_see_job(job_id));

-- The people at a company put on a job, read from its card to get its lists: an admin, or a project
-- manager. Changing them, and the companies themselves, stays with an admin.
alter policy company_contacts_insert on public.company_contacts to authenticated with check (public.can_set_up_jobs() and org = (select public.current_org()));

-- The job's locations, beyond walking them: an admin, or a project manager.
create or replace function public.locations_setup_by_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_set_up_jobs() and (new.name, new.number, new.label, new.floor, new.kind, new.sort_order, new.active, new.job_id)
     is distinct from (old.name, old.number, old.label, old.floor, old.kind, old.sort_order, old.active, old.job_id) then
    raise exception 'Only an admin or a project manager changes the job''s locations' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- ---------- plans ----------
--
-- A company starts on a free trial of 30 days, then needs a plan. A plan is agreed and paid outside
-- the app, which sells nothing; Jake marks a company that has one as 'paid'. Ross Built, and the
-- companies already using the app, are 'free'. Once a trial ends with no plan, everything stays
-- there to look at, comment on and download, and nothing else changes until a plan starts.

alter table public.orgs add column plan text not null default 'trial' check (plan in ('trial', 'paid', 'free'));
alter table public.orgs add column trial_ends timestamptz not null default (now() + interval '30 days');
update public.orgs set plan = 'free';

/** A company's plan is changed by Jake, never from the app: what an admin sends for it is turned down. */
create function public.orgs_plan_kept() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.plan := 'trial';
      new.trial_ends := now() + interval '30 days';
    elsif (new.plan, new.trial_ends) is distinct from (old.plan, old.trial_ends) then
      raise exception 'A company''s plan is not changed from the app' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger orgs_plan_kept before insert or update on public.orgs for each row execute function public.orgs_plan_kept();

/** Whether the signed-in person's company can change things: on a plan, or still in its free trial. */
create function public.org_can_change() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select o.plan <> 'trial' or o.trial_ends > now() from public.orgs o where o.id = public.current_org()), true)
$$;
revoke execute on function public.org_can_change() from public, anon;
grant execute on function public.org_can_change() to authenticated;

-- ---------- the guard ----------
--
-- View Only changes nothing but their comments and their own view: every other table turns them away,
-- through the app's own functions too (a merge, a link for the owner or the station). Deleting their
-- own account is the one thing that changes other rows for them. The same goes for everyone at a
-- company whose free trial has ended with no plan.

create function public.view_only_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('punch.leaving', true), '') <> 'on' then
    if public.is_view_only() then
      raise exception 'View Only can look and comment, not change anything' using errcode = 'insufficient_privilege';
    end if;
    if not public.org_can_change() then
      raise exception 'Your company''s free trial has ended. Everything is still here to look at, comment on and download' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

/** Deleting your own account: as before, said first, so View Only can leave too. */
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_me public.people;
  v_others integer;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('punch.leaving', 'on', true);
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
      update public.items
        set assigned_to = null, unfinished = unfinished or (status = 'open' and company_id is null)
        where assigned_to = v_me.id;
      delete from public.job_team where person_id = v_me.id;
      delete from public.person_settings where person_id = v_me.id;
      update public.people
        set active = false, role = 'team', name = 'Deleted Account', email = 'deleted-' || v_me.id || '@deleted.invalid', phone = null
        where id = v_me.id;
    end if;
  end if;
  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.view_only_guard() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'jobs', 'locations', 'items', 'photos', 'plan_sheets', 'visits', 'list_sends', 'job_companies', 'job_team', 'job_waiting_on',
    'company_links', 'companies', 'company_contacts', 'templates', 'template_items', 'title_library', 'custom_fields', 'trades',
    'job_stations', 'owner_links', 'orgs', 'people'
  ] loop
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.view_only_guard()', t || '_view_only', t);
  end loop;
end $$;

-- ---------- email from the app's own address ----------
--
-- Each email the send-email function sends (a company's list, an invitation) is counted here, so a
-- company sends at most so many a day from the app's address. Only the function reads and writes it.

create table public.email_sends (
  id uuid primary key default gen_random_uuid(),
  org text not null references public.orgs (id) on delete cascade,
  person_id uuid references public.people (id) on delete set null,
  kind text not null check (kind in ('list', 'invite')),
  recipients integer not null check (recipients > 0),
  at timestamptz not null default now()
);
create index email_sends_org_at on public.email_sends (org, at);
alter table public.email_sends enable row level security;
revoke all on public.email_sends from public, anon, authenticated;
grant select, insert on public.email_sends to service_role;
