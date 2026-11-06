-- The new trigger functions run only as triggers: nobody calls them. And the never delete checks get
-- a fixed search path, like every other function here.

revoke execute on function public.org_follows_job() from public, anon, authenticated;
revoke execute on function public.org_follows_person() from public, anon, authenticated;
revoke execute on function public.orgs_before_write() from public, anon, authenticated;

alter function public.comments_never_delete() set search_path = public;
alter function public.company_contacts_never_delete() set search_path = public;
alter function public.company_links_never_delete() set search_path = public;
alter function public.items_never_delete() set search_path = public;
alter function public.job_activity_never_change() set search_path = public;
alter function public.list_sends_never_delete() set search_path = public;
alter function public.people_never_delete() set search_path = public;
alter function public.photos_never_delete() set search_path = public;
alter function public.plan_sheets_never_delete() set search_path = public;
alter function public.templates_never_delete() set search_path = public;
alter function public.visits_never_delete() set search_path = public;
