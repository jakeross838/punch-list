-- Database checks: the access rule and everything the database keeps itself.
-- Run by tools/db-test.sh on a fresh local Postgres. Any failed check stops the run.

insert into public.people (email, name) values ('jake@rossbuilt.com', 'Jake Ross'), ('former@rossbuilt.com', 'Former Employee');
update public.people set active = false where email = 'former@rossbuilt.com';

-- ---------- an active person ----------
set role authenticated;
set request.jwt.claims = '{"email":"JAKE@rossbuilt.com"}';

do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  j uuid; j2 uuid; loc uuid; loc2 uuid; t uuid; c uuid;
  a uuid; b uuid; na integer; nb integer;
  rec record;
begin
  insert into public.jobs (name, address) values ('Fish', '715 North Shore Drive') returning id into j;
  insert into public.locations (job_id, name, number, label, kind, sort_order)
    values (j, 'Kitchen', '109', 'Kitchen 109', 'room', 1) returning id into loc;
  insert into public.trades (name) values ('Plumbing') returning id into t;
  insert into public.companies (name, default_trade_id) values ('Gator Plumbing', t) returning id into c;
  insert into public.job_companies (job_id, company_id, trade_id) values (j, c, t);

  insert into public.items (job_id, location_id, title, trade_id, company_id, ready, bought_out)
    values (j, loc, 'Install toilet', t, c, true, true) returning id, number into a, na;
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready, waiting_on, ready_by, bought_out)
    values (j, loc, 'Set vanity top', t, c, false, 'Volcano Stone', '2026-11-02', true) returning id, number into b, nb;
  if na <> 1 or nb <> 2 then raise exception 'FAIL: item numbers should be 1 and 2, got % and %', na, nb; end if;
  if (select created_by from public.items where id = a) is distinct from jake then
    raise exception 'FAIL: created_by is not the signed-in person';
  end if;

  -- Not ready needs Waiting On.
  begin
    insert into public.items (job_id, location_id, title, trade_id, company_id, ready) values (j, loc, 'Hang door', t, c, false);
    raise exception 'FAIL: a not ready item with no Waiting On was accepted';
  exception when check_violation then null;
  end;

  -- Added scope is not Bought Out without a PO or CO.
  begin
    insert into public.items (job_id, location_id, title, trade_id, company_id, kind, ready, bought_out)
      values (j, loc, 'Add outlet', t, c, 'added_scope', true, true);
    raise exception 'FAIL: added scope was Bought Out with no PO or CO';
  exception when check_violation then null;
  end;

  -- A ready item drops Waiting On and Ready By.
  update public.items set ready = true where id = b;
  select waiting_on, ready_by into rec from public.items where id = b;
  if rec.waiting_on is not null or rec.ready_by is not null then raise exception 'FAIL: ready item kept Waiting On or Ready By'; end if;

  -- Completion is stamped with the signed-in person, and a client cannot rewrite it.
  update public.items set status = 'complete' where id = a;
  select completed_by, completed_at into rec from public.items where id = a;
  if rec.completed_by is distinct from jake or rec.completed_at is null then raise exception 'FAIL: completion not stamped'; end if;
  update public.items set completed_by = null, completed_at = '2001-01-01' where id = a;
  select completed_by, completed_at into rec from public.items where id = a;
  if rec.completed_by is distinct from jake or rec.completed_at < '2026-01-01' then raise exception 'FAIL: completion stamp was rewritten'; end if;

  -- Reopening clears it; numbers and creators never change.
  update public.items set status = 'open', number = 99, created_by = null where id = a;
  select status, completed_by, number, created_by into rec from public.items where id = a;
  if rec.status <> 'open' or rec.completed_by is not null then raise exception 'FAIL: reopen did not clear completion'; end if;
  if rec.number <> 1 or rec.created_by is distinct from jake then raise exception 'FAIL: number or creator changed'; end if;

  -- History, written by the database.
  if not exists (select 1 from public.item_history where item_id = a and field = 'created' and person_id = jake) then
    raise exception 'FAIL: no created entry in the history';
  end if;
  if not exists (select 1 from public.item_history where item_id = a and field = 'status' and before = 'open' and after = 'complete' and person_id = jake) then
    raise exception 'FAIL: the status change is not in the history';
  end if;
  if exists (select 1 from public.item_history where field in ('updated_at', 'created_at')) then
    raise exception 'FAIL: the history records bookkeeping columns';
  end if;

  -- An item cannot point at another job's room.
  insert into public.jobs (name) values ('Biales') returning id into j2;
  insert into public.locations (job_id, name, label, sort_order) values (j2, 'Garage', 'Garage', 1) returning id into loc2;
  begin
    insert into public.items (job_id, location_id, title, trade_id, company_id, ready, bought_out) values (j, loc2, 'Paint door', t, c, true, true);
    raise exception 'FAIL: an item was put in another job''s room';
  exception when check_violation then null;
  end;

  -- The app cannot delete items, touch the item counter, or add people.
  begin
    delete from public.items where id = a;
    raise exception 'FAIL: the app deleted an item';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.jobs set item_counter = 0 where id = j;
    raise exception 'FAIL: the app reset the item counter';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.people (email, name) values ('friend@example.com', 'Friend');
    raise exception 'FAIL: the app added a person';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ---------- someone who was never invited ----------
set role authenticated;
set request.jwt.claims = '{"email":"stranger@example.com"}';

do $$
begin
  if (select count(*) from public.jobs) + (select count(*) from public.items) + (select count(*) from public.people)
     + (select count(*) from public.locations) + (select count(*) from public.companies) + (select count(*) from public.trades)
     + (select count(*) from public.item_history) + (select count(*) from public.job_companies) <> 0 then
    raise exception 'FAIL: an uninvited account can see data';
  end if;
  begin
    insert into public.jobs (name) values ('Sneaky');
    raise exception 'FAIL: an uninvited account created a job';
  exception when insufficient_privilege then null;
  end;
  update public.items set title = 'Changed by a stranger';
end $$;

reset role;

-- ---------- a person who has been switched off ----------
set role authenticated;
set request.jwt.claims = '{"email":"former@rossbuilt.com"}';

do $$
begin
  if (select count(*) from public.items) <> 0 then raise exception 'FAIL: a switched off person can see items'; end if;
end $$;

reset role;

-- ---------- not signed in ----------
set role anon;
do $$
begin
  perform 1 from public.items;
  raise exception 'FAIL: anonymous access reached items';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ---------- the owner ----------
do $$
begin
  if exists (select 1 from public.items where title = 'Changed by a stranger') then
    raise exception 'FAIL: an uninvited account changed an item';
  end if;
  begin
    delete from public.items;
    raise exception 'FAIL: an item was deleted with full rights';
  exception when restrict_violation then null;
  end;
  if (select count(*) from public.items i join public.jobs j on j.id = i.job_id where j.name = 'Test Job (generated)') <> 600 then
    raise exception 'FAIL: the test job does not have 600 items';
  end if;
  if (select count(distinct number) from public.items i join public.jobs j on j.id = i.job_id where j.name = 'Test Job (generated)') <> 600 then
    raise exception 'FAIL: test job item numbers are not unique';
  end if;
end $$;

select 'All database checks passed' as result;
