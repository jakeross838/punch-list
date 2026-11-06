-- Walking a job right away, and putting a job away for good.
--
-- Anyone on a job adds the locations and the companies they walk with, without Job Setup first:
-- a room typed in while walking, a company picked or typed for an item. Changing or removing them
-- is still for an admin.
--
-- A company that started before sign up came with the standard trades gets them now, so there is a
-- trade for every company it adds.
--
-- An admin deletes a job: every item, photo, comment and record on it, for everyone. The app takes
-- the photos out of storage first.

drop policy locations_insert on public.locations;
create policy locations_insert on public.locations for insert to authenticated
  with check (public.can_see_job(job_id));

drop policy companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (org = (select public.current_org()));

drop policy job_companies_insert on public.job_companies;
create policy job_companies_insert on public.job_companies for insert to authenticated
  with check (public.can_see_job(job_id));

insert into public.trades (org, name, sort_order)
select o.id, t.name, t.n
from public.orgs o
cross join unnest(array[
  'Site Work', 'Concrete', 'Framing', 'Roofing', 'Windows and Doors', 'Plumbing', 'Electrical', 'HVAC',
  'Insulation', 'Drywall', 'Trim Carpentry', 'Cabinets', 'Countertops', 'Tile', 'Flooring', 'Painting',
  'Appliances', 'Landscaping', 'Cleaning'
]) with ordinality as t(name, n)
where not exists (select 1 from public.trades x where x.org = o.id);

/** Deletes a job and everything on it, for an admin at its company. Its photos leave storage first, from the app. */
create function public.delete_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete a job' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.jobs j where j.id = p_job and j.org = public.current_org()) then
    raise exception 'That job is not here anymore' using errcode = 'no_data_found';
  end if;
  perform set_config('punch.purging', 'on', true);
  -- Teams and companies on the job first: taking them off writes to the activity, which goes next.
  delete from public.job_team where job_id = p_job;
  delete from public.job_companies where job_id = p_job;
  delete from public.job_activity where job_id = p_job;
  delete from public.item_history where job_id = p_job;
  delete from public.comments where job_id = p_job;
  delete from public.list_sends where job_id = p_job;
  delete from public.company_links where job_id = p_job;
  delete from public.photos where job_id = p_job;
  delete from public.items where job_id = p_job;
  delete from public.visits where job_id = p_job;
  delete from public.plan_sheets where job_id = p_job;
  delete from public.job_waiting_on where job_id = p_job;
  delete from public.locations where job_id = p_job;
  delete from public.job_access where job_id = p_job;
  delete from public.job_activity where job_id = p_job;
  delete from public.jobs where id = p_job;
  perform set_config('punch.purging', '', true);
end $$;
revoke execute on function public.delete_job(uuid) from public, anon;
grant execute on function public.delete_job(uuid) to authenticated;
