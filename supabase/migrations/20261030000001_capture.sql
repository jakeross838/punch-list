-- Capture: photos with their markup, the fields Ross Built adds to the item form and the answers on
-- each item, and each person's own form and view settings.
--
-- Photos are never deleted: removing one sets removed. Marks are stored apart from the picture, as
-- points on it, so the original photo is always kept.

-- ---------- answers to the added fields ----------

alter table public.items add column extra jsonb not null default '{}'::jsonb;
alter table public.items add constraint items_extra_is_object check (jsonb_typeof(extra) = 'object');

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  label text not null check (btrim(label) <> ''),
  kind text not null check (kind in ('text', 'list', 'yes_no', 'date')),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint custom_fields_list_has_choices check (kind <> 'list' or jsonb_array_length(options) > 0)
);
create unique index custom_fields_label on public.custom_fields (org, lower(label));

-- ---------- photos ----------

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  org text not null default 'ross_built',
  job_id uuid not null references public.jobs (id),
  item_id uuid not null references public.items (id),
  -- Where the picture is in the photos bucket; empty until the phone has uploaded it.
  storage_path text,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  marks jsonb not null default '[]'::jsonb check (jsonb_typeof(marks) = 'array'),
  sort_order integer not null default 0,
  removed boolean not null default false,
  created_by uuid references public.people (id),
  created_at timestamptz not null default now()
);
create index photos_item on public.photos (item_id, sort_order);

create function public.photos_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select i.job_id from public.items i where i.id = new.item_id) is distinct from new.job_id then
      raise exception 'The photo belongs to an item on a different job' using errcode = 'check_violation';
    end if;
    new.created_by := coalesce(public.current_person_id(), new.created_by);
    new.created_at := coalesce(new.created_at, now());
  else
    -- A photo stays with its item; only its marks, order, upload path and removed change.
    new.job_id := old.job_id;
    new.item_id := old.item_id;
    new.width := old.width;
    new.height := old.height;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create trigger photos_before_write before insert or update on public.photos
  for each row execute function public.photos_before_write();

create function public.photos_never_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Photos are never deleted; set removed' using errcode = 'restrict_violation';
end $$;

create trigger photos_never_delete before delete on public.photos
  for each row execute function public.photos_never_delete();

-- ---------- each person's settings ----------

create table public.person_settings (
  person_id uuid primary key references public.people (id),
  org text not null default 'ross_built',
  -- Item Form: the fields turned off and what a new item starts as.
  item_form jsonb not null default '{}'::jsonb check (jsonb_typeof(item_form) = 'object'),
  -- Save as My Default: how a job opens.
  job_view jsonb not null default '{}'::jsonb check (jsonb_typeof(job_view) = 'object'),
  updated_at timestamptz not null default now()
);

create function public.person_settings_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Settings always belong to the person signed in.
  new.person_id := coalesce(public.current_person_id(), new.person_id);
  new.updated_at := now();
  return new;
end $$;

create trigger person_settings_before_write before insert or update on public.person_settings
  for each row execute function public.person_settings_before_write();

-- ---------- access rules ----------

alter table public.custom_fields enable row level security;
alter table public.photos enable row level security;
alter table public.person_settings enable row level security;

revoke all on public.custom_fields, public.photos, public.person_settings from anon, authenticated;
grant select, insert, update on public.custom_fields, public.photos, public.person_settings to authenticated;

create policy custom_fields_read on public.custom_fields for select to authenticated using (public.is_active_person());
create policy custom_fields_insert on public.custom_fields for insert to authenticated with check (public.is_active_person());
create policy custom_fields_update on public.custom_fields for update to authenticated using (public.is_active_person()) with check (public.is_active_person());

create policy photos_read on public.photos for select to authenticated using (public.is_active_person());
create policy photos_insert on public.photos for insert to authenticated with check (public.is_active_person());
create policy photos_update on public.photos for update to authenticated using (public.is_active_person()) with check (public.is_active_person());

create policy person_settings_read on public.person_settings for select to authenticated
  using (person_id = public.current_person_id());
create policy person_settings_insert on public.person_settings for insert to authenticated
  with check (person_id = public.current_person_id());
create policy person_settings_update on public.person_settings for update to authenticated
  using (person_id = public.current_person_id()) with check (person_id = public.current_person_id());

-- ---------- to the phones ----------

alter publication powersync add table public.custom_fields, public.photos, public.person_settings;
