-- Three types of item: Deficiency (wrong or damaged, to fix), Incomplete (kind completion: scope
-- completion, the company's own work not done yet) and Additional (kind added_scope: extra work
-- that needs a price). Bought Out is no
-- longer asked for. It follows the type and the order number: deficiencies and completion work are
-- in scope already, and additional work counts as priced once it has its purchase order or change
-- order number. The column stays for Buildertrend.

alter table public.items drop constraint items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('deficiency', 'completion', 'added_scope'));
alter table public.items alter column kind set default 'completion';

create or replace function public.items_bought_out_follows() returns trigger
language plpgsql set search_path = public as $$
begin
  new.bought_out := new.kind <> 'added_scope' or nullif(btrim(new.po_or_co), '') is not null;
  return new;
end $$;

create trigger items_bought_out_follows before insert or update of kind, po_or_co, bought_out on public.items
  for each row execute function public.items_bought_out_follows();

update public.items
  set bought_out = (kind <> 'added_scope' or nullif(btrim(po_or_co), '') is not null)
  where bought_out is distinct from (kind <> 'added_scope' or nullif(btrim(po_or_co), '') is not null);
