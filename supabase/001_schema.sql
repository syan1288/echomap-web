-- Echo Map — 在 Supabase Dashboard → SQL Editor 中粘贴执行（一次即可）
-- 前提：已创建项目。Storage 桶也可在 Dashboard 手动建名为 buildings 的私有桶，再执行下方 storage 策略。

-- ---------------------------------------------------------------------------
-- 建筑表（后续把 App 里的建筑同步到此表）
-- ---------------------------------------------------------------------------
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  width real not null,
  height real not null,
  flipped_horizontally boolean not null default false,
  is_locked boolean not null default false,
  building_style text,
  content_bounds jsonb not null default '{}'::jsonb,
  log jsonb not null default '{}'::jsonb,
  processed_image_path text,
  -- photos: [{ "path": "userId/buildingId/photo_0.jpg", "name": "orig.jpg" }, ...]
  photos jsonb not null default '[]'::jsonb
);

create index if not exists buildings_user_id_idx on public.buildings (user_id);
create index if not exists buildings_user_updated_idx on public.buildings (user_id, updated_at desc);

alter table public.buildings enable row level security;

drop policy if exists "buildings_select_own" on public.buildings;
create policy "buildings_select_own" on public.buildings for select using (auth.uid() = user_id);

drop policy if exists "buildings_insert_own" on public.buildings;
create policy "buildings_insert_own" on public.buildings for insert with check (auth.uid() = user_id);

drop policy if exists "buildings_update_own" on public.buildings;
create policy "buildings_update_own" on public.buildings for update using (auth.uid() = user_id);

drop policy if exists "buildings_delete_own" on public.buildings;
create policy "buildings_delete_own" on public.buildings for delete using (auth.uid() = user_id);

create or replace function public.set_buildings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists buildings_set_updated_at on public.buildings;
create trigger buildings_set_updated_at
  before update on public.buildings
  for each row
  execute function public.set_buildings_updated_at();

-- ---------------------------------------------------------------------------
-- Storage：路径约定 {user_id}/{building_id}/filename
-- 在 Dashboard → Storage → New bucket → 名称 buildings → Public: off
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('buildings', 'buildings', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "buildings_obj_select" on storage.objects;
create policy "buildings_obj_select"
  on storage.objects for select
  using (
    bucket_id = 'buildings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "buildings_obj_insert" on storage.objects;
create policy "buildings_obj_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'buildings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "buildings_obj_update" on storage.objects;
create policy "buildings_obj_update"
  on storage.objects for update
  using (
    bucket_id = 'buildings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "buildings_obj_delete" on storage.objects;
create policy "buildings_obj_delete"
  on storage.objects for delete
  using (
    bucket_id = 'buildings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
