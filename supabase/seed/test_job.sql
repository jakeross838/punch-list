-- Test Job (generated): 50 rooms, 12 companies, 600 items, for the Phase 1 speed and offline checks.
-- Everything here is named "Test" and can be archived or switched off afterward; items are never deleted.

do $$
declare
  j uuid;
  trade_ids uuid[] := '{}';
  company_ids uuid[] := '{}';
  room_ids uuid[] := '{}';
  t uuid;
  c uuid;
  r uuid;
  i integer;
  verbs text[] := array['Install', 'Replace', 'Repair', 'Touch up', 'Caulk', 'Adjust'];
begin
  insert into public.jobs (name, address) values ('Test Job (generated)', 'For the Phase 1 checks only') returning id into j;

  for i in 1..12 loop
    insert into public.trades (name, sort_order) values ('Test Trade ' || chr(64 + i), 900 + i) returning id into t;
    insert into public.companies (name, default_trade_id) values ('Test Company ' || chr(64 + i), t) returning id into c;
    insert into public.job_companies (job_id, company_id, trade_id) values (j, c, t);
    trade_ids := trade_ids || t;
    company_ids := company_ids || c;
  end loop;

  for i in 1..50 loop
    insert into public.locations (job_id, name, number, label, floor, kind, sort_order)
    values (j, 'Test Room', (100 + i)::text, 'Test Room ' || (100 + i), case when i <= 25 then 'Level 1' else 'Level 2' end, 'room', i)
    returning id into r;
    room_ids := room_ids || r;
  end loop;

  insert into public.job_waiting_on (job_id, label, sort_order) values (j, 'Ross Built', 1), (j, 'Owner', 2);

  for i in 1..600 loop
    insert into public.items (job_id, location_id, title, description, trade_id, company_id, kind, ready, waiting_on, bought_out, source)
    values (
      j,
      room_ids[1 + (i % 50)],
      verbs[1 + (i % 6)] || ' test item ' || i,
      'Generated for the speed check.',
      trade_ids[1 + (i % 12)],
      company_ids[1 + (i % 12)],
      'deficiency',
      i % 3 <> 0,
      case when i % 3 = 0 then array['Ross Built'] else '{}'::text[] end,
      true,
      'typed'
    );
  end loop;
end $$;
