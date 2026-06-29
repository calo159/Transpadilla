# Seguridad de TransPadilla

Resumen de la postura de seguridad del sistema y cómo está protegido contra
abuso y ataques de denegación de servicio (DoS/DDoS).

## Autenticación y autorización
- **JWT** firmado con `JWT_SECRET` (obligatorio en producción; el arranque falla
  si no está). Tokens con expiración de **3 días por defecto** (configurable con
  `JWT_EXPIRES_IN`, p. ej. `12h`).
- Contraseñas con **bcrypt** (10 rondas), **mínimo 8 caracteres** (registro,
  alta de conductor y cambio de clave). Cambio de clave self-service que
  verifica la contraseña actual (`POST /auth/cambiar-password`).
- **Login resistente a enumeración de usuarios**: respuesta genérica
  ("Credenciales inválidas") y **tiempo constante** (compara contra un hash
  bcrypt señuelo si el correo no existe) → no filtra qué cuentas existen.
- **Anti-XSS almacenado**: los datos de la BD/usuario (novedad del conductor,
  placa, nombres de ruta/parada) se **escapan** antes de inyectarse por
  `innerHTML` en los popups de Leaflet (además de la CSP `script-src 'self'`).
- **Toda la autorización vive en el backend**, no en el cliente:
  - El registro público SIEMPRE crea rol `pasajero` (el `rol` del cliente se
    ignora) → nadie puede auto-otorgarse permisos. Los conductores los crea un
    administrador autenticado.
  - Un conductor solo puede operar **su** bus: el `bus_id` se resuelve en el
    servidor desde su JWT (`busAutorizado`); se ignora el `bus_id` del cliente
    (evita IDOR/suplantación).
  - Las mutaciones de rutas/paradas/buses exigen rol `admin`.

## Defensa contra abuso / DoS de capa 7 (aplicación)
- **Rate limiting por IP** (en memoria, con barrido para no fugar memoria):
  - Global: `API_RATE_LIMIT` (600/min por defecto) sobre toda `/api`.
  - Login: 10 / 5 min · Registro: 20 / hora · Cambio de clave: 20 / 15 min.
  - Los health checks (`/api/healthz`, `/api/readyz`) NO se limitan, para que un
    flood no los haga fallar y provoque reinicios.
- **Límite de tamaño de body** (JSON 32 KB, urlencoded 16 KB).
- **Timeouts HTTP** (`headersTimeout`, `requestTimeout`, `keepAliveTimeout`) →
  mitigan slow-loris.
- **Socket.IO endurecido**: `maxHttpBufferSize` 10 KB, ping/connect timeouts,
  throttle por socket (se desconecta a quien spamea eventos), validación de la
  entrada y una sola "room" de ruta por cliente. La posición de cada bus se emite
  **solo a la sala de su ruta** (`ruta_<id>`), no a todos los clientes (anti-fanout).
- **Cabeceras de seguridad**: **CSP a medida** (`script-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'self'`, `upgrade-insecure-requests` en prod; ver `apps/api/src/app.ts`),
  HSTS (prod), X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy,
  Cross-Origin-Opener-Policy / Resource-Policy. Sin `x-powered-by`.
- **CORS** restringido a mismo origen (o lista `CORS_ORIGIN`) en producción, más los
  orígenes del WebView del APK (`https://localhost`, etc.) para que la app Android pueda
  consumir la API.

## Base de datos
- **Supabase (PostgreSQL)** con **Row Level Security (RLS) activado en modo FORCE** en las
  5 tablas (`packages/db/rls.sql`, idempotente). El backend conecta como rol `postgres`
  (bypassa RLS) → opera normal, pero la base queda blindada ante accesos directos.
- **TLS automático** a la base (SSL si el host es Supabase). Consultas **parametrizadas**
  (Drizzle ORM; el SQL crudo de reportes/historial usa placeholders `$1`) → sin inyección SQL.

## App Android (APK)
- **Solo HTTPS** (`network_security_config.xml` con `cleartextTrafficPermitted=false`).
- `allowBackup=false` (nadie extrae datos con `adb backup`), **FLAG_SECURE**
  (bloquea capturas/grabación de pantalla), depuración de WebView desactivada en release.
- **ProGuard/R8** (ofuscación + minificación) y **APK firmado** (keystore propio, fuera del repo).
- Prevención de *task hijacking* (`taskAffinity` vacío).

## Calidad
- TypeScript estricto, validación de entradas propia, pruebas automatizadas
  (Vitest + Supertest) y CI (typecheck + build + test + `pnpm audit`).

## ⚠️ Importante: DDoS volumétrico se mitiga en el BORDE, no en el código
Las defensas de arriba frenan abuso por IP y floods de capa 7, pero **ningún
servidor Node detiene por sí solo un DDoS volumétrico** (gigabits de tráfico de
miles de IPs). Para eso, antes de ir a producción real:

1. **Pon Cloudflare (gratis) delante del dominio** — guía completa en
   [CLOUDFLARE.md](CLOUDFLARE.md). La app ya está preparada: con
   `BEHIND_CLOUDFLARE=true` usa la IP real del usuario para el rate-limit, y con
   `CLOUDFLARE_ORIGIN_SECRET` rechaza el tráfico que intente esquivar Cloudflare.
2. Activa las protecciones de la plataforma (Render/VPS) y, en VPS, un proxy
   (Caddy/Nginx) con límites de conexión + `fail2ban`.
3. Mantén `API_RATE_LIMIT` ajustado a tu tráfico real.

## Auditoría (2026-06)

Revisión manual de todo el código. **Resultado: postura sólida; sin fallos que exijan
cambios de código.** Verificado:
- Todas las mutaciones (rutas, paradas, buses, conductores, `/seed`) exigen
  `authMiddleware + requireRol("admin")`; las operaciones del conductor pasan por
  `busAutorizado` (anti-IDOR). Las lecturas del mapa son públicas a propósito.
- SQL parametrizado en todo (sin inyección). Validación de entradas en cada endpoint.

Puntos **menores / conocidos** (aceptables a esta escala, a tener en cuenta):
- **JWT sin revocación**: un token filtrado es válido hasta su expiración (3 días por
  defecto). Mitigación: bajar `JWT_EXPIRES_IN`.
- **`/auth/register` revela si un correo ya existe** (409) → enumeración menor (el login
  sí está protegido contra timing).
- **Rate-limit en memoria por instancia**: correcto con una sola instancia; con varias
  habría que un store compartido (Redis).
- **Sin registro de auditoría** de acciones de admin (quién creó/borró qué).

## Pendiente (acción del operador, no es código)
- 🔴 **Rotar los secretos expuestos** (llave de MapTiler, contraseña de Supabase,
  contraseña del admin) — la más urgente.
- Poner **Cloudflare** delante del dominio antes de producción real (ver
  [CLOUDFLARE.md](CLOUDFLARE.md); la app ya está preparada).
- Restringir/rotar la contraseña del admin si la base se sembró con `admin123` (demo).
