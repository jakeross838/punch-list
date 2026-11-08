-- Database checks: the access rule and everything the database keeps itself.
-- Run by tools/db-test.sh on a fresh local Postgres. Any failed check stops the run.

insert into public.people (org, email, name) values
  ('ross_built', 'jake@rossbuilt.com', 'Jake Ross'),
  ('ross_built', 'andrew@rossbuilt.com', 'Andrew Ross'),
  ('ross_built', 'former@rossbuilt.com', 'Former Employee');
update public.people set role = 'admin' where email in ('jake@rossbuilt.com', 'andrew@rossbuilt.com');
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
  -- The standard trades are there already; Plumbing is one.
  t := (select id from public.trades where org = 'ross_built' and name = 'Plumbing');
  if t is null then
    raise exception 'FAIL: the standard trades are missing';
  end if;
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
  -- An admin adds people; an email is always lower case.
  begin
    insert into public.people (email, name) values ('Friend@Example.com', 'Friend');
    raise exception 'FAIL: an email in capitals was accepted';
  exception when check_violation then null;
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
  -- A done photo, taken by the team, stays one; and a photo of the problem never becomes one.
  declare
    dp uuid;
  begin
    insert into public.photos (job_id, item_id, width, height, done) values (j, a, 3024, 4032, true) returning id into dp;
    update public.photos set done = false where id = dp;
    update public.photos set done = true where id = p;
    if not (select done from public.photos where id = dp) or (select done from public.photos where id = p) then
      raise exception 'FAIL: a photo stopped or started being a done photo';
    end if;
    if (select detail ->> 'done' from public.job_activity where kind = 'photo_added' and detail ->> 'photo_id' = dp::text) <> 'true' then
      raise exception 'FAIL: Activity does not say it was a done photo';
    end if;
  end;

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
  -- An unfinished item may wait for its title and who it is assigned to; a finished one may not.
  -- Assigned To is a company or someone on the team. The trade is never asked for: it follows the
  -- company's trade on the job.
  insert into public.items (job_id, location_id, title, ready, unfinished) values (j, loc, '', true, true) returning id into d;
  begin
    insert into public.items (job_id, location_id, title, ready) values (j, loc, '', true);
    raise exception 'FAIL: a finished item with no title was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.items (job_id, location_id, title, ready) values (j, loc, 'Install vanity', true);
    raise exception 'FAIL: a finished item assigned to no one was accepted';
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
  t2 := (select id from public.trades where org = 'ross_built' and name = 'Painting');
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

-- ---------- the company page's functions ----------
-- For the company-page function alone, which runs as the service role: closed to the app and to
-- anyone not signed in.
set request.jwt.claims = '';
set role service_role;
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
  -- What finishing each item frees up, down the chain, for the order to do the work.
  if exists (select 1 from jsonb_array_elements(page -> 'items') x where x -> 'holds_up' is null or x -> 'holds_up' ->> 'items' is null) then
    raise exception 'FAIL: an item on the page does not say what it holds up';
  end if;
  if not exists (select 1 from jsonb_array_elements(page -> 'items') x where x ->> 'title' = 'Install faucets' and (x -> 'holds_up' ->> 'items')::int = 1) then
    raise exception 'FAIL: the page does not say the faucets hold up the caulk';
  end if;
  if exists (
    select 1 from jsonb_array_elements(page -> 'items') x
    where x ->> 'title' = 'Install vanity sinks' and (x -> 'holds_up' ->> 'items')::int <> 2
  ) then
    raise exception 'FAIL: the sinks do not hold up the faucets and the caulk after them';
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
  -- Its work: done, for Ross Built to check. The item stays open and on the page, marked.
  perform public.trade_mark_done(link, current_setting('test.item')::uuid, true, ' Mike ');
  page := public.trade_page(link);
  if not exists (select 1 from jsonb_array_elements(page -> 'items') x where x ->> 'id' = current_setting('test.item') and x ->> 'marked_done_at' is not null) then
    raise exception 'FAIL: the company could not mark its work done';
  end if;
  -- Saying it twice changes nothing.
  perform public.trade_mark_done(link, current_setting('test.item')::uuid, true, 'Mike');
  begin
    perform public.trade_mark_done(link, current_setting('test.other_item')::uuid, true, 'Mike');
    raise exception 'FAIL: a company marked another company''s item done';
  exception when insufficient_privilege then null;
  end;
  -- A photo of the finished work, put in the item's folder by the company-page function: a done
  -- photo, after the others, said in Activity as from the company.
  declare
    folder text := (select i.job_id::text || '/' || i.id::text from public.items i where i.id = current_setting('test.item')::uuid);
    shot uuid;
    d jsonb;
  begin
    if public.trade_photo_folder(link, current_setting('test.item')::uuid) <> folder then
      raise exception 'FAIL: the company''s photo folder is not the item''s';
    end if;
    shot := public.trade_add_photo(link, current_setting('test.item')::uuid, folder || '/done-' || gen_random_uuid()::text || '.jpg', 1600, 1200, ' Mike ');
    if not (select p.done and p.width = 1600 and p.storage_path like folder || '/done-%' from public.photos p where p.id = shot) then
      raise exception 'FAIL: the company''s photo is not a done photo';
    end if;
    if (select p.sort_order from public.photos p where p.id = shot) <= coalesce((select max(p.sort_order) from public.photos p where p.item_id = current_setting('test.item')::uuid and p.id <> shot), 0) then
      raise exception 'FAIL: the done photo is not after the others';
    end if;
    select a.detail into d from public.job_activity a where a.kind = 'photo_added' and a.detail ->> 'photo_id' = shot::text;
    if d is null or d ->> 'done' <> 'true' or d ->> 'from_company' <> 'true' or d ->> 'author_name' <> 'Mike'
       or d ->> 'company_id' <> (select i.company_id::text from public.items i where i.id = current_setting('test.item')::uuid) then
      raise exception 'FAIL: Activity does not say the company sent a done photo: %', d;
    end if;
    page := public.trade_page(link);
    if not exists (
      select 1 from jsonb_array_elements(page -> 'items') x, jsonb_array_elements(x -> 'photos') ph
      where x ->> 'id' = current_setting('test.item') and ph ->> 'done' = 'true'
    ) then
      raise exception 'FAIL: the page does not show the done photo as one';
    end if;
    -- Only into the item's own folder, and only on the company's own items.
    begin
      perform public.trade_add_photo(link, current_setting('test.item')::uuid, 'elsewhere/done-' || gen_random_uuid()::text || '.jpg', 1600, 1200, 'Mike');
      raise exception 'FAIL: a done photo was taken from outside the item''s folder';
    exception when check_violation then null;
    end;
    begin
      perform public.trade_add_photo(link, current_setting('test.other_item')::uuid, folder || '/done-' || gen_random_uuid()::text || '.jpg', 1600, 1200, 'Mike');
      raise exception 'FAIL: a company put a photo on another company''s item';
    exception when insufficient_privilege then null;
    end;
    -- Nothing after the next write says it came from the company.
    if coalesce(current_setting('punch.from_company', true), '') <> '' then
      raise exception 'FAIL: the company''s mark stayed on after its photo';
    end if;
  end;
  -- Confirming an item: it is theirs and right as it is. Saying it twice changes nothing.
  perform public.trade_confirm(link, current_setting('test.item')::uuid, true, ' Mike ');
  perform public.trade_confirm(link, current_setting('test.item')::uuid, true, 'Mike');
  page := public.trade_page(link);
  if not exists (select 1 from jsonb_array_elements(page -> 'items') x where x ->> 'id' = current_setting('test.item') and x ->> 'confirmed_at' is not null) then
    raise exception 'FAIL: the company could not confirm an item';
  end if;
  begin
    perform public.trade_confirm(link, current_setting('test.other_item')::uuid, true, 'Mike');
    raise exception 'FAIL: a company confirmed another company''s item';
  exception when insufficient_privilege then null;
  end;
  -- How long it takes: to the quarter hour, and a confirmation stays through the company's own answer.
  perform public.trade_set_hours(link, current_setting('test.item')::uuid, 2.1, 'Mike');
  if (select hours from public.items where id = current_setting('test.item')::uuid) <> 2 then raise exception 'FAIL: the company''s hours were not kept to the quarter hour'; end if;
  if (select confirmed_at from public.items where id = current_setting('test.item')::uuid) is null then raise exception 'FAIL: the company''s hours took back its own confirmation'; end if;
  perform public.trade_set_hours(link, current_setting('test.item')::uuid, 500, 'Mike');
  if (select hours from public.items where id = current_setting('test.item')::uuid) <> 200 then raise exception 'FAIL: the company''s hours went past the most an item takes'; end if;
  perform public.trade_set_hours(link, current_setting('test.item')::uuid, 3, 'Mike');
  begin
    perform public.trade_set_hours(link, current_setting('test.other_item')::uuid, 3, 'Mike');
    raise exception 'FAIL: a company gave hours on another company''s item';
  exception when insufficient_privilege then null;
  end;
  if public.trade_page('not-a-link') is not null then raise exception 'FAIL: a made up link opened a page'; end if;
  -- What was checked off lately shows too, apart from the open work.
  if jsonb_typeof(page -> 'completed') <> 'array' or page ->> 'builder' <> 'Ross Built' then raise exception 'FAIL: the page is missing the builder or what was checked off'; end if;
  -- The schedule's dates are out of the app for now: the page function cannot answer them.
  begin
    perform public.trade_confirm_visit(link, current_setting('test.visit')::uuid, 'Mike');
    raise exception 'FAIL: the page function can confirm a visit';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The schedule's dates, as the database: these work, or other dates asked for.
do $$
declare
  link text := current_setting('test.link');
begin
  perform public.trade_confirm_visit(link, current_setting('test.visit')::uuid, 'Mike');
  perform public.trade_ask_visit(link, current_setting('test.visit2')::uuid, '2026-11-13', 1, ' Mike ');
  if not (select confirmed from public.visits where id = current_setting('test.visit')::uuid) then
    raise exception 'FAIL: the company could not confirm its dates';
  end if;
  if (select asked_start from public.visits where id = current_setting('test.visit2')::uuid) <> '2026-11-13' then
    raise exception 'FAIL: the dates the company asked for were not kept';
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
end $$;
reset role;

set role anon;
do $$
declare
  link text := current_setting('test.link');
begin
  begin
    perform public.trade_page(link);
    raise exception 'FAIL: the company page opens for anyone';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trade_comment(link, null, 'Hello', 'Mike');
    raise exception 'FAIL: anyone can comment through a link';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trade_mark_done(link, current_setting('test.item')::uuid, true, 'Mike');
    raise exception 'FAIL: anyone can mark work done through a link';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trade_confirm(link, current_setting('test.item')::uuid, true, 'Mike');
    raise exception 'FAIL: anyone can confirm through a link';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trade_set_hours(link, current_setting('test.item')::uuid, 1, 'Mike');
    raise exception 'FAIL: anyone can give hours through a link';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.plan_sheets;
    raise exception 'FAIL: anyone reached the plans';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.visits;
    raise exception 'FAIL: anyone reached the visits table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.comments;
    raise exception 'FAIL: anyone reached the comments table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.log_activity(null, null, 'job_renamed', '{}'::jsonb);
    raise exception 'FAIL: anyone could write to the activity log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
begin
  begin
    perform public.trade_page(current_setting('test.link'));
    raise exception 'FAIL: the app can open a company page';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trade_confirm(current_setting('test.link'), current_setting('test.item')::uuid, true, 'Mike');
    raise exception 'FAIL: the app can confirm for a company';
  exception when insufficient_privilege then null;
  end;
  -- The builder changing the work takes back the company's confirmation; the company's hours stay.
  if (select confirmed_at from public.items where id = current_setting('test.item')::uuid) is null then raise exception 'FAIL: the confirmation was lost'; end if;
  update public.items set description = 'Both sinks, the left one first.' where id = current_setting('test.item')::uuid;
  if (select confirmed_at from public.items where id = current_setting('test.item')::uuid) is not null then
    raise exception 'FAIL: changing the work kept the company''s confirmation';
  end if;
  if (select hours from public.items where id = current_setting('test.item')::uuid) <> 3 then raise exception 'FAIL: the company''s hours were lost'; end if;
  -- Its answers are in Activity under its name.
  if (select count(*) from public.job_activity where kind = 'item_confirmed' and person_id is null and detail ->> 'author_name' = 'Mike') <> 1
     or (select count(*) from public.job_activity where kind = 'item_hours_given' and person_id is null and (detail ->> 'hours')::numeric = 3) <> 1 then
    raise exception 'FAIL: the company''s confirmation and hours are not in Activity';
  end if;
  if exists (select 1 from public.item_history where field in ('confirmed_at', 'hours') and person_id is null) then
    raise exception 'FAIL: the company''s answers were logged as changes by nobody';
  end if;
end $$;
reset role;

-- ---------- the job's station ----------
-- One link per job for a tablet or a TV in the house, made and turned off from the app; the screen
-- talks to the database only through the company-page function.
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  j uuid := (select id from public.jobs where name = 'Fish');
  a text; b text; c text;
begin
  if public.job_station(j, 'get') is not null then raise exception 'FAIL: a job had a station before one was made'; end if;
  a := public.job_station(j, 'make');
  if a !~ '^[0-9a-f]{64}$' then raise exception 'FAIL: the station link is too easy to guess'; end if;
  if public.job_station(j, 'make') <> a or public.job_station(j, 'get') <> a then raise exception 'FAIL: making the station again made another link'; end if;
  b := public.job_station(j, 'new');
  if b = a or public.job_station(j, 'get') <> b then raise exception 'FAIL: a new station link did not replace the old one'; end if;
  if public.job_station(j, 'off') is not null or public.job_station(j, 'get') is not null then raise exception 'FAIL: the station did not turn off'; end if;
  c := public.job_station(j, 'make');
  perform set_config('test.station_old', a, false);
  perform set_config('test.station', c, false);
  begin
    perform 1 from public.job_stations;
    raise exception 'FAIL: the app read the station links directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.job_station(j, 'open');
    raise exception 'FAIL: the station took an action it does not have';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.station_page(c);
    raise exception 'FAIL: the app can open the station''s board';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role anon;
do $$
begin
  begin
    perform public.job_station((select gen_random_uuid()), 'make');
    raise exception 'FAIL: anyone can make a station';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.station_page(current_setting('test.station'));
    raise exception 'FAIL: the station''s board opens for anyone';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.station_company(current_setting('test.station'), gen_random_uuid());
    raise exception 'FAIL: anyone can open a company''s list through the station';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set request.jwt.claims = '';
set role service_role;
do $$
declare
  board jsonb := public.station_page(current_setting('test.station'));
  gator uuid := (select id from public.companies where name = 'Gator Plumbing');
  gator_items jsonb;
begin
  if board is null or board -> 'job' ->> 'name' <> 'Fish' then raise exception 'FAIL: the station''s board did not open'; end if;
  select x -> 'items' into gator_items from jsonb_array_elements(board -> 'companies') x where x ->> 'name' = 'Gator Plumbing';
  if gator_items is null or jsonb_array_length(gator_items) = 0 then raise exception 'FAIL: the board left out a company''s open work'; end if;
  if exists (select 1 from jsonb_array_elements(gator_items) x where x ->> 'id' not in (select id::text from public.items where company_id = gator and status = 'open' and not unfinished)) then
    raise exception 'FAIL: the board showed work that is not open and finished';
  end if;
  if not exists (select 1 from jsonb_array_elements(gator_items) x where x ? 'holds_up') then raise exception 'FAIL: the board does not say what work frees up'; end if;
  -- A company's list opens through its own link, the one it already has.
  if public.station_company(current_setting('test.station'), gator) <> current_setting('test.link') then raise exception 'FAIL: the station did not open the company''s own list'; end if;
  begin
    perform public.station_company(current_setting('test.station'), gen_random_uuid());
    raise exception 'FAIL: the station opened a company that is not on the job';
  exception when insufficient_privilege then null;
  end;
  -- A station link turned off, or one that was replaced, opens nothing; nor does it open a company page.
  if public.station_page(current_setting('test.station_old')) is not null or public.station_company(current_setting('test.station_old'), gator) is not null then
    raise exception 'FAIL: a station link that was replaced still works';
  end if;
  if public.trade_page(current_setting('test.station')) is not null then raise exception 'FAIL: a station link opened a company page'; end if;
end $$;
reset role;

-- ---------- the owner's page ----------
-- One private link per job for the homeowner, made from the app; the page talks to the database only
-- through the company-page function. The owner sees progress, adds what they want looked at, and
-- signs off.
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  j uuid := (select id from public.jobs where name = 'Fish');
  a jsonb; b jsonb; c jsonb;
begin
  if public.owner_link(j, 'get') is not null then raise exception 'FAIL: a job had an owner link before one was made'; end if;
  a := public.owner_link(j, 'make', '  Lisa   and Mark Fish ');
  if (a ->> 'token') !~ '^[0-9a-f]{64}$' then raise exception 'FAIL: the owner link is too easy to guess'; end if;
  if a ->> 'name' <> 'Lisa and Mark Fish' then raise exception 'FAIL: the owner link did not keep who it is for: %', a ->> 'name'; end if;
  if public.owner_link(j, 'make') ->> 'token' <> a ->> 'token' or public.owner_link(j, 'get') ->> 'token' <> a ->> 'token' then
    raise exception 'FAIL: making the owner link again made another one';
  end if;
  if public.owner_link(j, 'get', 'The Fish Family') ->> 'name' <> 'The Fish Family' then raise exception 'FAIL: who the link is for did not change'; end if;
  b := public.owner_link(j, 'new');
  if b ->> 'token' = a ->> 'token' or b ->> 'name' <> 'The Fish Family' then raise exception 'FAIL: a new owner link did not replace the old one, keeping its name'; end if;
  if public.owner_link(j, 'off') is not null or public.owner_link(j, 'get') is not null then raise exception 'FAIL: the owner link did not turn off'; end if;
  c := public.owner_link(j, 'make', 'Lisa Fish');
  perform set_config('test.owner_old', a ->> 'token', false);
  perform set_config('test.owner', c ->> 'token', false);
  begin
    perform 1 from public.owner_links;
    raise exception 'FAIL: the app read the owner links directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.owner_link(j, 'open');
    raise exception 'FAIL: the owner link took an action it does not have';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.owner_page(c ->> 'token');
    raise exception 'FAIL: the app can open the owner''s page';
  exception when insufficient_privilege then null;
  end;
  -- Something waiting on the owner.
  update public.items set ready = false, waiting_on = '{Owner}' where id = current_setting('test.other_item')::uuid;
end $$;
reset role;

set role anon;
do $$
begin
  begin
    perform public.owner_link((select gen_random_uuid()), 'make');
    raise exception 'FAIL: anyone can make an owner link';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.owner_page(current_setting('test.owner'));
    raise exception 'FAIL: the owner''s page opens for anyone';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.owner_sign_off(current_setting('test.owner'), null, 'Lisa Fish');
    raise exception 'FAIL: anyone can sign off for the owner';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set request.jwt.claims = '';
set role service_role;
do $$
declare
  owner text := current_setting('test.owner');
  page jsonb := public.owner_page(current_setting('test.owner'));
  j uuid := (select id from public.jobs where name = 'Fish');
  kitchen uuid := (select l.id from public.locations l where l.job_id = (select id from public.jobs where name = 'Fish') and l.active order by l.sort_order limit 1);
  elsewhere uuid := (select l.id from public.locations l join public.jobs jj on jj.id = l.job_id where jj.name = 'Biales' limit 1);
  added uuid := gen_random_uuid();
  plain uuid := gen_random_uuid();
  d jsonb;
begin
  if page is null or page -> 'job' ->> 'name' <> 'Fish' or page ->> 'owner' <> 'Lisa Fish' or jsonb_array_length(page -> 'locations') = 0 then
    raise exception 'FAIL: the owner''s page did not open';
  end if;
  if (select opened_at from public.owner_links where token = owner) is null then raise exception 'FAIL: opening the owner''s page was not noted'; end if;
  -- Titles only: no companies, notes, prices or numbers.
  if exists (select 1 from jsonb_array_elements(page -> 'locations') lo, jsonb_array_elements(lo -> 'open') x where x ? 'description' or x ? 'company' or x ? 'po_or_co' or x ? 'number') then
    raise exception 'FAIL: the owner''s page shows more than titles';
  end if;
  if (select count(*) from jsonb_array_elements(page -> 'locations') lo, jsonb_array_elements(lo -> 'open') x)
     <> (select count(*) from public.items i join public.locations l on l.id = i.location_id where i.job_id = j and i.status = 'open' and not i.unfinished and l.active) then
    raise exception 'FAIL: the owner''s page left out open work, or showed drafts: % on the page, % open', (select count(*) from jsonb_array_elements(page -> 'locations') lo, jsonb_array_elements(lo -> 'open') x),
      (select count(*) from public.items i join public.locations l on l.id = i.location_id where i.job_id = j and i.status = 'open' and not i.unfinished and l.active);
  end if;
  if not exists (select 1 from jsonb_array_elements(page -> 'locations') lo, jsonb_array_elements(lo -> 'open') x where x ->> 'id' = current_setting('test.other_item') and (x ->> 'waits_on_owner')::boolean) then
    raise exception 'FAIL: the owner''s page does not say what waits on them';
  end if;
  -- Something to look at: the owner's words and photo, a draft from the owner.
  if public.owner_photo_folder(owner) <> j::text then raise exception 'FAIL: the owner''s photo folder is not the job''s'; end if;
  perform public.owner_add_item(owner, added, kitchen, '  The pantry door   sticks at the top ', ' Lisa ', j::text || '/' || added::text || '/owner-' || gen_random_uuid()::text || '.jpg', 1200, 900);
  if not exists (
    select 1 from public.items i
    where i.id = added and i.source = 'owner' and i.unfinished and i.title = '' and i.description = 'The pantry door sticks at the top' and i.location_id = kitchen and i.status = 'open' and i.number > 0
  ) then
    raise exception 'FAIL: what the owner added is not a draft from the owner';
  end if;
  select a.detail into d from public.job_activity a where a.kind = 'owner_item_added' and a.item_id = added;
  if d is null or d ->> 'author_name' <> 'Lisa' or d ->> 'from_owner' <> 'true' then raise exception 'FAIL: Activity does not say the owner added it: %', d; end if;
  select a.detail into d from public.job_activity a where a.kind = 'photo_added' and a.item_id = added;
  if d is null or d ->> 'from_owner' <> 'true' or d ->> 'author_name' <> 'Lisa' or d ? 'done' then raise exception 'FAIL: Activity does not say the owner sent the photo: %', d; end if;
  -- Words alone, and no place: still a draft.
  perform public.owner_add_item(owner, plain, null, 'Garage door remote', 'Lisa', null, null, null);
  if not exists (select 1 from public.items i where i.id = plain and i.location_id is null and i.unfinished) then raise exception 'FAIL: words alone did not come in'; end if;
  page := public.owner_page(owner);
  if jsonb_array_length(page -> 'added') <> 2 or (page -> 'added' -> 0 ->> 'status') <> 'received' then raise exception 'FAIL: the owner does not see what they added'; end if;
  begin
    perform public.owner_add_item(owner, gen_random_uuid(), null, '   ', 'Lisa', null, null, null);
    raise exception 'FAIL: the owner added nothing at all';
  exception when check_violation then null;
  end;
  begin
    perform public.owner_add_item(owner, added, null, 'Again', 'Lisa', 'elsewhere/owner-' || gen_random_uuid()::text || '.jpg', 1200, 900);
    raise exception 'FAIL: a photo was taken from outside the job''s folder';
  exception when check_violation then null;
  end;
  begin
    perform public.owner_add_item(owner, gen_random_uuid(), elsewhere, 'Wrong house', 'Lisa', null, null, null);
    raise exception 'FAIL: the owner put something on another job';
  exception when insufficient_privilege then null;
  end;
  -- Signing off: the whole job, then a location, under the owner's name, with how much is still open.
  perform public.owner_sign_off(owner, null, '  Lisa  Fish ');
  perform public.owner_sign_off(owner, kitchen, 'Lisa Fish');
  if (select count(*) from public.job_activity where kind = 'owner_signed_off' and detail ->> 'author_name' = 'Lisa Fish' and person_id is null) <> 2 then
    raise exception 'FAIL: the owner''s sign offs are not in Activity';
  end if;
  if (select (detail ->> 'open')::integer from public.job_activity where kind = 'owner_signed_off' and detail ->> 'location_id' is null)
     <> (select count(*) from public.items where job_id = j and status = 'open' and not unfinished) then
    raise exception 'FAIL: the sign off did not count what is still open';
  end if;
  if jsonb_array_length(public.owner_page(owner) -> 'sign_offs') <> 2 then raise exception 'FAIL: the owner''s page does not show the sign offs'; end if;
  begin
    perform public.owner_sign_off(owner, null, 'L');
    raise exception 'FAIL: a sign off took no name';
  exception when check_violation then null;
  end;
  -- A link that was replaced opens nothing, and an owner's link opens no company's or station's page.
  if public.owner_page(current_setting('test.owner_old')) is not null then raise exception 'FAIL: an owner link that was replaced still works'; end if;
  begin
    perform public.owner_add_item(current_setting('test.owner_old'), gen_random_uuid(), null, 'Old link', 'Lisa', null, null, null);
    raise exception 'FAIL: an old owner link added something';
  exception when insufficient_privilege then null;
  end;
  if public.trade_page(owner) is not null or public.station_page(owner) is not null then raise exception 'FAIL: an owner link opened another page'; end if;
  perform set_config('test.owner_item', added::text, false);
end $$;
reset role;

-- ---------- a company's page in Spanish, and its other jobs ----------
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  gator uuid := (select id from public.companies where name = 'Gator Plumbing');
  biales uuid := (select id from public.jobs where name = 'Biales');
  garage uuid := (select l.id from public.locations l where l.job_id = (select id from public.jobs where name = 'Biales') limit 1);
begin
  update public.companies set language = 'es' where id = gator;
  begin
    update public.companies set language = 'fr' where id = gator;
    raise exception 'FAIL: a company took a language the pages do not have';
  exception when check_violation then null;
  end;
  -- Gator has open work on Biales too, and a link there.
  insert into public.items (job_id, location_id, title, company_id, ready) values (biales, garage, 'Install hose bib', gator, true);
  insert into public.company_links (job_id, company_id) values (biales, gator);
  begin
    perform 1 from public.translations;
    raise exception 'FAIL: the app read the translations directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.org_ai_allowance('ross_built');
    raise exception 'FAIL: the app asked for a company''s allowance by name';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set request.jwt.claims = '';
set role service_role;
do $$
declare
  page jsonb := public.trade_page(current_setting('test.link'));
  a jsonb := public.org_ai_allowance((select org from public.company_links where token = current_setting('test.link')));
begin
  if page -> 'company' ->> 'language' <> 'es' then raise exception 'FAIL: the company''s page does not say its language'; end if;
  if page ->> 'org' is null then raise exception 'FAIL: the company''s page does not say whose it is'; end if;
  if jsonb_array_length(page -> 'other_jobs') <> 1 or page -> 'other_jobs' -> 0 ->> 'name' <> 'Biales'
     or (page -> 'other_jobs' -> 0 ->> 'open')::integer <> (select count(*) from public.items i join public.jobs jj on jj.id = i.job_id
       where jj.name = 'Biales' and i.company_id = (select id from public.companies where name = 'Gator Plumbing') and i.status = 'open' and not i.unfinished)
     or (page -> 'other_jobs' -> 0 ->> 'token') !~ '^[0-9a-f]{64}$' then
    raise exception 'FAIL: the company''s page does not list its other jobs: %', page -> 'other_jobs';
  end if;
  if a is null or (a ->> 'limit_cents')::numeric <= 0 then raise exception 'FAIL: the company''s allowance did not come back'; end if;
  insert into public.translations (org, lang, source_hash, text) values (page ->> 'org', 'es', repeat('a', 64), 'Instalar llave de manguera');
  if (select opened_at from public.company_links where token = current_setting('test.link')) is null then raise exception 'FAIL: opening the company''s page was not noted'; end if;
  -- The page asks every minute it is open: noted at most every ten minutes.
  update public.company_links set opened_at = now() - interval '5 minutes' where token = current_setting('test.link');
  perform public.trade_page(current_setting('test.link'));
  if (select opened_at from public.company_links where token = current_setting('test.link')) > now() - interval '4 minutes' then raise exception 'FAIL: opening the page again right away was noted again'; end if;
  update public.company_links set opened_at = now() - interval '11 minutes' where token = current_setting('test.link');
  perform public.trade_page(current_setting('test.link'));
  if (select opened_at from public.company_links where token = current_setting('test.link')) < now() - interval '1 minute' then raise exception 'FAIL: opening the page later was not noted'; end if;
  if (select text from public.translations where source_hash = repeat('a', 64)) <> 'Instalar llave de manguera' then raise exception 'FAIL: a translation was not kept'; end if;
end $$;
reset role;

-- ---------- back in the app: the company's comments, and taking a link back ----------
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  link text := current_setting('test.link');
begin
  -- When each company last opened its list, for the app; the app cannot say it opened it.
  if (select count(*) from public.company_links_opened((select id from public.jobs where name = 'Fish')) o where o.opened_at is not null) <> 1 then
    raise exception 'FAIL: the app cannot see when the company opened its list';
  end if;
  begin
    update public.company_links set opened_at = '2020-01-01' where token = link;
    raise exception 'FAIL: the app changed when the company opened its list';
  exception when insufficient_privilege then null;
  end;
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
  -- The company's done is in Activity under its name, once, and not as a change by nobody.
  if (select count(*) from public.job_activity where kind = 'item_marked_done' and person_id is null and detail ->> 'author_name' = 'Mike') <> 1 then
    raise exception 'FAIL: the company''s done is not in Activity once';
  end if;
  if exists (select 1 from public.item_history where field = 'marked_done_at' and person_id is null) then
    raise exception 'FAIL: the company''s done was logged as a change by nobody';
  end if;
  -- Not Done: back on the company's list, in the item's history under who said so.
  update public.items set marked_done_at = null where id = current_setting('test.item')::uuid;
  if not exists (select 1 from public.item_history where field = 'marked_done_at' and item_id = current_setting('test.item')::uuid and person_id is not null) then
    raise exception 'FAIL: Not Done is not in the item''s history';
  end if;
  update public.company_links set revoked = true where token = link;
  begin
    update public.company_links set revoked = false where token = link;
    raise exception 'FAIL: a link taken back came back';
  exception when restrict_violation then null;
  end;
end $$;
reset role;

set request.jwt.claims = '';
do $$
begin
  if public.trade_page(current_setting('test.link')) is not null then raise exception 'FAIL: a link taken back still works'; end if;
end $$;

-- ---------- To Check after reopening, priority, checklists, and the plans ----------
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  j uuid := (select id from public.jobs where name = 'Fish');
  loc uuid := (select id from public.locations where job_id = (select id from public.jobs where name = 'Fish') order by sort_order limit 1);
  other_job uuid := (select id from public.jobs where id <> (select id from public.jobs where name = 'Fish') order by created_at limit 1);
  it uuid;
  p uuid;
  p2 uuid;
  rec record;
begin
  insert into public.items (job_id, location_id, title, ready, company_id, trade_id)
    select j, loc, 'Adjust closet door', true, jc.company_id, jc.trade_id from public.job_companies jc where jc.job_id = j limit 1
    returning id into it;
  -- Done by the company, then completed: the company's done is answered, and History says only
  -- that it was completed.
  update public.items set marked_done_at = now() where id = it;
  update public.items set status = 'complete' where id = it;
  if (select marked_done_at from public.items where id = it) is not null then raise exception 'FAIL: completing kept the company''s done'; end if;
  if exists (select 1 from public.item_history where item_id = it and field = 'marked_done_at' and after is null) then
    raise exception 'FAIL: completing logged the company''s done as taken back';
  end if;
  -- Undo: open again with the company's done as it was, so it is To Check again.
  update public.items set status = 'open', marked_done_at = '2026-11-04 17:10:00+00' where id = it;
  if (select marked_done_at from public.items where id = it) is null then raise exception 'FAIL: Undo did not put it back To Check'; end if;
  -- Completed, then opened again later: the done stays answered.
  update public.items set status = 'complete' where id = it;
  update public.items set status = 'open' where id = it;
  if (select marked_done_at from public.items where id = it) is not null then raise exception 'FAIL: reopening brought back the company''s done'; end if;
  -- Priority and the checklist save, and are in the history.
  update public.items set priority = true, checklist = '[{"id":"s1","text":"Both hinges","done":false}]'::jsonb where id = it;
  select * into rec from public.items where id = it;
  if not rec.priority or jsonb_array_length(rec.checklist) <> 1 then raise exception 'FAIL: priority or the checklist did not save'; end if;
  if (select count(*) from public.item_history where item_id = it and field in ('priority', 'checklist')) <> 2 then
    raise exception 'FAIL: priority or the checklist is not in the history';
  end if;
  begin
    update public.items set checklist = '{"id":"s1"}'::jsonb where id = it;
    raise exception 'FAIL: a checklist that is not a list was accepted';
  exception when check_violation then null;
  end;
  -- A plan for the level, logged; an item pinned on it.
  insert into public.plan_sheets (job_id, floor, name, width, height) values (j, 'Level 1', '  Level 1 Plan  ', 1600, 1100) returning id into p;
  select * into rec from public.plan_sheets where id = p;
  if rec.name <> 'Level 1 Plan' or rec.created_by is distinct from (select id from public.people where email = 'jake@rossbuilt.com') then
    raise exception 'FAIL: the plan was not tidied or stamped';
  end if;
  if not exists (select 1 from public.job_activity where kind = 'plan_added' and detail ->> 'plan_id' = p::text) then raise exception 'FAIL: the new plan is not in Activity'; end if;
  update public.items set plan_id = p, pin_x = 0.5, pin_y = 0.25 where id = it;
  if (select pin_x from public.items where id = it) <> 0.5 then raise exception 'FAIL: the pin did not save'; end if;
  -- Where exactly is not worth a line of history; being put on the plan is.
  if exists (select 1 from public.item_history where item_id = it and field in ('pin_x', 'pin_y')) then raise exception 'FAIL: the pin''s spot is in the history'; end if;
  if not exists (select 1 from public.item_history where item_id = it and field = 'plan_id') then raise exception 'FAIL: pinning is not in the history'; end if;
  begin
    update public.items set pin_x = 1.5 where id = it;
    raise exception 'FAIL: a pin off the plan was accepted';
  exception when check_violation then null;
  end;
  -- Off the plan: the spot goes with it.
  update public.items set plan_id = null where id = it;
  if (select pin_x from public.items where id = it) is not null then raise exception 'FAIL: an item off the plan kept its spot'; end if;
  -- Another job's plan is not this job's.
  if other_job is not null then
    insert into public.plan_sheets (job_id, floor, name, width, height) values (other_job, 'Level 1', 'Their Plan', 100, 100) returning id into p2;
    begin
      update public.items set plan_id = p2, pin_x = 0.1, pin_y = 0.1 where id = it;
      raise exception 'FAIL: an item was pinned on another job''s plan';
    exception when check_violation then null;
    end;
  end if;
  -- Taken off, never deleted.
  update public.plan_sheets set removed = true where id = p;
  if not exists (select 1 from public.job_activity where kind = 'plan_removed' and detail ->> 'plan_id' = p::text) then raise exception 'FAIL: taking off the plan is not in Activity'; end if;
  begin
    delete from public.plan_sheets where id = p;
    raise exception 'FAIL: a plan was deleted';
  exception when insufficient_privilege or restrict_violation then null;
  end;
end $$;
reset role;

-- ---------- another active person ----------
set role authenticated;
set request.jwt.claims = '{"email":"andrew@rossbuilt.com"}';

do $$
begin
  -- The team's own photos, the done photo and the owner's photo.
  if (select count(*) from public.photos p join public.items i on i.id = p.item_id where not p.done and i.source <> 'owner') <> 2 or not exists (select 1 from public.photos where done)
     or not exists (select 1 from public.photos p join public.items i on i.id = p.item_id where i.source = 'owner') or (select count(*) from public.custom_fields) <> 1 then
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

-- ---------- people, roles, job teams and assigning: as an admin ----------
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';

do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  j uuid := (select id from public.jobs where name = 'Fish');
  t uuid := (select id from public.trades where name = 'Plumbing');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  sam uuid; j2 uuid; loc2 uuid; it uuid;
begin
  -- An admin adds a person who sees only the jobs they are on.
  insert into public.people (email, name, role, sees, phone) values ('sam@rossbuilt.com', 'Sam Rivera', 'team', 'assigned', ' 941 555 0100 ') returning id into sam;
  if (select added_by from public.people where id = sam) is distinct from jake then raise exception 'FAIL: who added the person was not stamped'; end if;
  if (select phone from public.people where id = sam) <> '941 555 0100' then raise exception 'FAIL: the phone number was not tidied'; end if;
  insert into public.jobs (name) values ('Gavin Addition') returning id into j2;
  insert into public.locations (job_id, name, label, sort_order) values (j2, 'Garage', 'Garage', 1) returning id into loc2;
  if not exists (select 1 from public.job_access where job_id = j2 and person_id = jake) then raise exception 'FAIL: an admin cannot see a new job'; end if;
  if exists (select 1 from public.job_access where person_id = sam) then raise exception 'FAIL: someone who sees only their jobs sees jobs they are not on'; end if;

  -- On Fish's team: Sam sees Fish.
  insert into public.job_team (job_id, person_id, part) values (j, sam, 'field');
  if not exists (select 1 from public.job_access where job_id = j and person_id = sam and email = 'sam@rossbuilt.com') then
    raise exception 'FAIL: joining the team did not let them see the job';
  end if;
  update public.job_team set part = 'superintendent' where job_id = j and person_id = sam;
  if (select count(*) from public.job_activity where job_id = j and kind in ('team_added', 'team_changed')) <> 2 then
    raise exception 'FAIL: the team changes are not in Activity';
  end if;

  -- Assigned an item on another job: Sam joins that job's team, and sees it.
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready)
    values (j2, loc2, 'Install shelving', t, c, true) returning id into it;
  update public.items set assigned_to = sam where id = it;
  if not exists (select 1 from public.job_team where job_id = j2 and person_id = sam and part = 'field') or not exists (select 1 from public.job_access where job_id = j2 and person_id = sam) then
    raise exception 'FAIL: assigning an item did not put them on the job';
  end if;
  if not exists (select 1 from public.item_history where item_id = it and field = 'assigned_to' and after = sam::text) then
    raise exception 'FAIL: the assignment is not in the history';
  end if;
  begin
    update public.items set assigned_to = (select id from public.people where email = 'former@rossbuilt.com') where id = it;
    raise exception 'FAIL: an item was assigned to someone switched off';
  exception when check_violation then null;
  end;
  -- Assigned To is a company or someone on the team: work that is Sam's alone needs no company,
  -- but open work needs one or the other.
  declare
    ours uuid;
  begin
    insert into public.items (job_id, location_id, title, ready, assigned_to) values (j2, loc2, 'Order towel bar', true, sam) returning id into ours;
    begin
      update public.items set assigned_to = null where id = ours;
      raise exception 'FAIL: an open item was left assigned to no one';
    exception when check_violation then null;
    end;
    -- Done work keeps its record, assigned or not.
    update public.items set status = 'removed' where id = ours;
    update public.items set assigned_to = null where id = ours;
  end;
  -- Off Gavin Addition's team again: Sam no longer sees it.
  delete from public.job_team where job_id = j2 and person_id = sam;
  if exists (select 1 from public.job_access where job_id = j2 and person_id = sam) or (select count(*) from public.job_activity where job_id = j2 and kind = 'team_removed') <> 1 then
    raise exception 'FAIL: leaving the team did not take the job away';
  end if;

  -- Closing a job is in Activity.
  update public.jobs set archived = true where id = j2;
  update public.jobs set archived = false where id = j2;
  if (select count(*) from public.job_activity where job_id = j2 and kind in ('job_closed', 'job_reopened')) <> 2 then raise exception 'FAIL: closing a job is not in Activity'; end if;

  -- Ross Built always keeps an admin who can sign in.
  update public.people set role = 'team' where email = 'andrew@rossbuilt.com';
  begin
    update public.people set active = false where id = jake;
    raise exception 'FAIL: the last admin was switched off';
  exception when check_violation then null;
  end;
  update public.people set role = 'admin' where email = 'andrew@rossbuilt.com';
  begin
    delete from public.people where id = sam;
    raise exception 'FAIL: a person was deleted';
  exception when insufficient_privilege or restrict_violation then null;
  end;
  perform set_config('test.gavin', j2::text, false);
end $$;
reset role;

-- ---------- a team member who sees only their jobs ----------
set role authenticated;
set request.jwt.claims = '{"email":"sam@rossbuilt.com"}';

do $$
declare
  j uuid := (select id from public.jobs where name = 'Fish');
  loc uuid := (select id from public.locations where job_id = (select id from public.jobs where name = 'Fish') order by sort_order limit 1);
  t uuid := (select id from public.trades where name = 'Plumbing');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  x uuid; x2 uuid;
begin
  if (select count(*) from public.jobs) <> 1 or (select name from public.jobs) <> 'Fish' then raise exception 'FAIL: a team member sees jobs they are not on'; end if;
  if exists (select 1 from public.items where job_id = current_setting('test.gavin')::uuid) or exists (select 1 from public.job_team where job_id = current_setting('test.gavin')::uuid) then
    raise exception 'FAIL: a team member sees another job''s work';
  end if;
  -- The work itself: add an item, mark a location walked, comment.
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready) values (j, loc, 'Install faucet', t, c, true) returning id into x;
  update public.locations set walked_at = now() where id = loc;
  insert into public.comments (job_id, item_id, body) values (j, x, 'Faucet is on site.');
  -- Not the setup: no new job, location, company, title or person, no renaming, no teams.
  begin
    insert into public.jobs (name) values ('My Job');
    raise exception 'FAIL: a team member made a job';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.locations set label = 'Renamed' where id = loc;
    raise exception 'FAIL: a team member renamed a location';
  exception when insufficient_privilege then null;
  end;
  -- The walk itself: a location typed in, and a company picked for an item, put on the job.
  insert into public.locations (job_id, name, label, sort_order) values (j, 'Attic', 'Attic', 99);
  insert into public.companies (name) values ('My Company') returning id into x2;
  insert into public.job_companies (job_id, company_id, trade_id) values (j, x2, t);
  if (select org from public.companies where id = x2) <> 'ross_built' then raise exception 'FAIL: a company a team member added is not at their company'; end if;
  -- Not on a job they are not on, and not changing a company.
  begin
    insert into public.locations (job_id, name, label, sort_order) values (current_setting('test.gavin')::uuid, 'Attic', 'Attic', 99);
    raise exception 'FAIL: a team member added a location to a job they are not on';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.job_companies (job_id, company_id, trade_id) values (current_setting('test.gavin')::uuid, x2, t);
    raise exception 'FAIL: a team member put a company on a job they are not on';
  exception when insufficient_privilege then null;
  end;
  update public.companies set name = 'Renamed Company' where id = x2;
  if (select name from public.companies where id = x2) <> 'My Company' then raise exception 'FAIL: a team member renamed a company'; end if;
  begin
    insert into public.title_library (title, trade_id) values ('Install widget', t);
    raise exception 'FAIL: a team member added a standard title';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.people (email, name) values ('friend@rossbuilt.com', 'Friend');
    raise exception 'FAIL: a team member added a person';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.job_team (job_id, person_id) values (j, (select id from public.people where email = 'andrew@rossbuilt.com'));
    raise exception 'FAIL: a team member changed a team';
  exception when insufficient_privilege then null;
  end;
  update public.people set role = 'admin' where email = 'sam@rossbuilt.com';
  if (select role from public.people where email = 'sam@rossbuilt.com') <> 'team' then raise exception 'FAIL: a team member made themself an admin'; end if;
end $$;
reset role;

-- ---------- copy and paste, dragging, and templates ----------
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';

do $$
declare
  j uuid := (select id from public.jobs where name = 'Fish');
  loc uuid := (select id from public.locations where job_id = (select id from public.jobs where name = 'Fish') order by sort_order limit 1);
  t uuid := (select id from public.trades where name = 'Plumbing');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  tpl uuid; other uuid; a uuid; b uuid; x uuid; y uuid; before_count int;
begin
  -- Pasted items and items from a template say so; one made on the phone with its id can be waited on.
  x := gen_random_uuid();
  insert into public.items (id, job_id, location_id, title, trade_id, company_id, ready, source) values (x, j, loc, 'Caulk shower corner', t, c, true, 'copy');
  insert into public.items (job_id, location_id, title, trade_id, company_id, ready, waiting_on_items, source)
    values (j, loc, 'Install shower glass', t, c, false, array[x], 'template') returning id into y;
  if (select waiting_on_items from public.items where id = y) <> array[x] then raise exception 'FAIL: a pasted item could not wait on another'; end if;
  begin
    insert into public.items (job_id, location_id, title, trade_id, company_id, ready, source) values (j, loc, 'Bad source', t, c, true, 'magic');
    raise exception 'FAIL: an unknown source was accepted';
  exception when check_violation then null;
  end;
  -- Dragging it in its list keeps where it was put, with no line in its History.
  select count(*) into before_count from public.item_history where item_id = y;
  update public.items set position = 0.5 where id = y;
  if (select position from public.items where id = y) <> 0.5 then raise exception 'FAIL: the position did not save'; end if;
  if (select count(*) from public.item_history where item_id = y) <> before_count then raise exception 'FAIL: dragging an item wrote its History'; end if;

  -- An admin makes a template: its tasks wait only on tasks in it.
  insert into public.templates (name) values ('  End  of the House ') returning id into tpl;
  if (select name from public.templates where id = tpl) <> 'End of the House' or (select created_by from public.templates where id = tpl) is null then
    raise exception 'FAIL: the template name was not tidied or its maker not stamped';
  end if;
  insert into public.template_items (template_id, title, trade_id, hours, place) values (tpl, 'Caulk shower corner', t, 0.5, 'bathroom') returning id into a;
  insert into public.template_items (template_id, title, trade_id, hours, place, waits_on) values (tpl, 'Install shower glass', t, 2, 'bathroom', array[a, a]) returning id into b;
  if (select waits_on from public.template_items where id = b) <> array[a] then raise exception 'FAIL: a task waits on the same task twice'; end if;
  begin
    insert into public.template_items (template_id, title, place) values (tpl, 'Somewhere', 'attic');
    raise exception 'FAIL: a place every job does not have was accepted';
  exception when check_violation then null;
  end;
  insert into public.templates (name) values ('Pool') returning id into other;
  begin
    insert into public.template_items (template_id, title, place, waits_on) values (other, 'Fill pool', 'Pool', array[a]);
    raise exception 'FAIL: a task waited on a task in another template';
  exception when check_violation then null;
  end;
  begin
    insert into public.templates (name) values ('end of the house');
    raise exception 'FAIL: two templates with the same name';
  exception when unique_violation then null;
  end;
  begin
    delete from public.template_items where id = a;
    raise exception 'FAIL: a template task was deleted';
  exception when insufficient_privilege or restrict_violation then null;
  end;
  update public.template_items set active = false where id = b;
  perform set_config('test.template', tpl::text, false);
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"sam@rossbuilt.com"}';

do $$
declare
  tpl uuid := current_setting('test.template')::uuid;
begin
  -- The team uses the templates, and only an admin changes them.
  if (select count(*) from public.template_items where template_id = tpl) <> 2 then raise exception 'FAIL: the team cannot read the templates'; end if;
  begin
    insert into public.templates (name) values ('Mine');
    raise exception 'FAIL: a team member made a template';
  exception when insufficient_privilege then null;
  end;
  update public.template_items set title = 'Changed' where template_id = tpl;
  if exists (select 1 from public.template_items where template_id = tpl and title = 'Changed') then raise exception 'FAIL: a team member changed a template'; end if;
end $$;
reset role;

-- ---------- the people at each company, and the schedule each send keeps ----------
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';

do $$
declare
  j uuid := (select id from public.jobs where name = 'Fish');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  other uuid := (select id from public.companies where id <> (select id from public.companies where name = 'Gator Plumbing') limit 1);
  k uuid; s uuid; rec record;
begin
  -- An admin adds a company's people: tidied, stamped, kept to the company.
  insert into public.company_contacts (company_id, name, email, phone) values (c, '  Mike   Smith ', ' Mike@GatorPlumbing.com ', ' 941  555 0123 ') returning id into k;
  select * into rec from public.company_contacts where id = k;
  if rec.name <> 'Mike Smith' or rec.email <> 'mike@gatorplumbing.com' or rec.phone <> '941 555 0123' or not rec.gets_lists or rec.created_by is null then
    raise exception 'FAIL: a contact was not tidied or stamped: %', row_to_json(rec);
  end if;
  insert into public.company_contacts (company_id, phone) values (c, '941 555 0100');
  begin
    insert into public.company_contacts (company_id, name, email) values (c, 'Bad', 'not an email');
    raise exception 'FAIL: a bad email was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.company_contacts (company_id, name) values (c, '   ');
    raise exception 'FAIL: a contact with no name, email or phone was accepted';
  exception when check_violation then null;
  end;
  -- Moving a contact to another company, or changing who added it, does not take.
  update public.company_contacts set company_id = other, gets_lists = false where id = k;
  if (select company_id from public.company_contacts where id = k) <> c then raise exception 'FAIL: a contact moved to another company'; end if;
  if (select gets_lists from public.company_contacts where id = k) then raise exception 'FAIL: gets_lists did not change'; end if;
  begin
    delete from public.company_contacts where id = k;
    raise exception 'FAIL: a contact was deleted';
  exception when insufficient_privilege or restrict_violation then null;
  end;
  update public.company_contacts set active = false where id = k;

  -- The Three Week Look Ahead and the Schedule Email go out, each keeping the schedule as it went.
  insert into public.list_sends (job_id, list, snapshot) values (j, 'lookahead', '{"finish":"2026-11-17","bars":[]}') returning id into s;
  insert into public.list_sends (job_id, list, snapshot)
    values (j, 'schedule', '{"finish":"2026-11-17","bars":[{"key":"v1","companyId":"x","start":"2026-11-16","end":"2026-11-17","confirmed":true}]}');
  update public.list_sends set snapshot = '{"finish":null,"bars":[]}', removed = true where id = s;
  select snapshot, removed into rec from public.list_sends where id = s;
  if rec.snapshot ->> 'finish' <> '2026-11-17' or not rec.removed then raise exception 'FAIL: the schedule a send kept was changed: %', row_to_json(rec); end if;
  begin
    insert into public.list_sends (job_id, list, snapshot) values (j, 'schedule', '[1, 2]');
    raise exception 'FAIL: a schedule kept as something other than an object was accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"sam@rossbuilt.com"}';

do $$
declare
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
begin
  -- The team sees who to send to, and only an admin changes it.
  if (select count(*) from public.company_contacts where company_id = c) <> 2 then raise exception 'FAIL: the team cannot read the contacts'; end if;
  begin
    insert into public.company_contacts (company_id, name) values (c, 'Mine');
    raise exception 'FAIL: a team member added a contact';
  exception when insufficient_privilege then null;
  end;
  update public.company_contacts set name = 'Changed' where company_id = c;
  if exists (select 1 from public.company_contacts where name = 'Changed') then raise exception 'FAIL: a team member changed a contact'; end if;
end $$;
reset role;

-- ---------- Claude's use, and merging two items ----------
-- What Claude costs is counted by the functions, as the service role. The app never counts it or
-- sets an allowance, and an admin sees their own company's.
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  a jsonb := public.ai_allowance();
begin
  if a ->> 'org' <> 'ross_built' or (a ->> 'person_id')::uuid is distinct from jake
     or (a ->> 'limit_cents')::numeric <> 20000 or (a ->> 'used_cents')::numeric <> 0 then
    raise exception 'FAIL: the allowance is not Ross Built''s: %', a;
  end if;
  begin
    insert into public.ai_usage (org, task, model, cost_cents) values ('ross_built', 'fill-in', 'claude-sonnet-5-5', 0);
    raise exception 'FAIL: the app counted its own use of Claude';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.ai_limits;
    raise exception 'FAIL: the app can read the allowances';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_limits set monthly_cents = 999999;
    raise exception 'FAIL: the app changed its allowance';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role service_role;
insert into public.ai_usage (org, person_id, task, model, input_tokens, output_tokens, cost_cents) values
  ('ross_built', (select id from public.people where email = 'jake@rossbuilt.com'), 'fill-in', 'claude-sonnet-5-5', 1200, 300, 0.54),
  ('ross_built', (select id from public.people where email = 'sam@rossbuilt.com'), 'say-it', 'claude-sonnet-5-5', 2000, 900, 1.3);
-- Last month's is not this month's.
insert into public.ai_usage (org, task, model, cost_cents, created_at)
  values ('ross_built', 'read-plans', 'claude-sonnet-5-5', 80, date_trunc('month', now()) - interval '1 day');
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
begin
  if (public.ai_allowance() ->> 'used_cents')::numeric <> 1.84 then raise exception 'FAIL: this month''s use is not what was counted: %', public.ai_allowance(); end if;
  if (select count(*) from public.ai_usage) <> 3 then raise exception 'FAIL: an admin does not see what Claude cost the company'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"sam@rossbuilt.com"}';
do $$
declare
  a jsonb := public.ai_allowance();
begin
  if a ->> 'org' <> 'ross_built' or (a ->> 'person_id')::uuid is distinct from public.current_person_id() or (a ->> 'used_cents')::numeric <> 1.84 then
    raise exception 'FAIL: a team member''s allowance is not their company''s: %', a;
  end if;
  if exists (select 1 from public.ai_usage) then raise exception 'FAIL: a team member sees what Claude cost'; end if;
end $$;
reset role;

-- The same work written twice: the one kept takes the other's photos and comments.
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  j uuid := (select id from public.jobs where name = 'Fish');
  loc uuid := (select id from public.locations where job_id = (select id from public.jobs where name = 'Fish') order by sort_order limit 1);
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  g uuid := (select id from public.items where job_id = current_setting('test.gavin')::uuid and title = 'Install shelving');
  keep uuid; dupe uuid; waits uuid; n_dupe integer;
  pk uuid; p1 uuid; p2 uuid; p3 uuid; m1 uuid; m2 uuid;
  r jsonb; rec record;
begin
  insert into public.items (job_id, location_id, title, company_id, ready) values (j, loc, 'Replace the outlet by the sink', c, true) returning id into keep;
  insert into public.items (job_id, location_id, title, company_id, ready) values (j, loc, 'Sink outlet replace', c, true) returning id, number into dupe, n_dupe;
  insert into public.photos (job_id, item_id, width, height, sort_order) values (j, keep, 900, 1200, 1) returning id into pk;
  insert into public.photos (job_id, item_id, width, height, sort_order) values (j, dupe, 900, 1200, 1) returning id into p1;
  insert into public.photos (job_id, item_id, width, height, sort_order) values (j, dupe, 900, 1200, 2) returning id into p2;
  insert into public.photos (job_id, item_id, width, height, sort_order) values (j, dupe, 900, 1200, 3) returning id into p3;
  update public.photos set removed = true where id = p3;
  insert into public.comments (job_id, item_id, body) values (j, dupe, 'The cover plate is cracked too.') returning id into m1;
  insert into public.comments (job_id, item_id, body) values (j, dupe, 'Never mind.') returning id into m2;
  update public.comments set removed = true where id = m2;
  insert into public.items (job_id, location_id, title, company_id, ready, waiting_on_items)
    values (j, loc, 'Install the backsplash', c, false, array[dupe]) returning id into waits;

  -- Outside of a merge, a photo stays with its item.
  update public.photos set item_id = waits where id = p1;
  if (select item_id from public.photos where id = p1) <> dupe then raise exception 'FAIL: a photo moved to another item'; end if;

  r := public.merge_items(keep, dupe);
  if r <> '{"photos": 2, "comments": 1}'::jsonb then raise exception 'FAIL: the merge did not say what came along: %', r; end if;
  if (select item_id from public.photos where id = p1) <> keep or (select item_id from public.photos where id = p2) <> keep
     or (select item_id from public.comments where id = m1) <> keep then
    raise exception 'FAIL: the photos and the comment did not come along';
  end if;
  if (select sort_order from public.photos where id = pk) <> 1 or (select sort_order from public.photos where id = p1) <> 2
     or (select sort_order from public.photos where id = p2) <> 3 then
    raise exception 'FAIL: the photos that came along are not after the kept item''s own';
  end if;
  if (select item_id from public.photos where id = p3) <> dupe or (select item_id from public.comments where id = m2) <> dupe then
    raise exception 'FAIL: what was taken back came along';
  end if;
  if (select status from public.items where id = dupe) <> 'removed' or (select status from public.items where id = keep) <> 'open' then
    raise exception 'FAIL: the merged item was not removed, or the kept one was';
  end if;
  select ready, waiting_on_items into rec from public.items where id = waits;
  if rec.ready or rec.waiting_on_items <> array[keep] then raise exception 'FAIL: what waited on the merged item does not wait on the kept one'; end if;
  select * into rec from public.job_activity where kind = 'items_merged' and item_id = keep;
  if rec.person_id is distinct from jake or (rec.detail ->> 'from_number')::int <> n_dupe or rec.detail ->> 'from_title' <> 'Sink outlet replace'
     or rec.detail ->> 'into_title' <> 'Replace the outlet by the sink' or (rec.detail ->> 'photos')::int <> 2 or (rec.detail ->> 'comments')::int <> 1 then
    raise exception 'FAIL: the merge is not in Activity as it happened';
  end if;
  -- Merging adds no photo, mark or comment to Activity.
  if (select count(*) from public.job_activity where kind in ('photo_added', 'photo_marked', 'photo_removed', 'comment_added') and item_id = keep) <> 1 then
    raise exception 'FAIL: the merge logged photos or comments as new';
  end if;

  begin
    perform public.merge_items(keep, dupe);
    raise exception 'FAIL: an item was merged twice';
  exception when check_violation then null;
  end;
  begin
    perform public.merge_items(keep, keep);
    raise exception 'FAIL: an item was merged into itself';
  exception when check_violation then null;
  end;
  begin
    perform public.merge_items(keep, g);
    raise exception 'FAIL: items on two jobs were merged';
  exception when check_violation then null;
  end;
  begin
    perform public.merge_items(keep, gen_random_uuid());
    raise exception 'FAIL: an item that is not there was merged';
  exception when insufficient_privilege then null;
  end;

  -- The kept item waiting on the merged one just stops waiting on it.
  declare
    a uuid; b uuid;
  begin
    insert into public.items (job_id, location_id, title, company_id, ready) values (j, loc, 'Patch the drywall', c, true) returning id into b;
    insert into public.items (job_id, location_id, title, company_id, ready, waiting_on_items) values (j, loc, 'Patch drywall', c, false, array[b]) returning id into a;
    perform public.merge_items(a, b);
    select ready, waiting_on_items into rec from public.items where id = a;
    if not rec.ready or cardinality(rec.waiting_on_items) <> 0 then raise exception 'FAIL: the kept item still waits on the one merged into it'; end if;
  end;
  -- When waiting on the kept item would leave something waiting on itself, it just stops waiting.
  declare
    a uuid; b uuid; d uuid;
  begin
    insert into public.items (job_id, location_id, title, company_id, ready) values (j, loc, 'Seal the grout', c, true) returning id into d;
    insert into public.items (job_id, location_id, title, company_id, ready, waiting_on_items) values (j, loc, 'Set the tile', c, false, array[d]) returning id into b;
    insert into public.items (job_id, location_id, title, company_id, ready, waiting_on_items) values (j, loc, 'Seal grout', c, false, array[b]) returning id into a;
    perform public.merge_items(a, d);
    select ready, waiting_on_items into rec from public.items where id = b;
    if not rec.ready or cardinality(rec.waiting_on_items) <> 0 then raise exception 'FAIL: what would wait on itself still waits'; end if;
    if (select waiting_on_items from public.items where id = a) <> array[b] then raise exception 'FAIL: the kept item lost what it waits on'; end if;
  end;

  perform set_config('test.merge_keep', keep::text, false);
  perform set_config('test.merge_photo', p1::text, false);
  perform set_config('test.merge_comment', m1::text, false);
  perform set_config('test.merge_other', waits::text, false);
  perform set_config('test.gavin_item', g::text, false);
end $$;
reset role;

-- Even with full rights, a comment stays with its item outside of a merge, and a merge never
-- moves anything to another job.
do $$
declare
  keep uuid := current_setting('test.merge_keep')::uuid;
  p uuid := current_setting('test.merge_photo')::uuid;
  m uuid := current_setting('test.merge_comment')::uuid;
  g uuid := current_setting('test.gavin_item')::uuid;
begin
  begin
    update public.comments set item_id = current_setting('test.merge_other')::uuid where id = m;
    raise exception 'FAIL: a comment moved to another item';
  exception when restrict_violation then null;
  end;
  perform set_config('punch.merging', 'on', true);
  begin
    update public.comments set item_id = g where id = m;
    raise exception 'FAIL: a comment moved to another job';
  exception when restrict_violation then null;
  end;
  update public.photos set item_id = g where id = p;
  if (select item_id from public.photos where id = p) <> keep then raise exception 'FAIL: a photo moved to another job'; end if;
  perform set_config('punch.merging', '', true);
end $$;

-- A team member merges only on the jobs they are on.
set role authenticated;
set request.jwt.claims = '{"email":"sam@rossbuilt.com"}';
do $$
begin
  begin
    perform public.merge_items(current_setting('test.gavin_item')::uuid, (select id from public.items where title = 'Install faucet' limit 1));
    raise exception 'FAIL: a team member merged on a job they are not on';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- who can sign in ----------
do $$
begin
  if public.hook_only_ross_built_people('{"user":{"email":" Jake@RossBuilt.com "}}') <> '{}'::jsonb then
    raise exception 'FAIL: an active person was turned away at sign in';
  end if;
  -- Anyone may sign up and start a company.
  if public.hook_only_ross_built_people('{"user":{"email":"stranger@example.com"}}') <> '{}'::jsonb then
    raise exception 'FAIL: a new email was turned away at sign up';
  end if;
  if public.hook_only_ross_built_people('{"user":{"email":"former@rossbuilt.com"}}') -> 'error' ->> 'message'
     <> 'That email is switched off at Ross Built. Ask an admin there to switch it back on.' then
    raise exception 'FAIL: a switched off person was not told so at sign in';
  end if;
  if public.hook_only_ross_built_people('{}') -> 'error' is null then
    raise exception 'FAIL: a sign in with no email was let in';
  end if;
end $$;
set role authenticated;
do $$
begin
  perform public.hook_only_ross_built_people('{}');
  raise exception 'FAIL: the app can call the sign in check';
exception when insufficient_privilege then null;
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
     + (select count(*) from public.comments) + (select count(*) from public.company_links)
     + (select count(*) from public.job_team) + (select count(*) from public.job_access) + (select count(*) from public.ai_usage) <> 0 then
    raise exception 'FAIL: an uninvited account can see data';
  end if;
  if public.ai_allowance() is not null then raise exception 'FAIL: an uninvited account has an allowance for Claude'; end if;
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
  if public.ai_allowance() is not null then raise exception 'FAIL: a switched off person has an allowance for Claude'; end if;
  begin
    perform public.merge_items(current_setting('test.merge_keep')::uuid, current_setting('test.merge_other')::uuid);
    raise exception 'FAIL: a switched off person merged items';
  exception when insufficient_privilege then null;
  end;
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
do $$
begin
  perform public.ai_allowance();
  raise exception 'FAIL: anonymous access reached the allowance';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform public.merge_items(gen_random_uuid(), gen_random_uuid());
  raise exception 'FAIL: anonymous access merged items';
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
  begin
    delete from public.templates;
    raise exception 'FAIL: a template was deleted with full rights';
  exception when restrict_violation then null;
  end;
  if (select count(*) from public.items i join public.jobs j on j.id = i.job_id where j.name = 'Test Job (generated)') <> 600 then
    raise exception 'FAIL: the test job does not have 600 items';
  end if;
  if (select count(distinct number) from public.items i join public.jobs j on j.id = i.job_id where j.name = 'Test Job (generated)') <> 600 then
    raise exception 'FAIL: test job item numbers are not unique';
  end if;
end $$;

-- ---------- deleting a job ----------
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  j uuid; loc uuid; x uuid; t uuid := (select id from public.trades where org = 'ross_built' and name = 'Plumbing');
  c uuid := (select id from public.companies where name = 'Gator Plumbing');
  fish_items int := (select count(*) from public.items where job_id = (select id from public.jobs where name = 'Fish'));
  n int; tbl text;
begin
  insert into public.jobs (name, address) values ('Old Job', '1 Old Road') returning id into j;
  insert into public.locations (job_id, name, label, kind, sort_order) values (j, 'Garage', 'Garage', 'room', 1) returning id into loc;
  insert into public.job_companies (job_id, company_id, trade_id) values (j, c, t);
  insert into public.job_team (job_id, person_id, part) values (j, (select id from public.people where email = 'jake@rossbuilt.com'), 'project_manager');
  insert into public.items (job_id, location_id, title, company_id, ready) values (j, loc, 'Sweep the garage', c, true) returning id into x;
  update public.items set title = 'Sweep and clean the garage' where id = x;
  insert into public.photos (job_id, item_id, width, height) values (j, x, 900, 1200);
  insert into public.comments (job_id, item_id, body) values (j, x, 'Broom is in the truck.');
  insert into public.company_links (job_id, company_id) values (j, c);
  perform public.job_station(j, 'make');
  perform set_config('test.old_job', j::text, false);
  perform set_config('test.fish_count', fish_items::text, false);
  -- Not some other job, and not one that is not there.
  begin
    perform public.delete_job(gen_random_uuid());
    raise exception 'FAIL: a job that is not there was deleted';
  exception when no_data_found then null;
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"sam@rossbuilt.com"}';
do $$
begin
  begin
    perform public.delete_job(current_setting('test.old_job')::uuid);
    raise exception 'FAIL: a team member deleted a job';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
select public.delete_job(current_setting('test.old_job')::uuid);
reset role;

do $$
declare
  j uuid := current_setting('test.old_job')::uuid;
  tbl text; n int;
begin
  foreach tbl in array array['job_team', 'job_companies', 'job_activity', 'item_history', 'comments', 'list_sends', 'company_links', 'job_stations', 'photos', 'items', 'visits', 'plan_sheets', 'job_waiting_on', 'locations', 'job_access'] loop
    execute format('select count(*) from public.%I where job_id = %L', tbl, j) into n;
    if n <> 0 then raise exception 'FAIL: % still has the deleted job''s rows', tbl; end if;
  end loop;
  if exists (select 1 from public.jobs where id = j) then raise exception 'FAIL: the deleted job is still there'; end if;
  if (select count(*) from public.items where job_id = (select id from public.jobs where name = 'Fish'))::text <> current_setting('test.fish_count') then
    raise exception 'FAIL: deleting one job touched another';
  end if;
  -- Nothing else can be deleted afterward.
  begin
    delete from public.items where job_id = (select id from public.jobs where name = 'Fish');
    raise exception 'FAIL: an item was deleted after a job was';
  exception when restrict_violation then null;
  end;
end $$;

-- ---------- a second company ----------
-- Anyone signs up, names their company and becomes its admin. Each company sees only its own.
do $$
begin
  perform set_config('test.fish', (select id::text from public.jobs where name = 'Fish'), false);
  perform set_config('test.fish_items', (select count(*)::text from public.items where org = 'ross_built'), false);
  insert into auth.users (id, email) values
    ('11111111-1111-4111-8111-111111111111', 'pat@gulfcoast.example'),
    ('22222222-2222-4222-8222-222222222222', 'sam@gulfcoast.example');
end $$;

set role authenticated;
set request.jwt.claims = '{"email":"pat@gulfcoast.example","sub":"11111111-1111-4111-8111-111111111111"}';
do $$
declare
  mine text;
  j uuid; loc uuid; c uuid; i uuid;
begin
  if public.my_account() ->> 'state' <> 'none' then raise exception 'FAIL: a new email is already with a company'; end if;
  if (select count(*) from public.jobs) + (select count(*) from public.people) + (select count(*) from public.orgs)
     + (select count(*) from public.trades) + (select count(*) from public.companies) <> 0 then
    raise exception 'FAIL: someone with no company sees data';
  end if;
  begin
    perform public.start_company('   ', 'Pat Lee');
    raise exception 'FAIL: a company with no name was started';
  exception when check_violation then null;
  end;
  begin
    perform public.start_company('Gulf Coast Homes', '');
    raise exception 'FAIL: a company was started with no name for its admin';
  exception when check_violation then null;
  end;
  mine := public.start_company('  Gulf   Coast Homes ', ' Pat  Lee ');
  if (select count(*) from public.orgs) <> 1 or (select name from public.orgs) <> 'Gulf Coast Homes' or (select id from public.orgs) <> mine then
    raise exception 'FAIL: the new company is not set up as named';
  end if;
  if public.my_account() ->> 'state' <> 'active' or public.my_account() ->> 'company' <> 'Gulf Coast Homes' then
    raise exception 'FAIL: the new admin is not active at the new company';
  end if;
  if (select count(*) from public.people) <> 1 or (select role from public.people) <> 'admin' or (select name from public.people) <> 'Pat Lee' then
    raise exception 'FAIL: the new company does not have its admin';
  end if;
  if (select count(*) from public.trades) <> 19 or (select name from public.trades order by sort_order limit 1) <> 'Site Work' then
    raise exception 'FAIL: the new company did not get the usual trades';
  end if;
  begin
    perform public.start_company('Another Company', 'Pat Lee');
    raise exception 'FAIL: one email started two companies';
  exception when unique_violation then null;
  end;

  -- Its own job: the database fills in the company on every row.
  insert into public.jobs (name, address) values ('Bayview', '12 Bay Road') returning id into j;
  insert into public.locations (job_id, name, number, label, kind, sort_order) values (j, 'Kitchen', '101', 'Kitchen 101', 'room', 1) returning id into loc;
  -- Names are unique within a company only: Ross Built has a Gator Plumbing and a Plumbing too.
  insert into public.companies (name, default_trade_id) values ('Gator Plumbing', (select id from public.trades where name = 'Plumbing')) returning id into c;
  insert into public.job_companies (job_id, company_id, trade_id) values (j, c, (select id from public.trades where name = 'Plumbing'));
  insert into public.items (job_id, location_id, title, company_id, ready, bought_out) values (j, loc, 'Install toilet', c, true, true) returning id into i;
  if (select org from public.jobs where id = j) <> mine or (select org from public.locations where id = loc) <> mine
     or (select org from public.companies where id = c) <> mine or (select org from public.items where id = i) <> mine then
    raise exception 'FAIL: a new row did not get its company';
  end if;
  if (select number from public.items where id = i) <> 1 then raise exception 'FAIL: the new company''s first item is not number 1'; end if;
  -- Saying another company's org changes nothing: the row is still this company's.
  insert into public.trades (org, name) values ('ross_built', 'Odd Jobs');
  if (select org from public.trades where name = 'Odd Jobs') <> mine then raise exception 'FAIL: a row was put in another company'; end if;
  update public.trades set org = 'ross_built' where name = 'Odd Jobs';
  if (select org from public.trades where name = 'Odd Jobs') <> mine then raise exception 'FAIL: a row was moved to another company'; end if;

  -- Ross Built's rows are out of reach, even with their ids.
  if exists (select 1 from public.jobs where id = current_setting('test.fish')::uuid) or public.can_see_job(current_setting('test.fish')::uuid) then
    raise exception 'FAIL: one company sees another''s job';
  end if;
  if exists (select 1 from public.items where org <> mine) or exists (select 1 from public.people where org <> mine)
     or exists (select 1 from public.job_access where org <> mine) or exists (select 1 from public.companies where org <> mine) then
    raise exception 'FAIL: one company sees another''s rows';
  end if;
  begin
    insert into public.items (job_id, title, ready, bought_out) values (current_setting('test.fish')::uuid, 'Sneaky', true, true);
    raise exception 'FAIL: one company added an item to another''s job';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.locations (job_id, name, label, kind, sort_order) values (current_setting('test.fish')::uuid, 'Sneaky', 'Sneaky', 'room', 99);
    raise exception 'FAIL: one company added a location to another''s job';
  exception when insufficient_privilege then null;
  end;
  update public.people set name = 'Changed by another company' where email = 'jake@rossbuilt.com';
  update public.items set title = 'Changed by another company' where job_id = current_setting('test.fish')::uuid;
  update public.jobs set name = 'Changed by another company' where id = current_setting('test.fish')::uuid;
  -- Moving its item to Ross Built's job is turned down.
  begin
    update public.items set job_id = current_setting('test.fish')::uuid where id = i;
    raise exception 'FAIL: an item moved to another company''s job';
  exception when insufficient_privilege or check_violation then null;
  end;
  -- An email is with one company: Pat cannot add someone from Ross Built.
  begin
    insert into public.people (email, name) values ('jake@rossbuilt.com', 'Jake Ross');
    raise exception 'FAIL: one email was added at two companies';
  exception when unique_violation then null;
  end;
  insert into public.people (email, name, role, sees) values ('sam@gulfcoast.example', 'Sam Diaz', 'team', 'all');
  if (select org from public.people where email = 'sam@gulfcoast.example') <> mine then raise exception 'FAIL: a new person did not get the company'; end if;
  -- Photos are kept by job: a path names its job.
  if public.job_of_path(j::text || '/' || i::text || '.jpg') <> j or public.job_of_path(j::text || '/plans/x.jpg') <> j
     or public.job_of_path('not a job/x.jpg') is not null or public.job_of_path(null) is not null then
    raise exception 'FAIL: a photo path does not name its job';
  end if;
  if public.alone_in_company() then raise exception 'FAIL: Pat is not alone at the company'; end if;
  -- Claude: the usual allowance, nothing used, and nothing of Ross Built's seen or merged.
  if public.ai_allowance() ->> 'org' <> mine or (public.ai_allowance() ->> 'limit_cents')::numeric <> 2500
     or (public.ai_allowance() ->> 'used_cents')::numeric <> 0 or exists (select 1 from public.ai_usage) then
    raise exception 'FAIL: the new company''s allowance for Claude is not the usual one: %', public.ai_allowance();
  end if;
  begin
    perform public.merge_items(current_setting('test.merge_keep')::uuid, current_setting('test.merge_other')::uuid);
    raise exception 'FAIL: one company merged another''s items';
  exception when insufficient_privilege then null;
  end;
  -- The company's name: its admin changes it.
  update public.orgs set name = '  Gulf Coast Homes  LLC ' where id = mine;
  if (select name from public.orgs) <> 'Gulf Coast Homes LLC' then raise exception 'FAIL: the admin could not rename the company'; end if;
  perform set_config('test.gulf', mine, false);
  perform set_config('test.bayview', j::text, false);
end $$;
reset role;

-- What Claude cost the new company, and its own allowance, go with it when it is deleted.
set role service_role;
insert into public.ai_usage (org, task, model, cost_cents) values (current_setting('test.gulf'), 'fill-in', 'claude-sonnet-5-5', 1);
insert into public.ai_limits (org, monthly_cents) values (current_setting('test.gulf'), 5000);
reset role;

-- Ross Built sees none of it, and nothing of its own changed.
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
begin
  if (select count(*) from public.orgs) <> 1 or (select name from public.orgs) <> 'Ross Built' then raise exception 'FAIL: Ross Built sees another company'; end if;
  if exists (select 1 from public.jobs where id = current_setting('test.bayview')::uuid) or public.can_see_job(current_setting('test.bayview')::uuid)
     or exists (select 1 from public.people where org <> 'ross_built') or exists (select 1 from public.trades where org <> 'ross_built')
     or exists (select 1 from public.items where org <> 'ross_built') or exists (select 1 from public.job_access where org <> 'ross_built')
     or exists (select 1 from public.ai_usage where org <> 'ross_built') then
    raise exception 'FAIL: Ross Built sees another company''s rows';
  end if;
  if (public.ai_allowance() ->> 'used_cents')::numeric <> 1.84 then raise exception 'FAIL: another company''s use of Claude was counted as Ross Built''s'; end if;
  if exists (select 1 from public.people where name = 'Changed by another company') or exists (select 1 from public.items where title = 'Changed by another company')
     or exists (select 1 from public.jobs where name = 'Changed by another company') then
    raise exception 'FAIL: another company changed Ross Built''s rows';
  end if;
  begin
    update public.orgs set name = 'Taken Over' where id = current_setting('test.gulf');
    if exists (select 1 from public.orgs where name = 'Taken Over') then raise exception 'FAIL: Ross Built renamed another company'; end if;
  end;
end $$;
reset role;

-- A team member at the new company cannot rename it; deleting an account.
set role authenticated;
set request.jwt.claims = '{"email":"sam@gulfcoast.example","sub":"22222222-2222-4222-8222-222222222222"}';
do $$
begin
  update public.orgs set name = 'Renamed by Sam';
  if exists (select 1 from public.orgs where name = 'Renamed by Sam') then raise exception 'FAIL: a team member renamed the company'; end if;
  if (select count(*) from public.jobs) <> 1 then raise exception 'FAIL: Sam does not see the company''s job'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"pat@gulfcoast.example","sub":"11111111-1111-4111-8111-111111111111"}';
do $$
begin
  -- The only admin, with someone still at the company: someone else is made admin first.
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: the only admin deleted their account with people still at the company';
  exception when check_violation then null;
  end;
  update public.items set assigned_to = (select id from public.people where email = 'sam@gulfcoast.example') where title = 'Install toilet';
  -- Work that is Sam's alone, with no company.
  update public.items set company_id = null where title = 'Install toilet' and org = current_setting('test.gulf');
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"sam@gulfcoast.example","sub":"22222222-2222-4222-8222-222222222222"}';
do $$
begin
  perform public.delete_my_account();
end $$;
reset role;

do $$
begin
  if exists (select 1 from auth.users where id = '22222222-2222-4222-8222-222222222222') then raise exception 'FAIL: the sign in was not deleted'; end if;
  if exists (select 1 from public.people where email = 'sam@gulfcoast.example') then raise exception 'FAIL: the email stayed on the person'; end if;
  if not exists (select 1 from public.people where org = current_setting('test.gulf') and name = 'Deleted Account' and not active and phone is null) then
    raise exception 'FAIL: the deleted person was not taken off their records';
  end if;
  if exists (select 1 from public.items where org = current_setting('test.gulf') and assigned_to is not null)
     or exists (select 1 from public.job_team jt join public.people p on p.id = jt.person_id where p.name = 'Deleted Account') then
    raise exception 'FAIL: the deleted person is still assigned or on a team';
  end if;
  if (select count(*) from public.items where org = current_setting('test.gulf')) <> 1 then raise exception 'FAIL: the company lost its items'; end if;
  if not (select unfinished from public.items where org = current_setting('test.gulf') and title = 'Install toilet') then
    raise exception 'FAIL: open work that was the deleted person''s alone did not go back to Drafts';
  end if;
end $$;

-- The last one at the company deletes their account: the whole company goes, and nothing else.
set role authenticated;
set request.jwt.claims = '{"email":"pat@gulfcoast.example","sub":"11111111-1111-4111-8111-111111111111"}';
do $$
begin
  if not public.alone_in_company() then raise exception 'FAIL: Pat is alone at the company now'; end if;
  perform public.delete_my_account();
end $$;
reset role;

do $$
declare
  t text;
  n integer;
begin
  for t in select c.table_name from information_schema.columns c where c.table_schema = 'public' and c.column_name = 'org' loop
    execute format('select count(*) from public.%I where org = %L', t, current_setting('test.gulf')) into n;
    if n <> 0 then raise exception 'FAIL: % still has the deleted company''s rows', t; end if;
  end loop;
  if exists (select 1 from public.orgs where id = current_setting('test.gulf')) or exists (select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL: the company or the sign in is still there';
  end if;
  if (select count(*) from public.items where org = 'ross_built')::text <> current_setting('test.fish_items') or not exists (select 1 from public.orgs where id = 'ross_built') then
    raise exception 'FAIL: deleting one company touched another';
  end if;
  -- And nothing is deleted outside of that.
  begin
    delete from public.items where org = 'ross_built';
    raise exception 'FAIL: an item was deleted after a company was';
  exception when restrict_violation then null;
  end;
end $$;

set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
begin
  begin
    perform public.purge_company('ross_built');
    raise exception 'FAIL: the app can delete a company';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Round 4: a photo's words, and the phones to tell ----------
set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
declare
  ph uuid;
begin
  select p.id into ph from public.photos p join public.jobs j on j.id = p.job_id where j.name = 'Fish' and not p.removed limit 1;
  if ph is null then raise exception 'FAIL: no photo on Fish to describe'; end if;
  update public.photos set description = 'water stain on the ceiling by the vent' where id = ph;
  if (select description from public.photos where id = ph) is distinct from 'water stain on the ceiling by the vent' then raise exception 'FAIL: the photo''s words were not kept'; end if;
  begin
    update public.photos set description = repeat('a', 301) where id = ph;
    raise exception 'FAIL: the photo kept too many words';
  exception when check_violation then null;
  end;
  perform public.save_push_token('ExponentPushToken[jakes-phone-1234]', 'ios');
  perform public.save_push_token('ExponentPushToken[jakes-phone-1234]', 'ios');
  begin
    perform public.save_push_token('not a token', 'ios');
    raise exception 'FAIL: a token that is not one was kept';
  exception when check_violation then null;
  end;
  begin
    perform 1 from public.push_tokens;
    raise exception 'FAIL: the app can read the phones to tell';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.push_targets(current_setting('test.owner'));
    raise exception 'FAIL: the app can ask who to tell';
  exception when insufficient_privilege then null;
  end;
end $$;

set request.jwt.claims = '{"email":"sam@rossbuilt.com"}';
do $$
begin
  perform public.save_push_token('ExponentPushToken[sams-phone-5678]', 'android');
  -- Sam cannot take Jake's phone off.
  perform public.drop_push_token('ExponentPushToken[jakes-phone-1234]');
end $$;
reset role;

do $$
declare
  fish uuid := (select id from public.jobs where name = 'Fish');
  jake uuid := (select id from public.people where email = 'jake@rossbuilt.com');
  sam uuid := (select id from public.people where email = 'sam@rossbuilt.com');
  -- The owner's link on Fish, and a company's link on Fish, one taken back and one new.
  owner text := current_setting('test.owner');
  taken_back text := current_setting('test.link');
  company text;
  told text[];
begin
  if (select count(*) from public.push_tokens) <> 2 then raise exception 'FAIL: the phones were not kept once each: %', (select count(*) from public.push_tokens); end if;
  if not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[jakes-phone-1234]' and person_id = jake) then raise exception 'FAIL: Sam took Jake''s phone off'; end if;
  if (select job_id from public.company_links where token = taken_back) <> fish or not (select revoked from public.company_links where token = taken_back) then
    raise exception 'FAIL: the test needs the company link on Fish taken back by now';
  end if;
  insert into public.company_links (org, job_id, company_id) select org, job_id, company_id from public.company_links where token = taken_back returning token into company;
  -- Who to tell about Fish: its team, switched on, on a job that is open, through either link.
  update public.jobs set archived = false where id = fish;
  insert into public.job_team (org, job_id, person_id, part) values ('ross_built', fish, jake, 'project_manager') on conflict (job_id, person_id) do nothing;
  delete from public.job_team where job_id = fish and person_id = sam;
  select array_agg(token order by token) into told from public.push_targets(owner);
  if told is distinct from array['ExponentPushToken[jakes-phone-1234]'] then raise exception 'FAIL: the wrong phones would be told about the owner on Fish: %', told; end if;
  select array_agg(token order by token) into told from public.push_targets(company);
  if told is distinct from array['ExponentPushToken[jakes-phone-1234]'] then raise exception 'FAIL: the wrong phones would be told about a company on Fish: %', told; end if;
  if (select job_name from public.push_targets(company) limit 1) <> 'Fish' or (select job_id from public.push_targets(company) limit 1) <> fish then raise exception 'FAIL: the job does not go with it'; end if;
  if exists (select 1 from public.push_targets(taken_back)) then raise exception 'FAIL: a link taken back tells the team'; end if;
  if exists (select 1 from public.push_targets(repeat('0', 64))) then raise exception 'FAIL: a link that is not one tells someone'; end if;
  update public.jobs set archived = true where id = fish;
  if exists (select 1 from public.push_targets(owner)) then raise exception 'FAIL: a closed job''s team is told'; end if;
  update public.jobs set archived = false where id = fish;
  -- On the team and switched off: not told. Sam, on the team now, is; and the admin is not, since the team heard.
  update public.people set active = false where id = jake;
  insert into public.job_team (org, job_id, person_id, part) values ('ross_built', fish, sam, 'field');
  select array_agg(token order by token) into told from public.push_targets(company);
  if told is distinct from array['ExponentPushToken[sams-phone-5678]'] then raise exception 'FAIL: someone switched off is told, or the team was not: %', told; end if;
  update public.people set active = true where id = jake;
  -- Nobody on the job's team: the company's admins are told (Jake), and not Sam.
  delete from public.job_team where job_id = fish;
  select array_agg(token order by token) into told from public.push_targets(company);
  if told is distinct from array['ExponentPushToken[jakes-phone-1234]'] then raise exception 'FAIL: a job with no team did not tell the admins: %', told; end if;
  perform public.forget_push_tokens(array['ExponentPushToken[sams-phone-5678]']);
  if exists (select 1 from public.push_tokens where person_id = sam) then raise exception 'FAIL: a token Expo turned down was kept'; end if;
end $$;

set role authenticated;
set request.jwt.claims = '{"email":"jake@rossbuilt.com"}';
do $$
begin
  perform public.drop_push_token('ExponentPushToken[jakes-phone-1234]');
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.push_tokens) then raise exception 'FAIL: signing out did not take the phone off'; end if;
end $$;

select 'All database checks passed' as result;
