-- Punch list core schema.
--
-- Access rule: only an active person, matched by the signed-in email, can read or write anything.
-- Every row carries org (always 'ross_built' for now) so the phone sync can be limited to active
-- people's org: PowerSync does not go through these access rules, so it filters on its own.
-- Items are never deleted: removing an item sets its status to removed.
-- The database keeps item numbers, completion stamps and the change history itself, so no client
-- can get them wrong.

-- ---------- people and the access rule ----------

create table public.people (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index people_email on public.people (email);

create function public.current_email() returns text
language sql stable set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create function public.is_active_person() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people p where p.email = public.current_email() and p.active)
$$;

create function public.current_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.people p where p.email = public.current_email() and p.active
$$;

-- ---------- jobs and their setup ----------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  name text not null check (btrim(name) <> ''),
  address text not null default '',
  item_counter integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  name text not null check (btrim(name) <> ''),
  number text,
  label text not null check (btrim(label) <> ''),
  floor text,
  kind text not null default 'room' check (kind in ('room', 'shared')),
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index locations_job_label on public.locations (job_id, lower(label));
create index locations_job_order on public.locations (job_id, sort_order);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  active boolean not null default true
);
create unique index trades_name on public.trades (lower(name));

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  name text not null check (btrim(name) <> ''),
  default_trade_id uuid references public.trades (id),
  phone text,
  email text,
  active boolean not null default true
);
create unique index companies_name on public.companies (lower(name));

create table public.job_companies (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  company_id uuid not null references public.companies (id),
  trade_id uuid not null references public.trades (id),
  unique (job_id, company_id, trade_id)
);

create table public.job_waiting_on (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  label text not null check (btrim(label) <> ''),
  sort_order integer not null default 0
);
create unique index job_waiting_on_label on public.job_waiting_on (job_id, lower(label));

-- ---------- items ----------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  location_id uuid not null references public.locations (id),
  number integer,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '',
  trade_id uuid not null references public.trades (id),
  company_id uuid not null references public.companies (id),
  kind text not null default 'deficiency' check (kind in ('deficiency', 'added_scope')),
  ready boolean not null default false,
  waiting_on text,
  ready_by date,
  bought_out boolean not null default false,
  po_or_co text,
  status text not null default 'open' check (status in ('open', 'complete', 'removed')),
  completed_by uuid references public.people (id),
  completed_at timestamptz,
  source text not null default 'typed' check (source in ('walk', 'typed', 'import')),
  bt_external_id text,
  created_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_not_ready_needs_waiting_on check (ready or nullif(btrim(waiting_on), '') is not null),
  constraint items_complete_records_who check (status <> 'complete' or (completed_by is not null and completed_at is not null)),
  constraint items_added_scope_bought_out_needs_po_or_co
    check (not (kind = 'added_scope' and bought_out and nullif(btrim(po_or_co), '') is null)),
  constraint items_number_unique unique (job_id, number)
);
create index items_job_location on public.items (job_id, location_id);

create table public.item_history (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  item_id uuid not null references public.items (id),
  job_id uuid not null references public.jobs (id),
  person_id uuid references public.people (id),
  field text not null,
  before text,
  after text,
  source text not null default 'app' check (source in ('app', 'import')),
  at timestamptz not null default now()
);
create index item_history_item on public.item_history (item_id, at);

create table public.title_library (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  title text not null check (char_length(btrim(title)) between 1 and 80),
  trade_id uuid references public.trades (id),
  uses integer not null default 0,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index title_library_title
  on public.title_library (lower(title), coalesce(trade_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------- what the database keeps itself ----------

create function public.items_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select l.job_id from public.locations l where l.id = new.location_id) is distinct from new.job_id then
    raise exception 'The room belongs to a different job' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    -- Job-wide numbers, assigned once, in the order items reach the server.
    update public.jobs set item_counter = item_counter + 1 where id = new.job_id
      returning item_counter into new.number;
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.created_at := coalesce(new.created_at, now());
  else
    new.number := old.number;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  -- Waiting On and Ready By only mean something while an item is not ready.
  if new.ready then
    new.waiting_on := null;
    new.ready_by := null;
  end if;

  -- Completion is stamped with the person who did it, never taken from the client.
  if new.status = 'complete' then
    if tg_op = 'INSERT' or old.status <> 'complete' then
      new.completed_by := coalesce(public.current_person_id(), new.completed_by);
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_by := old.completed_by;
      new.completed_at := old.completed_at;
    end if;
  else
    new.completed_by := null;
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();

create function public.items_never_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Items are never deleted; set the status to removed' using errcode = 'restrict_violation';
end $$;

create trigger items_never_delete before delete on public.items
  for each row execute function public.items_never_delete();

create function public.items_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text;
  o jsonb;
  n jsonb := to_jsonb(new);
  who uuid := coalesce(public.current_person_id(), new.created_by);
begin
  if tg_op = 'INSERT' then
    insert into public.item_history (item_id, job_id, person_id, field, before, after, source)
    values (new.id, new.job_id, who, 'created', null, new.title, case when new.source = 'import' then 'import' else 'app' end);
    return null;
  end if;
  o := to_jsonb(old);
  for k in select jsonb_object_keys(n) loop
    continue when k in ('id', 'job_id', 'created_at', 'created_by', 'updated_at');
    if (o -> k) is distinct from (n -> k) then
      insert into public.item_history (item_id, job_id, person_id, field, before, after)
      values (new.id, new.job_id, public.current_person_id(), k, o ->> k, n ->> k);
    end if;
  end loop;
  return null;
end $$;

create trigger items_after_write after insert or update on public.items
  for each row execute function public.items_after_write();

-- ---------- access rules ----------

alter table public.people enable row level security;
alter table public.jobs enable row level security;
alter table public.locations enable row level security;
alter table public.trades enable row level security;
alter table public.companies enable row level security;
alter table public.job_companies enable row level security;
alter table public.job_waiting_on enable row level security;
alter table public.items enable row level security;
alter table public.item_history enable row level security;
alter table public.title_library enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- People and history are read only from the app.
grant select on public.people, public.item_history to authenticated;
create policy people_read on public.people for select to authenticated using (public.is_active_person());
create policy item_history_read on public.item_history for select to authenticated using (public.is_active_person());

-- Jobs: the item counter belongs to the database.
grant select, insert on public.jobs to authenticated;
grant update (name, address, archived) on public.jobs to authenticated;
create policy jobs_read on public.jobs for select to authenticated using (public.is_active_person());
create policy jobs_insert on public.jobs for insert to authenticated with check (public.is_active_person());
create policy jobs_update on public.jobs for update to authenticated using (public.is_active_person()) with check (public.is_active_person());

-- Setup tables and items: read, add and change. Rooms, companies and items are never deleted.
grant select, insert, update on public.locations, public.trades, public.companies, public.items to authenticated;
grant select, insert, update, delete on public.job_companies, public.job_waiting_on, public.title_library to authenticated;

create policy locations_read on public.locations for select to authenticated using (public.is_active_person());
create policy locations_insert on public.locations for insert to authenticated with check (public.is_active_person());
create policy locations_update on public.locations for update to authenticated using (public.is_active_person()) with check (public.is_active_person());

create policy trades_read on public.trades for select to authenticated using (public.is_active_person());
create policy trades_insert on public.trades for insert to authenticated with check (public.is_active_person());
create policy trades_update on public.trades for update to authenticated using (public.is_active_person()) with check (public.is_active_person());

create policy companies_read on public.companies for select to authenticated using (public.is_active_person());
create policy companies_insert on public.companies for insert to authenticated with check (public.is_active_person());
create policy companies_update on public.companies for update to authenticated using (public.is_active_person()) with check (public.is_active_person());

create policy items_read on public.items for select to authenticated using (public.is_active_person());
create policy items_insert on public.items for insert to authenticated with check (public.is_active_person());
create policy items_update on public.items for update to authenticated using (public.is_active_person()) with check (public.is_active_person());

create policy job_companies_read on public.job_companies for select to authenticated using (public.is_active_person());
create policy job_companies_insert on public.job_companies for insert to authenticated with check (public.is_active_person());
create policy job_companies_update on public.job_companies for update to authenticated using (public.is_active_person()) with check (public.is_active_person());
create policy job_companies_delete on public.job_companies for delete to authenticated using (public.is_active_person());

create policy job_waiting_on_read on public.job_waiting_on for select to authenticated using (public.is_active_person());
create policy job_waiting_on_insert on public.job_waiting_on for insert to authenticated with check (public.is_active_person());
create policy job_waiting_on_update on public.job_waiting_on for update to authenticated using (public.is_active_person()) with check (public.is_active_person());
create policy job_waiting_on_delete on public.job_waiting_on for delete to authenticated using (public.is_active_person());

create policy title_library_read on public.title_library for select to authenticated using (public.is_active_person());
create policy title_library_insert on public.title_library for insert to authenticated with check (public.is_active_person());
create policy title_library_update on public.title_library for update to authenticated using (public.is_active_person()) with check (public.is_active_person());
create policy title_library_delete on public.title_library for delete to authenticated using (public.is_active_person());
