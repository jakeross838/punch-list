-- The people at each company, the lists a send can be, and the schedule each send keeps.
--
-- A company's contacts are its people: a name, an email, a phone, and whether they get the lists
-- and the schedule email. They belong to the company, so they get its lists on every job. Everyone
-- at Ross Built sees them; admins change them. Nobody is deleted: a contact is switched off.
--
-- A send of the Three Week Look Ahead or of the Friday schedule email keeps the schedule as it went
-- out (each visit or best guess with its dates and whether it was confirmed), so the schedule can
-- be tracked against what everyone was told.

-- ---------- the people at each company ----------

create table public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  company_id uuid not null references public.companies (id),
  name text not null default '' check (char_length(name) <= 80),
  email text check (email is null or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text check (phone is null or char_length(phone) <= 40),
  -- Gets the company's lists and the schedule email.
  gets_lists boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_contacts_someone check (btrim(name) <> '' or email is not null or phone is not null)
);
create index company_contacts_company on public.company_contacts (company_id);

create function public.company_contacts_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.phone := nullif(btrim(regexp_replace(coalesce(new.phone, ''), '\s+', ' ', 'g')), '');
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.org := coalesce((select c.org from public.companies c where c.id = new.company_id), new.org);
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.created_at := now();
  else
    new.company_id := old.company_id;
    new.org := old.org;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create trigger company_contacts_before_write before insert or update on public.company_contacts
  for each row execute function public.company_contacts_before_write();

create function public.company_contacts_never_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Contacts are never deleted; switch them off' using errcode = 'restrict_violation';
end $$;

create trigger company_contacts_never_delete before delete on public.company_contacts
  for each row execute function public.company_contacts_never_delete();

alter table public.company_contacts enable row level security;
grant select, insert, update on public.company_contacts to authenticated;
create policy company_contacts_read on public.company_contacts for select to authenticated using (public.is_active_person());
create policy company_contacts_insert on public.company_contacts for insert to authenticated with check (public.is_admin());
create policy company_contacts_update on public.company_contacts for update to authenticated using (public.is_admin()) with check (public.is_admin());

alter publication powersync add table public.company_contacts;

-- ---------- the lists a send can be, and the schedule it kept ----------

-- The Three Week Look Ahead on its own, and the Friday schedule email to every company.
alter table public.list_sends drop constraint list_sends_list_check;
alter table public.list_sends add constraint list_sends_list_check
  check (list in ('job', 'lookahead', 'schedule') or list like 'company:_%' or list like 'party:_%');

-- The schedule as it went out, as the app keeps it: { finish, bars: [{ key, companyId, start, end, confirmed }] }.
alter table public.list_sends add column snapshot jsonb check (snapshot is null or jsonb_typeof(snapshot) = 'object');

create or replace function public.list_sends_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.sent_by := coalesce(public.current_person_id(), new.sent_by);
    new.sent_at := coalesce(new.sent_at, now());
  else
    -- What went out stays as it went out; only removed changes (Undo).
    new.job_id := old.job_id;
    new.list := old.list;
    new.item_ids := old.item_ids;
    new.sent_at := old.sent_at;
    new.sent_by := old.sent_by;
    new.snapshot := old.snapshot;
  end if;
  return new;
end $$;

-- ---------- who can sign in ----------

-- For Supabase Auth's Before User Created hook (Authentication, Hooks, as a Postgres function): a
-- sign in code goes only to someone Ross Built has added under People and not switched off. Anyone
-- else is turned away before an account is made, with the sentence the app shows.
create function public.hook_only_ross_built_people(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if exists (select 1 from public.people p where p.email = v_email and p.active) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'That email is not set up at Ross Built. Ask an admin to add you under People.'
  ));
end $$;

revoke execute on function public.hook_only_ross_built_people(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.hook_only_ross_built_people(jsonb) to supabase_auth_admin;
  end if;
end $$;
