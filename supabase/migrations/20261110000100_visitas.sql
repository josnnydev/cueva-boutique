-- ============================================================================
-- Cueva Boutique · Estadísticas de visitas
-- ----------------------------------------------------------------------------
-- Ejecuta este archivo completo en Supabase → SQL Editor → New query → Run.
-- Es seguro volver a ejecutarlo: usa IF NOT EXISTS y recrea la política.
--
-- Guarda visitas anónimas de la tienda. NO guarda IPs ni datos personales.
-- El rol "anon" solo puede insertar. Ningún cliente puede leer la tabla:
-- las estadísticas las calcula la API del panel con service_role.
-- ============================================================================

create table if not exists public.visitas (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  pagina     text not null
             check (char_length(pagina) between 1 and 200),
  referrer   text
             check (referrer is null or char_length(referrer) between 1 and 500),
  user_agent text
             check (user_agent is null or char_length(user_agent) between 1 and 500),
  session_id text not null
             check (char_length(session_id) between 8 and 100)
);

-- Consultas del panel: rango de fechas, páginas más vistas y visitantes únicos.
create index if not exists visitas_created_idx
  on public.visitas(created_at desc);
create index if not exists visitas_pagina_idx
  on public.visitas(pagina);
create index if not exists visitas_session_idx
  on public.visitas(session_id, created_at desc);

-- ============================================================================
-- RLS: anon SOLO puede insertar; no puede leer, actualizar ni borrar.
-- ============================================================================
alter table public.visitas enable row level security;

drop policy if exists "anon inserta visitas" on public.visitas;
create policy "anon inserta visitas"
on public.visitas
for insert
to anon
with check (true);

-- Sin políticas de SELECT/UPDATE/DELETE para anon ni authenticated.
-- service_role (la API del panel) omite RLS y es el único que lee.

-- Permisos explícitos por si el proyecto cambió los privilegios por defecto.
grant insert on table public.visitas to anon;
grant usage on sequence public.visitas_id_seq to anon;

-- Refuerza que ningún rol de cliente pueda consultar la tabla directamente.
revoke select, update, delete on table public.visitas from anon, authenticated;
