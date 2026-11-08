-- Claude's use, counted for each company, and two items merged into one.
--
-- Claude: every answer from Claude through the ai and read-plans functions is counted here, with
-- what it cost, by the functions as the service role. Each company has a monthly allowance (25
-- dollars unless the app's owner sets it otherwise); the functions stop asking once it is used. An
-- admin sees their own company's use. Nobody in the app writes to either table.
--
-- Say It: an item can come from what was said.
--
-- Merging: the same work written twice becomes one item. The one kept takes the other's photos and
-- comments, and the other is removed. Photos and comments otherwise never move between items.
--
-- Deleting a job: an admin may take the job's photos out of storage, not only the last person at
-- the company; the app does that just before it deletes the job.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  org text not null references public.orgs (id) on delete cascade,
  person_id uuid references public.people (id) on delete set null,
  task text not null check (char_length(task) between 1 and 40),
  model text not null check (char_length(model) between 1 and 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_cents numeric(12, 4) not null default 0 check (cost_cents >= 0),
  created_at timestamptz not null default now()
);
create index ai_usage_org_time on public.ai_usage (org, created_at);
alter table public.ai_usage enable row level security;
grant select on public.ai_usage to authenticated;
create policy ai_usage_read on public.ai_usage for select to authenticated
  using (org = (select public.current_org()) and public.is_admin());

/** A company's monthly allowance for Claude, when it is not the usual one. Set by the app's owner. */
create table public.ai_limits (
  org text primary key references public.orgs (id) on delete cascade,
  monthly_cents integer not null check (monthly_cents >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ai_limits enable row level security;
insert into public.ai_limits (org, monthly_cents) values ('ross_built', 20000) on conflict (org) do nothing;

/**
 * The signed-in person's company, who they are, the company's monthly allowance for Claude and
 * what it has used this month, in cents. Nothing for someone switched off.
 */
create function public.ai_allowance() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'org', x.o,
    'person_id', public.current_person_id(),
    'limit_cents', coalesce((select l.monthly_cents from public.ai_limits l where l.org = x.o), 2500),
    'used_cents', coalesce((select sum(u.cost_cents) from public.ai_usage u where u.org = x.o and u.created_at >= date_trunc('month', now())), 0)
  )
  from (select public.current_org() as o) x
  where public.is_active_person() and x.o is not null
$$;
revoke execute on function public.ai_allowance() from public, anon;
grant execute on function public.ai_allowance() to authenticated;

-- ---------- Say It ----------

-- Items said out loud and written down by Claude, as Say It makes them.
alter table public.items drop constraint items_source_check;
alter table public.items add constraint items_source_check check (source in ('walk', 'typed', 'import', 'copy', 'template', 'said'));

-- ---------- merging ----------

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
  'items_merged'
));

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
    -- A photo stays with its item; only its marks, order, upload path and removed change. Merging
    -- two items moves the photos to the one kept, on the same job.
    if not (coalesce(current_setting('punch.merging', true), '') = 'on'
            and (select i.job_id from public.items i where i.id = new.item_id) = old.job_id) then
      new.item_id := old.item_id;
    end if;
    new.job_id := old.job_id;
    new.width := old.width;
    new.height := old.height;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create or replace function public.comments_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  item record;
  v_moving boolean;
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
  -- Merging two items moves the comments to the one kept, on the same job; nothing else changes.
  v_moving := coalesce(current_setting('punch.merging', true), '') = 'on'
    and (select i.job_id from public.items i where i.id = new.item_id) = old.job_id;
  if (new.org, new.job_id, new.company_id, new.body, new.person_id, new.from_company, new.author_name, new.internal, new.created_at)
     is distinct from (old.org, old.job_id, old.company_id, old.body, old.person_id, old.from_company, old.author_name, old.internal, old.created_at)
     or (new.item_id is distinct from old.item_id and not coalesce(v_moving, false)) then
    raise exception 'A comment is never changed; take it back and write a new one' using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

/**
 * Two items that are the same work become one: the one kept takes the other's photos (after its
 * own) and comments, and the other is removed. Both on one job the person can see. Activity says
 * what was merged into what. Answers how many photos and comments came along.
 */
create function public.merge_items(p_keep uuid, p_merge uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_keep public.items;
  v_merge public.items;
  v_last integer;
  v_photos integer;
  v_comments integer;
  v_waiting uuid;
begin
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Pick two different items' using errcode = 'check_violation';
  end if;
  select * into v_keep from public.items where id = p_keep;
  select * into v_merge from public.items where id = p_merge;
  if v_keep.id is null or v_merge.id is null or not public.can_see_job(v_keep.job_id) or not public.can_see_job(v_merge.job_id) then
    raise exception 'Those items are not on a job of yours' using errcode = 'insufficient_privilege';
  end if;
  if v_keep.job_id <> v_merge.job_id then
    raise exception 'Both items have to be on the same job' using errcode = 'check_violation';
  end if;
  if v_keep.status = 'removed' or v_merge.status = 'removed' then
    raise exception 'One of those items was removed already' using errcode = 'check_violation';
  end if;
  select coalesce(max(sort_order), 0) into v_last from public.photos where item_id = p_keep;
  perform set_config('punch.merging', 'on', true);
  with ranked as (
    select p.id, row_number() over (order by p.sort_order, p.created_at, p.id) as n
    from public.photos p where p.item_id = p_merge and not p.removed
  ), moved as (
    update public.photos p set item_id = p_keep, sort_order = v_last + r.n from ranked r where p.id = r.id returning 1
  ) select count(*) into v_photos from moved;
  with moved as (
    update public.comments set item_id = p_keep where item_id = p_merge and not removed returning 1
  ) select count(*) into v_comments from moved;
  perform set_config('punch.merging', '', true);
  -- What waited on the merged item waits on the one kept, when that one is still open and that
  -- would not leave anything waiting on itself. Removing the merged item frees the rest, the kept
  -- one included, the usual way.
  if v_keep.status = 'open' then
    for v_waiting in
      select i.id from public.items i where p_merge = any(i.waiting_on_items) and i.id <> p_keep and i.status = 'open'
    loop
      begin
        update public.items set waiting_on_items = array_replace(waiting_on_items, p_merge, p_keep) where id = v_waiting;
      exception when check_violation then null;
      end;
    end loop;
  end if;
  update public.items set status = 'removed' where id = p_merge;
  perform public.log_activity(v_keep.job_id, p_keep, 'items_merged', jsonb_build_object(
    'from_id', p_merge, 'from_number', v_merge.number, 'from_title', v_merge.title,
    'into_number', v_keep.number, 'into_title', v_keep.title,
    'photos', v_photos, 'comments', v_comments));
  return jsonb_build_object('photos', v_photos, 'comments', v_comments);
end $$;
revoke execute on function public.merge_items(uuid, uuid) from public, anon;
grant execute on function public.merge_items(uuid, uuid) to authenticated;

-- ---------- a deleted job's photos ----------

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'No Supabase storage here: the photo rules are skipped';
    return;
  end if;
  execute 'drop policy if exists photos_bucket_delete on storage.objects';
  execute $p$
    create policy photos_bucket_delete on storage.objects for delete to authenticated
      using (bucket_id = 'photos' and (public.alone_in_company() or public.is_admin()) and public.can_see_job(public.job_of_path(name)))
  $p$;
end $$;
