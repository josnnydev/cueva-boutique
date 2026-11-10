-- ============================================================================
-- Cueva Boutique · Rendimiento y bajo consumo
-- ----------------------------------------------------------------------------
-- Ejecuta este archivo completo en Supabase → SQL Editor → New query → Run.
-- Es idempotente: puedes volver a ejecutarlo sin romper nada.
--
-- Qué hace:
--   1. Índices en las columnas que se filtran u ordenan.
--   2. visitas_stats(): estadísticas agregadas en Postgres (no trae filas a Node).
--   3. registrar_visita(): límite por IP + deduplicación + inserción en 1 viaje.
--   4. consumir_rate_limit(): límite de login en 1 viaje.
--   5. Limpieza automática de rate_limits con pg_cron (más de 1 día).
--
-- Requiere que exista public.visitas (migración 20261110000100_visitas.sql).
-- ============================================================================

-- ============================================================================
-- 1. Índices
-- ----------------------------------------------------------------------------
-- El catálogo público ordena por categoría + orden + nombre y filtra activos.
-- El panel busca por precio, fecha y categoría.
-- ============================================================================
create index if not exists products_price_idx
  on public.products(price);

create index if not exists products_category_sort_idx
  on public.products(category_id, sort_order, name);

create index if not exists products_active_sort_idx
  on public.products(sort_order, name)
  where is_active = true;

create index if not exists products_updated_idx
  on public.products(updated_at desc);

create index if not exists categories_sort_idx
  on public.categories(sort_order, name);

create index if not exists product_images_product_idx
  on public.product_images(product_id, is_primary desc, sort_order, created_at);

-- Acelera la deduplicación de visitas (misma sesión + página + 90 s).
do $$
begin
  if to_regclass('public.visitas') is not null then
    execute 'create index if not exists visitas_session_page_idx
             on public.visitas(session_id, pagina, created_at desc)';
  end if;
end
$$;

-- ============================================================================
-- 2. rate_limits (se crea también en la migración de seguridad)
-- ----------------------------------------------------------------------------
-- Se repite aquí para que esta migración funcione sola, en cualquier orden.
-- ============================================================================
create table if not exists public.rate_limits (
  id         bigint generated always as identity primary key,
  bucket     text not null check (char_length(bucket) between 1 and 40),
  ip_hash    text not null check (char_length(ip_hash) between 8 and 128),
  created_at timestamptz not null default now()
);

create index if not exists rate_limits_lookup_idx
  on public.rate_limits(bucket, ip_hash, created_at desc);

alter table public.rate_limits enable row level security;

-- Sin políticas: solo service_role (la API) puede leer y escribir aquí.

revoke all on table public.rate_limits from anon, authenticated;

-- service_role es el único rol que usa la API del servidor.
grant all on table public.rate_limits to service_role;
grant usage, select on sequence public.rate_limits_id_seq to service_role;

-- ============================================================================
-- 3. Clasificador de referentes
-- ----------------------------------------------------------------------------
-- Misma idea que la versión de TypeScript, pero ejecutada en Postgres para no
-- traer los referentes a Node. Devuelve una clave corta y estable.
-- ============================================================================
create or replace function public.referrer_key(
  p_referrer text,
  p_site_host text default null
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with raw as (
    select lower(btrim(coalesce(p_referrer, ''))) as value
  ),
  without_scheme as (
    select case
      when value ~ '^[a-z][a-z0-9+.-]*://'
        then regexp_replace(value, '^[a-z][a-z0-9+.-]*://', '')
      else value
    end as value
    from raw
  ),
  host as (
    select
      value,
      regexp_replace(
        split_part(split_part(value, '/', 1), ':', 1),
        '^www\.',
        ''
      ) as host
    from without_scheme
  )
  select case
    when value = '' or host = '' then 'directo'
    when nullif(lower(p_site_host), '') is not null
      and (
        host = lower(p_site_host)
        or host like '%.' || lower(p_site_host)
      )
      then 'directo'
    when host like 'com.instagram%'
      or host = 'instagram.com'
      or host like '%.instagram.com'
      or host = 'ig.me'
      or host like '%.ig.me'
      then 'instagram'
    when host like 'com.facebook%'
      or host = 'facebook.com'
      or host like '%.facebook.com'
      or host = 'fb.com'
      or host like '%.fb.com'
      or host = 'fb.me'
      or host like '%.fb.me'
      then 'facebook'
    when host like 'com.whatsapp%'
      or host = 'whatsapp.com'
      or host like '%.whatsapp.com'
      or host = 'wa.me'
      or host like '%.wa.me'
      then 'whatsapp'
    when host ~ '^(www\.)?google(\.[a-z]{2,})+$'
      or host = 'g.co'
      or host like '%.g.co'
      or host = 'goo.gl'
      or host = 'googleusercontent.com'
      or host like '%.googleusercontent.com'
      or host like '%.googleadservices.com'
      or host like '%.googlesyndication.com'
      or host like 'com.google.android%'
      then 'google'
    else 'otros'
  end
  from host;
$$;

revoke all on function public.referrer_key(text, text) from public, anon, authenticated;
grant execute on function public.referrer_key(text, text) to service_role;

-- ============================================================================
-- 4. Estadísticas agregadas
-- ----------------------------------------------------------------------------
-- Devuelve un único JSON con totales, serie diaria, top de páginas y referentes.
-- No devuelve ni una fila individual: el panel recibe ~2 KB en vez de 60 000.
-- ============================================================================
create or replace function public.visitas_stats(
  p_days integer default 30,
  p_site_host text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days       integer := case when p_days = 7 then 7 else 30 end;
  v_today      date := (now() at time zone 'America/Santo_Domingo')::date;
  v_start      date := v_today - 29;
  v_start_ts   timestamptz := ((v_today - 29)::timestamp)
                              at time zone 'America/Santo_Domingo';
  v_result     jsonb;
begin
  with recent as (
    select
      (created_at at time zone 'America/Santo_Domingo')::date as dia,
      pagina,
      referrer,
      session_id
    from public.visitas
    where created_at >= v_start_ts
  ),
  totales as (
    select
      count(*) filter (where dia = v_today) as today,
      count(*) filter (where dia >= v_today - 6) as last7,
      count(*) as last30,
      count(distinct session_id) filter (where dia = v_today) as unique_today,
      count(distinct session_id) filter (where dia >= v_today - 6) as unique7,
      count(distinct session_id) as unique30
    from recent
  ),
  dias as (
    select generate_series(v_start, v_today, interval '1 day')::date as dia
  ),
  por_dia as (
    select dia, count(*) as visitas, count(distinct session_id) as unicos
    from recent
    group by dia
  ),
  serie as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(d.dia, 'YYYY-MM-DD'),
          'visits', coalesce(p.visitas, 0),
          'unique', coalesce(p.unicos, 0)
        )
        order by d.dia
      ),
      '[]'::jsonb
    ) as data
    from dias d
    left join por_dia p on p.dia = d.dia
  ),
  paginas as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('page', pagina, 'visits', visitas)
        order by visitas desc, pagina
      ),
      '[]'::jsonb
    ) as data
    from (
      select pagina, count(*) as visitas
      from recent
      group by pagina
      order by visitas desc, pagina
      limit 10
    ) top
  ),
  referentes as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('key', clave, 'visits', visitas)
        order by visitas desc
      ),
      '[]'::jsonb
    ) as data
    from (
      select public.referrer_key(referrer, p_site_host) as clave,
             count(*) as visitas
      from recent
      group by 1
      order by visitas desc
    ) agrupado
  ),
  ventana as (
    select count(*) as total
    from recent
    where dia >= v_today - (v_days - 1)
  )
  select jsonb_build_object(
    'days', v_days,
    'totals', jsonb_build_object(
      'today', totales.today,
      'last7', totales.last7,
      'last30', totales.last30,
      'uniqueToday', totales.unique_today,
      'unique7', totales.unique7,
      'unique30', totales.unique30
    ),
    'daily', serie.data,
    'topPages', paginas.data,
    'referrers', referentes.data,
    'windowTotal', ventana.total,
    'generatedAt', now()
  )
  into v_result
  from totales, serie, paginas, referentes, ventana;

  return v_result;
end;
$$;

revoke all on function public.visitas_stats(integer, text) from public, anon, authenticated;
grant execute on function public.visitas_stats(integer, text) to service_role;

-- ============================================================================
-- 5. Registrar visita en un solo viaje
-- ----------------------------------------------------------------------------
-- Antes: SELECT de admin + COUNT de rate limit + INSERT + SELECT de dedupe +
-- INSERT de visita (hasta 5 consultas). Ahora: 1 llamada.
-- ============================================================================
create or replace function public.registrar_visita(
  p_pagina text,
  p_referrer text,
  p_user_agent text,
  p_session_id text,
  p_ip_hash text,
  p_max_por_minuto integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_max_por_minuto, 30), 300));
  v_count integer;
begin
  if p_pagina is null
     or char_length(p_pagina) not between 1 and 200
     or p_session_id is null
     or char_length(p_session_id) not between 8 and 100 then
    return jsonb_build_object('recorded', false, 'reason', 'invalid');
  end if;

  if p_ip_hash is null or char_length(p_ip_hash) not between 8 and 128 then
    return jsonb_build_object('recorded', false, 'reason', 'invalid');
  end if;

  select count(*) into v_count
  from public.rate_limits
  where bucket = 'visits'
    and ip_hash = p_ip_hash
    and created_at >= now() - interval '1 minute';

  if v_count >= v_limit then
    return jsonb_build_object('recorded', false, 'reason', 'rate');
  end if;

  insert into public.rate_limits(bucket, ip_hash)
  values ('visits', p_ip_hash);

  if exists (
    select 1
    from public.visitas
    where session_id = p_session_id
      and pagina = p_pagina
      and created_at >= now() - interval '90 seconds'
  ) then
    return jsonb_build_object('recorded', false, 'reason', 'duplicate');
  end if;

  insert into public.visitas(pagina, referrer, user_agent, session_id)
  values (
    p_pagina,
    nullif(left(p_referrer, 500), ''),
    nullif(left(p_user_agent, 500), ''),
    p_session_id
  );

  -- Limpieza oportunista. La limpieza principal la hace pg_cron cada hora.
  if random() < 0.01 then
    delete from public.rate_limits
    where created_at < now() - interval '1 day';
  end if;

  return jsonb_build_object('recorded', true, 'reason', 'ok');
end;
$$;

revoke all on function public.registrar_visita(text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.registrar_visita(text, text, text, text, text, integer)
  to service_role;

-- ============================================================================
-- 6. Consumir cupo de rate limit en un solo viaje (login)
-- ============================================================================
create or replace function public.consumir_rate_limit(
  p_bucket text,
  p_ip_hash text,
  p_max integer,
  p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max    integer := greatest(1, least(coalesce(p_max, 1), 1000));
  v_window integer := greatest(1, least(coalesce(p_window_seconds, 60), 86400));
  v_count  integer;
begin
  if p_bucket is null
     or char_length(p_bucket) not between 1 and 40
     or p_ip_hash is null
     or char_length(p_ip_hash) not between 8 and 128 then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', v_window
    );
  end if;

  select count(*) into v_count
  from public.rate_limits
  where bucket = p_bucket
    and ip_hash = p_ip_hash
    and created_at >= now() - make_interval(secs => v_window);

  if v_count >= v_max then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', v_window
    );
  end if;

  insert into public.rate_limits(bucket, ip_hash)
  values (p_bucket, p_ip_hash);

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(0, v_max - v_count - 1),
    'retry_after', 0
  );
end;
$$;

revoke all on function public.consumir_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consumir_rate_limit(text, text, integer, integer)
  to service_role;

-- ============================================================================
-- 7. Limpieza automática con pg_cron
-- ----------------------------------------------------------------------------
-- Si pg_cron no está disponible, se avisa y se mantiene la limpieza
-- oportunista del código. En Supabase puedes activarlo en
-- Database → Extensions → pg_cron.
-- ============================================================================
do $$
begin
  execute 'create extension if not exists pg_cron';
exception when others then
  raise notice 'pg_cron no disponible: %', sqlerrm;
end
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('limpiar-rate-limits');
    exception when others then
      null; -- El trabajo aún no existía.
    end;

    perform cron.schedule(
      'limpiar-rate-limits',
      '7 * * * *',
      $cron$delete from public.rate_limits where created_at < now() - interval '1 day'$cron$
    );
  else
    raise notice 'pg_cron no está activo: la limpieza se hará de forma oportunista.';
  end if;
exception when others then
  raise notice 'No se pudo programar la limpieza de rate_limits: %', sqlerrm;
end
$$;

-- ============================================================================
-- 8. Comprobación rápida (opcional)
-- ----------------------------------------------------------------------------
-- select * from public.visitas_stats(30, 'cueva-boutique.netlify.app');
-- select jobname, schedule, command from cron.job;
-- ============================================================================
