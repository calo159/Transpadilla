# Seguridad de TransPadilla

Resumen de la postura de seguridad del sistema y cómo está protegido contra
abuso y ataques de denegación de servicio (DoS/DDoS).

## Autenticación y autorización
- **JWT** firmado con `JWT_SECRET` (obligatorio en producción; el arranque falla
  si no está). Tokens con expiración de 7 días.
- Contraseñas con **bcrypt** (10 rondas). Cambio de clave self-service que
  verifica la contraseña actual (`POST /auth/cambiar-password`).
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
  entrada y una sola "room" de ruta por cliente.
- **Cabeceras de seguridad**: HSTS (prod), X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy. Sin `x-powered-by`.
- **CORS** restringido a mismo origen (o lista `CORS_ORIGIN`) en producción.

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

## Pendiente recomendado
- **Content-Security-Policy (CSP)**: no se aplica una estricta por defecto para
  no romper el mapa (OSM), las fuentes (Google Fonts) ni OSRM. Defínela según los
  proveedores que uses finalmente (idealmente self-hospedando tiles/fuentes).
- Rotar la contraseña del admin si la base se sembró con datos demo (`admin123`).
