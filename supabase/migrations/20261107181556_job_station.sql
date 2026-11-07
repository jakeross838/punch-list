-- The job's station: one private link per job for a tablet or a TV in the house. It shows every
-- company with work on the job and how much of it is ready; a company taps its name for its own
-- list, in the order to do it, and answers there the same as on its own page: Confirm, how long it
-- takes, Mark Done and comments, under the name typed on the station. The TV shows the same board
-- in large type and keeps itself up to date.
--
-- The station opens a company's list through that company's own link (made if it has none yet), so
-- everything the company's page does and checks stays in one place, and the station never hands a
-- company's link to the screen. Only one station link works on a job at a time. Turned off, it stops
-- working; a new one can be made.

create table public.job_stations (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  org text not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  created_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  revoked boolean not null default false,
  -- 64 random hex characters, never something short enough to guess.
  constraint job_stations_token check (token ~ '^[0-9a-f]{64}$')
);
create unique index job_stations_live on public.job_stations (job_id) where not revoked;

-- Nobody reads or writes it directly: the app goes through job_station(), the station's page
-- through the company-page function.
alter table public.job_stations enable row level security;
revoke all on public.job_stations from public, anon, authenticated;

/**
 * For the app: the job's station link. get: the one that works, or none. make: the one that works,
 * or a new one. new: a new one, and the old one stops working. off: none works. Anyone who can see
 * the job, like a company's link.
 */
create function public.job_station(p_job uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  t text;
  v_org text;
begin
  if p_action not in ('get', 'make', 'new', 'off') then
    raise exception 'Ask for get, make, new or off' using errcode = 'invalid_parameter_value';
  end if;
  if not public.is_active_person() or not public.can_see_job(p_job) then
    raise exception 'Only someone on the job can do that' using errcode = 'insufficient_privilege';
  end if;
  select j.org into v_org from public.jobs j where j.id = p_job;
  if p_action in ('new', 'off') then
    update public.job_stations set revoked = true where job_id = p_job and not revoked;
    if p_action = 'off' then
      return null;
    end if;
  end if;
  select s.token into t from public.job_stations s where s.job_id = p_job and not s.revoked;
  if t is null and p_action in ('make', 'new') then
    insert into public.job_stations (org, job_id, created_by) values (v_org, p_job, public.current_person_id()) returning token into t;
  end if;
  return t;
end $$;
revoke execute on function public.job_station(uuid, text) from public, anon;
grant execute on function public.job_station(uuid, text) to authenticated;

/** The companies on a station's job: on the job in Job Setup, or with open work on it. */
create function public.station_companies(p_job uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select jc.company_id from public.job_companies jc where jc.job_id = p_job
  union
  select i.company_id from public.items i where i.job_id = p_job and i.company_id is not null and i.status = 'open' and not i.unfinished
$$;

/**
 * The station's board: the job, and each company with its open, finished items in short, with
 * what each frees up, so the screen numbers them in the same order as the company's own list.
 */
create function public.station_page(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.job_stations;
begin
  select * into s from public.job_stations where token = p_token and not revoked;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'builder', (select o.name from public.orgs o where o.id = s.org),
    'job', (select jsonb_build_object('name', j.name, 'address', j.address, 'closed', j.archived) from public.jobs j where j.id = s.job_id),
    'companies', coalesce((
      select jsonb_agg(x.c order by x.name)
      from (
        select co.name, jsonb_build_object(
          'id', co.id,
          'name', co.name,
          'trade', (
            select t.name from public.job_companies jc join public.trades t on t.id = jc.trade_id
            where jc.job_id = s.job_id and jc.company_id = co.id
            order by t.sort_order, lower(t.name) limit 1
          ),
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', i.id, 'number', i.number, 'title', i.title, 'location', lo.label, 'kind', i.kind,
              'ready', i.ready, 'ready_by', i.ready_by, 'hours', i.hours, 'priority', i.priority, 'po_or_co', i.po_or_co,
              'confirmed_at', i.confirmed_at, 'marked_done_at', i.marked_done_at,
              'holds_up', (
                with recursive after(id) as (
                  select w.id from public.items w
                  where w.job_id = i.job_id and w.status = 'open' and w.id <> i.id and i.id = any(w.waiting_on_items)
                  union
                  select w.id from public.items w join after a on a.id = any(w.waiting_on_items)
                  where w.job_id = i.job_id and w.status = 'open' and w.id <> i.id
                )
                select jsonb_build_object('items', count(*), 'hours', coalesce(sum(h.hours), 0))
                from after join public.items h on h.id = after.id
              )
            ) order by i.priority desc, lo.sort_order, i.number)
            from public.items i join public.locations lo on lo.id = i.location_id
            where i.job_id = s.job_id and i.company_id = co.id and i.status = 'open' and not i.unfinished
          ), '[]'::jsonb)
        ) as c
        from public.companies co
        where co.id in (select public.station_companies(s.job_id))
      ) x
    ), '[]'::jsonb)
  );
end $$;

/**
 * The station opens a company's list: that company's own link on the job, made if it has none yet.
 * Null when the station is turned off. A company not on the job is refused.
 */
create function public.station_company(p_token text, p_company uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  s public.job_stations;
  t text;
begin
  select * into s from public.job_stations where token = p_token and not revoked;
  if not found then
    return null;
  end if;
  if p_company is null or p_company not in (select public.station_companies(s.job_id)) then
    raise exception 'That company is not on this job' using errcode = 'insufficient_privilege';
  end if;
  select l.token into t from public.company_links l where l.job_id = s.job_id and l.company_id = p_company and not l.revoked;
  if t is null then
    insert into public.company_links (org, job_id, company_id) values (s.org, s.job_id, p_company) returning token into t;
  end if;
  return t;
end $$;

-- Only the company-page function, which runs with the service role, calls these.
revoke execute on function public.station_companies(uuid), public.station_page(text), public.station_company(text, uuid) from public, anon, authenticated;
grant execute on function public.station_page(text), public.station_company(text, uuid) to service_role;
