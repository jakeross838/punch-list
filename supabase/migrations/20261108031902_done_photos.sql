-- Done photos: a photo of the finished work, taken by someone on the team or sent by the company
-- from its page as it marks the work done. It sits with the item's other photos, marked as a done
-- photo, so the work can be checked from the phone; Claude can compare it with the photo of the
-- problem.

alter table public.photos add column done boolean not null default false;

create or replace function public.photos_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select i.job_id from public.items i where i.id = new.item_id) is distinct from new.job_id then
      raise exception 'The photo belongs to an item on a different job' using errcode = 'check_violation';
    end if;
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.created_at := coalesce(new.created_at, now());
  else
    -- A photo stays with its item; only its marks, order, upload path and removed change, and a
    -- done photo stays one. Merging two items moves the photos to the one kept, on the same job.
    if not (coalesce(current_setting('punch.merging', true), '') = 'on'
            and (select i.job_id from public.items i where i.id = new.item_id) = old.job_id) then
      new.item_id := old.item_id;
    end if;
    new.job_id := old.job_id;
    new.width := old.width;
    new.height := old.height;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.done := old.done;
  end if;
  return new;
end $$;

-- Activity says when a photo is a done photo, and who sent it when a company did.
create or replace function public.photos_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb;
begin
  if tg_op = 'INSERT' then
    d := jsonb_build_object('photo_id', new.id);
    if new.done then
      d := d || jsonb_build_object('done', true);
    end if;
    if coalesce(current_setting('punch.from_company', true), '') = '1' then
      d := d || jsonb_build_object(
        'from_company', true,
        'company_id', (select i.company_id from public.items i where i.id = new.item_id),
        'author_name', nullif(btrim(coalesce(current_setting('punch.author_name', true), '')), '')
      );
    end if;
    perform public.log_activity(new.job_id, new.item_id, 'photo_added', d);
  elsif new.removed and not old.removed then
    perform public.log_activity(new.job_id, new.item_id, 'photo_removed', jsonb_build_object('photo_id', new.id));
  elsif new.marks is distinct from old.marks then
    perform public.log_activity(new.job_id, new.item_id, 'photo_marked', jsonb_build_object('photo_id', new.id));
  end if;
  return null;
end $$;

-- The company's page shows which photos are done photos.
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
          select jsonb_agg(jsonb_build_object('storage_path', p.storage_path, 'width', p.width, 'height', p.height, 'marks', p.marks, 'done', p.done) order by p.sort_order)
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

/**
 * From the company's page: a photo of the finished work, which the company-page function has put in
 * the item's own folder in storage. It goes on the item as a done photo, after the others. At most
 * ten done photos on an item.
 */
create function public.trade_add_photo(p_token text, p_item uuid, p_path text, p_width integer, p_height integer, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i public.items := public.trade_item(p_token, p_item);
  v_id uuid;
begin
  if p_path is null or p_path !~ ('^' || i.job_id::text || '/' || i.id::text || '/done-[0-9a-f-]{36}[.]jpg$') then
    raise exception 'That photo is not in the item''s folder' using errcode = 'check_violation';
  end if;
  if coalesce(p_width, 0) <= 0 or coalesce(p_height, 0) <= 0 or p_width > 12000 or p_height > 12000 then
    raise exception 'That photo has no size' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.photos p where p.item_id = i.id and p.done and not p.removed) >= 10 then
    raise exception 'That item has all the photos it can take' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('punch.from_company', '1', true);
  perform set_config('punch.author_name', coalesce(p_name, ''), true);
  insert into public.photos (job_id, item_id, storage_path, width, height, sort_order, done)
  values (i.job_id, i.id, p_path, p_width, p_height, coalesce((select max(p.sort_order) from public.photos p where p.item_id = i.id), 0) + 1, true)
  returning id into v_id;
  perform set_config('punch.from_company', '', true);
  perform set_config('punch.author_name', '', true);
  return v_id;
end $$;

/** From the company's page: the item's own folder in storage, once the link and the item check out. */
create function public.trade_photo_folder(p_token text, p_item uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  i public.items := public.trade_item(p_token, p_item);
begin
  return i.job_id::text || '/' || i.id::text;
end $$;

-- Only the company-page function, which runs with the service role, calls these.
revoke execute on function public.trade_add_photo(text, uuid, text, integer, integer, text), public.trade_photo_folder(text, uuid) from public, anon, authenticated;
grant execute on function public.trade_add_photo(text, uuid, text, integer, integer, text), public.trade_photo_folder(text, uuid) to service_role;
