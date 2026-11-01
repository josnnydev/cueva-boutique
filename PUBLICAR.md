# Publicar Cueva Boutique con el CMS (todo gratis)

Esta guía deja la tienda y el panel funcionando en **Netlify + Supabase Free**. No necesitas tarjeta ni servidor propio.

Orden recomendado:

1. Crear Supabase y ejecutar el esquema.
2. Crear el administrador.
3. Probar en local y migrar los 34 productos.
4. Subir a GitHub.
5. Conectar Netlify y configurar variables.
6. Crear el build hook y verificar.

---

## 1. Crear Supabase

1. Entra a <https://supabase.com> y crea un proyecto.
2. Anota la contraseña de la base de datos.
3. Espera a que el proyecto esté listo.

### 1.1 Ejecutar el esquema

Abre **SQL Editor → New query** y pega el contenido completo de:

```
supabase/migrations/20261101000100_init.sql
```

Pulsa **Run**. Debe terminar sin errores.

Después abre otra consulta, pega `supabase/seed.sql` y ejecútala. Crea las 5 categorías y los ajustes iniciales.

### 1.2 Copiar credenciales

En el proyecto de Supabase abre **Settings → API Keys** (o el botón **Connect** del proyecto):

| Valor | Variable |
| --- | --- |
| Project URL | `SUPABASE_URL` |
| Secret key (`sb_secret_...`) | `SUPABASE_SECRET_KEY` |
| Publishable key (`sb_publishable_...`) | `SUPABASE_ANON_KEY` (opcional) |

Pulsa el icono del ojo para revelar la clave secreta. Si tu proyecto todavía usa las claves antiguas, en `SUPABASE_SECRET_KEY` pega la `service_role`.

> La clave secreta omite RLS. Solo va en Netlify y en tu `.env` local. Nunca en el navegador, GitHub ni capturas.

---

## 2. Crear el administrador

### Opción A — Desde Supabase

1. **Authentication → Users → Add user**.
2. Escribe el correo y una contraseña larga.
3. Marca **Auto Confirm User**.
4. Copia el UUID del usuario.
5. En **SQL Editor** ejecuta, cambiando los valores:

```sql
insert into public.admin_profiles (user_id, email, full_name)
values (
  'UUID-DEL-USUARIO',
  'tu-correo@ejemplo.com',
  'Administrador'
)
on conflict (user_id) do update
  set email = excluded.email,
      is_active = true;
```

### Opción B — Con `npm run admin`

Rellena `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env` y ejecuta `npm run admin`. Crea el usuario confirmado y su perfil en `admin_profiles`. Si el usuario ya existe, actualiza la contraseña.

---

## 3. Preparar el proyecto en local

Requisitos: Node.js 20+.

```bash
npm install
cp .env.example .env
```

Edita `.env`:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SESSION_SECRET=un-secreto-de-32-caracteres-o-mas
ALLOWED_ORIGIN=http://localhost:8888
NETLIFY_BUILD_HOOK=
ADMIN_EMAIL=tu-correo@ejemplo.com
ADMIN_PASSWORD=una-contraseña-larga
ADMIN_NAME=Administrador
```

Genera `SESSION_SECRET` con:

```bash
openssl rand -hex 32
```

### 3.1 Probar el build

```bash
npm run typecheck
npm test
npm run build
npm run verify
```

El build debe terminar con `[verify] Todo correcto.` y `dist/admin/index.html` debe existir.

### 3.2 Migrar los 34 productos

```bash
npm run seed
npm run doctor
```

`npm run doctor` revisa variables, tablas, bucket, productos, fotos y administradores sin mostrar claves. Debe terminar con `Todo listo para usar el CMS.`

El script:

- Lee las tarjetas de `index.html`.
- Crea/actualiza los 34 productos con sus anchors actuales.
- Sube las imágenes WebP a Supabase Storage.
- Crea las categorías si faltan.
- Deja la versión `1.2.0` publicada.
- Si definiste `ADMIN_EMAIL` y `ADMIN_PASSWORD`, crea el administrador.

Puedes ejecutarlo de nuevo: no duplica productos ni vuelve a subir una foto existente.

### 3.3 Probar la API y el panel

Con Netlify CLI:

```bash
npx netlify-cli dev
```

Abre:

- Tienda: <http://localhost:8888>
- Panel: <http://localhost:8888/admin/>
- Salud: <http://localhost:8888/api/health>

`/api/health` debe devolver `configured: true`.

> Sin Netlify CLI puedes usar `npm run dev` para el panel, pero la API debe estar en `http://localhost:8888`.

---

## 4. Subir a GitHub

Crea un repositorio vacío llamado `cueva-boutique` y sube el proyecto **sin** `.env`, `node_modules`, `dist` ni `backups` (ya están en `.gitignore`).

Con Git instalado:

```bash
git init
git add .
git commit -m "Cueva Boutique 1.2.0 con CMS"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/cueva-boutique.git
git push -u origin main
```

Si no tienes Git:

1. En GitHub: **Add file → Upload files**.
2. Arrastra el contenido del proyecto (no la carpeta `node_modules`, no `.env`, no `dist`).
3. Confirma el commit.

---

## 5. Conectar Netlify

1. Entra a <https://app.netlify.com>.
2. **Add new site → Import an existing project → GitHub**.
3. Autoriza GitHub y elige el repositorio.
4. Netlify lee `netlify.toml`; confirma:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions`
5. Pulsa **Deploy site**.

El primer deploy puede publicar la tienda actual aunque Supabase aún no esté configurado; el build tiene respaldo.

### 5.1 Variables de entorno

En **Site configuration → Environment variables → Add a variable**:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SESSION_SECRET=el-mismo-secreto-largo
ALLOWED_ORIGIN=https://cueva-boutique.netlify.app
NETLIFY_BUILD_HOOK=
```

- `ALLOWED_ORIGIN` debe ser el dominio final, sin barra al final.
- `NETLIFY_BUILD_HOOK` se completa en el paso 6.
- No pongas `ADMIN_EMAIL` ni `ADMIN_PASSWORD` en Netlify: solo se usan en local para el seed.

Después de guardar, ve a **Deploys → Trigger deploy → Deploy site**.

### 5.2 Nombre del sitio

En **Site configuration → Change site name** elige `cueva-boutique` para obtener:

```
https://cueva-boutique.netlify.app
```

Si Netlify te da otro nombre, actualiza el dominio en:

- `index.html` (`canonical`, Open Graph, Twitter, JSON-LD).
- `robots.txt`.
- `sitemap.xml`.
- `ALLOWED_ORIGIN` en Netlify.

```bash
sed -i 's|cueva-boutique.netlify.app|TU-SITIO.netlify.app|g' index.html robots.txt sitemap.xml
```

Haz commit y vuelve a desplegar.

---

## 6. Crear el build hook

El build hook permite que el CMS regenere el HTML estático, el JSON-LD, las imágenes locales y el sitemap.

1. **Site configuration → Build & deploy → Build hooks**.
2. **Add build hook**, nombre `cms`, rama `main`.
3. Copia la URL.
4. En **Environment variables**, edita `NETLIFY_BUILD_HOOK` y pega la URL.
5. **Deploys → Trigger deploy → Deploy site** para que las Functions reciban la variable.

Sin este paso el panel funciona y la tienda se actualiza en vivo, pero no se regenera el HTML estático.

---

## 7. Verificar

1. Abre `https://tu-sitio.netlify.app/api/health`:

```json
{
  "ok": true,
  "data": {
    "configured": true,
    "missing": []
  }
}
```

2. Abre la tienda y confirma que aparecen los 34 productos y el pie con **Versión 1.2.0**.
3. Abre `/admin/` e inicia sesión.
4. Cambia el precio de un producto y guarda.
5. Recarga la tienda: el cambio debe aparecer en ≤ 30 s.
6. En **Ajustes → Publicar versión** publica `1.2.1` y espera el build.
7. Confirma que el pie muestra `1.2.1`.

Verificación automática:

```bash
npm run verify -- https://tu-sitio.netlify.app
```

---

## 8. Checklist después de publicar

- [ ] `/api/health` devuelve `configured: true` y `missing: []`.
- [ ] La tienda muestra los 34 productos.
- [ ] El panel abre en `/admin/` y el login funciona.
- [ ] Cambiar un precio se refleja en la tienda.
- [ ] Subir una foto funciona y la imagen aparece.
- [ ] Activar/desactivar un producto se refleja.
- [ ] El carrito, las ofertas y el botón Compartir siguen funcionando.
- [ ] El pedido por WhatsApp llega con productos, cantidades y total.
- [ ] El pie muestra la versión publicada.
- [ ] `sitemap.xml` y `robots.txt` usan el dominio correcto.
- [ ] Enviar la URL a Google Search Console y pedir indexación.
- [ ] Configurar un recordatorio mensual para `npm run backup`.

---

## 9. Actualizar el sitio

### Cambios de contenido

Se hacen desde `/admin/`. No edites `dist/` a mano.

### Cambios de código o diseño

1. Edita los archivos fuente (`admin/src`, `netlify/`, `scripts/`, `css/`, `js/`, `index.html`).
2. Actualiza la versión en `package.json` y en el panel (o en `settings.site`).
3. Ejecuta:

```bash
npm run typecheck
npm test
npm run build
npm run verify
```

4. Haz commit y push. Netlify despliega solo.
5. Publica la versión desde **Ajustes** para forzar el build estático.

### Volver a una versión anterior

En Netlify: **Deploys → elige un deploy anterior → Publish deploy**. Para el catálogo, restaura un backup JSON o vuelve a ejecutar el seed.

---

## 10. Dominio propio (opcional)

1. Compra el dominio donde prefieras.
2. En Netlify: **Domain management → Add a domain**.
3. Configura los DNS que indica Netlify.
4. Espera la propagación y el certificado SSL gratuito.
5. Actualiza el dominio en `index.html`, `robots.txt`, `sitemap.xml` y `ALLOWED_ORIGIN`.
6. Vuelve a desplegar.

---

## 11. Problemas frecuentes

**El panel dice “Tu sesión expiró”**

Vuelve a iniciar sesión. Si persiste, revisa que `SESSION_SECRET` no haya cambiado y que el usuario esté activo en `admin_profiles`.

**Error 401 al entrar**

- El usuario no está confirmado en Supabase Auth.
- No existe su fila en `admin_profiles`.
- La contraseña es incorrecta (5 intentos fallidos bloquean 15 minutos).

**La tienda no cambia**

- Espera 30 s por la caché del CDN o recarga sin caché.
- Revisa `/api/public/catalog`.
- Revisa que el producto esté activo y su categoría visible.

**El build falla**

- Revisa **Deploys → Logs**.
- Confirma `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en Netlify.
- El build tiene respaldo: si Supabase falla, publica la tienda anterior.

**Las fotos no suben**

- El bucket `product-images` debe existir y ser público.
- La clave debe ser la **secreta** (`sb_secret_...`), no la pública (`sb_publishable_...`).
- Formatos: JPG, PNG o WebP; máximo 12 MB el original.

**Supabase se pausó**

Entra al panel de Supabase y reanuda el proyecto. La Function `keepalive` lo consulta a diario para evitarlo.

---

## 12. Costos

Todo lo necesario está en planes gratuitos:

- Netlify Free: hosting, CDN, Functions, builds y deploy continuo.
- Supabase Free: PostgreSQL, Auth y Storage.
- GitHub Free: repositorio.

Solo pagarías si superas los límites gratuitos o quieres un dominio propio.

---

Contacto: **829-381-5317** · [@cueva_boutique](https://www.instagram.com/cueva_boutique?mdxt=MTh0ZnBxb3Bta3ZuaA==)
