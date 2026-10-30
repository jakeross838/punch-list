-- The schedule the list builds, and quick drafts.
--
-- Unfinished items: a photo snapped on a walk, or an item saved before its company was known. They
-- may wait for a title, a company and a trade; every other rule still holds, and they cannot be
-- completed until they are finished.
--
-- Visits: a company's trip to the job for a batch of items, with its first day, its working days,
-- and whether the company confirmed it. An item is on at most one visit, of its own company.
--
-- List sends: a record of each list that went out, so the next one can mark what is new.
--
-- Nothing here is deleted: removing a visit or a send sets removed.

-- ---------- unfinished items ----------

alter table public.items add column unfinished boolean not null default false;
alter table public.items alter column trade_id drop not null;
alter table public.items alter column company_id drop not null;
alter table public.items drop constraint if exists items_title_check;
alter table public.items add constraint items_title_length check (char_length(btrim(title)) <= 80);
alter table public.items add constraint items_finished_has_title check (unfinished or char_length(btrim(title)) >= 1);
alter table public.items add constraint items_finished_has_company_and_trade
  check (unfinished or (trade_id is not null and company_id is not null));
alter table public.items add constraint items_unfinished_not_complete check (not (unfinished and status = 'complete'));

-- ---------- visits ----------

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  company_id uuid not null references public.companies (id),
  start_date date not null,
  -- Working days, Monday to Friday.
  days integer not null check (days between 1 and 60),
  confirmed boolean not null default false,
  note text not null default '',
  removed boolean not null default false,
  created_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index visits_job on public.visits (job_id, start_date);

create function public.visits_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.created_at := coalesce(new.created_at, now());
  else
    -- A visit stays with its job and company; its dates, days, confirmation and note change.
    new.job_id := old.job_id;
    new.company_id := old.company_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger visits_before_write before insert or update on public.visits
  for each row execute function public.visits_before_write();

create function public.visits_never_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Visits are never deleted; set removed' using errcode = 'restrict_violation';
end $$;

create trigger visits_never_delete before delete on public.visits
  for each row execute function public.visits_never_delete();

alter table public.items add column visit_id uuid references public.visits (id);
create index items_visit on public.items (visit_id);

-- An item goes only on a visit of its own company, on its own job.
create function public.items_visit_matches() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visit_id is not null and not exists (
    select 1 from public.visits v
    where v.id = new.visit_id and v.job_id = new.job_id and v.company_id is not distinct from new.company_id
  ) then
    raise exception 'The visit is for a different company or job' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger items_visit_matches before insert or update of visit_id, company_id, job_id on public.items
  for each row execute function public.items_visit_matches();

-- ---------- lists sent ----------

create table public.list_sends (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  -- Which list: the whole job, one company's, or one party's (the owner, the design team).
  list text not null check (list = 'job' or list like 'company:_%' or list like 'party:_%'),
  item_ids uuid[] not null default '{}',
  sent_at timestamptz not null default now(),
  sent_by uuid references public.people (id),
  removed boolean not null default false
);
create index list_sends_job on public.list_sends (job_id, list, sent_at);

create function public.list_sends_before_write() returns trigger
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
  end if;
  return new;
end $$;

create trigger list_sends_before_write before insert or update on public.list_sends
  for each row execute function public.list_sends_before_write();

create function public.list_sends_never_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Sent lists are never deleted; set removed' using errcode = 'restrict_violation';
end $$;

create trigger list_sends_never_delete before delete on public.list_sends
  for each row execute function public.list_sends_never_delete();

-- ---------- access rules ----------

alter table public.visits enable row level security;
alter table public.list_sends enable row level security;
revoke all on public.visits, public.list_sends from anon, authenticated;
grant select, insert, update on public.visits, public.list_sends to authenticated;

create policy visits_read on public.visits for select to authenticated using (public.is_active_person());
create policy visits_insert on public.visits for insert to authenticated with check (public.is_active_person());
create policy visits_update on public.visits for update to authenticated using (public.is_active_person()) with check (public.is_active_person());
create policy list_sends_read on public.list_sends for select to authenticated using (public.is_active_person());
create policy list_sends_insert on public.list_sends for insert to authenticated with check (public.is_active_person());
create policy list_sends_update on public.list_sends for update to authenticated using (public.is_active_person()) with check (public.is_active_person());

-- ---------- to the phones ----------

alter publication powersync add table public.visits, public.list_sends;
