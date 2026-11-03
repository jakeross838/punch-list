-- What Supabase's security check asks for, with nothing changing in what anyone can do.
--
-- The functions that only stop a delete, and visits_answered, are fixed to the public schema like
-- every other function here.
--
-- Postgres runs a trigger function only as a trigger, never when someone calls it, so nobody needs
-- to call one: that is taken away from everyone but the owner. The checks the access rules use
-- (is_active_person, is_admin, can_see_job, current_person_id) stay callable by people signed in,
-- since the rules run as them, and no longer by anyone not signed in. The company page's four
-- functions stay open to it: the page has no account and works only with its link.

alter function public.items_never_delete() set search_path = public;
alter function public.photos_never_delete() set search_path = public;
alter function public.visits_never_delete() set search_path = public;
alter function public.list_sends_never_delete() set search_path = public;
alter function public.job_activity_never_change() set search_path = public;
alter function public.comments_never_delete() set search_path = public;
alter function public.company_links_never_delete() set search_path = public;
alter function public.people_never_delete() set search_path = public;
alter function public.templates_never_delete() set search_path = public;
alter function public.company_contacts_never_delete() set search_path = public;
alter function public.visits_answered() set search_path = public;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
    order by p.proname
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

revoke execute on function public.is_active_person(), public.is_admin(), public.can_see_job(uuid), public.current_person_id()
  from public, anon;
grant execute on function public.is_active_person(), public.is_admin(), public.can_see_job(uuid), public.current_person_id()
  to authenticated;
