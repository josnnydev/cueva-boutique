-- ============================================================================
-- Cueva Boutique · Endurecimiento de seguridad
-- ----------------------------------------------------------------------------
-- Ejecuta este archivo completo en Supabase → SQL Editor → New query → Run.
-- Es idempotente: puedes volver a ejecutarlo sin romper nada.
--
-- Resumen:
--   1. RLS activado en TODAS las tablas del esquema public.
--   2. Lectura pública solo en products y categories (filas activas).
--   3. INSERT/UPDATE/DELETE prohibidos para anon y authenticated.
--   4. Storage: lectura pública; subir/borrar solo administradores.
--   5. Tabla rate_limits para limitar envíos por IP.
--
-- Las escrituras reales las hace la API de Netlify con service_role, que
-- omite RLS. El navegador nunca recibe una clave con privilegios.
-- ============================================================================

-- ============================================================================
-- 1. RLS en todas las tablas de public
-- ----------------------------------------------------------------------------
-- El bucle evita que una tabla nueva se quede sin RLS por olvido.
-- ============================================================================
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end
$$;

-- ============================================================================
-- 2. Límite de peticiones por IP (5 por minuto en los formularios)
-- ============================================================================
create table if not exists public.rate_limits (
  id         bigint generated always as identity primary key,
  bucket     text not null check (char_length(bucket) between 1 and 40),
  ip_hash    text not null check (char_length(ip_hash) between 8 and 128),
  created_at timestamptz not null default now()
);

create index if not exists rate_limits_lookup_idx
  on public.rate_limits(bucket, ip_hash, created_at desc);

-- Se creó después del bucle, así que su RLS se activa a mano.
alter table public.rate_limits enable row level security;

-- Sin políticas: solo service_role (la API) puede leer y escribir aquí.

-- ============================================================================
-- 3. Quitar TODOS los privilegios de cliente sobre el esquema
-- ----------------------------------------------------------------------------
-- No se revoca de "public" (pseudo-rol) para no quitarle privilegios a
-- service_role, que sí necesita escribir. anon y authenticated pierden todo.
-- ============================================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ============================================================================
-- 4. Lectura pública: solo productos y categorías activos
-- ----------------------------------------------------------------------------
-- El filtro real de filas lo pone la política RLS: aunque se conceda SELECT
-- sobre la tabla, anon solo verá productos y categorías con is_active = true.
-- ============================================================================
grant select on public.products   to anon, authenticated;
grant select on public.categories to anon, authenticated;

drop policy if exists "productos activos visibles" on public.products;
create policy "productos activos visibles"
on public.products
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "categorias activas visibles" on public.categories;
create policy "categorias activas visibles"
on public.categories
for select
to anon, authenticated
using (is_active = true);

-- Escrituras: prohibidas explícitamente, aunque los privilegios ya no existen.
-- Estos "false" documentan la intención y frenan un error futuro de políticas.
drop policy if exists "clientes no crean productos" on public.products;
create policy "clientes no crean productos"
on public.products for insert to anon, authenticated with check (false);

drop policy if exists "clientes no editan productos" on public.products;
create policy "clientes no editan productos"
on public.products for update to anon, authenticated
using (false) with check (false);

drop policy if exists "clientes no borran productos" on public.products;
create policy "clientes no borran productos"
on public.products for delete to anon, authenticated using (false);

drop policy if exists "clientes no crean categorias" on public.categories;
create policy "clientes no crean categorias"
on public.categories for insert to anon, authenticated with check (false);

drop policy if exists "clientes no editan categorias" on public.categories;
create policy "clientes no editan categorias"
on public.categories for update to anon, authenticated
using (false) with check (false);

drop policy if exists "clientes no borran categorias" on public.categories;
create policy "clientes no borran categorias"
on public.categories for delete to anon, authenticated using (false);

-- ============================================================================
-- 5. Visitas anónimas: solo INSERT (nunca lectura) para anon
-- ----------------------------------------------------------------------------
-- El revoke global de arriba quitó el permiso; se vuelve a conceder a mano.
-- ============================================================================
grant insert on table public.visitas to anon;
grant usage on sequence public.visitas_id_seq to anon;

drop policy if exists "anon inserta visitas" on public.visitas;
create policy "anon inserta visitas"
on public.visitas
for insert
to anon
with check (true);

-- ============================================================================
-- 6. Storage: lectura pública, escritura solo administradores
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER es necesario: la comprobación sobre admin_profiles debe
-- saltarse su propio RLS. Si no, la función nunca encontraría al admin.
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and is_active = true
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

drop policy if exists "Lectura pública de imágenes" on storage.objects;
create policy "Lectura pública de imágenes"
on storage.objects for select
to public
using (bucket_id = 'product-images');

drop policy if exists "Administradores suben imágenes" on storage.objects;
create policy "Administradores suben imágenes"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Administradores actualizan imágenes" on storage.objects;
create policy "Administradores actualizan imágenes"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Administradores borran imágenes" on storage.objects;
create policy "Administradores borran imágenes"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and public.is_admin());

-- El bucket sigue siendo de lectura pública, con límite de 5 MB y solo imágenes.
update storage.buckets
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
where id = 'product-images';

-- ============================================================================
-- 7. Comprobación rápida (opcional)
-- ----------------------------------------------------------------------------
-- Ejecuta esto aparte para ver el estado de cada tabla:
--
-- select tablename, rowsecurity
-- from pg_tables where schemaname = 'public' order by tablename;
--
-- Y esto para ver las políticas:
--
-- select tablename, policyname, cmd, roles
-- from pg_policies where schemaname in ('public', 'storage')
-- order by tablename, policyname;
-- ============================================================================
