-- Assigned To: one field on an item for a company or someone on your own team. A company gets the
-- item on its list; someone on the team gets it on their My Items. Picking one clears the other in
-- the app; the two columns stay as they are, so a company's list, page and emails work as before.
--
-- An open item needs one or the other. A draft can wait for it, and work that is completed or
-- removed keeps its record even when the person it was assigned to leaves.

alter table public.items drop constraint items_finished_has_company;
alter table public.items add constraint items_open_is_assigned
  check (unfinished or status <> 'open' or company_id is not null or assigned_to is not null);

/**
 * Deletes the signed-in person's account. Their sign in goes, and their name, email and phone are
 * taken off what they did; the company keeps its records. Open work that was theirs alone, with no
 * company, goes back to Drafts to be assigned to someone else. The last one at a company takes the
 * whole company with it (the app deletes its photos first). An admin with people still at the
 * company makes someone else an admin first.
 */
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_me public.people;
  v_others integer;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  select * into v_me from public.people p where p.email = public.current_email();
  if found then
    select count(*) into v_others from public.people p where p.org = v_me.org and p.id <> v_me.id and p.active;
    if v_others = 0 then
      perform public.purge_company(v_me.org);
    else
      if v_me.active and v_me.role = 'admin' and not exists (
        select 1 from public.people p where p.org = v_me.org and p.id <> v_me.id and p.active and p.role = 'admin'
      ) then
        raise exception 'Make someone else an admin first: your company needs one' using errcode = 'check_violation';
      end if;
      update public.items
        set assigned_to = null, unfinished = unfinished or (status = 'open' and company_id is null)
        where assigned_to = v_me.id;
      delete from public.job_team where person_id = v_me.id;
      delete from public.person_settings where person_id = v_me.id;
      update public.people
        set active = false, role = 'team', name = 'Deleted Account', email = 'deleted-' || v_me.id || '@deleted.invalid', phone = null
        where id = v_me.id;
    end if;
  end if;
  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
