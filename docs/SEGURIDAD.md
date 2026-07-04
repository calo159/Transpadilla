# Seguridad de TransPadilla — Postura, defensas y guía para Claude Code

Este documento describe todas las capas de seguridad del sistema, cómo están
implementadas y qué debe respetar cualquier cambio de código para no debilitarlas.
Es tanto un reference para Claude Code como un checklist de despliegue.

---

## Índice

1. [Autenticación y autorización](#1-autenticación-y-autorización)
2. [Protección contra abuso y DoS](#2-protección-contra-abuso-y-dos)
3. [Cabeceras de seguridad HTTP](#3-cabeceras-de-seguridad-http)
4. [Base de datos](#4-base-de-datos)
5. [App Android (APK)](#5-app-android-apk)
6. [Anti-DDoS en el borde (Cloudflare)](#6-anti-ddos-en-el-borde-cloudflare)
7. [Defensas por capa (resumen visual)](#7-defensas-por-capa-resumen-visual)
8. [Reglas para Claude Code](#8-reglas-para-claude-code)
9. [Pendientes del operador](#9-pendientes-del-operador)

---

## 1. Autenticación y autorización

### JWT
- `JWT_SECRET` **obligatorio en producción**: el arranque falla (fail-fast) si no está
  (`apps/api/src/middleware/auth.ts:13`). En local usa un valor fijo de desarrollo.
- Token firmado con `jsonwebtoken`, payload: `{ id, correo, rol }`.
- Expiración configurable vía `JWT_EXPIRES_IN` (default: `3d`).
- **Lista negra de tokens revocados** en tabla `tokens_revocados` (SHA-256 del token,
  no el token plano). Cierre de sesión real (`POST /auth/cerrar-sesion`) invalida
  el token actual. **Fail-closed**: si la BD falla, responde 503 (no deja pasar).

### Contraseñas
- **bcrypt** con 10 rondas de sal (`apps/api/src/routes/auth.ts:93`).
- Mínimo **8 caracteres** en registro y cambio de clave.
- **Anti-enumeración por timing**: si el correo no existe, compara contra un hash
  bcrypt señuelo (`DUMMY_HASH` en `auth.ts:16` para que ambas ramas tarden lo mismo.

### RBAC (Role-Based Access Control)
- `requireRol("admin")` protege todas las mutaciones (rutas, paradas, buses,
  conductores, seed, reportes).
- `authMiddleware` + `busAutorizado` para operaciones de conductor:
  - El `bus_id` **se resuelve en el servidor** desde el JWT, nunca del body del
    cliente. Conductor solo opera su propio bus. Admin puede operar cualquiera
    (envía `bus_id` en el body).
  - Esto evita **IDOR** (Insecure Direct Object Reference) y suplantación entre buses.
- **Registro público siempre crea rol `pasajero`**: el campo `rol` del body se ignora
  (`auth.ts:96`). Nadie puede auto-otorgarse permisos.

### Cambio de contraseña
- Requiere token válido (`authMiddleware`) **y** la contraseña actual correcta
  (`/auth/cambiar-password`). Un token robado no basta para secuestrar la cuenta.

---

## 2. Protección contra abuso y DoS

### Rate limiting por IP

Middleware propio en memoria (`apps/api/src/middleware/rate-limit.ts`) con barrido
automático de entradas vencidas para evitar fuga de memoria.

| Límite | Ventana | Máx. | Ubicación |
|--------|---------|------|-----------|
| Global `/api` | 60 s | 600 (o `API_RATE_LIMIT`) | `app.ts:135` |
| Login | 5 min | 10 | `routes/auth.ts:19` |
| Registro | 60 min | 20 | `routes/auth.ts:21` |
| Cambio password | 15 min | 20 | `routes/auth.ts:23` |
| Push subscribe/unsub | 60 s | 10 | `routes/push.ts:13` |

- Health checks (`/api/healthz`, `/api/readyz`) **NO se limitan** para evitar que
  un flood haga que Render crea que la app está caída y la reinicie.
- La IP real se extrae de `CF-Connecting-IP` si `BEHIND_CLOUDFLARE=true`, o de
  `req.ip` (confiando en `trust proxy`) (`lib/client-ip.ts`).

### Límites de payload
- `Content-Length` verificado **antes de parsear** (> 33 KB → 413).
- `express.json({ limit: "32kb" })`
- `express.urlencoded({ limit: "16kb" })`

### Timeouts HTTP
Configurados en `apps/api/src/index.ts:50-52`:
- `headersTimeout`: 20 s
- `requestTimeout`: 30 s
- `keepAliveTimeout`: 65 s

Mitigan **slow-loris** (cliente que envía datos muy lento para agotar sockets).

### Cache con deduplicación de thundering herd
`lib/cache.ts`: TTL corto en memoria para lecturas públicas (`GET /rutas`, `GET /buses`).
Si N requests llegan mientras se está cargando, **comparten la misma promesa** en vez
de golpear la BD N veces.

### Socket.IO endurecido
`apps/api/src/lib/socket.ts`:
- `maxHttpBufferSize`: 10 KB
- `pingTimeout`: 20 s, `pingInterval`: 25 s, `connectTimeout`: 10 s
- **Throttle por socket**: > 40 eventos en 10 s → desconexión forzada.
- Una sola room por cliente (evita acumular miles de rooms).
- Las posiciones GPS solo entran por REST autenticado, nunca por socket (un cliente
  no puede falsear ubicación de un bus conectándose al socket).
- La emisión de posición es **por sala de ruta** (`ruta_<id>`), no a todos los
  clientes (anti-fanout).

### Web Push
- VAPID keys opcionales (si no están configuradas, el push se desactiva silenciosamente).
- Suscripciones validadas: endpoint ≤ 600 chars, solo HTTPS (o localhost en dev),
  p256dh ≤ 256, auth ≤ 128.
- Máx. 50 rutas por suscripción.
- Suscripciones muertas (404/410) se limpian automáticamente.
- Proximidad con throttle: 5 min entre avisos del mismo bus (configurable).

---

## 3. Cabeceras de seguridad HTTP

Aplicadas en `apps/api/src/app.ts:81-94`:

| Cabecera | Valor |
|----------|-------|
| `Content-Security-Policy` | `default-src 'self'`; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https: wss: ws:; worker-src 'self' blob:; + `upgrade-insecure-requests` en prod |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(self)` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` (solo prod) |
| `X-Powered-By` | **Eliminado** (`app.disable("x-powered-by")`) |

### CSP detail
Política a medida para React/Vite + Leaflet + Socket.IO:
- `script-src 'self'`: el build de Vite solo emite scripts externos (sin inline).
- `style-src 'unsafe-inline'`: Leaflet y Radix/shadcn inyectan estilos.
- `img-src https: data: blob:`: tiles de mapa (cualquier proveedor) + marcadores Leaflet.
- `connect-src https: wss: ws:`: OSRM routing + WebSocket Socket.IO.
- CSP sobreescribible con variable de entorno `CSP`. Precaución: en prod se añade
  `upgrade-insecure-requests`; si se define `CSP` manualmente, mantener esa directiva.

### CORS
- Producción: solo `CORS_ORIGIN` (lista separada por comas) + orígenes del APK
  (`https://localhost`, `http://localhost`, `capacitor://localhost`).
- Desarrollo: todo permitido.
- El frontend en prod es same-origin (lo sirve Express), así que CORS apenas aplica.
  El APK sí necesita CORS porque carga el bundle localmente (cross-origin).

### Cloudflare Origin Secret
Si se define `CLOUDFLARE_ORIGIN_SECRET`, los endpoints `/api` exigen la cabecera
`x-cf-origin-secret` (inyectada por Cloudflare via Transform Rule). Health checks
quedan exentos. **Impide que un atacante golpee Render directo esquivando Cloudflare**
(`app.ts:144-152`).

---

## 4. Base de datos

### Row Level Security (RLS)
- Activado en **modo FORCE** en las 6 tablas (`packages/db/rls.sql`):
  `usuarios`, `rutas`, `paradas`, `ruta_paradas`, `buses`, `favoritos`.
- FORCE aplica RLS incluso al owner de la tabla. El backend conecta como rol de
  servicio (bypass RLS) → opera normal.
- Rol `anon` (cliente público): solo SELECT en rutas, paradas, ruta_paradas, buses.
  `usuarios` no tiene política pública → completamente blindada al exterior.
- Idempotente: se puede correr varias veces sin error.

### SQL Injection
- **Todas las consultas usan Drizzle ORM** (query builder) o SQL crudo con
  placeholders `$1`, `$2`, etc. Nunca interpolación de cadenas.
- Incluso en los reportes/insights con SQL complejo (`routes/reportes.ts`), los
  parámetros dinámicos (días, límites) van como placeholders.

### SSL/TLS
- Conexión a Supabase con SSL activado automáticamente si el host contiene
  `supabase` o la URL trae `sslmode` (`packages/db/src/index.ts`).
- En producción se usa el **Session pooler** de Supabase (host `pooler.supabase.com`),
  no la conexión directa IPv6 (que falla en Render).

---

## 5. App Android (APK)

Medidas en `apps/web/android/` (ver también `docs/CAPACITOR-ANDROID.md`):
- **Solo HTTPS** (`cleartextTrafficPermitted=false`).
- `allowBackup=false`: evitar extracción de datos con `adb backup`.
- `FLAG_SECURE`: bloquea capturas de pantalla y grabación.
- WebView con depuración desactivada en release.
- **ProGuard/R8**: ofuscación y minificación.
- APK firmado con keystore propio (NO en el repo).
- Prevención de **task hijacking** (`taskAffinity` vacío).

---

## 6. Anti-DDoS en el borde (Cloudflare)

El rate limiting y timeouts del servidor **no detienen un DDoS volumétrico**
(gigabits de tráfico desde miles de IPs). Para eso se necesita Cloudflare:

### Qué hace Cloudflare
- Absorbe el ataque antes de que llegue al origen.
- WAF (Web Application Firewall) con reglas de rate limiting.
- "I'm Under Attack Mode": challenge JS/CAPTCHA a visitantes sospechosos.
- Bot Fight Mode (gratis): bloquea bots conocidos.
- Caché del frontend estático.

### Cómo conectarlo (app ya lista)
1. Comprar dominio y ponerlo en Cloudflare.
2. Crear CNAME → `transpadilla-web.onrender.com` (proxy: naranja).
3. En Render: Settings → Custom Domain (para SSL).
4. Variables en Render:
   - `BEHIND_CLOUDFLARE=true` → la IP real del usuario llega por `CF-Connecting-IP`.
   - `CLOUDFLARE_ORIGIN_SECRET=<secreto>` → bloquea acceso directo a Render.
5. En Cloudflare: Transform Rule que inyecte `x-cf-origin-secret` con ese secreto.
6. SSL/TLS: Full (strict) + Always Use HTTPS.
7. Cache Rule: cachear todo excepto `/api/*` y `/socket.io/*`.

Guía detallada en `docs/CLOUDFLARE.md`.

---

## 7. Defensas por capa (resumen visual)

```
CLIENTE
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  1. BORDE (Cloudflare — opcional pero recomendado)           │
│     • Under Attack Mode        • DDoS volumétrico            │
│     • WAF + Rate limiting      • Bot Fight Mode              │
│     • Cache de frontend        • Validación SSL/TLS          │
│     • Origin Secret → bloquea tráfico directo a Render       │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  2. RENDER / VPS                                             │
│     • TLS (HTTPS)               • Firewall de plataforma     │
│     • Apagado graceful (SIGTERM)• Timeouts HTTP              │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  3. EXPRESS (MIDDLEWARE)                                     │
│     • CSP + Security headers    • CORS restringido           │
│     • Rate limiting por IP      • Límite de payload (32 KB)  │
│     • Origin Secret check       • Body size pre-verificación │
│     • JWT auth + RBAC           • busAutorizado (anti-IDOR)  │
│     • Validación de entradas    • Anti-timing (bcrypt dummy) │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  4. SOCKET.IO                                               │
│     • Throttle por socket       • maxHttpBufferSize 10 KB    │
│     • Timeouts cortos           • Una room por cliente       │
│     • GPS solo por REST (nunca socket)                       │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  5. BASE DE DATOS (Supabase/PostgreSQL)                      │
│     • RLS + FORCE en 6 tablas   • SQL parametrizado          │
│     • SSL automático            • Service role bypass        │
│     • Tabla usuarios blindada al público                     │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  6. APP ANDROID                                              │
│     • Solo HTTPS                • FLAG_SECURE anti-captura   │
│     • No backup                 • ProGuard + firma           │
│     • Sin depuración WebView    • Anti-task hijacking        │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Reglas para Claude Code

Al modificar cualquier parte del código, seguir estas reglas:

### Nunca
- **No confiar en `bus_id`, `rol` o `id` del cliente**: siempre resolver en servidor.
- **No exponer secretos** en logs, respuestas de error, o commits.
- **No usar interpolación de cadenas en SQL**: usar placeholders `$1`, `$2`, etc.
  (incluso con Drizzle, evitar `sql` template literal con datos del usuario).
- **No deshabilitar la validación de entradas** en endpoints públicos.
- **No quitar rate limiting** de endpoints existentes.
- **No rebajar la CSP** sin entender el riesgo: `script-src 'unsafe-inline'` o
  `'unsafe-eval'` abren la puerta a XSS.
- **No usar `res.send()` con datos del usuario sin escapar** (especialmente en
  popups de Leaflet que usan `innerHTML`).

### Siempre
- **Autenticar y autorizar en cada mutación**: `authMiddleware` + `requireRol()` o
  `busAutorizado`. No asumir que el middleware anterior ya lo hizo.
- **Rate limit** todo endpoint público que escriba en BD.
- **Validar tamaños** de inputs: strings ≤ 500 chars por defecto, enteros en rangos
  acotados, arrays con límite (`slice(0, N)`).
- **Usar `parseIdParam()`** de `middleware/validate.ts` para extraer `:id` de URL.
- **Loggear errores sin el mensaje** si puede contener datos sensibles (SQL, rutas
  de archivos, etc.). Usar `notificarAlerta()` para alertas externas sin detalles.
- **Apagar el bus del conductor al cerrar sesión** (como en `routes/auth.ts:154-167`).
- **Revisar el resumen de seguridad** al arrancar (`logResumenSeguridad()` en
  `index.ts`). Si faltan `CLOUDFLARE_ORIGIN_SECRET` o `JWT_SECRET`, investigar.

### Al agregar un nuevo endpoint
1. ¿Es público o requiere auth? Si requiere, añadir `authMiddleware`.
2. ¿Solo admin? Añadir `requireRol("admin")`.
3. ¿Es una operación de conductor? Usar `busAutorizado`.
4. ¿Recibe datos del cliente? Validar con `validarBody(...reglas)`.
5. ¿Puede un abusador llamarlo muchas veces? Añadir `rateLimit(...)`.
6. ¿Devuelve datos del usuario? No exponer passwords, hashes, tokens.
7. ¿Usa el parámetro `:id` de la URL? Usar `parseIdParam()`.

### Al modificar el frontend
- Si se añade un recurso externo (fuente, tile, CDN), **actualizar la CSP** en
  `app.ts:60-78` o se bloqueará.
- Si se añade `innerHTML`, escapar el contenido (Leaflet popups).
- No almacenar tokens en `localStorage` si se puede evitar; usar cookies
  httpOnly es más seguro pero requiere cambios en el backend.

---

## 9. Pendientes del operador

Acciones que debe hacer el operador, no son cambios de código:

- 🔴 **Rotar secretos expuestos**: llave de MapTiler, contraseña de Supabase,
  contraseña del admin sembrada con `admin123` (demo).
- ⚠️ **Poner Cloudflare delante** del dominio antes de producción real
  (ver `docs/CLOUDFLARE.md`; la app ya preparada).
- ⚠️ **Ajustar `API_RATE_LIMIT`** según el tráfico real de la ciudad.
- ⚠️ **Configurar VAPID keys** para Web Push (generar con `npx web-push
  generate-vapid-keys` y poner en `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`).

### Limitaciones conocidas (aceptables a esta escala)
- **JWT sin revocación temprana**: un token filtrado vale hasta su expiración (3d).
  Mitigación: bajar `JWT_EXPIRES_IN` (ej. `12h`).
- **`/auth/register` revela si un correo ya existe** (409). Enumeración menor.
- **Rate-limit en memoria**: correcto con 1 instancia; con varias instancias se
  necesitaría Redis.
- **Sin registro de auditoría** de acciones de admin (quién creó/borró qué).

---

> Última revisión: julio 2026. Auditoría de código completa; postura sólida sin
> cambios de código requeridos en ese momento.
