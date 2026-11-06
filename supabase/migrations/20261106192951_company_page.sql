-- The company's page: the private link on every list a company gets, opened with no account. It
-- shows the company its open items on the job with their marked up photos, whether each is ready
-- or what it waits on and when it should be ready, and what was checked off lately. On each item
-- the company confirms it (the item turns green in the app), says how long it takes, marks it done
-- (it waits for the builder to check it) and comments, under the name typed once on the page.
--
-- The page talks to the database only through the company-page function, which checks the link
-- and signs the photos. The functions here are for that function alone, never for the phones or
-- for anyone signed out.

alter table public.items add column confirmed_at timestamptz;

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
  'item_marked_done', 'plan_added', 'plan_removed',
  'item_confirmed', 'item_hours_given'
));

-- A confirmation is for the work as it was: the builder changing what it is, where, who does it,
-- when it is ready or how long it takes, or opening it again, takes it back. The company's own
-- answers leave it.
create function public.items_confirmation_follows() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.confirmed_at is not null and new.confirmed_at is not null
    and coalesce(current_setting('punch.from_company', true), '') <> '1'
    and (
      new.title is distinct from old.title or new.description is distinct from old.description
      or new.location_id is distinct from old.location_id or new.company_id is distinct from old.company_id
      or new.ready_by is distinct from old.ready_by or new.hours is distinct from old.hours
      or (new.status = 'open' and old.status <> 'open')
    )
  then
    new.confirmed_at := null;
  end if;
  return new;
end $$;
create trigger items_confirmation_follows before update on public.items
  for each row execute function public.items_confirmation_follows();
revoke execute on function public.items_confirmation_follows() from public, anon, authenticated;

/** The link, if it still works, and the item on its list: open, finished, the company's. */
create function public.trade_item(p_token text, p_item uuid) returns public.items
language plpgsql stable security definer set search_path = public as $$
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
  return i;
end $$;

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
    'builder', (select o.name from public.orgs o where o.id = l.org),
    'job', (select jsonb_build_object('name', j.name, 'address', j.address, 'closed', j.archived) from public.jobs j where j.id = l.job_id),
    'company', (select jsonb_build_object('id', c.id, 'name', c.name) from public.companies c where c.id = l.company_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'title', i.title, 'description', i.description,
        'location', lo.label, 'floor', lo.floor, 'kind', i.kind, 'ready', i.ready,
        'waiting_on', i.waiting_on, 'ready_by', i.ready_by, 'hours', i.hours, 'priority', i.priority,
        'po_or_co', i.po_or_co, 'checklist', i.checklist,
        'confirmed_at', i.confirmed_at, 'marked_done_at', i.marked_done_at,
        'waiting_for', coalesce((
          select jsonb_agg(jsonb_build_object('title', b.title, 'company', bc.name, 'location', bl.label) order by u.o)
          from unnest(i.waiting_on_items) with ordinality as u(w, o)
          join public.items b on b.id = u.w and b.status = 'open'
          left join public.companies bc on bc.id = b.company_id
          left join public.locations bl on bl.id = b.location_id
        ), '[]'::jsonb),
        'photos', coalesce((
          select jsonb_agg(jsonb_build_object('storage_path', p.storage_path, 'width', p.width, 'height', p.height, 'marks', p.marks) order by p.sort_order)
          from public.photos p where p.item_id = i.id and not p.removed and coalesce(p.storage_path, '') <> ''
        ), '[]'::jsonb),
        -- What finishing it frees up, for the order to do the work: every open item on the job that
        -- waits on it, down the chain, whoever does it, and their hours.
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
      where i.job_id = l.job_id and i.company_id = l.company_id and i.status = 'open' and not i.unfinished
    ), '[]'::jsonb),
    'completed', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'title', x.title, 'location', x.label, 'completed_at', x.completed_at) order by x.completed_at desc)
      from (
        select i.id, i.number, i.title, lo.label, i.completed_at
        from public.items i join public.locations lo on lo.id = i.location_id
        where i.job_id = l.job_id and i.company_id = l.company_id and i.status = 'complete' and i.completed_at > now() - interval '14 days'
        order by i.completed_at desc
        limit 50
      ) x
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

/** From the company's page: the item is theirs and right as it is (or, on second thought, not yet). */
create function public.trade_confirm(p_token text, p_item uuid, p_confirmed boolean, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  i public.items := public.trade_item(p_token, p_item);
  yes boolean := coalesce(p_confirmed, true);
begin
  if yes = (i.confirmed_at is not null) then
    return;
  end if;
  perform set_config('punch.from_company', '1', true);
  update public.items set confirmed_at = case when yes then now() else null end where id = i.id;
  perform set_config('punch.from_company', '', true);
  if yes then
    insert into public.job_activity (org, job_id, item_id, person_id, kind, detail)
    values (i.org, i.job_id, i.id, null, 'item_confirmed', jsonb_build_object(
      'company_id', i.company_id, 'from_company', true, 'author_name', nullif(btrim(coalesce(p_name, '')), '')
    ));
  end if;
end $$;

/** From the company's page: how long the work takes, to the quarter hour (or not known, cleared). */
create function public.trade_set_hours(p_token text, p_item uuid, p_hours numeric, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  i public.items := public.trade_item(p_token, p_item);
  h numeric := case when p_hours is null or p_hours <= 0 then null else least(200, greatest(0.25, round(p_hours * 4) / 4)) end;
begin
  if h is not distinct from i.hours then
    return;
  end if;
  perform set_config('punch.from_company', '1', true);
  update public.items set hours = h where id = i.id;
  perform set_config('punch.from_company', '', true);
  insert into public.job_activity (org, job_id, item_id, person_id, kind, detail)
  values (i.org, i.job_id, i.id, null, 'item_hours_given', jsonb_build_object(
    'company_id', i.company_id, 'from_company', true, 'author_name', nullif(btrim(coalesce(p_name, '')), ''), 'hours', h
  ));
end $$;

-- Only the company-page function, which runs with the service role, calls these.
revoke execute on function
  public.trade_item(text, uuid),
  public.trade_page(text),
  public.trade_comment(text, uuid, text, text),
  public.trade_mark_done(text, uuid, boolean, text),
  public.trade_confirm(text, uuid, boolean, text),
  public.trade_set_hours(text, uuid, numeric, text)
from public, anon, authenticated;
grant execute on function
  public.trade_page(text),
  public.trade_comment(text, uuid, text, text),
  public.trade_mark_done(text, uuid, boolean, text),
  public.trade_confirm(text, uuid, boolean, text),
  public.trade_set_hours(text, uuid, numeric, text)
to service_role;
