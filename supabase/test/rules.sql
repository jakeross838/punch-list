-- Database checks: the access rule and everything the database keeps itself.
-- Run by tools/db-test.sh on a fresh local Postgres. Any failed check stops the run.

insert into public.people (email, name) values
  ('jake@rossbuilt.com', 'Jake Ross'),
  ('andrew@rossbuilt.com', 'Andrew Ross'),
  ('former@rossbuilt.com', 'Former Employee');
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
    values (j, loc, 'Set vanity top', t, c, false, array['Volcano Stone', 'Owner'], '2026-11-02', true) returning id, number into b, nb;
  if na <> 1 or nb <> 2 then raise exception 'FAIL: item numbers should be 1 and 2, got % and %', na, nb; end if;
  if (select created_by from public.items where id = a) is distinct from jake then
    raise exception 'FAIL: created_by is not the signed-in person';
  end if;

  -- Not ready needs Waiting On: one thing or several, none of them blank.
  begin
    insert into public.items (job_id, location_id, title, trade_id, company_id, ready) values (j, loc, 'Hang door', t, c, false);
    raise exception 'FAIL: a not ready item with no Waiting On was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.items (job_id, location_id, title, trade_id, company_id, ready, waiting_on) values (j, loc, 'Hang door', t, c, false, array['']);
    raise exception 'FAIL: a not ready item waiting on a blank was accepted';
  exception when check_violation then null;
  end;

  -- Three types. Bought Out follows the type and the order number, whatever the client sends.
  declare
    x uuid;
  begin
    insert into public.items (job_id, location_id, title, trade_id, company_id, kind, ready, bought_out)
      values (j, loc, 'Add outlet', t, c, 'added_scope', true, true) returning id into x;
    if (select bought_out from public.items where id = x) then raise exception 'FAIL: additional work with no order number was Bought Out'; end if;
    update public.items set po_or_co = 'CO-14' where id = x;
    if not (select bought_out from public.items where id = x) then raise exception 'FAIL: additional work with an order number was not Bought Out'; end if;
    update public.items set kind = 'completion', po_or_co = null, bought_out = false where id = x;
    if not (select bought_out from public.items where id = x) then raise exception 'FAIL: completion work was not Bought Out'; end if;
    update public.items set status = 'removed' where id = x;
  end;
  begin
    insert into public.items (job_id, location_id, title, trade_id, company_id, kind, ready)
      values (j, loc, 'Add outlet', t, c, 'extra', true);
    raise exception 'FAIL: an unknown type was accepted';
  exception when check_violation then null;
  end;

  -- A ready item drops Waiting On and Ready By.
  update public.items set ready = true where id = b;
  select waiting_on, ready_by into rec from public.items where id = b;
  if cardinality(rec.waiting_on) > 0 or rec.ready_by is not null then raise exception 'FAIL: ready item kept Waiting On or Ready By'; end if;

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

-- ---------- capture: photos, added fields and settings ----------
do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  j uuid := (select id from public.jobs where name = 'Fish');
  j2 uuid := (select id from public.jobs where name = 'Biales');
  a uuid := (select i.id from public.items i where i.title = 'Install toilet' and i.job_id = (select id from public.jobs where name = 'Fish'));
  p uuid;
  rec record;
begin
  insert into public.photos (job_id, item_id, width, height, marks)
    values (j, a, 3024, 4032, '[{"tool":"circle","color":"red","from":[0.1,0.2],"to":[0.4,0.6]}]') returning id into p;
  if (select created_by from public.photos where id = p) is distinct from jake then
    raise exception 'FAIL: the photo creator was not stamped';
  end if;

  -- A photo cannot go on another job's item, and it stays with its item and its size.
  begin
    insert into public.photos (job_id, item_id, width, height) values (j2, a, 10, 10);
    raise exception 'FAIL: a photo was put on another job''s item';
  exception when check_violation then null;
  end;
  update public.photos set item_id = gen_random_uuid(), width = 1, marks = '[]', storage_path = 'fish/a.jpg' where id = p;
  select item_id, width, marks, storage_path into rec from public.photos where id = p;
  if rec.item_id <> a or rec.width <> 3024 then raise exception 'FAIL: a photo moved items or changed size'; end if;
  if rec.marks <> '[]'::jsonb or rec.storage_path <> 'fish/a.jpg' then raise exception 'FAIL: marks or the upload path did not save'; end if;

  -- Photos are never deleted.
  begin
    delete from public.photos where id = p;
    raise exception 'FAIL: the app deleted a photo';
  exception when insufficient_privilege then null;
  end;

  -- Added fields: a list needs its choices; the answers sit on the item, as an object.
  insert into public.custom_fields (label, kind, options) values ('Found By', 'list', '["Owner", "Architect", "Ross Built"]');
  begin
    insert into public.custom_fields (label, kind) values ('Empty List', 'list');
    raise exception 'FAIL: a list field with no choices was accepted';
  exception when check_violation then null;
  end;
  update public.items set extra = '{"found_by": "Owner"}' where id = a;
  begin
    update public.items set extra = '["Owner"]' where id = a;
    raise exception 'FAIL: item answers that are not an object were accepted';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.item_history where item_id = a and field = 'extra') then
    raise exception 'FAIL: a change to the added fields is not in the history';
  end if;

  -- Settings always belong to the person signed in, whatever the app sends.
  insert into public.person_settings (person_id, item_form, job_view)
    values (gen_random_uuid(), '{"hidden": ["poOrCo"]}', '{"groupBy": "trade"}');
  if (select person_id from public.person_settings) is distinct from jake then
    raise exception 'FAIL: settings were saved for someone else';
  end if;
end $$;

-- ---------- drafts, visits and lists sent ----------
do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  j uuid := (select id from public.jobs where name = 'Fish');
  loc uuid := (select l.id from public.locations l join public.jobs jb on jb.id = l.job_id where jb.name = 'Fish' limit 1);
  t uuid := (select id from public.trades where name = 'Plumbing');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  c2 uuid; d uuid; v uuid; v2 uuid; s uuid;
  rec record;
begin
  -- An unfinished item may wait for its title and company; a finished one may not. The trade is
  -- never asked for: it follows the company's trade on the job.
  insert into public.items (job_id, location_id, title, ready, unfinished) values (j, loc, '', true, true) returning id into d;
  begin
    insert into public.items (job_id, location_id, title, ready) values (j, loc, '', true);
    raise exception 'FAIL: a finished item with no title was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.items (job_id, location_id, title, ready) values (j, loc, 'Install vanity', true);
    raise exception 'FAIL: a finished item with no company was accepted';
  exception when check_violation then null;
  end;
  declare
    x uuid;
    paint uuid;
  begin
    insert into public.items (job_id, location_id, title, company_id, ready) values (j, loc, 'Install faucet', c, true) returning id into x;
    if (select trade_id from public.items where id = x) is distinct from t then
      raise exception 'FAIL: the trade did not follow the company on the job';
    end if;
    -- A trade the company does not do on the job is put right; another company brings its own.
    insert into public.trades (name, sort_order) values ('Wallcovering', 9) returning id into paint;
    update public.items set trade_id = paint where id = x;
    if (select trade_id from public.items where id = x) is distinct from t then
      raise exception 'FAIL: a trade the company does not do on the job was kept';
    end if;
    insert into public.companies (name, default_trade_id) values ('Bayside Wallcovering', paint) returning id into c2;
    update public.items set company_id = c2 where id = x;
    if (select trade_id from public.items where id = x) is distinct from paint then
      raise exception 'FAIL: a company not on the job did not bring its usual trade';
    end if;
    update public.items set status = 'removed' where id = x;
  end;
  -- A photo saves before a location is picked: a draft may wait for its location too.
  declare
    x uuid;
  begin
    insert into public.items (job_id, location_id, title, ready, unfinished) values (j, null, '', true, true) returning id into x;
    begin
      update public.items set title = 'Install mirror', company_id = c, unfinished = false where id = x;
      raise exception 'FAIL: a finished item with no location was accepted';
    exception when check_violation then null;
    end;
    update public.items set location_id = loc, title = 'Install mirror', company_id = c, unfinished = false where id = x;
    update public.items set status = 'removed' where id = x;
  end;
  -- Every other rule still holds: not ready needs Waiting On, and it cannot be completed.
  begin
    update public.items set ready = false where id = d;
    raise exception 'FAIL: an unfinished, not ready item with no Waiting On was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.items set status = 'complete' where id = d;
    raise exception 'FAIL: an unfinished item was completed';
  exception when check_violation then null;
  end;
  update public.items set title = 'Install vanity', trade_id = t, company_id = c, unfinished = false where id = d;

  -- Visits: stamped, kept to their job and company, never deleted.
  insert into public.visits (job_id, company_id, start_date, days) values (j, c, '2026-11-03', 2) returning id into v;
  if (select created_by from public.visits where id = v) is distinct from jake then
    raise exception 'FAIL: the visit creator was not stamped';
  end if;
  begin
    insert into public.visits (job_id, company_id, start_date, days) values (j, c, '2026-11-03', 0);
    raise exception 'FAIL: a visit of no days was accepted';
  exception when check_violation then null;
  end;
  update public.visits set company_id = gen_random_uuid(), confirmed = true, days = 3 where id = v;
  select company_id, confirmed, days into rec from public.visits where id = v;
  if rec.company_id <> c or not rec.confirmed or rec.days <> 3 then
    raise exception 'FAIL: a visit moved companies or its changes did not save';
  end if;
  update public.items set visit_id = v where id = d;
  insert into public.companies (name, default_trade_id) values ('LaPensee Plumbing', t) returning id into c2;
  insert into public.visits (job_id, company_id, start_date, days) values (j, c2, '2026-11-04', 1) returning id into v2;
  begin
    update public.items set visit_id = v2 where id = d;
    raise exception 'FAIL: an item went on another company''s visit';
  exception when check_violation then null;
  end;
  begin
    delete from public.visits where id = v;
    raise exception 'FAIL: the app deleted a visit';
  exception when insufficient_privilege then null;
  end;

  -- Lists sent: what went out stays as it went out; Undo only sets removed.
  insert into public.list_sends (job_id, list, item_ids) values (j, 'company:' || c, array[d]) returning id into s;
  update public.list_sends set item_ids = '{}', removed = true where id = s;
  select item_ids, removed, sent_by into rec from public.list_sends where id = s;
  if cardinality(rec.item_ids) <> 1 or not rec.removed or rec.sent_by is distinct from jake then
    raise exception 'FAIL: a sent list was changed or not stamped';
  end if;
  begin
    insert into public.list_sends (job_id, list) values (j, 'somewhere');
    raise exception 'FAIL: a send to an unknown list was accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------- activity: who did what ----------
do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  j uuid := (select id from public.jobs where name = 'Fish');
  t uuid := (select id from public.trades where name = 'Plumbing');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  loc uuid; i uuid; p uuid; v uuid; n integer;
begin
  -- Items: a row for adding one and a row for each field changed, each with who did it.
  insert into public.locations (job_id, name, number, label, kind, sort_order) values (j, 'Office', '302', 'Office 302', 'room', 9) returning id into loc;
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready) values (j, loc, 'Patch drywall', t, c, true) returning id into i;
  update public.items set description = 'Two screw holes.', ready = false, waiting_on = array['Owner'] where id = i;
  if (select count(*) from public.item_history where item_id = i and field = 'created' and person_id = jake) <> 1 then
    raise exception 'FAIL: adding an item was not logged with who did it';
  end if;
  if (select count(*) from public.item_history where item_id = i and field in ('description', 'ready', 'waiting_on') and person_id = jake) <> 3 then
    raise exception 'FAIL: item changes were not logged field by field';
  end if;

  -- Photos: added, marked up and removed. An upload finishing is not activity.
  insert into public.photos (job_id, item_id, width, height) values (j, i, 1200, 1600) returning id into p;
  update public.photos set marks = '[{"tool":"number","color":"red","at":[0.5,0.5],"n":1}]' where id = p;
  update public.photos set storage_path = 'fish/photo.jpg' where id = p;
  update public.photos set removed = true where id = p;
  select count(*) into n from public.job_activity where item_id = i and person_id = jake and kind in ('photo_added', 'photo_marked', 'photo_removed');
  if n <> 3 then raise exception 'FAIL: photo activity has % rows, not 3', n; end if;

  -- Visits: scheduled, confirmed and removed, keeping what changed. A note alone is not activity.
  insert into public.visits (job_id, company_id, start_date, days) values (j, c, '2026-11-10', 1) returning id into v;
  update public.visits set confirmed = true where id = v;
  update public.visits set note = 'Gate code at the office' where id = v;
  update public.visits set removed = true where id = v;
  if (select count(*) from public.job_activity where detail ->> 'visit_id' = v::text and person_id = jake) <> 3 then
    raise exception 'FAIL: visit activity was not logged';
  end if;
  if (select detail ->> 'was_confirmed' from public.job_activity where detail ->> 'visit_id' = v::text and kind = 'visit_changed') <> 'false' then
    raise exception 'FAIL: a visit change did not keep what it was before';
  end if;

  -- Lists sent and taken back (the list sent above).
  if (select count(*) from public.job_activity where job_id = j and kind = 'list_sent' and person_id = jake) <> 1
     or (select count(*) from public.job_activity where job_id = j and kind = 'list_undone') <> 1 then
    raise exception 'FAIL: sending and taking back a list was not logged';
  end if;

  -- Setup: a location renamed and removed, a company's name, the job's address.
  update public.locations set name = 'Home Office', label = 'Home Office 302' where id = loc;
  update public.locations set active = false where id = loc;
  update public.job_companies set trade_id = t where job_id = j and company_id = c;
  update public.companies set name = 'Gator Plumbing and Gas' where id = c;
  update public.jobs set address = '715 North Shore Drive, Anna Maria' where id = j;
  if (select count(*) from public.job_activity where detail ->> 'location_id' = loc::text and kind in ('location_added', 'location_renamed', 'location_removed')) <> 3 then
    raise exception 'FAIL: location activity was not logged';
  end if;
  if (select count(*) from public.job_activity where job_id = j and kind = 'company_trade_changed') <> 0 then
    raise exception 'FAIL: a trade that did not change was logged';
  end if;
  if (select detail ->> 'to' from public.job_activity where job_id = j and kind = 'company_renamed') <> 'Gator Plumbing and Gas' then
    raise exception 'FAIL: a company''s new name was not logged on its job';
  end if;
  if (select count(*) from public.job_activity where job_id = j and kind = 'job_address_changed' and person_id = jake) <> 1 then
    raise exception 'FAIL: the job''s new address was not logged';
  end if;
  update public.companies set name = 'Gator Plumbing' where id = c;

  -- The app only reads the log.
  begin
    insert into public.job_activity (job_id, kind) values (j, 'job_renamed');
    raise exception 'FAIL: the app wrote to the activity log';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.job_activity where job_id = j;
    raise exception 'FAIL: the app deleted activity';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- estimated time ----------
do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  j uuid := (select id from public.jobs where name = 'Fish');
  t uuid := (select id from public.trades where name = 'Plumbing');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  loc uuid := (select id from public.locations where job_id = j order by sort_order limit 1);
  i uuid;
begin
  -- An estimate in hours, changed like any field and logged with who changed it.
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready, hours) values (j, loc, 'Install hose bib', t, c, true, 1.5) returning id into i;
  update public.items set hours = 2 where id = i;
  if (select after from public.item_history where item_id = i and field = 'hours' and person_id = jake) is distinct from '2.00' then
    raise exception 'FAIL: an estimate change was not logged';
  end if;
  update public.items set hours = null where id = i;
  begin
    update public.items set hours = 0 where id = i;
    raise exception 'FAIL: an estimate of nothing was kept';
  exception when check_violation then null;
  end;
  begin
    update public.items set hours = 250 where id = i;
    raise exception 'FAIL: an estimate over 200 hours was kept';
  exception when check_violation then null;
  end;
  -- The standard titles keep how long the work usually takes.
  insert into public.title_library (title, trade_id, approved, hours) values ('Install hose bib', t, true, 1);
  if (select hours from public.title_library where title = 'Install hose bib') <> 1 then
    raise exception 'FAIL: a standard title did not keep its usual time';
  end if;
  begin
    update public.title_library set hours = -1 where title = 'Install hose bib';
    raise exception 'FAIL: a negative usual time was kept';
  exception when check_violation then null;
  end;
end $$;

-- ---------- waiting on other tasks ----------
do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  j uuid := (select id from public.jobs where name = 'Fish');
  j2 uuid := (select id from public.jobs where name = 'Biales');
  t uuid := (select id from public.trades where name = 'Plumbing');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  loc uuid := (select id from public.locations where job_id = j order by sort_order limit 1);
  loc2 uuid := (select id from public.locations where job_id = j2 order by sort_order limit 1);
  stops uuid; sinks uuid; faucets uuid; caulk uuid; away uuid; x uuid; y uuid;
begin
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready) values (j, loc, 'Set supply stops', t, c, true) returning id into stops;
  -- A task it waits on is enough to be not ready; each task is kept once.
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready, waiting_on_items)
    values (j, loc, 'Install vanity sinks', t, c, false, array[stops, stops]) returning id into sinks;
  if (select waiting_on_items from public.items where id = sinks) <> array[stops] then raise exception 'FAIL: a task it waits on was kept twice'; end if;
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready, waiting_on_items, waiting_on)
    values (j, loc, 'Install faucets', t, c, false, array[sinks], array['Owner']) returning id into faucets;
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready, waiting_on_items)
    values (j, loc, 'Caulk vanity sinks', t, c, false, array[faucets]) returning id into caulk;

  -- Never on itself, never in a loop, never on another job's item or one that is not there.
  begin
    update public.items set waiting_on_items = array[sinks] where id = sinks;
    raise exception 'FAIL: an item waited on itself';
  exception when check_violation then null;
  end;
  begin
    update public.items set ready = false, waiting_on_items = array[caulk] where id = stops;
    raise exception 'FAIL: items waited on each other in a loop';
  exception when check_violation then null;
  end;
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready) values (j2, loc2, 'Paint garage door', t, c, true) returning id into away;
  begin
    update public.items set waiting_on_items = array[away] where id = caulk;
    raise exception 'FAIL: an item waited on another job''s item';
  exception when check_violation then null;
  end;
  begin
    update public.items set waiting_on_items = array[gen_random_uuid()] where id = caulk;
    raise exception 'FAIL: an item waited on an item that is not there';
  exception when check_violation then null;
  end;

  -- The stops done: the sinks are ready, logged under who finished them. The faucets still wait on the sinks.
  update public.items set status = 'complete' where id = stops;
  if not (select ready from public.items where id = sinks) or (select cardinality(waiting_on_items) from public.items where id = sinks) <> 0 then
    raise exception 'FAIL: finishing a task did not free what waited on it';
  end if;
  if not exists (select 1 from public.item_history where item_id = sinks and field = 'ready' and after = 'true' and person_id = jake) then
    raise exception 'FAIL: freeing an item was not logged under who finished the task';
  end if;
  if (select waiting_on_items from public.items where id = faucets) <> array[sinks] then raise exception 'FAIL: the faucets stopped waiting too soon'; end if;
  -- The sinks done: the faucets still wait on the owner.
  update public.items set status = 'complete' where id = sinks;
  if (select ready from public.items where id = faucets) or (select waiting_on from public.items where id = faucets) <> array['Owner']
     or (select cardinality(waiting_on_items) from public.items where id = faucets) <> 0 then
    raise exception 'FAIL: an item still waiting on the owner was marked ready';
  end if;

  -- A removed task frees what waited on it too, and a ready item waits on nothing.
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready) values (j, loc, 'Install shutoff valve', t, c, true) returning id into y;
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready, waiting_on_items)
    values (j, loc, 'Install water heater', t, c, false, array[y]) returning id into x;
  update public.items set status = 'removed' where id = y;
  if not (select ready from public.items where id = x) then raise exception 'FAIL: removing a task did not free what waited on it'; end if;
  update public.items set ready = false, waiting_on_items = array[caulk] where id = x;
  update public.items set ready = true where id = x;
  if (select cardinality(waiting_on_items) from public.items where id = x) <> 0 then raise exception 'FAIL: a ready item still waits on a task'; end if;
end $$;

-- ---------- comments, and the company's own page ----------
do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  j uuid := (select id from public.jobs where name = 'Fish');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  i uuid := (select id from public.items where title = 'Install hose bib');
  loc uuid := (select location_id from public.items where title = 'Install hose bib');
  t uuid := (select id from public.trades where name = 'Plumbing');
  t2 uuid; c2 uuid; other uuid; m uuid; link text;
begin
  -- From the app: stamped with who is signed in, and with the company doing the item.
  insert into public.comments (job_id, item_id, body) values (j, i, '  Bring the frost free one.  ') returning id into m;
  if (select person_id from public.comments where id = m) is distinct from jake then raise exception 'FAIL: a comment was not stamped with its writer'; end if;
  if (select company_id from public.comments where id = m) is distinct from c then raise exception 'FAIL: an item comment is not with the item''s company'; end if;
  if (select body from public.comments where id = m) <> 'Bring the frost free one.' then raise exception 'FAIL: a comment was not tidied'; end if;
  insert into public.comments (job_id, item_id, body, internal) values (j, i, 'Owner wants one by the pool too.', true);
  insert into public.comments (job_id, company_id, body) values (j, c, 'Can you come Tuesday?');
  if (select count(*) from public.job_activity where job_id = j and kind = 'comment_added' and person_id = jake) <> 3 then
    raise exception 'FAIL: comments are not in Activity';
  end if;
  -- The app never writes as the company.
  begin
    insert into public.comments (job_id, company_id, body, from_company, author_name) values (j, c, 'Fake', true, 'Mike');
    raise exception 'FAIL: the app wrote a comment as the company';
  exception when insufficient_privilege then null;
  end;
  -- A comment is never changed or deleted; its writer can take it back.
  update public.comments set removed = true where id = m;
  if not (select removed from public.comments where id = m) then raise exception 'FAIL: a comment could not be taken back'; end if;
  begin
    update public.comments set body = 'Changed' where id = m;
    raise exception 'FAIL: a comment was changed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.comments where id = m;
    raise exception 'FAIL: a comment was deleted';
  exception when insufficient_privilege then null;
  end;

  -- Another company's item, which Gator Plumbing's link must not reach.
  insert into public.trades (name) values ('Painting') returning id into t2;
  insert into public.companies (name, default_trade_id) values ('Triple H Painting', t2) returning id into c2;
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready) values (j, loc, 'Touch up paint', t2, c2, true) returning id into other;
  -- An item's comment is always with the company doing the item, whatever the app sends.
  insert into public.comments (job_id, item_id, company_id, body) values (j, other, c, 'The ceiling by the hood.') returning id into m;
  if (select company_id from public.comments where id = m) is distinct from c2 then raise exception 'FAIL: an item comment went to another company'; end if;
  -- A link is always long and random.
  begin
    insert into public.company_links (token, job_id, company_id) values ('abc123', j, c2);
    raise exception 'FAIL: a short link was made';
  exception when check_violation then null;
  end;

  -- The walk: Done Here stamps who walked the location; Start a New Walk clears it.
  update public.locations set walked_at = now() where id = loc;
  if (select walked_by from public.locations where id = loc) is distinct from jake then raise exception 'FAIL: the walk was not stamped with who walked it'; end if;
  update public.locations set walked_at = null where id = loc;
  if (select walked_by from public.locations where id = loc) is not null then raise exception 'FAIL: a new walk kept who walked it'; end if;
  -- Common tasks: a title is common in kinds of room the app knows.
  begin
    insert into public.title_library (title, trade_id, rooms) values ('Install attic ladder', t, array['attic']);
    raise exception 'FAIL: a title was common in a kind of room the app does not know';
  exception when check_violation then null;
  end;
  insert into public.title_library (title, trade_id, rooms) values ('Trim out toilet', t, array['bathroom']);

  -- Visits for the company to answer from its page, and one of another company's it must not reach.
  declare
    v uuid;
    v2 uuid;
  begin
    insert into public.visits (job_id, company_id, start_date, days) values (j, c, '2026-11-04', 1) returning id into v;
    insert into public.visits (job_id, company_id, start_date, days) values (j, c, '2026-11-11', 2) returning id into v2;
    perform set_config('test.visit', v::text, false);
    perform set_config('test.visit2', v2::text, false);
    insert into public.visits (job_id, company_id, start_date, days) values (j, c2, '2026-11-05', 1) returning id into v;
    perform set_config('test.other_visit', v::text, false);
  end;

  -- The company's private link.
  insert into public.company_links (job_id, company_id) values (j, c) returning token into link;
  if length(link) < 60 then raise exception 'FAIL: the link is too easy to guess'; end if;
  perform set_config('test.link', link, false);
  perform set_config('test.item', i::text, false);
  perform set_config('test.other_item', other::text, false);
end $$;

reset role;

-- ---------- the company, on its page ----------
set role anon;
set request.jwt.claims = '';
do $$
declare
  link text := current_setting('test.link');
  page jsonb := public.trade_page(current_setting('test.link'));
  shared text[];
begin
  if page is null then raise exception 'FAIL: the company page did not open'; end if;
  if page -> 'company' ->> 'name' <> 'Gator Plumbing' or page -> 'job' ->> 'name' <> 'Fish' then raise exception 'FAIL: the page is for the wrong company or job'; end if;
  if exists (select 1 from jsonb_array_elements(page -> 'items') x where x ->> 'title' = 'Touch up paint') then
    raise exception 'FAIL: the page shows another company''s work';
  end if;
  -- What an item waits on: the task, who is doing it and where.
  if not exists (
    select 1 from jsonb_array_elements(page -> 'items') x
    where x ->> 'title' = 'Caulk vanity sinks' and x -> 'waiting_for' -> 0 ->> 'title' = 'Install faucets' and x -> 'waiting_for' -> 0 ->> 'company' = 'Gator Plumbing'
  ) then
    raise exception 'FAIL: the page does not say which task an item waits on';
  end if;
  -- Never a Ross Built only note or one taken back.
  select array_agg(x ->> 'body') into shared from jsonb_array_elements(page -> 'comments') x;
  if shared is distinct from array['Can you come Tuesday?'] then raise exception 'FAIL: the page shows the wrong comments: %', shared; end if;

  perform public.trade_comment(link, current_setting('test.item')::uuid, 'Tuesday works.', ' Mike ');
  perform public.trade_comment(link, null, 'We will bring the frost free bib.', null);
  page := public.trade_page(link);
  if jsonb_array_length(page -> 'comments') <> 3 or (page -> 'comments' -> 1 ->> 'author') <> 'Mike' then
    raise exception 'FAIL: the company''s comments did not land';
  end if;
  begin
    perform public.trade_comment(link, current_setting('test.other_item')::uuid, 'Not ours', 'Mike');
    raise exception 'FAIL: a company commented on another company''s item';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trade_comment('not-a-link', null, 'Hello', 'Mike');
    raise exception 'FAIL: a made up link was accepted';
  exception when insufficient_privilege then null;
  end;
  -- Its dates: these work, or other dates asked for.
  perform public.trade_confirm_visit(link, current_setting('test.visit')::uuid, 'Mike');
  perform public.trade_ask_visit(link, current_setting('test.visit2')::uuid, '2026-11-13', 1, ' Mike ');
  page := public.trade_page(link);
  if not exists (select 1 from jsonb_array_elements(page -> 'visits') x where x ->> 'id' = current_setting('test.visit') and (x ->> 'confirmed')::boolean) then
    raise exception 'FAIL: the company could not confirm its dates';
  end if;
  if not exists (select 1 from jsonb_array_elements(page -> 'visits') x where x ->> 'id' = current_setting('test.visit2') and x ->> 'asked_start' = '2026-11-13' and (x ->> 'asked_days')::int = 1) then
    raise exception 'FAIL: the page does not show the dates the company asked for';
  end if;
  begin
    perform public.trade_confirm_visit(link, current_setting('test.other_visit')::uuid, 'Mike');
    raise exception 'FAIL: a company confirmed another company''s visit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trade_ask_visit(link, current_setting('test.visit2')::uuid, null, 1, 'Mike');
    raise exception 'FAIL: dates were asked for with no first day';
  exception when check_violation then null;
  end;
  begin
    perform 1 from public.visits;
    raise exception 'FAIL: the page reached the visits table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.comments;
    raise exception 'FAIL: the page reached the comments table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.log_activity(null, null, 'job_renamed', '{}'::jsonb);
    raise exception 'FAIL: anyone could write to the activity log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- back in the app: the company's comments, and taking a link back ----------
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  link text := current_setting('test.link');
begin
  if (select count(*) from public.comments where from_company and author_name = 'Mike' and person_id is null) <> 1 then
    raise exception 'FAIL: the company''s comment is not in the app';
  end if;
  if (select count(*) from public.job_activity where kind = 'comment_added' and person_id is null and (detail ->> 'from_company')::boolean) <> 2 then
    raise exception 'FAIL: the company''s comments are not in Activity';
  end if;
  -- Its answers on its dates are in Activity under its name, and nothing else was logged for them.
  if (select count(*) from public.job_activity where kind = 'visit_confirmed_by_company' and detail ->> 'author_name' = 'Mike') <> 1
     or (select count(*) from public.job_activity where kind = 'visit_change_asked' and detail ->> 'start' = '2026-11-13' and detail ->> 'was_start' = '2026-11-11') <> 1 then
    raise exception 'FAIL: the company''s answers on its dates are not in Activity';
  end if;
  if exists (select 1 from public.job_activity where kind = 'visit_changed' and person_id is null) then
    raise exception 'FAIL: the company''s answer was logged as a change by nobody';
  end if;
  if (select asked_name from public.visits where id = current_setting('test.visit2')::uuid) <> 'Mike' then raise exception 'FAIL: the ask lost its name'; end if;
  -- Moving the visit to the dates asked for answers it.
  update public.visits set start_date = '2026-11-13', days = 1, confirmed = true where id = current_setting('test.visit2')::uuid;
  if (select asked_start from public.visits where id = current_setting('test.visit2')::uuid) is not null then
    raise exception 'FAIL: moving the visit did not answer what the company asked';
  end if;
  update public.company_links set revoked = true where token = link;
  begin
    update public.company_links set revoked = false where token = link;
    raise exception 'FAIL: a link taken back came back';
  exception when restrict_violation then null;
  end;
end $$;
reset role;

set role anon;
set request.jwt.claims = '';
do $$
begin
  if public.trade_page(current_setting('test.link')) is not null then raise exception 'FAIL: a link taken back still works'; end if;
end $$;
reset role;

-- ---------- another active person ----------
set role authenticated;
set request.jwt.claims = '{"email":"andrew@rossbuilt.com"}';

do $$
begin
  if (select count(*) from public.photos) <> 2 or (select count(*) from public.custom_fields) <> 1 then
    raise exception 'FAIL: photos and added fields are not shared with the team';
  end if;
  if (select count(*) from public.person_settings) <> 0 then
    raise exception 'FAIL: one person can see another''s settings';
  end if;
  if (select count(*) from public.job_activity) = 0 then
    raise exception 'FAIL: activity is not shared with the team';
  end if;
  -- Comments are the team's, but only their writer takes one back.
  if (select count(*) from public.comments) = 0 then
    raise exception 'FAIL: comments are not shared with the team';
  end if;
  update public.comments set removed = true where not from_company;
  if (select count(*) from public.comments where removed) <> 1 then
    raise exception 'FAIL: one person took back another''s comment';
  end if;
  update public.person_settings set job_view = '{"groupBy": "company"}';
end $$;

reset role;

-- ---------- someone who was never invited ----------
set role authenticated;
set request.jwt.claims = '{"email":"stranger@example.com"}';

do $$
begin
  if (select count(*) from public.jobs) + (select count(*) from public.items) + (select count(*) from public.people)
     + (select count(*) from public.locations) + (select count(*) from public.companies) + (select count(*) from public.trades)
     + (select count(*) from public.item_history) + (select count(*) from public.job_companies)
     + (select count(*) from public.photos) + (select count(*) from public.custom_fields)
     + (select count(*) from public.person_settings) + (select count(*) from public.job_activity)
     + (select count(*) from public.comments) + (select count(*) from public.company_links) <> 0 then
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
  if (select job_view ->> 'groupBy' from public.person_settings) <> 'trade' then
    raise exception 'FAIL: one person changed another''s settings';
  end if;
  begin
    delete from public.items;
    raise exception 'FAIL: an item was deleted with full rights';
  exception when restrict_violation then null;
  end;
  begin
    update public.job_activity set kind = 'job_renamed';
    raise exception 'FAIL: activity was changed with full rights';
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
