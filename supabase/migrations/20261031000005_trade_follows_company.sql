-- The trade follows the company. The item no longer asks for its trade: it is the trade the company
-- does on the job (Job Setup), or the company's usual trade when it is not on the job, kept in the
-- data for the lists by trade in Buildertrend. A trade the company does on the job already stays
-- (a company can do more than one). A finished item needs its company; its trade is filled in.

create function public.items_trade_follows_company() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t uuid;
begin
  if new.company_id is null then
    return new;
  end if;
  if new.trade_id is not null and exists (
    select 1 from public.job_companies jc
    where jc.job_id = new.job_id and jc.company_id = new.company_id and jc.trade_id = new.trade_id
  ) then
    return new;
  end if;
  select jc.trade_id into t
    from public.job_companies jc
    join public.trades tr on tr.id = jc.trade_id
    where jc.job_id = new.job_id and jc.company_id = new.company_id
    order by tr.sort_order, lower(tr.name)
    limit 1;
  if t is null then
    select c.default_trade_id into t from public.companies c where c.id = new.company_id;
  end if;
  new.trade_id := coalesce(t, new.trade_id);
  return new;
end $$;

create trigger items_company_trade before insert or update of company_id, trade_id, job_id on public.items
  for each row execute function public.items_trade_follows_company();

alter table public.items drop constraint items_finished_has_company_and_trade;
alter table public.items add constraint items_finished_has_company check (unfinished or company_id is not null);
