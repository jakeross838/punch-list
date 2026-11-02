-- The first template: what always needs doing at the end of a house. Run once the trades are in
-- (after the import), so each task finds its trade by name; a trade not there is left blank, and
-- its items wait in Drafts for a company. Does nothing when the template is there already.

do $$
declare
  t uuid;
  tr record;
  trade_of jsonb := '{}'::jsonb;
  clean uuid; glass uuid;
begin
  if exists (select 1 from public.templates where lower(name) = 'end of the house' and active) then return; end if;
  for tr in select id, name from public.trades loop
    trade_of := trade_of || jsonb_build_object(lower(tr.name), tr.id);
  end loop;
  insert into public.templates (name, sort_order) values ('End of the House', 1) returning id into t;
  insert into public.template_items (template_id, title, kind, trade_id, hours, place, sort_order) values
    (t, 'Install mirror', 'completion', (trade_of ->> 'carpentry')::uuid, 1, 'bathroom', 1),
    (t, 'Install towel bar', 'completion', (trade_of ->> 'carpentry')::uuid, 0.5, 'bathroom', 2),
    (t, 'Install toilet paper holder', 'completion', (trade_of ->> 'carpentry')::uuid, 0.25, 'bathroom', 3),
    (t, 'Trim out toilet', 'completion', (trade_of ->> 'plumbing')::uuid, 1, 'bathroom', 4),
    (t, 'Caulk shower corner', 'completion', (trade_of ->> 'tile')::uuid, 0.5, 'bathroom', 5),
    (t, 'Install cabinet hardware', 'completion', (trade_of ->> 'carpentry')::uuid, 2, 'kitchen', 7),
    (t, 'Install appliances', 'completion', (trade_of ->> 'ross built crew')::uuid, 4, 'kitchen', 8),
    (t, 'Install dryer vent cover', 'completion', (trade_of ->> 'air conditioning')::uuid, 0.5, 'laundry', 9),
    (t, 'Install door stop', 'completion', (trade_of ->> 'carpentry')::uuid, 0.25, 'bedroom', 10),
    (t, 'Touch up paint', 'completion', (trade_of ->> 'painting')::uuid, 2, 'Whole House', 11),
    (t, 'Clean windows', 'completion', (trade_of ->> 'ross built crew')::uuid, 8, 'Whole House', 13),
    (t, 'Pressure wash driveway', 'completion', (trade_of ->> 'ross built crew')::uuid, 3, 'Driveway', 14);
  insert into public.template_items (template_id, title, kind, trade_id, hours, place, sort_order) values
    (t, 'Install shower glass', 'completion', (trade_of ->> 'carpentry')::uuid, 2, 'bathroom', 6)
    returning id into glass;
  update public.template_items set waits_on = array[(select id from public.template_items where template_id = t and title = 'Caulk shower corner')]
    where id = glass;
  insert into public.template_items (template_id, title, kind, trade_id, hours, place, sort_order) values
    (t, 'Final clean', 'completion', (trade_of ->> 'ross built crew')::uuid, 8, 'Whole House', 12)
    returning id into clean;
  update public.template_items set waits_on = array[(select id from public.template_items where template_id = t and title = 'Touch up paint')]
    where id = clean;
end $$;
