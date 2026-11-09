-- Round 4: finding things, and being told.
--
-- A photo's words: Claude says what is in each photo in a few words once ("water stain on the ceiling
-- by the vent"), and search finds the item by them. The phone writes them on the photo like its marks.
--
-- Notifications: each phone that says yes gives its push token, kept here for the person signed in.
-- When a company marks work done, confirms it or comments from its page, the company-page function
-- asks push_targets for the phones of the people on that job's team and tells them through Expo's
-- push service.

alter table public.photos add column description text check (description is null or char_length(description) between 1 and 300);

-- ---------- the phones to tell ----------

create table public.push_tokens (
  -- Expo's token for the phone: ExponentPushToken[...].
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,80}\]$'),
  org text not null references public.orgs (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_person on public.push_tokens (person_id);
-- Nobody reads or writes it directly: the phone goes through save_push_token and drop_push_token,
-- the page function through push_targets.
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from public, anon, authenticated;
-- PowerSync's own role reads what it syncs to the phones; the phones' tokens are not that.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'powersync_role') then
    execute 'revoke all on public.push_tokens from powersync_role';
  end if;
end $$;

/** The phone signed in says yes to notifications: its token is kept for the person, moved from anyone who had it before. */
create function public.save_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_person uuid := public.current_person_id();
begin
  if v_person is null or not public.is_active_person() then
    raise exception 'Only someone switched on at a company can do that' using errcode = 'insufficient_privilege';
  end if;
  insert into public.push_tokens (token, org, person_id, platform, updated_at)
  values (p_token, public.current_org(), v_person, p_platform, now())
  on conflict (token) do update set org = excluded.org, person_id = excluded.person_id, platform = excluded.platform, updated_at = now();
end $$;

/** The phone signs out, or says no: its token goes. Only the person it belongs to can take it away. */
create function public.drop_push_token(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = p_token and person_id = public.current_person_id()
$$;

revoke execute on function public.save_push_token(text, text), public.drop_push_token(text) from public, anon;
grant execute on function public.save_push_token(text, text), public.drop_push_token(text) to authenticated;

/**
 * For the page function, once a company or the owner has answered through their link (a company's
 * link, which the job's station uses too, or the owner's): the phones to tell, with the job's id and
 * name. The job's team who are switched on; a job with nobody on its team tells the company's
 * admins, so someone always hears (a company of one has no teams). Nobody for a link taken back or
 * a job closed.
 */
create function public.push_targets(p_link text) returns table (token text, job_id uuid, job_name text)
language sql stable security definer set search_path = public as $$
  with link as (
    select l.job_id from public.company_links l where l.token = p_link and not l.revoked
    union all
    select l.job_id from public.owner_links l where l.token = p_link and not l.revoked
  ), job as (
    select j.id, j.org, j.name from public.jobs j where j.id = (select link.job_id from link limit 1) and not j.archived
  ), team as (
    select p.id from public.job_team m join job on job.id = m.job_id join public.people p on p.id = m.person_id and p.active
  ), who as (
    select team.id from team
    union
    select p.id from public.people p join job on p.org = job.org
    where p.active and p.role = 'admin' and not exists (select 1 from team)
  )
  select t.token, job.id, job.name from who join public.push_tokens t on t.person_id = who.id cross join job
$$;
revoke execute on function public.push_targets(text) from public, anon, authenticated;
grant execute on function public.push_targets(text) to service_role;

/** For the page function: Expo said a phone's token no longer works, so it goes. */
create function public.forget_push_tokens(p_tokens text[]) returns void
language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = any(p_tokens)
$$;
revoke execute on function public.forget_push_tokens(text[]) from public, anon, authenticated;
grant execute on function public.forget_push_tokens(text[]) to service_role;
