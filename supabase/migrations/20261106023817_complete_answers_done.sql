-- Completing an item answers the company's word that it is done, so the mark clears when the item
-- is completed, not when it is opened again. Undo after Complete then puts it back To Check as it
-- was: the app opens it again with the mark it had. An item completed and opened again later stays
-- answered. History leaves the mark out when the status changes in the same edit, since the status
-- already says what happened.

create or replace function public.items_reopened() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'complete' and old.status is distinct from 'complete' then
    new.marked_done_at := null;
  end if;
  if new.plan_id is null then
    new.pin_x := null;
    new.pin_y := null;
  elsif new.plan_id is distinct from old.plan_id
    and (select s.job_id from public.plan_sheets s where s.id = new.plan_id) is distinct from new.job_id then
    raise exception 'The plan belongs to a different job' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function public.items_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text;
  o jsonb;
  n jsonb := to_jsonb(new);
  who uuid := coalesce(public.current_person_id(), new.created_by);
begin
  if tg_op = 'INSERT' then
    insert into public.item_history (item_id, job_id, person_id, field, before, after, source)
    values (new.id, new.job_id, who, 'created', null, new.title, case when new.source = 'import' then 'import' else 'app' end);
    return null;
  end if;
  if coalesce(current_setting('punch.from_company', true), '') = '1' then
    return null;
  end if;
  o := to_jsonb(old);
  for k in select jsonb_object_keys(n) loop
    continue when k in ('id', 'job_id', 'created_at', 'created_by', 'updated_at', 'position', 'pin_x', 'pin_y');
    continue when k = 'marked_done_at' and (o ->> 'status') is distinct from (n ->> 'status');
    if (o -> k) is distinct from (n -> k) then
      insert into public.item_history (item_id, job_id, person_id, field, before, after)
      values (new.id, new.job_id, public.current_person_id(), k, o ->> k, n ->> k);
    end if;
  end loop;
  return null;
end $$;

-- Trigger functions are never called by anyone.
revoke execute on function public.items_reopened() from public, anon, authenticated;
