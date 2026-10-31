-- Activity: who did what on a job, for the job's Activity screen and each item's History. Item
-- changes are in item_history already, a row for each field; this keeps the rest: photos added,
-- marked up or removed, visits scheduled, changed or removed, lists sent or taken back, and job
-- setup (locations, companies, the job's name and address). Only the database writes it, stamped
-- with the signed-in person, and nobody changes or deletes it.

create table public.job_activity (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  item_id uuid references public.items (id),
  person_id uuid references public.people (id),
  kind text not null check (kind in (
    'photo_added', 'photo_marked', 'photo_removed',
    'visit_added', 'visit_changed', 'visit_removed',
    'list_sent', 'list_undone',
    'location_added', 'location_renamed', 'location_removed', 'location_restored',
    'company_added', 'company_renamed', 'company_trade_changed', 'company_removed',
    'job_renamed', 'job_address_changed'
  )),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  -- The moment it happened, so several things done at once keep their order.
  at timestamptz not null default clock_timestamp()
);
create index job_activity_job on public.job_activity (job_id, at);
create index job_activity_item on public.job_activity (item_id, at);

create function public.log_activity(p_job uuid, p_item uuid, p_kind text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.job_activity (org, job_id, item_id, person_id, kind, detail)
  select j.org, j.id, p_item, public.current_person_id(), p_kind, coalesce(p_detail, '{}'::jsonb)
  from public.jobs j where j.id = p_job;
$$;

create function public.job_activity_never_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Activity is never changed or deleted' using errcode = 'restrict_violation';
end $$;

create trigger job_activity_never_change before update or delete on public.job_activity
  for each row execute function public.job_activity_never_change();

-- ---------- photos ----------

create function public.photos_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.job_id, new.item_id, 'photo_added', jsonb_build_object('photo_id', new.id));
  elsif new.removed and not old.removed then
    perform public.log_activity(new.job_id, new.item_id, 'photo_removed', jsonb_build_object('photo_id', new.id));
  elsif new.marks is distinct from old.marks then
    perform public.log_activity(new.job_id, new.item_id, 'photo_marked', jsonb_build_object('photo_id', new.id));
  end if;
  return null;
end $$;

create trigger photos_activity after insert or update of marks, removed on public.photos
  for each row execute function public.photos_activity();

-- ---------- visits ----------

create function public.visits_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := jsonb_build_object('visit_id', new.id, 'company_id', new.company_id, 'start', new.start_date, 'days', new.days, 'confirmed', new.confirmed);
begin
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

create trigger visits_activity after insert or update of start_date, days, confirmed, removed on public.visits
  for each row execute function public.visits_activity();

-- ---------- lists sent ----------

create function public.list_sends_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.job_id, null, 'list_sent', jsonb_build_object('list', new.list, 'items', cardinality(new.item_ids)));
  elsif new.removed and not old.removed then
    perform public.log_activity(new.job_id, null, 'list_undone', jsonb_build_object('list', new.list));
  end if;
  return null;
end $$;

create trigger list_sends_activity after insert or update of removed on public.list_sends
  for each row execute function public.list_sends_activity();

-- ---------- job setup ----------

create function public.locations_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.job_id, null, 'location_added', jsonb_build_object('location_id', new.id, 'label', new.label));
    return null;
  end if;
  if new.label is distinct from old.label then
    perform public.log_activity(new.job_id, null, 'location_renamed', jsonb_build_object('location_id', new.id, 'from', old.label, 'to', new.label));
  end if;
  if new.active is distinct from old.active then
    perform public.log_activity(new.job_id, null, case when new.active then 'location_restored' else 'location_removed' end,
      jsonb_build_object('location_id', new.id, 'label', new.label));
  end if;
  return null;
end $$;

create trigger locations_activity after insert or update of label, active on public.locations
  for each row execute function public.locations_activity();

create function public.job_companies_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.job_id, null, 'company_added', jsonb_build_object('company_id', new.company_id, 'trade_id', new.trade_id));
  elsif tg_op = 'DELETE' then
    perform public.log_activity(old.job_id, null, 'company_removed', jsonb_build_object('company_id', old.company_id, 'trade_id', old.trade_id));
  elsif new.trade_id is distinct from old.trade_id then
    perform public.log_activity(new.job_id, null, 'company_trade_changed',
      jsonb_build_object('company_id', new.company_id, 'from', old.trade_id, 'to', new.trade_id));
  end if;
  return null;
end $$;

create trigger job_companies_activity after insert or delete or update of trade_id on public.job_companies
  for each row execute function public.job_companies_activity();

-- A company's name is the same on every job, so a new name shows on every job it is on.
create function public.companies_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    insert into public.job_activity (org, job_id, person_id, kind, detail)
    select j.org, j.id, public.current_person_id(), 'company_renamed', jsonb_build_object('company_id', new.id, 'from', old.name, 'to', new.name)
    from public.jobs j
    where j.id in (select jc.job_id from public.job_companies jc where jc.company_id = new.id);
  end if;
  return null;
end $$;

create trigger companies_activity after update of name on public.companies
  for each row execute function public.companies_activity();

create function public.jobs_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    perform public.log_activity(new.id, null, 'job_renamed', jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  if new.address is distinct from old.address then
    perform public.log_activity(new.id, null, 'job_address_changed', jsonb_build_object('from', old.address, 'to', new.address));
  end if;
  return null;
end $$;

create trigger jobs_activity after update of name, address on public.jobs
  for each row execute function public.jobs_activity();

-- ---------- access rules ----------

alter table public.job_activity enable row level security;
revoke all on public.job_activity from anon, authenticated;
grant select on public.job_activity to authenticated;
create policy job_activity_read on public.job_activity for select to authenticated using (public.is_active_person());
revoke all on function public.log_activity(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ---------- to the phones ----------

alter publication powersync add table public.job_activity;
