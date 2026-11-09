-- A temporary holding table for a one-time import (`setup.md`, Fish from Buildertrend). A signed in
-- Buildertrend page can reach the app's database and this workspace can too, but the page cannot
-- reach the workspace: what the page reads waits here for the workspace, and the list in the app's
-- shape waits here for the loader. Nothing but these three functions can reach it, it is not in the
-- sync, and it is removed as soon as the list is loaded. It is run by hand on the live project, with
-- Jake's OK, never as a migration.
--
--   psql -v key_hash=<sha256 of local/secrets/import.key, in hex> -f tools/import-mailbox.sql
--
-- To remove it:
--
--   drop function public.import_mailbox_put_raw(integer, text);
--   drop function public.import_mailbox_get(text, text, integer);
--   drop function public.import_mailbox_put(text, integer, text);
--   drop table public.import_mailbox;
--   drop table public.import_mailbox_key;

create table public.import_mailbox (
  box text not null check (box in ('raw', 'mapped')),
  part integer not null check (part >= 0 and part < 64),
  body text not null,
  created_at timestamptz not null default now(),
  primary key (box, part)
);
-- The workspace's key, kept as its hash.
create table public.import_mailbox_key (hash text not null check (hash ~ '^[0-9a-f]{64}$'));
insert into public.import_mailbox_key (hash) values (:'key_hash');
alter table public.import_mailbox enable row level security;
alter table public.import_mailbox_key enable row level security;
revoke all on public.import_mailbox, public.import_mailbox_key from public, anon, authenticated;

-- What was read in Buildertrend, sent from the page. It holds no key, so the page is told none: it
-- can only add a part, a few of them, and the workspace checks the whole against its hash.
create function public.import_mailbox_put_raw(part integer, body text) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if length(body) > 1200000 then
    raise exception 'too big';
  end if;
  if (select count(*) from public.import_mailbox m where m.box = 'raw') >= 24 then
    raise exception 'full';
  end if;
  insert into public.import_mailbox (box, part, body) values ('raw', import_mailbox_put_raw.part, import_mailbox_put_raw.body);
  return length(body);
end $$;

-- The workspace reads a part, and puts the list in the app's shape, with the key only it holds.
create function public.import_mailbox_get(key text, box text, part integer) returns text
language plpgsql security definer set search_path = '' as $$
declare
  found text;
begin
  if not exists (select 1 from public.import_mailbox_key k where k.hash = encode(sha256(convert_to(coalesce(key, ''), 'UTF8')), 'hex')) then
    raise exception 'not allowed';
  end if;
  select m.body into found from public.import_mailbox m where m.box = import_mailbox_get.box and m.part = import_mailbox_get.part;
  return found;
end $$;

-- A list starts at part 0: putting part 0 takes the list before it away, so a shorter one leaves
-- nothing of the old one behind.
create function public.import_mailbox_put(key text, part integer, body text) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.import_mailbox_key k where k.hash = encode(sha256(convert_to(coalesce(key, ''), 'UTF8')), 'hex')) then
    raise exception 'not allowed';
  end if;
  if import_mailbox_put.part = 0 then
    delete from public.import_mailbox m where m.box = 'mapped';
  end if;
  insert into public.import_mailbox (box, part, body) values ('mapped', import_mailbox_put.part, import_mailbox_put.body);
  return length(body);
end $$;

revoke all on function public.import_mailbox_put_raw(integer, text) from public;
revoke all on function public.import_mailbox_get(text, text, integer) from public;
revoke all on function public.import_mailbox_put(text, integer, text) from public;
grant execute on function public.import_mailbox_put_raw(integer, text) to anon;
grant execute on function public.import_mailbox_get(text, text, integer) to anon;
grant execute on function public.import_mailbox_put(text, integer, text) to anon;
notify pgrst, 'reload schema';
