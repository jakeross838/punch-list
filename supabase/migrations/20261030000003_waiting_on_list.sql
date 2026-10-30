-- Waiting On holds one thing or several: a not ready item can wait on a company, Ross Built, the
-- owner and the design team at once, and becomes ready when all of them are done. It is a list
-- now; an empty list means it waits on nothing.

alter table public.items drop constraint items_not_ready_needs_waiting_on;
alter table public.items alter column waiting_on type text[]
  using case when nullif(btrim(waiting_on), '') is null then '{}'::text[] else array[btrim(waiting_on)] end;
alter table public.items alter column waiting_on set default '{}';
update public.items set waiting_on = '{}' where waiting_on is null;
alter table public.items alter column waiting_on set not null;
alter table public.items add constraint items_not_ready_needs_waiting_on
  check (ready or cardinality(array_remove(waiting_on, '')) > 0);

-- The same rules as before, with Waiting On emptied rather than nulled once an item is ready.
create or replace function public.items_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select l.job_id from public.locations l where l.id = new.location_id) is distinct from new.job_id then
    raise exception 'The room belongs to a different job' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    -- Job-wide numbers, assigned once, in the order items reach the server.
    update public.jobs set item_counter = item_counter + 1 where id = new.job_id
      returning item_counter into new.number;
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.created_at := coalesce(new.created_at, now());
  else
    new.number := old.number;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  -- Waiting On and Ready By only mean something while an item is not ready.
  if new.ready then
    new.waiting_on := '{}';
    new.ready_by := null;
  end if;

  -- Completion is stamped with the person who did it, never taken from the client.
  if new.status = 'complete' then
    if tg_op = 'INSERT' or old.status <> 'complete' then
      new.completed_by := coalesce(public.current_person_id(), new.completed_by);
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_by := old.completed_by;
      new.completed_at := old.completed_at;
    end if;
  else
    new.completed_by := null;
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end $$;
