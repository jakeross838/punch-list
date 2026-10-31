-- Comments: a back and forth on an item, or on a company's whole list on a job, between Ross Built
-- and the company doing the work. Ross Built writes from the app, stamped with whoever is signed in.
-- The company writes from the private page its list links to, with no account, under the name it
-- types: the page reaches the database only through trade_page and trade_comment, with the link's
-- token. A comment marked Ross Built only (internal) never reaches the company's page. Comments are
-- never deleted or changed: taking one back marks it removed, and only its writer can.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  -- The item it is on, or null for a comment on the company's whole list.
  item_id uuid references public.items (id),
  -- The company the conversation is with.
  company_id uuid references public.companies (id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  -- Who at Ross Built wrote it; null when the company did.
  person_id uuid references public.people (id),
  from_company boolean not null default false,
  -- The name the company's person typed on the page.
  author_name text check (author_name is null or char_length(btrim(author_name)) between 1 and 80),
  internal boolean not null default false,
  removed boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  constraint comments_about check (item_id is not null or company_id is not null),
  constraint comments_author check (from_company = (person_id is null)),
  constraint comments_company_shares check (not (from_company and internal)),
  constraint comments_company_named check (not from_company or company_id is not null)
);
create index comments_job on public.comments (job_id, created_at);
create index comments_item on public.comments (item_id, created_at);

-- Stamped with whoever is signed in. An item's comment is with the company doing the item, and the
-- item belongs to the job. After that a comment never changes, except to be taken back.
create function public.comments_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  item record;
begin
  if tg_op = 'INSERT' then
    if not new.from_company then
      new.person_id := public.current_person_id();
    end if;
    if new.item_id is not null then
      select i.job_id, i.company_id into item from public.items i where i.id = new.item_id;
      if item.job_id is distinct from new.job_id then
        raise exception 'The item belongs to a different job' using errcode = 'check_violation';
      end if;
      new.company_id := item.company_id;
    end if;
    new.body := btrim(new.body);
    new.author_name := nullif(btrim(coalesce(new.author_name, '')), '');
    new.removed := false;
    new.created_at := clock_timestamp();
    return new;
  end if;
  if (new.org, new.job_id, new.item_id, new.company_id, new.body, new.person_id, new.from_company, new.author_name, new.internal, new.created_at)
     is distinct from (old.org, old.job_id, old.item_id, old.company_id, old.body, old.person_id, old.from_company, old.author_name, old.internal, old.created_at) then
    raise exception 'A comment is never changed; take it back and write a new one' using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger comments_before_write before insert or update on public.comments
  for each row execute function public.comments_before_write();

create function public.comments_never_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Comments are never deleted; set removed' using errcode = 'restrict_violation';
end $$;

create trigger comments_never_delete before delete on public.comments
  for each row execute function public.comments_never_delete();

-- In the job's Activity: who commented on what (the company's name for its own).
alter table public.job_activity drop constraint job_activity_kind_check;
alter table public.job_activity add constraint job_activity_kind_check check (kind in (
  'photo_added', 'photo_marked', 'photo_removed',
  'visit_added', 'visit_changed', 'visit_removed',
  'list_sent', 'list_undone',
  'location_added', 'location_renamed', 'location_removed', 'location_restored',
  'company_added', 'company_renamed', 'company_trade_changed', 'company_removed',
  'job_renamed', 'job_address_changed',
  'comment_added'
));

-- Logged under the comment's own writer: the person, or nobody when the company wrote it.
create function public.comments_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.job_activity (org, job_id, item_id, person_id, kind, detail)
  values (new.org, new.job_id, new.item_id, new.person_id, 'comment_added', jsonb_build_object(
    'comment_id', new.id,
    'company_id', new.company_id,
    'from_company', new.from_company,
    'author_name', new.author_name,
    'internal', new.internal,
    'body', left(new.body, 200)
  ));
  return null;
end $$;

create trigger comments_activity after insert on public.comments
  for each row execute function public.comments_activity();

-- The log is the database's own: nobody calls it directly.
revoke execute on function public.log_activity(uuid, uuid, text, jsonb) from public, anon, authenticated;

alter table public.comments enable row level security;
grant select, insert on public.comments to authenticated;
grant update (removed) on public.comments to authenticated;
create policy comments_read on public.comments for select to authenticated using (public.is_active_person());
create policy comments_insert on public.comments for insert to authenticated with check (public.is_active_person() and not from_company);
create policy comments_update on public.comments for update to authenticated
  using (public.is_active_person() and person_id = public.current_person_id())
  with check (public.is_active_person() and person_id = public.current_person_id());

-- ---------- the company's private page ----------

-- One link for each company on each job, sent with its lists. A link that is taken back stops
-- working, and a new one can be made.
create table public.company_links (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  company_id uuid not null references public.companies (id),
  created_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  revoked boolean not null default false,
  -- 64 random hex characters, made here or on the phone; never something short enough to guess.
  constraint company_links_token check (token ~ '^[0-9a-f]{64}$')
);
create unique index company_links_live on public.company_links (job_id, company_id) where not revoked;

create function public.company_links_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.revoked := false;
    return new;
  end if;
  if (new.token, new.org, new.job_id, new.company_id, new.created_by, new.created_at) is distinct from
     (old.token, old.org, old.job_id, old.company_id, old.created_by, old.created_at) or (old.revoked and not new.revoked) then
    raise exception 'A link is never changed; take it back and make a new one' using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger company_links_before_write before insert or update on public.company_links
  for each row execute function public.company_links_before_write();

create function public.company_links_never_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Links are never deleted; set revoked' using errcode = 'restrict_violation';
end $$;

create trigger company_links_never_delete before delete on public.company_links
  for each row execute function public.company_links_never_delete();

alter table public.company_links enable row level security;
grant select, insert on public.company_links to authenticated;
grant update (revoked) on public.company_links to authenticated;
create policy company_links_read on public.company_links for select to authenticated using (public.is_active_person());
create policy company_links_insert on public.company_links for insert to authenticated with check (public.is_active_person());
create policy company_links_update on public.company_links for update to authenticated using (public.is_active_person()) with check (public.is_active_person());

-- What the company's page shows: the job, the company's open items on it with their locations and
-- photos, its visits, and the comments it may see. Null when the link does not work.
create function public.trade_page(p_token text) returns jsonb
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

-- A comment from the company's page: on one of its items, or on its whole list (no item).
create function public.trade_comment(p_token text, p_item uuid, p_body text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.company_links;
  made uuid;
begin
  select * into l from public.company_links where token = p_token and not revoked;
  if not found then
    raise exception 'This link no longer works' using errcode = 'insufficient_privilege';
  end if;
  if p_item is not null and not exists (
    select 1 from public.items i where i.id = p_item and i.job_id = l.job_id and i.company_id = l.company_id and i.status <> 'removed'
  ) then
    raise exception 'That item is not on this list' using errcode = 'insufficient_privilege';
  end if;
  insert into public.comments (org, job_id, item_id, company_id, body, from_company, author_name)
    values (l.org, l.job_id, p_item, l.company_id, p_body, true, p_name)
    returning id into made;
  return made;
end $$;

revoke execute on function public.trade_page(text), public.trade_comment(text, uuid, text, text) from public;
grant execute on function public.trade_page(text), public.trade_comment(text, uuid, text, text) to anon, authenticated;

alter publication powersync add table public.comments, public.company_links;
