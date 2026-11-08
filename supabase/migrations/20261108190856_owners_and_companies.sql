-- Round 3: companies and owners.
--
-- The owner's page: one private link per job for the homeowner, like a company's. It shows the
-- job's progress location by location, what is done with its photos, what is left (titles only:
-- no companies, notes or prices), and what is waiting on the owner. The owner can add something
-- they want looked at, with a photo and a few words, which comes into the app as a draft from the
-- owner for the team to finish, and can sign off the job or a location under their name. Like the
-- station, the app makes the link through owner_link(), and the page reaches the database only
-- through the company-page function, as the service role, with the functions here.
--
-- A company's page in Spanish: a company can be set to Spanish, and its page shows its list and
-- the comments translated by Claude. Each sentence is translated once and kept here, for the
-- builder's company only, and what it cost counts against that company's allowance for Claude.
--
-- One link for all of a company's jobs: a company's page lists the builder's other jobs where the
-- company has open work and a link that works, so it can go from one to the next.

-- ---------- the owner's link ----------

create table public.owner_links (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  org text not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  -- Who it is for, as the team typed it ("Lisa and Mark Fish"), shown on the page.
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  created_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  revoked boolean not null default false,
  -- When the page last opened.
  opened_at timestamptz,
  -- 64 random hex characters, never something short enough to guess.
  constraint owner_links_token check (token ~ '^[0-9a-f]{64}$')
);
create unique index owner_links_live on public.owner_links (job_id) where not revoked;

-- Nobody reads or writes it directly: the app goes through owner_link(), the page through the
-- company-page function.
alter table public.owner_links enable row level security;
revoke all on public.owner_links from public, anon, authenticated;

/**
 * For the app: the job's owner link, with who it is for and when it was last opened. get: the one
 * that works, or none. make: the one that works, or a new one. new: a new one, and the old one stops
 * working. off: none works. name: who it is for, kept on make and new, and changed with get when
 * given. Anyone who can see the job.
 */
create function public.owner_link(p_job uuid, p_action text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.owner_links;
  v_org text;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if p_action not in ('get', 'make', 'new', 'off') then
    raise exception 'Ask for get, make, new or off' using errcode = 'invalid_parameter_value';
  end if;
  if not public.is_active_person() or not public.can_see_job(p_job) then
    raise exception 'Only someone on the job can do that' using errcode = 'insufficient_privilege';
  end if;
  if v_name is not null then
    v_name := left(v_name, 80);
  end if;
  select j.org into v_org from public.jobs j where j.id = p_job;
  if p_action in ('new', 'off') then
    -- The name carries over to the new link unless a new one is given.
    select coalesce(v_name, o.name) into v_name from public.owner_links o where o.job_id = p_job and not o.revoked;
    update public.owner_links set revoked = true where job_id = p_job and not revoked;
    if p_action = 'off' then
      return null;
    end if;
  end if;
  select * into l from public.owner_links o where o.job_id = p_job and not o.revoked;
  if not found and p_action in ('make', 'new') then
    insert into public.owner_links (org, job_id, name, created_by) values (v_org, p_job, v_name, public.current_person_id()) returning * into l;
  elsif found and v_name is not null and v_name is distinct from l.name then
    update public.owner_links set name = v_name where token = l.token returning * into l;
  end if;
  if l.token is null then
    return null;
  end if;
  return jsonb_build_object('token', l.token, 'name', l.name, 'opened_at', l.opened_at);
end $$;
revoke execute on function public.owner_link(uuid, text, text) from public, anon;
grant execute on function public.owner_link(uuid, text, text) to authenticated;

-- ---------- what the owner adds, and signs off ----------

-- Something the owner added on their page: a draft from the owner, for the team to finish.
alter table public.items drop constraint items_source_check;
alter table public.items add constraint items_source_check check (source in ('walk', 'typed', 'import', 'copy', 'template', 'said', 'owner'));

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
  'item_confirmed', 'item_hours_given',
  'items_merged',
  'owner_item_added', 'owner_signed_off'
));

-- A photo the owner sent is said to be theirs in Activity, under the name typed on the page.
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
    elsif coalesce(current_setting('punch.from_owner', true), '') = '1' then
      d := d || jsonb_build_object('from_owner', true, 'author_name', nullif(btrim(coalesce(current_setting('punch.author_name', true), '')), ''));
    end if;
    perform public.log_activity(new.job_id, new.item_id, 'photo_added', d);
  elsif new.removed and not old.removed then
    perform public.log_activity(new.job_id, new.item_id, 'photo_removed', jsonb_build_object('photo_id', new.id));
  elsif new.marks is distinct from old.marks then
    perform public.log_activity(new.job_id, new.item_id, 'photo_marked', jsonb_build_object('photo_id', new.id));
  end if;
  return null;
end $$;

/** An owner's link that works, or an error the page shows. */
create function public.owner_link_of(p_token text) returns public.owner_links
language plpgsql stable security definer set search_path = public as $$
declare
  l public.owner_links;
begin
  select * into l from public.owner_links where token = p_token and not revoked;
  if not found then
    raise exception 'This link no longer works' using errcode = 'insufficient_privilege';
  end if;
  return l;
end $$;

/** Whether an item is waiting on the owner: Owner is one of what it waits on. */
create function public.waits_on_owner(p_waiting text[]) returns boolean
language sql immutable set search_path = public as $$
  select exists (select 1 from unnest(coalesce(p_waiting, '{}')) w where lower(btrim(w)) in ('owner', 'the owner', 'owners', 'homeowner', 'client'))
$$;

/**
 * The owner's page: the builder, the job and who the link is for; each location with its open
 * work (titles only) and what was finished in the last 30 days with its photos; what waits on the
 * owner; what the owner added and where each stands; and the sign offs. Null when the link does
 * not work. Opening it is noted, for the app to show when the owner last looked.
 */
create function public.owner_page(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.owner_links;
begin
  select * into l from public.owner_links where token = p_token and not revoked;
  if not found then
    return null;
  end if;
  -- Noted at most every ten minutes: the page asks again every minute it is open.
  update public.owner_links set opened_at = now() where token = l.token and (opened_at is null or opened_at < now() - interval '10 minutes');
  return jsonb_build_object(
    'builder', (select o.name from public.orgs o where o.id = l.org),
    'job', (select jsonb_build_object('name', j.name, 'address', j.address, 'closed', j.archived) from public.jobs j where j.id = l.job_id),
    'owner', l.name,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lo.id, 'label', lo.label, 'floor', lo.floor,
        'open', coalesce((
          select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'ready', i.ready, 'waits_on_owner', public.waits_on_owner(i.waiting_on)) order by i.priority desc, i.number)
          from public.items i
          where i.location_id = lo.id and i.status = 'open' and not i.unfinished
        ), '[]'::jsonb),
        'done', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', i.id, 'title', i.title, 'completed_at', i.completed_at,
            'photos', coalesce((
              select jsonb_agg(jsonb_build_object('storage_path', p.storage_path, 'width', p.width, 'height', p.height, 'marks', p.marks, 'done', p.done) order by p.done desc, p.sort_order desc)
              from public.photos p where p.item_id = i.id and not p.removed and coalesce(p.storage_path, '') <> ''
            ), '[]'::jsonb)
          ) order by i.completed_at desc)
          from public.items i
          where i.location_id = lo.id and i.status = 'complete' and i.completed_at > now() - interval '30 days'
        ), '[]'::jsonb)
      ) order by lo.sort_order)
      from public.locations lo
      where lo.job_id = l.job_id and lo.active
    ), '[]'::jsonb),
    -- What the owner added, newest first: received while the team fills it in, then on the list, then done.
    'added', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'words', i.description, 'title', case when i.unfinished then null else i.title end, 'location', lo.label,
        'status', case when i.status = 'complete' then 'done' when i.status = 'removed' then 'removed' when i.unfinished then 'received' else 'on_list' end,
        'created_at', i.created_at
      ) order by i.created_at desc)
      from public.items i left join public.locations lo on lo.id = i.location_id
      where i.job_id = l.job_id and i.source = 'owner'
    ), '[]'::jsonb),
    'sign_offs', coalesce((
      select jsonb_agg(jsonb_build_object('name', a.detail ->> 'author_name', 'location', a.detail ->> 'label', 'open', (a.detail ->> 'open')::integer, 'at', a.at) order by a.at desc)
      from public.job_activity a where a.job_id = l.job_id and a.kind = 'owner_signed_off'
    ), '[]'::jsonb)
  );
end $$;

/** The folder in storage for something the owner adds: the job's own. */
create function public.owner_photo_folder(p_token text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  l public.owner_links := public.owner_link_of(p_token);
begin
  return l.job_id::text;
end $$;

/**
 * Something the owner wants looked at: their words, where it is (a location on the job, or none),
 * and a photo the company-page function has put in the job's folder under the item's id. It comes
 * into the app as a draft from the owner, with no title or company yet, for the team to finish.
 * At most 30 a day on a job, so a link passed around cannot flood the list.
 */
create function public.owner_add_item(p_token text, p_item uuid, p_location uuid, p_words text, p_name text, p_path text, p_width integer, p_height integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.owner_links := public.owner_link_of(p_token);
  v_words text := btrim(regexp_replace(coalesce(p_words, ''), '[ \t]+', ' ', 'g'));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_words = '' and p_path is null then
    raise exception 'Say what to look at, or add a photo' using errcode = 'check_violation';
  end if;
  if char_length(v_words) > 1000 then
    raise exception 'That is more than this can take: say it in fewer words' using errcode = 'check_violation';
  end if;
  if p_location is not null and not exists (select 1 from public.locations lo where lo.id = p_location and lo.job_id = l.job_id and lo.active) then
    raise exception 'That place is not on this job' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.items i where i.job_id = l.job_id and i.source = 'owner' and i.created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is all that can be added today. Add the rest tomorrow, or call the builder' using errcode = 'insufficient_privilege';
  end if;
  if p_path is not null then
    if p_path !~ ('^' || l.job_id::text || '/' || p_item::text || '/owner-[0-9a-f-]{36}[.]jpg$') then
      raise exception 'That photo is not in the job''s folder' using errcode = 'check_violation';
    end if;
    if coalesce(p_width, 0) <= 0 or coalesce(p_height, 0) <= 0 or p_width > 12000 or p_height > 12000 then
      raise exception 'That photo has no size' using errcode = 'check_violation';
    end if;
  end if;
  -- Ready until the team says what it waits on, like a draft from a walk.
  insert into public.items (id, org, job_id, location_id, title, description, unfinished, source, ready)
  values (p_item, l.org, l.job_id, p_location, '', v_words, true, 'owner', true);
  insert into public.job_activity (org, job_id, item_id, person_id, kind, detail)
  values (l.org, l.job_id, p_item, null, 'owner_item_added', jsonb_build_object('from_owner', true, 'author_name', v_name));
  if p_path is not null then
    perform set_config('punch.from_owner', '1', true);
    perform set_config('punch.author_name', coalesce(v_name, ''), true);
    insert into public.photos (job_id, item_id, storage_path, width, height, sort_order)
    values (l.job_id, p_item, p_path, p_width, p_height, 1);
    perform set_config('punch.from_owner', '', true);
    perform set_config('punch.author_name', '', true);
  end if;
  return p_item;
end $$;

/**
 * The owner signs off the whole job, or one location, under their name: noted in Activity with how
 * many items were still open there, and shown on their page.
 */
create function public.owner_sign_off(p_token text, p_location uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.owner_links := public.owner_link_of(p_token);
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_label text;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Type your name to sign off' using errcode = 'check_violation';
  end if;
  if p_location is not null then
    select lo.label into v_label from public.locations lo where lo.id = p_location and lo.job_id = l.job_id and lo.active;
    if v_label is null then
      raise exception 'That place is not on this job' using errcode = 'insufficient_privilege';
    end if;
  end if;
  insert into public.job_activity (org, job_id, item_id, person_id, kind, detail)
  values (l.org, l.job_id, null, null, 'owner_signed_off', jsonb_build_object(
    'from_owner', true,
    'author_name', v_name,
    'location_id', p_location,
    'label', v_label,
    'open', (select count(*) from public.items i where i.job_id = l.job_id and i.status = 'open' and not i.unfinished and (p_location is null or i.location_id = p_location))
  ));
end $$;

-- Only the company-page function, which runs with the service role, calls these.
revoke execute on function public.owner_page(text), public.owner_photo_folder(text), public.owner_link_of(text),
  public.owner_add_item(text, uuid, uuid, text, text, text, integer, integer), public.owner_sign_off(text, uuid, text) from public, anon, authenticated;
grant execute on function public.owner_page(text), public.owner_photo_folder(text), public.owner_link_of(text),
  public.owner_add_item(text, uuid, uuid, text, text, text, integer, integer), public.owner_sign_off(text, uuid, text) to service_role;

-- ---------- a company's page in Spanish ----------

alter table public.companies add column language text not null default 'en' check (language in ('en', 'es'));

-- Each sentence translated once, for one builder's company: the page function keeps them here.
create table public.translations (
  org text not null references public.orgs (id) on delete cascade,
  lang text not null check (lang in ('es')),
  -- The text's SHA-256, in hex.
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null default now(),
  primary key (org, lang, source_hash)
);
alter table public.translations enable row level security;
revoke all on public.translations from public, anon, authenticated;
grant select, insert on public.translations to service_role;

/**
 * For the page function, which has no one signed in: a builder's company's allowance for Claude
 * this month, and what is used of it, in cents.
 */
create function public.org_ai_allowance(p_org text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'org', p_org,
    'limit_cents', coalesce((select l.monthly_cents from public.ai_limits l where l.org = p_org), 2500),
    'used_cents', coalesce((select sum(u.cost_cents) from public.ai_usage u where u.org = p_org and u.created_at >= date_trunc('month', now())), 0)
  )
  where exists (select 1 from public.orgs o where o.id = p_org)
$$;
revoke execute on function public.org_ai_allowance(text) from public, anon, authenticated;
grant execute on function public.org_ai_allowance(text) to service_role;

-- ---------- the company's page: its language, its other jobs, and when it last opened ----------

-- When the company last opened its list, for its report card and Nudge.
alter table public.company_links add column opened_at timestamptz;

create or replace function public.trade_page(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.company_links;
begin
  select * into l from public.company_links where token = p_token and not revoked;
  if not found then
    return null;
  end if;
  -- Noted at most every ten minutes: the page asks again every minute it is open.
  update public.company_links set opened_at = now() where token = l.token and (opened_at is null or opened_at < now() - interval '10 minutes');
  return jsonb_build_object(
    'builder', (select o.name from public.orgs o where o.id = l.org),
    'org', l.org,
    'job', (select jsonb_build_object('name', j.name, 'address', j.address, 'closed', j.archived) from public.jobs j where j.id = l.job_id),
    'company', (select jsonb_build_object('id', c.id, 'name', c.name, 'language', c.language) from public.companies c where c.id = l.company_id),
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
    ), '[]'::jsonb),
    -- The builder's other jobs where this company has open work and a link that works.
    'other_jobs', coalesce((
      select jsonb_agg(jsonb_build_object('name', j.name, 'address', j.address, 'token', ol.token, 'open', x.open) order by j.name)
      from public.company_links ol
      join public.jobs j on j.id = ol.job_id and not j.archived
      join lateral (
        select count(*) as open from public.items i
        where i.job_id = ol.job_id and i.company_id = ol.company_id and i.status = 'open' and not i.unfinished
      ) x on x.open > 0
      where ol.company_id = l.company_id and ol.org = l.org and ol.job_id <> l.job_id and not ol.revoked
    ), '[]'::jsonb)
  );
end $$;

-- A link is never changed, except to be taken back, and to note when it was last opened.
create or replace function public.company_links_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.revoked := false;
    new.opened_at := null;
    return new;
  end if;
  if (new.token, new.org, new.job_id, new.company_id, new.created_by, new.created_at) is distinct from
     (old.token, old.org, old.job_id, old.company_id, old.created_by, old.created_at) or (old.revoked and not new.revoked) then
    raise exception 'A link is never changed; take it back and make a new one' using errcode = 'restrict_violation';
  end if;
  -- Only the page notes when it was opened.
  if new.opened_at is distinct from old.opened_at and public.current_person_id() is not null then
    new.opened_at := old.opened_at;
  end if;
  return new;
end $$;

/** For the app: when each company last opened its list on a job, for its report card and Nudge. */
create function public.company_links_opened(p_job uuid) returns table (company_id uuid, opened_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.company_id, max(l.opened_at)
  from public.company_links l
  where l.job_id = p_job and public.is_active_person() and public.can_see_job(p_job)
  group by l.company_id
$$;
revoke execute on function public.company_links_opened(uuid) from public, anon;
grant execute on function public.company_links_opened(uuid) to authenticated;

