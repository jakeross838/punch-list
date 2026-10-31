-- A photo saves the moment it is taken, even before a location is picked: a draft may wait for its
-- location, as it waits for its title and company. A finished item needs its location.

alter table public.items alter column location_id drop not null;
alter table public.items add constraint items_finished_has_location check (unfinished or location_id is not null);

create or replace function public.items_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.location_id is not null and (select l.job_id from public.locations l where l.id = new.location_id) is distinct from new.job_id then
    raise exception 'The location belongs to a different job' using errcode = 'check_violation';
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
