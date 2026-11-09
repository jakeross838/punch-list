-- Loads a list in the app's shape (what `npm run import:buildertrend` writes) into a job that is
-- already in the app: its locations, the trades and companies it uses, their people, and every item,
-- under the database's own rules. Nothing is changed in Buildertrend, and nothing already on the job
-- is changed or removed: a location, trade, company, person or item that is already there is left as
-- it is, so running it twice adds nothing the second time.
--
-- The list comes from the temporary import mailbox (`setup.md`, Fish from Buildertrend), put there
-- in base64 parts. The loader itself is a function in pg_temp: it is gone when the session ends.
--
--   psql -v job=<job id> -v me=<person id> -v trade_names='{"HVAC":"Air Conditioning"}' -f tools/load-import.sql
--
--   job           the job in the app to load into
--   me            someone at the builder: who completed what comes in complete, and who an Action
--                 Item goes to when nobody it is assigned to in Buildertrend is in the app
--   trade_names   the starter trades the list has its own word for: each is renamed to the list's
--                 word (only when the list uses that word and it is not a trade yet), so the same
--                 trade does not sit in the list under two names

create function pg_temp.load_import(p_job uuid, p_me uuid, p_trade_names jsonb, p_list jsonb) returns jsonb
language plpgsql as $load$
declare
  v_org text;
  v_base integer;
  v_n integer;
  v_renamed integer := 0;
  v_out jsonb := '{}'::jsonb;
  v_names text;
  r record;
begin
  if p_list is null or jsonb_typeof(p_list -> 'items') <> 'array' then
    raise exception 'There is no list to load';
  end if;
  select j.org into v_org from public.jobs j where j.id = p_job;
  if v_org is null then
    raise exception 'That job is not in the app';
  end if;
  if not exists (select 1 from public.people p where p.id = p_me and p.org = v_org and p.active) then
    raise exception 'That person is not at the job''s company';
  end if;
  -- Every company needs a trade to be on the job under.
  select string_agg(c.name, ', ') into v_names from jsonb_to_recordset(p_list -> 'companies') as c(name text, "tradeName" text) where c."tradeName" is null;
  if v_names is not null then
    raise exception 'These companies have no trade on any item: %', v_names;
  end if;

  -- Trades: the starter names the list has its own word for, then the ones that are missing.
  for r in select e.key as was, e.value as now from jsonb_each_text(coalesce(p_trade_names, '{}'::jsonb)) e loop
    update public.trades t set name = r.now
     where t.org = v_org and lower(t.name) = lower(r.was)
       and exists (select 1 from jsonb_array_elements_text(p_list -> 'trades') x(name) where lower(x.name) = lower(r.now))
       and not exists (select 1 from public.trades o where o.org = v_org and lower(o.name) = lower(r.now));
    get diagnostics v_n = row_count;
    v_renamed := v_renamed + v_n;
  end loop;
  select coalesce(max(t.sort_order), 0) into v_base from public.trades t where t.org = v_org;
  insert into public.trades (org, name, sort_order)
  select v_org, x.name, v_base + row_number() over (order by lower(x.name))
    from jsonb_array_elements_text(p_list -> 'trades') x(name)
   where not exists (select 1 from public.trades t where t.org = v_org and lower(t.name) = lower(x.name));
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('trades_renamed', v_renamed, 'trades_added', v_n);

  -- Locations, in the list's order after what the job already has. The areas every job starts with
  -- are already there and stay as they are.
  select coalesce(max(l.sort_order), 0) into v_base from public.locations l where l.job_id = p_job;
  insert into public.locations (org, job_id, name, number, label, floor, kind, sort_order)
  select v_org, p_job, l.name, l.number, l.label, l.floor, l.kind, v_base + l."sortOrder"
    from jsonb_to_recordset(p_list -> 'locations') as l(label text, name text, number text, floor text, kind text, "sortOrder" integer)
   where not exists (select 1 from public.locations x where x.job_id = p_job and lower(x.label) = lower(l.label))
   order by l."sortOrder";
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('locations_added', v_n);

  -- Companies, each with its own trade.
  insert into public.companies (org, name, default_trade_id)
  select v_org, c.name, (select t.id from public.trades t where t.org = v_org and lower(t.name) = lower(c."tradeName"))
    from jsonb_to_recordset(p_list -> 'companies') as c(name text, "tradeName" text)
   where not exists (select 1 from public.companies x where x.org = v_org and lower(x.name) = lower(c.name))
   order by lower(c.name);
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('companies_added', v_n);

  -- On the job, each under its own trade. One already on the job stays under the trade it has.
  insert into public.job_companies (org, job_id, company_id, trade_id)
  select v_org, p_job, c.id, t.id
    from jsonb_to_recordset(p_list -> 'companies') as own(name text, "tradeName" text)
    join public.companies c on c.org = v_org and lower(c.name) = lower(own.name)
    join public.trades t on t.org = v_org and lower(t.name) = lower(own."tradeName")
   where exists (select 1 from jsonb_array_elements(p_list -> 'items') i(v) where lower(i.v ->> 'companyName') = lower(own.name))
     and not exists (select 1 from public.job_companies x where x.job_id = p_job and x.company_id = c.id)
   order by lower(c.name);
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('companies_put_on_the_job', v_n);

  -- Their people, for a company that has nobody yet.
  insert into public.company_contacts (org, company_id, name, email, phone, gets_lists, sort_order)
  select v_org, c.id, k.name, k.email, k.phone, true, row_number() over (partition by c.id order by k.ord)
    from (
      select e.value ->> 'companyName' as company, coalesce(e.value ->> 'name', '') as name, e.value ->> 'email' as email, e.value ->> 'phone' as phone, e.ord
        from jsonb_array_elements(coalesce(p_list -> 'contacts', '[]'::jsonb)) with ordinality as e(value, ord)
    ) k
    join public.companies c on c.org = v_org and lower(c.name) = lower(k.company)
   where not exists (select 1 from public.company_contacts x where x.company_id = c.id)
   order by lower(c.name), k.ord;
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('people_added', v_n);

  -- The items, in the list's order (the walk order), so their numbers follow it. What is complete was
  -- completed by the builder; work its own company marked done comes in open, to check; an Action
  -- Item goes to the first person it is assigned to who is in the app.
  insert into public.items (
    org, job_id, location_id, title, description, trade_id, company_id, kind, ready, waiting_on, ready_by, po_or_co,
    status, completed_by, completed_at, marked_done_at, hours, priority, assigned_to, source, bt_external_id, created_at
  )
  select
    v_org, p_job, l.id, i.v ->> 'title', coalesce(i.v ->> 'description', ''), t.id, c.id, i.v ->> 'kind', (i.v ->> 'ready')::boolean,
    array(select jsonb_array_elements_text(i.v -> 'waitingOn')), (i.v ->> 'readyBy')::date, i.v ->> 'poOrCo',
    i.v ->> 'status',
    case when i.v ->> 'status' = 'complete' then p_me end,
    case when i.v ->> 'status' = 'complete' then coalesce((i.v ->> 'completedAt')::timestamptz, now()) end,
    (i.v ->> 'markedDoneAt')::timestamptz,
    (i.v ->> 'hours')::numeric,
    coalesce((i.v ->> 'priority')::boolean, false),
    case when (i.v ->> 'actionItem')::boolean and c.id is null then coalesce(
      (select p.id from public.people p
         join jsonb_array_elements_text(i.v -> 'assignedTo') with ordinality as a(name, ord) on lower(a.name) = lower(p.name)
        where p.org = v_org and p.active order by a.ord limit 1),
      p_me) end,
    'import', i.v ->> 'btExternalId',
    -- Open work is new to the app today: what it measures (how long a company takes to confirm) starts
    -- now. Done work keeps the day it went on the list in Buildertrend, so how long it took is real.
    case when i.v ->> 'status' = 'complete' or i.v ->> 'markedDoneAt' is not null
         then least((i.v ->> 'addedAt')::timestamptz, coalesce((i.v ->> 'completedAt')::timestamptz, (i.v ->> 'markedDoneAt')::timestamptz)) end
    from jsonb_array_elements(p_list -> 'items') with ordinality as i(v, ord)
    join public.locations l on l.job_id = p_job and lower(l.label) = lower(i.v ->> 'locationLabel')
    left join public.companies c on c.org = v_org and lower(c.name) = lower(i.v ->> 'companyName')
    -- The trade is the list's; the database keeps it only where the company is on the job under it,
    -- and otherwise gives the item its company's trade on the job.
    left join public.trades t on t.org = v_org and lower(t.name) = lower(i.v ->> 'tradeName')
   where not exists (select 1 from public.items x where x.job_id = p_job and x.bt_external_id = i.v ->> 'btExternalId')
   order by i.ord;
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('items_added', v_n, 'items_in_list', jsonb_array_length(p_list -> 'items'));

  -- Anything in the list that did not land: an item whose location is not on the job.
  select count(*) into v_n
    from jsonb_array_elements(p_list -> 'items') as i(v)
   where not exists (select 1 from public.items x where x.job_id = p_job and x.bt_external_id = i.v ->> 'btExternalId');
  if v_n > 0 then
    raise exception '% of the list''s items did not load', v_n;
  end if;
  return v_out;
end
$load$;

select pg_temp.load_import(
  :'job'::uuid,
  :'me'::uuid,
  :'trade_names'::jsonb,
  (select convert_from(decode(string_agg(m.body, '' order by m.part), 'base64'), 'UTF8')::jsonb from public.import_mailbox m where m.box = 'mapped')
) as loaded;
