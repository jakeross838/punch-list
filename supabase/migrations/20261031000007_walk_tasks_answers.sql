-- The walk, the common tasks for each kind of room, and the company's answer on its dates.
--
-- The walk: Done Here marks a location walked, stamped with who and when, so the job shows how
-- many of its locations have been walked and the camera goes on to the next. Start a New Walk
-- clears them.
--
-- Common tasks: each standard title says which kinds of room it is common in, so a bathroom offers
-- Trim out toilet, Install faucet, Install shower trim and so on, to add with a tap.
--
-- The company's dates: from its own page, the company says a visit's dates work (the visit is
-- confirmed) or asks for other dates (the visit keeps its dates until Ross Built moves it, or
-- keeps them). Either way it is logged in the job's Activity under the name the company typed.

-- ---------- the walk ----------

alter table public.locations add column walked_at timestamptz;
alter table public.locations add column walked_by uuid references public.people (id);

create function public.locations_walked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.walked_at is distinct from old.walked_at then
    new.walked_by := case when new.walked_at is null then null else coalesce(public.current_person_id(), new.walked_by) end;
  else
    new.walked_by := old.walked_by;
  end if;
  return new;
end $$;

create trigger locations_walked before update on public.locations
  for each row execute function public.locations_walked();

-- ---------- common tasks ----------

alter table public.title_library add column rooms text[] not null default '{}';
alter table public.title_library add constraint title_library_rooms check (
  rooms <@ array['bathroom', 'kitchen', 'laundry', 'bedroom', 'closet', 'living', 'garage', 'outside']::text[]
);

-- The usual work for each kind of room, on the titles already in the library.
update public.title_library t set rooms = d.rooms
from (values
  ('trim out toilet', array['bathroom']),
  ('install toilet', array['bathroom']),
  ('install faucet', array['bathroom', 'kitchen', 'laundry']),
  ('install shower trim', array['bathroom']),
  ('install shower head', array['bathroom']),
  ('install shower glass', array['bathroom']),
  ('install towel bar', array['bathroom']),
  ('install toilet paper holder', array['bathroom']),
  ('install mirror', array['bathroom']),
  ('caulk tub surround', array['bathroom']),
  ('caulk shower corner', array['bathroom']),
  ('set vanity tops', array['bathroom']),
  ('install cabinet hardware', array['bathroom', 'kitchen', 'laundry']),
  ('adjust cabinet door', array['kitchen', 'bathroom']),
  ('install backsplash', array['kitchen']),
  ('seal countertop', array['kitchen']),
  ('install pendant lights', array['kitchen']),
  ('install appliances', array['kitchen']),
  ('install dryer vent cover', array['laundry']),
  ('install shelving', array['laundry', 'closet', 'garage']),
  ('install closet system', array['closet']),
  ('adjust closet door', array['closet', 'bedroom']),
  ('install door stop', array['bedroom', 'closet', 'living']),
  ('install light fixture', array['bedroom', 'closet', 'living', 'garage', 'outside', 'laundry']),
  ('install outlet cover', array['bedroom', 'living', 'kitchen', 'garage', 'outside']),
  ('install switch plate', array['bedroom', 'living', 'kitchen']),
  ('install smoke detector', array['bedroom', 'living']),
  ('install baseboard', array['bedroom', 'living']),
  ('touch up paint', array['bedroom', 'living', 'outside']),
  ('install garage door opener', array['garage']),
  ('install hose bib', array['outside']),
  ('clean windows', array['outside'])
) as d(title, rooms)
where lower(t.title) = d.title;

-- ---------- the company's answer on its dates ----------

alter table public.visits add column asked_start date;
alter table public.visits add column asked_days integer check (asked_days is null or asked_days > 0);
alter table public.visits add column asked_name text;
alter table public.visits add column asked_at timestamptz;

alter table public.job_activity drop constraint job_activity_kind_check;
alter table public.job_activity add constraint job_activity_kind_check check (kind in (
  'photo_added', 'photo_marked', 'photo_removed',
  'visit_added', 'visit_changed', 'visit_removed', 'visit_confirmed_by_company', 'visit_change_asked',
  'list_sent', 'list_undone',
  'location_added', 'location_renamed', 'location_removed', 'location_restored',
  'company_added', 'company_renamed', 'company_trade_changed', 'company_removed',
  'job_renamed', 'job_address_changed',
  'comment_added'
));

-- A change the company makes from its page is logged by the page's function, under its name.
create or replace function public.visits_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := jsonb_build_object('visit_id', new.id, 'company_id', new.company_id, 'start', new.start_date, 'days', new.days, 'confirmed', new.confirmed);
begin
  if coalesce(current_setting('punch.from_company', true), '') = '1' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.log_activity(new.job_id, null, 'visit_added', d);
  elsif new.removed and not old.removed then
    perform public.log_activity(new.job_id, null, 'visit_removed', d);
  elsif (new.start_date, new.days, new.confirmed) is distinct from (old.start_date, old.days, old.confirmed) then
    perform public.log_activity(new.job_id, null, 'visit_changed',
      d || jsonb_build_object('was_start', old.start_date, 'was_days', old.days, 'was_confirmed', old.confirmed));
  end if;
  return null;
end $$;

-- When Ross Built moves the visit or the company confirms it, what the company asked for is answered.
create function public.visits_answered() returns trigger
language plpgsql as $$
begin
  if (new.start_date, new.days) is distinct from (old.start_date, old.days) or (new.confirmed and not old.confirmed) then
    if coalesce(current_setting('punch.from_company', true), '') <> '1' or new.confirmed then
      new.asked_start := null;
      new.asked_days := null;
      new.asked_name := null;
      new.asked_at := null;
    end if;
  end if;
  return new;
end $$;

create trigger visits_answered before update on public.visits
  for each row execute function public.visits_answered();

-- The company's page: its visits say what it asked for.
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
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'start', v.start_date, 'days', v.days, 'confirmed', v.confirmed,
        'asked_start', v.asked_start, 'asked_days', v.asked_days
      ) order by v.start_date)
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

-- From the company's page: these dates work. The visit is confirmed.
create function public.trade_confirm_visit(p_token text, p_visit uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.company_links;
  v public.visits;
begin
  select * into l from public.company_links where token = p_token and not revoked;
  if not found then
    raise exception 'This link no longer works' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.visits where id = p_visit and job_id = l.job_id and company_id = l.company_id and not removed;
  if not found then
    raise exception 'That visit is not on this list' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('punch.from_company', '1', true);
  update public.visits set confirmed = true where id = v.id;
  perform set_config('punch.from_company', '', true);
  insert into public.job_activity (org, job_id, item_id, person_id, kind, detail)
  values (l.org, l.job_id, null, null, 'visit_confirmed_by_company', jsonb_build_object(
    'visit_id', v.id, 'company_id', v.company_id, 'start', v.start_date, 'days', v.days, 'confirmed', true,
    'from_company', true, 'author_name', nullif(btrim(coalesce(p_name, '')), '')
  ));
end $$;

-- From the company's page: other dates. The visit keeps its dates until Ross Built moves it.
create function public.trade_ask_visit(p_token text, p_visit uuid, p_start date, p_days integer, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.company_links;
  v public.visits;
begin
  select * into l from public.company_links where token = p_token and not revoked;
  if not found then
    raise exception 'This link no longer works' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.visits where id = p_visit and job_id = l.job_id and company_id = l.company_id and not removed;
  if not found then
    raise exception 'That visit is not on this list' using errcode = 'insufficient_privilege';
  end if;
  if p_start is null or coalesce(p_days, 0) < 1 then
    raise exception 'Pick the first day and how many days' using errcode = 'check_violation';
  end if;
  perform set_config('punch.from_company', '1', true);
  update public.visits
    set asked_start = p_start, asked_days = p_days, asked_name = nullif(btrim(coalesce(p_name, '')), ''), asked_at = now(), confirmed = false
    where id = v.id;
  perform set_config('punch.from_company', '', true);
  insert into public.job_activity (org, job_id, item_id, person_id, kind, detail)
  values (l.org, l.job_id, null, null, 'visit_change_asked', jsonb_build_object(
    'visit_id', v.id, 'company_id', v.company_id, 'start', p_start, 'days', p_days,
    'was_start', v.start_date, 'was_days', v.days,
    'from_company', true, 'author_name', nullif(btrim(coalesce(p_name, '')), '')
  ));
end $$;

revoke execute on function public.trade_confirm_visit(text, uuid, text), public.trade_ask_visit(text, uuid, date, integer, text) from public;
grant execute on function public.trade_confirm_visit(text, uuid, text), public.trade_ask_visit(text, uuid, date, integer, text) to anon, authenticated;
