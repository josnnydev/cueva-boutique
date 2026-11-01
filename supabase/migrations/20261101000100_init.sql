-- ============================================================================
-- Cueva Boutique CMS · Esquema inicial
-- Ejecutar en Supabase SQL Editor o con `supabase db push`.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- Administradores (un solo owner; la tabla permite ampliar a más adelante)
-- ============================================================================
create table if not exists public.admin_profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  is_active       boolean not null default true,
  session_version integer not null default 0,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- Categorías
-- ============================================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 2 and 60),
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- Productos
-- ============================================================================
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Conserva el anchor actual de la tienda: "product-kz-zs10-pro-x".
  legacy_anchor     text unique,
  name              text not null check (char_length(name) between 2 and 120),
  short_description text,
  description       text,
  price             numeric(10,2) not null check (price >= 0),
  compare_at_price  numeric(10,2)
                    check (compare_at_price is null or compare_at_price > price),
  category_id       uuid not null references public.categories(id) on delete restrict,
  badge             text,
  sku               text unique,
  is_active         boolean not null default true,
  offer_eligible    boolean not null default true,
  base_discount     smallint not null default 0
                    check (base_discount between 0 and 90),
  sort_order        integer not null default 0,
  seo_title         text,
  seo_description   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null
);

create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_active_idx   on public.products(is_active, sort_order);
create index if not exists products_updated_idx  on public.products(updated_at desc);

-- ============================================================================
-- Imágenes (una principal por producto; la estructura admite galería)
-- ============================================================================
create table if not exists public.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  storage_path  text not null unique,
  thumb_path    text,
  alt           text,
  width         integer,
  height        integer,
  bytes         integer,
  sort_order    integer not null default 0,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists product_images_product_idx
  on public.product_images(product_id, sort_order);

create unique index if not exists product_images_one_primary
  on public.product_images(product_id) where is_primary;

-- ============================================================================
-- Ajustes de la tienda (clave/valor)
-- ============================================================================
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- ============================================================================
-- Versiones publicadas
-- ============================================================================
create table if not exists public.site_releases (
  id          bigint generated always as identity primary key,
  version     text not null unique,
  notes       text,
  released_at timestamptz not null default now(),
  deployed_at timestamptz,
  commit_ref  text
);

-- ============================================================================
-- Auditoría
-- ============================================================================
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  diff        jsonb,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_entity_idx  on public.audit_log(entity, entity_id);

-- ============================================================================
-- Intentos de login (límite de velocidad)
-- ============================================================================
create table if not exists public.login_attempts (
  id         bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash    text,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_lookup_idx
  on public.login_attempts(email_hash, created_at desc);

-- ============================================================================
-- updated_at automático
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Seguridad: nadie lee ni escribe directo con anon/authenticated.
-- Solo service_role (Netlify Functions) omite RLS.
-- ============================================================================
alter table public.admin_profiles enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.settings       enable row level security;
alter table public.site_releases  enable row level security;
alter table public.audit_log      enable row level security;
alter table public.login_attempts enable row level security;

-- ============================================================================
-- Vista pública del catálogo (la usa la Function con service_role)
-- ============================================================================
create or replace view public.catalog_public
with (security_invoker = true) as
select
  p.id,
  p.slug,
  coalesce(p.legacy_anchor, 'product-' || p.slug) as anchor,
  p.name,
  p.short_description,
  p.description,
  p.price,
  p.compare_at_price,
  p.base_discount,
  p.badge,
  p.offer_eligible,
  p.sort_order,
  p.updated_at,
  c.id         as category_id,
  c.slug       as category_slug,
  c.name       as category_name,
  c.sort_order as category_sort_order,
  img.storage_path as image_path,
  img.thumb_path   as thumb_path,
  img.alt          as image_alt,
  img.width        as image_width,
  img.height       as image_height
from public.products p
join public.categories c on c.id = p.category_id
left join lateral (
  select i.storage_path, i.thumb_path, i.alt, i.width, i.height
  from public.product_images i
  where i.product_id = p.id and i.is_primary = true
  order by i.sort_order
  limit 1
) img on true
where p.is_active = true
  and c.is_active = true;

-- ============================================================================
-- Storage: bucket público de lectura, escritura solo con service_role
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Lectura pública de imágenes" on storage.objects;
create policy "Lectura pública de imágenes"
on storage.objects for select
to public
using (bucket_id = 'product-images');

-- ============================================================================
-- Crear el administrador
-- ----------------------------------------------------------------------------
-- 1. Authentication > Users > Add user (marca "Auto Confirm User").
-- 2. Copia el UUID del usuario y ejecuta:
--
-- insert into public.admin_profiles (user_id, email, full_name)
-- values ('<UUID>', 'tu-correo@ejemplo.com', 'Administrador')
-- on conflict (user_id) do update set email = excluded.email;
--
-- También puedes usar `npm run seed` con ADMIN_EMAIL y ADMIN_PASSWORD.
-- ============================================================================
