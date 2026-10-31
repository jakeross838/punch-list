-- An item waits on the tasks that have to be done first, usually one: other items on the same job.
-- Waiting On (who) stays for what is not a task on the list: the owner, the design team, Ross
-- Built. An item never waits on itself, even by way of other items. When a task is done or removed,
-- what waited on it stops waiting on it, and an item with nothing left to wait on is ready.

alter table public.items add column waiting_on_items uuid[] not null default '{}';

alter table public.items drop constraint items_not_ready_needs_waiting_on;
alter table public.items add constraint items_not_ready_needs_waiting_on
  check (ready or cardinality(array_remove(waiting_on, '')) > 0 or cardinality(waiting_on_items) > 0);

create function public.items_waits_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A ready item waits on nothing.
  if new.ready then
    new.waiting_on_items := '{}';
    return new;
  end if;
  -- Each task once, in the order picked.
  new.waiting_on_items := coalesce((
    select array_agg(w order by o) from (
      select w, min(o) as o from unnest(new.waiting_on_items) with ordinality as u(w, o) group by w
    ) d
  ), '{}');
  if cardinality(new.waiting_on_items) = 0 then
    return new;
  end if;
  if new.id = any(new.waiting_on_items) then
    raise exception 'An item cannot wait on itself' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(new.waiting_on_items) as u(w)
    left join public.items i on i.id = u.w
    where i.id is null or i.job_id <> new.job_id
  ) then
    raise exception 'It can only wait on items on the same job' using errcode = 'check_violation';
  end if;
  -- Nothing it waits on may already wait on it, however far back.
  if exists (
    with recursive back(id) as (
      select unnest(new.waiting_on_items)
      union
      select unnest(i.waiting_on_items) from public.items i join back b on i.id = b.id where i.id <> new.id
    )
    select 1 from back where id = new.id
  ) then
    raise exception 'That would leave it waiting on itself' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger items_waits_check before insert or update of waiting_on_items, ready, job_id on public.items
  for each row execute function public.items_waits_check();

-- A task done or removed frees what waited on it: it comes off their lists (with any other task
-- already done), and an item with nothing left to wait on is ready. Logged under whoever finished
-- the task, like any change.
create function public.items_release() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.items i
  set waiting_on_items = r.rest,
      ready = cardinality(r.rest) = 0 and cardinality(array_remove(i.waiting_on, '')) = 0
  from (
    select x.id, coalesce((
      select array_agg(u.w order by u.o) from unnest(x.waiting_on_items) with ordinality as u(w, o)
      where u.w <> new.id and exists (select 1 from public.items t where t.id = u.w and t.status = 'open')
    ), '{}') as rest
    from public.items x
    where new.id = any(x.waiting_on_items) and x.status = 'open' and not x.ready
  ) r
  where i.id = r.id;
  return null;
end $$;

create trigger items_release after update of status on public.items
  for each row when (old.status = 'open' and new.status <> 'open')
  execute function public.items_release();

-- The company's page says what each item waits on: the tasks, with who is doing them and where.
create or replace function public.trade_page(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l public.company_links;
begin
  select * into l from public.company_links where token = p_token and not revoked;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'job', (select jsonb_build_object('name', j.name, 'address', j.address) from public.jobs j where j.id = l.job_id),
    'company', (select jsonb_build_object('id', c.id, 'name', c.name) from public.companies c where c.id = l.company_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'title', i.title, 'description', i.description,
        'location', lo.label, 'floor', lo.floor, 'kind', i.kind, 'ready', i.ready,
        'waiting_on', i.waiting_on, 'ready_by', i.ready_by, 'po_or_co', i.po_or_co,
        'visit_id', i.visit_id, 'hours', i.hours,
        'waiting_for', coalesce((
          select jsonb_agg(jsonb_build_object('title', b.title, 'company', bc.name, 'location', bl.label) order by u.o)
          from unnest(i.waiting_on_items) with ordinality as u(w, o)
          join public.items b on b.id = u.w and b.status = 'open'
          left join public.companies bc on bc.id = b.company_id
          left join public.locations bl on bl.id = b.location_id
        ), '[]'::jsonb),
        'photos', coalesce((
          select jsonb_agg(jsonb_build_object('storage_path', p.storage_path, 'width', p.width, 'height', p.height, 'marks', p.marks) order by p.sort_order)
          from public.photos p where p.item_id = i.id and not p.removed
        ), '[]'::jsonb)
      ) order by lo.sort_order, i.number)
      from public.items i join public.locations lo on lo.id = i.location_id
      where i.job_id = l.job_id and i.company_id = l.company_id and i.status = 'open' and not i.unfinished
    ), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'start', v.start_date, 'days', v.days, 'confirmed', v.confirmed) order by v.start_date)
      from public.visits v where v.job_id = l.job_id and v.company_id = l.company_id and not v.removed
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'item_id', m.item_id, 'body', m.body, 'from_company', m.from_company,
        'author', case when m.from_company then m.author_name else p.name end, 'created_at', m.created_at
      ) order by m.created_at)
      from public.comments m left join public.people p on p.id = m.person_id
      where m.job_id = l.job_id and m.company_id = l.company_id and not m.internal and not m.removed
    ), '[]'::jsonb)
  );
end $$;
