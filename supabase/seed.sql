-- Datos base de Cueva Boutique.
-- Ejecutar después de la migración inicial.

insert into public.categories (slug, name, sort_order, is_active)
values
  ('audifonos',  'Audífonos',  1, true),
  ('cables',     'Cables',     2, true),
  ('accesorios', 'Accesorios', 3, true),
  ('relojes',    'Relojes',    4, true),
  ('lifestyle',  'Lifestyle',  5, true)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.settings (key, value)
values
  (
    'store',
    jsonb_build_object(
      'name', 'Cueva Boutique',
      'whatsapp', '18293815317',
      'generalLink', 'https://wa.me/message/P3LU5C3LG4JPA1',
      'instagramHandle', '@cueva_boutique',
      'instagramUrl', 'https://www.instagram.com/cueva_boutique?mdxt=MTh0ZnBxb3Bta3ZuaA==',
      'locale', 'es-DO',
      'currency', 'DOP',
      'currencySymbol', '$'
    )
  ),
  (
    'daily_offers',
    jsonb_build_object(
      'enabled', true,
      'count', 6,
      'step', 0,
      'highDiscount', 15,
      'highCount', 3,
      'lowDiscount', 10,
      'startDate', '2026-10-31',
      'seed', 484
    )
  ),
  (
    'site',
    jsonb_build_object(
      'version', '1.2.0',
      'updatedAt', '2026-11-01'
    )
  )
on conflict (key) do nothing;
