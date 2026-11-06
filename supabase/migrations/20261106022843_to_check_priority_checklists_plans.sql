-- To Check, priority, checklists inside an item, and the job's plans to pin items on.
--
-- To Check: a company marks its work done from its own page (trade_mark_done). The item stays open
-- and shows To Check until someone at Ross Built looks: Complete checks it off, Not Done clears the
-- mark so it is back on the company's list. Only Ross Built completes an item. Reopening a completed
-- item clears the mark too.
--
-- Priority: wanted first. A checklist: the steps inside an item, each with its words and whether it
-- is done, kept as a list on the item. A plan sheet: a picture of one level's plan; an item pinned on
-- it keeps the sheet and the spot as fractions across and down. Sheets are never deleted: taking one
-- off sets removed, and its pins stay with their items.

-- ---------- the job's plans ----------

create table public.plan_sheets (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  -- The level it shows, as the locations name it: "Level 1".
  floor text not null default '' check (char_length(floor) <= 60),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Where the picture is in the photos bucket, once it is up.
  storage_path text,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sort_order integer not null default 0,
  removed boolean not null default false,
  created_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plan_sheets_job on public.plan_sheets (job_id, sort_order);

create function public.plan_sheets_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.created_at := coalesce(new.created_at, now());
  else
    new.job_id := old.job_id;
    new.org := old.org;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end $$;

create trigger plan_sheets_before_write before insert or update on public.plan_sheets
  for each row execute function public.plan_sheets_before_write();

create function public.plan_sheets_never_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Plans are never deleted; take them off instead' using errcode = 'restrict_violation';
end $$;

create trigger plan_sheets_never_delete before delete on public.plan_sheets
  for each row execute function public.plan_sheets_never_delete();

alter table public.job_activity drop constraint job_activity_kind_check;
alter table public.job_activity add constraint job_activity_kind_check check (kind in (
  'photo_added', 'photo_marked', 'photo_removed',
  'visit_added', 'visit_changed', 'visit_removed', 'visit_confirmed_by_company', 'visit_change_asked',
  'list_sent', 'list_undone',
  'location_added', 'location_renamed', 'location_removed', 'location_restored',
  'company_added', 'company_renamed', 'company_trade_changed', 'company_removed',
  'job_renamed', 'job_address_changed', 'job_closed', 'job_reopened',
  'team_added', 'team_changed', 'team_removed',
  'comment_added',
  'item_marked_done', 'plan_added', 'plan_removed'
));

create function public.plan_sheets_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.job_id, null, 'plan_added', jsonb_build_object('plan_id', new.id, 'name', new.name, 'floor', new.floor));
  elsif new.removed and not old.removed then
    perform public.log_activity(new.job_id, null, 'plan_removed', jsonb_build_object('plan_id', new.id, 'name', new.name, 'floor', new.floor));
  end if;
  return null;
end $$;

create trigger plan_sheets_activity after insert or update on public.plan_sheets
  for each row execute function public.plan_sheets_activity();

alter table public.plan_sheets enable row level security;
grant select, insert, update on public.plan_sheets to authenticated;
create policy plan_sheets_read on public.plan_sheets for select to authenticated using (public.can_see_job(job_id));
create policy plan_sheets_insert on public.plan_sheets for insert to authenticated with check (public.can_see_job(job_id));
create policy plan_sheets_update on public.plan_sheets for update to authenticated using (public.can_see_job(job_id)) with check (public.can_see_job(job_id));

alter publication powersync add table public.plan_sheets;

-- ---------- on each item ----------

alter table public.items add column marked_done_at timestamptz;
alter table public.items add column priority boolean not null default false;
alter table public.items add column checklist jsonb not null default '[]'::jsonb
  check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 50);
alter table public.items add column plan_id uuid references public.plan_sheets (id);
alter table public.items add column pin_x real check (pin_x is null or (pin_x >= 0 and pin_x <= 1));
alter table public.items add column pin_y real check (pin_y is null or (pin_y >= 0 and pin_y <= 1));

-- Opened again after it was completed: whatever the company said before is answered.
create function public.items_reopened() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'open' and old.status = 'complete' then
    new.marked_done_at := null;
  end if;
  if new.plan_id is null then
    new.pin_x := null;
    new.pin_y := null;
  elsif new.plan_id is distinct from old.plan_id
    and (select s.job_id from public.plan_sheets s where s.id = new.plan_id) is distinct from new.job_id then
    raise exception 'The plan belongs to a different job' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger items_reopened before update on public.items
  for each row execute function public.items_reopened();

-- The company's own answer is logged by its page's function, under its name, not as a change by
-- nobody.
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
  if coalesce(current_setting('punch.from_company', true), '') = '1' then
    return null;
  end if;
  o := to_jsonb(old);
  for k in select jsonb_object_keys(n) loop
    continue when k in ('id', 'job_id', 'created_at', 'created_by', 'updated_at', 'position', 'pin_x', 'pin_y');
    if (o -> k) is distinct from (n -> k) then
      insert into public.item_history (item_id, job_id, person_id, field, before, after)
      values (new.id, new.job_id, public.current_person_id(), k, o ->> k, n ->> k);
    end if;
  end loop;
  return null;
end $$;

-- ---------- the company's page ----------

-- Its items say whether it marked them done, and show their checklists.
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
        'marked_done_at', i.marked_done_at, 'priority', i.priority, 'checklist', i.checklist,
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
      ) order by i.priority desc, lo.sort_order, i.number)
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

-- From the company's page: this is done (or, on second thought, not yet). The item stays open, To
-- Check, until Ross Built looks.
create function public.trade_mark_done(p_token text, p_item uuid, p_done boolean, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.company_links;
  i public.items;
begin
  select * into l from public.company_links where token = p_token and not revoked;
  if not found then
    raise exception 'This link no longer works' using errcode = 'insufficient_privilege';
  end if;
  select * into i from public.items
    where id = p_item and job_id = l.job_id and company_id = l.company_id and status = 'open' and not unfinished;
  if not found then
    raise exception 'That item is not on this list' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_done, true) = (i.marked_done_at is not null) then
    return;
  end if;
  perform set_config('punch.from_company', '1', true);
  update public.items set marked_done_at = case when coalesce(p_done, true) then now() else null end where id = i.id;
  perform set_config('punch.from_company', '', true);
  if coalesce(p_done, true) then
    insert into public.job_activity (org, job_id, item_id, person_id, kind, detail)
    values (l.org, l.job_id, i.id, null, 'item_marked_done', jsonb_build_object(
      'company_id', i.company_id, 'from_company', true, 'author_name', nullif(btrim(coalesce(p_name, '')), '')
    ));
  end if;
end $$;

revoke execute on function public.trade_mark_done(text, uuid, boolean, text) from public;
grant execute on function public.trade_mark_done(text, uuid, boolean, text) to anon, authenticated;

-- Trigger functions are never called by anyone.
revoke execute on function public.plan_sheets_before_write(), public.plan_sheets_never_delete(),
  public.plan_sheets_activity(), public.items_reopened() from public, anon, authenticated;
