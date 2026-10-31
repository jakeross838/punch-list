-- Estimated time: about how long each item takes, in hours, so the work adds up for every location,
-- trade, company and visit, and ready work can be planned in full working days (8 hours). Empty
-- until someone gives it one, the standard title fills it in, or Claude reads it from the photo.
-- The standard titles carry how long the work usually takes. Changes to an item's estimate are in
-- its History like any other field: items_after_write logs every column that changes.

alter table public.items add column hours numeric(5, 2)
  constraint items_hours_range check (hours is null or (hours > 0 and hours <= 200));

alter table public.title_library add column hours numeric(5, 2)
  constraint title_library_hours_range check (hours is null or (hours > 0 and hours <= 200));
