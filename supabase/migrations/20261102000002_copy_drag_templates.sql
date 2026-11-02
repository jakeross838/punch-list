-- Copy and paste, dragging a list into order, and templates for what always needs doing in a house.
--
-- Pasted items and items from a template are new items like any other, made on the phone with their
-- ids so copies can wait on each other; they say where they came from in source. An item dragged in
-- its list keeps where it was put in position. A template is a named list of tasks, each with where
-- it goes (the Whole House or another area every job has, or every location of a kind), its trade,
-- type and usual time, and the tasks in the template it waits on. Everyone reads the templates;
-- admins make and change them. Nothing is deleted: a template or a task is switched off instead.

-- ---------- where an item came from, and where it sits in its list ----------

alter table public.items drop constraint items_source_check;
alter table public.items add constraint items_source_check check (source in ('walk', 'typed', 'import', 'copy', 'template'));

-- Where someone dragged it in its location's list; null keeps number order.
alter table public.items add column position double precision;

-- Dragging a list into order is not worth a line in each item's History.
create or replace function public.items_after_write() returns trigger
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
    continue when k in ('id', 'job_id', 'created_at', 'created_by', 'updated_at', 'position');
    if (o -> k) is distinct from (n -> k) then
      insert into public.item_history (item_id, job_id, person_id, field, before, after)
      values (new.id, new.job_id, public.current_person_id(), k, o ->> k, n ->> k);
    end if;
  end loop;
  return null;
end $$;

-- ---------- templates ----------

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  name text not null check (char_length(btrim(name)) between 1 and 60),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index templates_name on public.templates (org, lower(btrim(name))) where active;

create table public.template_items (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  template_id uuid not null references public.templates (id),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  kind text not null default 'completion' check (kind in ('deficiency', 'completion', 'added_scope')),
  trade_id uuid references public.trades (id),
  hours numeric(5, 2) check (hours is null or (hours > 0 and hours <= 200)),
  -- The Whole House or another area every job has, or every location of a kind.
  place text not null default 'Whole House' check (place in (
    'Whole House', 'North Elevation', 'South Elevation', 'East Elevation', 'West Elevation', 'Roof', 'Pool', 'Driveway', 'Site',
    'bathroom', 'kitchen', 'laundry', 'bedroom', 'closet', 'living', 'garage', 'outside'
  )),
  -- The tasks in the same template that have to be done first.
  waits_on uuid[] not null default '{}',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index template_items_template on public.template_items (template_id);

create function public.templates_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.org := old.org;
  end if;
  return new;
end $$;

create trigger templates_before_write before insert or update on public.templates
  for each row execute function public.templates_before_write();

-- A task stays in its template; it waits only on other tasks in that template, each once.
create function public.template_items_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.title := btrim(regexp_replace(new.title, '\s+', ' ', 'g'));
  new.description := btrim(new.description);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.org := coalesce((select t.org from public.templates t where t.id = new.template_id), new.org);
    new.created_at := now();
  else
    new.template_id := old.template_id;
    new.org := old.org;
    new.created_at := old.created_at;
  end if;
  new.waits_on := coalesce((
    select array_agg(w order by o) from (
      select w, min(o) as o from unnest(new.waits_on) with ordinality as u(w, o) group by w
    ) firsts where w <> new.id
  ), '{}');
  if exists (
    select 1 from unnest(new.waits_on) w
    where not exists (select 1 from public.template_items x where x.id = w and x.template_id = new.template_id)
  ) then
    raise exception 'A task in a template waits only on tasks in the same template' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger template_items_before_write before insert or update on public.template_items
  for each row execute function public.template_items_before_write();

create function public.templates_never_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Templates and their tasks are never deleted; switch them off' using errcode = 'restrict_violation';
end $$;

create trigger templates_never_delete before delete on public.templates
  for each row execute function public.templates_never_delete();
create trigger template_items_never_delete before delete on public.template_items
  for each row execute function public.templates_never_delete();

-- ---------- access rules: everyone at Ross Built reads them, admins change them ----------

alter table public.templates enable row level security;
alter table public.template_items enable row level security;

grant select, insert, update on public.templates, public.template_items to authenticated;

create policy templates_read on public.templates for select to authenticated using (public.is_active_person());
create policy templates_insert on public.templates for insert to authenticated with check (public.is_admin());
create policy templates_update on public.templates for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy template_items_read on public.template_items for select to authenticated using (public.is_active_person());
create policy template_items_insert on public.template_items for insert to authenticated with check (public.is_admin());
create policy template_items_update on public.template_items for update to authenticated using (public.is_admin()) with check (public.is_admin());

alter publication powersync add table public.templates, public.template_items;
