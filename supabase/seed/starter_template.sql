-- The first templates: what always needs doing at the end of a house, and the common tasks in each
-- kind of room, which a walk offers as Common Tasks. Run once the trades and titles are in (after
-- the import), so each task finds its trade by name, or by its title in the standard titles; a
-- trade not there is left blank, and its items wait in Drafts for a company. Each does nothing when
-- its template is there already.

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

do $$
declare
  t uuid;
begin
  if exists (select 1 from public.templates where lower(name) = 'common tasks by room' and active) then return; end if;
  insert into public.templates (name, sort_order) values ('Common Tasks by Room', 2) returning id into t;
  insert into public.template_items (template_id, title, kind, trade_id, hours, place, sort_order)
  select t, v.title, 'completion',
    (select tl.trade_id from public.title_library tl where lower(tl.title) = lower(v.title) and tl.trade_id is not null order by tl.uses desc limit 1),
    (select tl.hours from public.title_library tl where lower(tl.title) = lower(v.title) and tl.hours is not null order by tl.uses desc limit 1),
    v.place, v.sort_order
  from (values
    ('Install toilet', 'bathroom', 1),
    ('Install faucet', 'bathroom', 2),
    ('Install shower trim', 'bathroom', 3),
    ('Install shower head', 'bathroom', 4),
    ('Caulk tub surround', 'bathroom', 5),
    ('Set vanity tops', 'bathroom', 6),
    ('Install cabinet hardware', 'bathroom', 7),
    ('Adjust cabinet door', 'bathroom', 8),
    ('Install faucet', 'kitchen', 9),
    ('Adjust cabinet door', 'kitchen', 10),
    ('Install backsplash', 'kitchen', 11),
    ('Seal countertop', 'kitchen', 12),
    ('Install pendant lights', 'kitchen', 13),
    ('Install outlet cover', 'kitchen', 14),
    ('Install switch plate', 'kitchen', 15),
    ('Install faucet', 'laundry', 16),
    ('Install cabinet hardware', 'laundry', 17),
    ('Install shelving', 'laundry', 18),
    ('Install light fixture', 'laundry', 19),
    ('Adjust closet door', 'bedroom', 20),
    ('Install light fixture', 'bedroom', 21),
    ('Install outlet cover', 'bedroom', 22),
    ('Install switch plate', 'bedroom', 23),
    ('Install smoke detector', 'bedroom', 24),
    ('Install baseboard', 'bedroom', 25),
    ('Touch up paint', 'bedroom', 26),
    ('Install shelving', 'closet', 27),
    ('Install closet system', 'closet', 28),
    ('Adjust closet door', 'closet', 29),
    ('Install door stop', 'closet', 30),
    ('Install light fixture', 'closet', 31),
    ('Install door stop', 'living', 32),
    ('Install light fixture', 'living', 33),
    ('Install outlet cover', 'living', 34),
    ('Install switch plate', 'living', 35),
    ('Install smoke detector', 'living', 36),
    ('Install baseboard', 'living', 37),
    ('Touch up paint', 'living', 38),
    ('Install shelving', 'garage', 39),
    ('Install light fixture', 'garage', 40),
    ('Install outlet cover', 'garage', 41),
    ('Install garage door opener', 'garage', 42),
    ('Install light fixture', 'outside', 43),
    ('Install outlet cover', 'outside', 44),
    ('Touch up paint', 'outside', 45),
    ('Install hose bib', 'outside', 46),
    ('Clean windows', 'outside', 47)
  ) as v(title, place, sort_order);
end $$;
