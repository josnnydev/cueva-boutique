# Cueva Boutique — Tienda + CMS

Tienda de audio, relojes, cables y lifestyle con un **CMS propio** para administrar el catálogo sin tocar código. Todo funciona con servicios gratuitos:

- **React + TypeScript** para el panel `/admin`.
- **Netlify Functions** para la API y el catálogo público.
- **Supabase** para PostgreSQL, autenticación y Storage.
- **Netlify** para hosting, CDN y builds automáticos.

La tienda actual se conserva como respaldo estático. Si la API falla, los visitantes siguen viendo el catálogo publicado.

---

## 1. Qué incluye

### Tienda

- 34 productos reales en 5 categorías: audífonos, cables, accesorios, relojes y lifestyle.
- Carrito con cantidades, total, ahorro y pedido completo por WhatsApp.
- Ofertas flash diarias: 6 productos distintos por día, 3 con 15% y 3 con 10%.
- Contador de oferta hasta medianoche, filtros por categoría/descuento y botón Compartir.
- Imagen vertical (1080 × 1920) para el estado de WhatsApp con foto, nombre, descripción y precio: se genera en el navegador desde el diálogo Compartir y se puede descargar o enviar.
- Registro anónimo de visitas con `sendBeacon`: cuenta páginas y productos vistos sin guardar IPs ni datos personales.
- SEO con Open Graph, Twitter Card, JSON-LD (`ElectronicsStore`, `WebSite`, `ItemList`, `FAQPage`), `robots.txt` y `sitemap.xml`.
- Versión visible en el pie y actualizada en cada despliegue.
- Diseño responsive y respaldo estático sin JavaScript.

### Panel de administración

- Login seguro con Supabase Auth y cookie de sesión firmada (`HttpOnly`).
- Dashboard con productos activos, valor del catálogo, ofertas, fotos y actividad reciente.
- CRUD de productos: nombre, descripción, precio, precio anterior, descuento base, categoría, etiqueta, SKU y orden.
- Galería de hasta 8 fotos por producto: se redimensionan a WebP (~1200 px) y se genera una miniatura (~480 px) de cada una.
- Elegir la foto principal, reordenar la galería y eliminar fotos desde el panel.
- Marcar productos como disponibles o agotados: los agotados siguen visibles con el cartel «Agotado», pero no se pueden comprar. También se puede elegir si participan en la rotación diaria.
- CRUD de categorías con orden y visibilidad.
- Ajustes de tienda, ofertas y publicación de versiones.
- Historial de versiones, registro de actividad y cambio de contraseña.
- **Estadísticas de visitas:** visitas de hoy, 7 y 30 días, visitantes únicos por día, gráfico diario, top 10 de páginas/productos y origen del tráfico (Instagram, Facebook, WhatsApp, Google y directo).
- Diseño responsive para usar desde el móvil.

---

## 2. Arquitectura

```
Visitante ──► Netlify CDN ──► index.html + css/js + imágenes
                  │
                  └──► /api/public/catalog (Function, caché 30 s)
                              │
                              └──► Supabase PostgreSQL

Admin ──► /admin (React) ──► /api/* (Function)
                                  ├──► Supabase Auth
                                  ├──► PostgreSQL
                                  └──► Storage (fotos)

Cambio guardado ──► API en vivo (≤ 30 s)
                └──► Build hook de Netlify (HTML estático, JSON-LD, sitemap)
```

- **API en vivo:** la tienda consulta `/api/public/catalog` al cargar y cada 60 s. Los cambios se ven sin reconstruir.
- **Build diferido:** las mutaciones piden a Netlify un build (máximo uno cada 10 minutos; las fotos fuerzan uno). El build regenera tarjetas, imágenes locales, JSON-LD, sitemap y versión.
- **Respaldo:** `scripts/build-store.mjs` copia la tienda actual y solo la regenera si Supabase responde. Si el catálogo remoto falla o está vacío, publica el HTML anterior.

### Estructura

```
.
├── index.html                  # tienda (respaldo y punto de entrada)
├── css/, js/                   # estilos y lógica de la tienda
│   ├── app.js                  # carrito, ofertas, filtros, compartir
│   ├── analytics.js            # registro anónimo de visitas (sendBeacon)
│   ├── catalog.js              # hidrata la tienda desde la API
│   ├── status.js               # imagen vertical para el estado de WhatsApp
│   └── config.js               # WhatsApp, versión y ajustes de ofertas
├── admin/                      # panel React + TypeScript (Vite)
│   ├── src/
│   └── vite.config.ts
├── netlify/
│   ├── functions/api.ts        # router REST
│   ├── functions/keepalive.ts  # evita la pausa de Supabase
│   └── lib/                    # auth, sesión, productos, imágenes, etc.
├── supabase/
│   ├── migrations/             # esquema, RLS, vista pública y bucket
│   └── seed.sql                # categorías y ajustes iniciales
├── scripts/
│   ├── build-store.mjs         # build de la tienda + catálogo estático
│   ├── seed-catalog.mjs        # migra los 34 productos actuales
│   ├── backup.mjs              # exporta tablas e imágenes
│   ├── verify-catalog.mjs      # comprueba el catálogo publicado
│   └── render-card.mjs         # renderer de tarjetas
├── assets/img/productos/       # imágenes locales de respaldo
├── netlify.toml                # build, funciones, redirects y cabeceras
├── package.json
└── .env.example
```

---

## 3. Requisitos

- Node.js 20 o superior.
- Cuenta gratuita de [Supabase](https://supabase.com).
- Cuenta gratuita de [Netlify](https://netlify.com).
- Cuenta de GitHub (recomendada para el despliegue continuo).

No hace falta tarjeta, servidor propio ni servicios de pago.

---

## 4. Configurar Supabase

### 4.1 Crear el proyecto

1. Entra a Supabase y crea un proyecto nuevo.
2. Guarda la contraseña de la base de datos.
3. Espera a que termine la provisión.

### 4.2 Crear el esquema

En **SQL Editor**, abre y ejecuta el contenido de:

```
supabase/migrations/20261101000100_init.sql
```

Esto crea:

- `admin_profiles`, `categories`, `products`, `product_images`.
- `settings`, `site_releases`, `audit_log`, `login_attempts`.
- Triggers de `updated_at`, RLS, vista `catalog_public` y bucket `product-images`.
- Política de lectura pública de las fotos.

Después ejecuta las migraciones de funciones y seguridad, en este orden:

```
supabase/migrations/20261110000100_visitas.sql
supabase/migrations/20261110000200_seguridad.sql
```

La de seguridad es idempotente y puedes volver a ejecutarla cuando quieras:

- Activa RLS en todas las tablas de `public`.
- Permite leer solo `products` y `categories` activos.
- Prohíbe a `anon` insertar, editar o borrar.
- Crea `rate_limits` para el límite de 5 envíos por minuto.
- Deja las fotos con lectura pública y escritura solo para administradores.

Después ejecuta `supabase/seed.sql` para crear las 5 categorías y los ajustes iniciales.

### 4.3 Credenciales

En el proyecto de Supabase abre **Settings → API Keys** (también puedes usar el botón **Connect** del proyecto). Copia:

- **Project URL** → `SUPABASE_URL` (formato `https://xxxxx.supabase.co`).
- **Secret key** (`sb_secret_...`) → `SUPABASE_SECRET_KEY`. Pulsa el ojo para revelarla.
- Si tu proyecto aún muestra las claves antiguas, usa `service_role` en la misma variable.

> La clave secreta **nunca** va al navegador ni al repositorio. Solo se configura en Netlify y en tu `.env` local.

La clave pública (`sb_publishable_...` o `anon`) no la necesita el panel. Si la usas en otro sitio, guárdala como `SUPABASE_ANON_KEY`.

### 4.4 Crear el administrador

Opción A — desde el panel de Supabase:

1. **Authentication → Users → Add user**.
2. Marca **Auto Confirm User**.
3. Copia el UUID y ejecuta:

```sql
insert into public.admin_profiles (user_id, email, full_name)
values ('UUID-DEL-USUARIO', 'tu-correo@ejemplo.com', 'Administrador')
on conflict (user_id) do update set email = excluded.email;
```

Opción B — con el script de administrador (crea el usuario, lo confirma y activa su perfil):

```bash
# Rellena ADMIN_EMAIL y ADMIN_PASSWORD en .env
npm run admin
```

La contraseña debe tener al menos 8 caracteres. Después puedes cambiarla desde **Ajustes → Seguridad**.

### 4.5 Activar las estadísticas de visitas

Las visitas usan una tabla aparte. En **SQL Editor** ejecuta:

```
supabase/migrations/20261110000100_visitas.sql
```

Esto crea `public.visitas` con índices y RLS:

- `anon` solo puede **insertar**; no puede leer, actualizar ni borrar.
- La API del panel lee con `service_role` después de validar la cookie de administrador.
- No se guardan IPs ni datos personales; solo ruta, referente, user agent y un identificador aleatorio del navegador (`session_id`).

El panel calcula las estadísticas en **Estadísticas** (`/admin/estadisticas`). La tienda envía cada visita con `navigator.sendBeacon` a `POST /api/public/visits`, sin frenar la página. El servidor ignora bots y visitas del administrador logueado.

Después de ejecutar el SQL, abre la tienda, navega un par de veces y entra a **Estadísticas**. Si acabas de publicar, espera unos segundos: la primera visita puede tardar en aparecer.

### 4.6 Activar Cloudflare Turnstile (opcional)

El captcha del login es opcional: si no configuras las claves, el login funciona igual.

1. Crea una cuenta gratis en Cloudflare y añade un sitio en **Turnstile**.
2. Copia la **Site Key** y el **Secret Key**.
3. En Netlify → **Environment variables** añade:
   - `VITE_TURNSTILE_SITE_KEY` → Site Key (pública, se compila en el panel).
   - `TURNSTILE_SECRET_KEY` → Secret Key (solo servidor).
4. Vuelve a desplegar para que el panel se recompile con la Site Key.

Si `TURNSTILE_SECRET_KEY` existe pero el panel no se recompiló con la Site Key, nadie podrá entrar: configura siempre las dos a la vez. Puedes comprobarlo en `GET /api/health` (campo `turnstile`).

---



## 5. Configuración local

```bash
cp .env.example .env
```

Completa `.env`:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...

# Genera uno con: openssl rand -hex 32
SESSION_SECRET=un-secreto-de-32-caracteres-o-mas

ALLOWED_ORIGIN=http://localhost:8888
NETLIFY_BUILD_HOOK=

ADMIN_EMAIL=tu-correo@ejemplo.com
ADMIN_PASSWORD=una-contraseña-larga
ADMIN_NAME=Administrador
```

Instala dependencias:

```bash
npm install
```

Migra los 34 productos actuales a Supabase (sube sus fotos incluidas):

```bash
npm run seed
```

Antes o después del seed, comprueba toda la configuración con:

```bash
npm run doctor
```

El diagnóstico revisa variables, tablas, bucket, productos, fotos y administradores, sin mostrar claves.

El script es idempotente: actualiza productos por `slug`, conserva los anchors `#product-...` y solo sube la foto si el producto aún no tiene una.

### Desarrollo

```bash
# Panel en modo desarrollo (proxy a http://localhost:8888)
npm run dev

# API + tienda con Netlify CLI (recomendado para probar todo)
npx netlify-cli dev
```

Abre:

- Tienda: `http://localhost:8888`
- Panel: `http://localhost:8888/admin/`

Si no usas Netlify CLI, el panel de Vite en `http://localhost:5173/admin/` necesita la API en el puerto 8888.

### Build y verificación

```bash
npm run typecheck
npm test
npm run build
npm run verify
```

`npm run build`:

1. Copia la tienda a `dist/`.
2. Consulta Supabase y regenera tarjetas, imágenes, JSON-LD, sitemap y versión.
3. Compila el panel React en `dist/admin`.

Si faltan las variables de Supabase, el build publica la tienda actual sin romperse.

Para verificar el sitio publicado:

```bash
npm run verify -- https://cueva-boutique.netlify.app
```

Comprueba el catálogo público, anchors, imágenes, versión y que el panel esté compilado.

---

## 6. Publicar en Netlify

1. Sube el proyecto a un repositorio de GitHub (**sin** `.env`, `node_modules` ni `dist`).
2. En Netlify: **Add new site → Import an existing project → GitHub**.
3. Selecciona el repositorio. Netlify lee `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions: `netlify/functions`
4. En **Site configuration → Environment variables** añade:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SESSION_SECRET=...
ALLOWED_ORIGIN=https://cueva-boutique.netlify.app
NETLIFY_BUILD_HOOK=...
```

`SUPABASE_ANON_KEY` no es necesaria para el panel, pero puedes añadirla si la usas en otros proyectos. Si tu proyecto sigue con las claves antiguas, `SUPABASE_SECRET_KEY` acepta igualmente el valor `service_role`.

5. Crea el **build hook** en **Site configuration → Build & deploy → Build hooks**, copia la URL y guárdala como `NETLIFY_BUILD_HOOK`. Vuelve a desplegar para que la Function la lea.
6. Comprueba `/api/health`: debe responder `configured: true` y `missing: []`.

La guía detallada, con el orden exacto y solución de problemas, está en [`PUBLICAR.md`](PUBLICAR.md).

---

## 7. Usar el panel

Abre `https://tu-sitio.netlify.app/admin/`.

- **Panel:** resumen del catálogo y actividad.
- **Productos:** buscar, filtrar, marcar disponible/agotado, editar y eliminar.
- **Nuevo producto:** guarda primero los datos; después sube la galería.
- **Fotos:** puedes subir varias a la vez (máximo 8). La primera es la principal; las demás aparecen en el carrusel y en el visor ampliado de la tienda.
- **Agotado:** al desactivar «Disponible para comprar», el producto sigue visible con el cartel «Agotado» y el botón de compra queda deshabilitado.
- **Categorías:** crea, ordena y oculta categorías. No se puede eliminar una categoría con productos.
- **Estadísticas:** visitas de hoy, 7 y 30 días, únicos por día, gráfico, top 10 de páginas/productos y referrers.
- **Ajustes:** datos de contacto, ofertas diarias, versión, build manual y contraseña.

### Flujo recomendado para publicar cambios

1. Edita productos o fotos.
2. La tienda en vivo los muestra en ≤ 30 s (o al recargar).
3. Cuando termines, entra a **Ajustes → Publicar versión**, escribe la nueva versión y las notas.
4. El panel guarda la versión, lanza un build forzado y actualiza el pie de la tienda.
5. Espera el build en Netlify y recarga la web.

---

## 8. Ofertas y precios

Cada producto tiene:

- `price`: precio base.
- `compare_at_price`: precio anterior tachado (opcional, debe ser mayor).
- `base_discount`: descuento permanente en porcentaje (`0`–`90`).
- `offer_eligible`: si participa en la rotación diaria.
- `badge`: etiqueta visual (`Favorito`, `Nuevo`, etc.).

La rotación diaria se configura en **Ajustes → Ofertas diarias**:

- `count`: productos por día (6).
- `highDiscount` / `highCount`: descuento alto y cuántos lo llevan (15% en 3).
- `lowDiscount`: descuento del resto (10%).
- `startDate`, `seed` y `step`: controlan la selección estable para todos los visitantes.

Un producto con `compare_at_price` y sin `base_discount` se trata como oferta manual y queda fuera de la rotación. Los descuentos se aplican en el navegador sobre el precio base; el JSON-LD usa el precio base para no quedar desactualizado.

---

## 9. Versión y despliegues

La versión vive en dos lugares:

- `settings.site` en Supabase (la usa la API y el panel).
- Texto estático del pie, que el build actualiza.

Cada **Publicar versión**:

1. Crea un registro en `site_releases`.
2. Actualiza `settings.site`.
3. Dispara un build forzado.
4. El build reemplaza `?v=` de CSS/JS y la versión del pie.

El formato es `MAYOR.MENOR.PARCHE` (`1.2.1`). Para cambios de funciones usa `1.3.0`; para correcciones, `1.2.1`.

---

## 10. Seguridad

- El panel no contiene claves de Supabase. Todo pasa por Netlify Functions.
- `SUPABASE_SECRET_KEY` y `SESSION_SECRET` solo existen en Netlify y en tu `.env` local. El navegador nunca recibe una clave con privilegios.
- `.gitignore` excluye cualquier `.env*`; la plantilla `.env.example` se versiona sin valores.
- La sesión es una cookie firmada con HMAC-SHA256, `HttpOnly`, `SameSite=Lax` y `Secure` en producción. Dura 8 horas.
- Las mutaciones exigen misma origen y la cabecera `X-CB-Request: 1`.
- RLS activo en todas las tablas de `public`. `anon` solo puede leer `products` y `categories` con `is_active = true`; no puede insertar, editar ni borrar.
- Storage: `product-images` es de lectura pública; subir, actualizar y borrar exige ser administrador activo (`public.is_admin()`).
- Límite de 5 intentos de login por IP y minuto, más 5 fallos por correo + IP cada 15 minutos.
- Cloudflare Turnstile en el login y campo honeypot oculto en los formularios. Si el honeypot viene relleno, el envío se descarta en silencio.
- Todo lo que llega de un formulario se valida con Zod en el servidor antes de tocar Supabase.
- Las fotos se suben con URL firmada, solo imágenes (`webp`, `jpeg`, `png`) y máximo 5 MB por archivo; la ruta la genera el servidor.
- Cambiar la contraseña invalida las sesiones anteriores (`session_version`).
- `audit_log` registra las acciones del panel.
- Encabezados globales: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS y `Permissions-Policy`.
- `/admin/*` se sirve además con `noindex` y `no-store`.

---

## 11. Plan gratuito y mantenimiento

Límites de referencia (pueden cambiar):

- **Netlify Free:** ~100 GB de tráfico, 300 minutos de build y 125k invocaciones al mes.
- **Supabase Free:** 500 MB de base de datos, 1 GB de Storage, ~5 GB de salida y pausa por inactividad.

Medidas incluidas:

- La Function `keepalive` consulta Supabase a diario para evitar la pausa.
- El catálogo público se cachea 30 s en el CDN.
- Las imágenes se redimensionan en el navegador antes de subirlas.
- El build se limita a uno cada 10 minutos (las fotos fuerzan uno).
- El carrito y las ofertas se calculan en el navegador, sin invocaciones.

### Copias de seguridad

Supabase Free no incluye backups automáticos. Ejecuta periódicamente:

```bash
npm run backup
```

Guarda `backups/<fecha>/` con las tablas en JSON y las imágenes descargadas. La carpeta `backups/` está en `.gitignore`.

---

## 12. Problemas frecuentes

**`/api/health` muestra `configured: false`**

Faltan variables en Netlify. Revisa `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `SESSION_SECRET` (mínimo 32 caracteres), y vuelve a desplegar.

**No puedo iniciar sesión**

- El usuario debe existir en **Authentication → Users** y estar confirmado.
- Debe tener una fila en `admin_profiles` con `is_active = true`.
- Revisa la contraseña y espera 15 minutos si agotaste los intentos.

**La tienda no muestra los cambios**

- La API tarda hasta 30 s por la caché del CDN.
- Recarga con `Ctrl/Cmd + Shift + R`.
- Comprueba `/api/public/catalog` y `/api/health`.
- Si el build falló, revisa **Netlify → Deploys → Logs**.

**El build publica la tienda vieja**

Es el respaldo intencional. Ocurre si faltan variables de Supabase, si el catálogo está vacío o si Supabase no responde. Revisa el log `[build-store]`.

**La foto no sube**

- Formatos: JPG, PNG o WebP; máximo 12 MB el original.
- Revisa que el bucket `product-images` exista y sea público.
- Verifica que `SUPABASE_SECRET_KEY` sea la clave **secreta** (`sb_secret_...`), no la pública (`sb_publishable_...`).

**Quiero volver a la tienda anterior**

El HTML, CSS y JS originales siguen en la raíz. El respaldo previo al CMS está en `/tmp/opencode/backup/` durante esta sesión. Para publicar sin CMS, desactiva `cms.enabled` en `js/config.js` o elimina `js/catalog.js` del `index.html`.

---

## 13. Historial

- **1.5.0** — 10/11/2026: estadísticas de visitas anónimas en el panel con Supabase (hoy, 7 y 30 días, únicos por día, gráfico, top de páginas y referrers); registro con `sendBeacon`, RLS de solo inserción y exclusión de administradores y bots.
- **1.4.0** — 06/11/2026: imagen para el estado de WhatsApp con foto, precio y descripción generada desde el botón Compartir; descarga y envío con el menú del sistema.
- **1.3.0** — 04/11/2026: galería de hasta 8 fotos por producto, visor ampliado y estado «Agotado» visible sin permitir la compra.
- **1.2.0** — 01/11/2026: CMS con React + TypeScript, API en Netlify Functions, Supabase (PostgreSQL, Auth y Storage), panel de productos/categorías/ajustes, versiones, actividad, catálogo en vivo y build estático con respaldo.
- **1.1.0** — 01/11/2026: carrito con checkout por WhatsApp, pagos por transferencia (BHD, Banreservas y Popular), botón Compartir y versión visible.

---

## Contacto

- WhatsApp: **829-381-5317**
- Enlace corto: `https://wa.me/message/P3LU5C3LG4JPA1`
- Instagram: [@cueva_boutique](https://www.instagram.com/cueva_boutique?mdxt=MTh0ZnBxb3Bta3ZuaA==)
