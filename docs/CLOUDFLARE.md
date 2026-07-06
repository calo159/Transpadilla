# Poner Cloudflare delante de TransPadilla (anti-DDoS)

Cloudflare absorbe el grueso de un ataque **antes** de que llegue a tu servidor:
mitiga DDoS volumétrico, da WAF, rate limiting de borde, "Under Attack Mode" y
caché. Es **gratis** en el plan Free. Esto requiere un **dominio propio**
(Cloudflare necesita gestionar el DNS); no funciona con la URL `*.onrender.com`.

La app ya viene **lista para Cloudflare** (ver variables al final).

---

## Paso a paso

### 1. Crear cuenta y agregar el sitio
1. Crea una cuenta en https://dash.cloudflare.com y elige **Add a site**.
2. Escribe tu dominio (p. ej. `transpadilla.com`) y elige el plan **Free**.
3. Cloudflare escanea tus DNS y te da **2 nameservers** (p. ej. `xxx.ns.cloudflare.com`).

### 2. Apuntar el dominio a Cloudflare
En tu registrador (donde compraste el dominio), reemplaza los nameservers por los
de Cloudflare. La propagación tarda de minutos a unas horas.

### 3. DNS hacia Render
En Cloudflare → **DNS** crea un registro:
- Tipo `CNAME`, nombre `@` (o `www`/`app`), destino = el host de tu servicio
  Render (`transpadilla-web.onrender.com`), **Proxy: activado (nube naranja)**.
- En Render → tu servicio → **Settings → Custom Domain**, agrega tu dominio para
  que Render emita su certificado.

### 4. SSL/TLS
Cloudflare → **SSL/TLS → Overview** → modo **Full (strict)** (Render ya sirve
HTTPS válido). Activa **Always Use HTTPS**.

### 5. Seguridad / anti-DDoS
- **Security → Settings**: Security Level *Medium/High*. Ante un ataque activo,
  enciende **"I'm Under Attack Mode"** (muestra un challenge unos segundos).
- **Security → WAF → Rate limiting rules** (Free incluye 1 regla): por ejemplo,
  *si* `URI Path` empieza con `/api/auth/` *entonces* máx. 10 req/min por IP →
  *Block* 10 min. Es el rate-limit de borde, complementa el de la app.
- **Bots**: activa **Bot Fight Mode** (Free).
- **WebSockets**: Network → **WebSockets = On** (suele venir activado). El mapa en
  vivo usa Socket.IO sobre WebSocket; debe quedar habilitado.

### 6. Caché (rendimiento)
El frontend es estático y cacheable. Una **Cache Rule**: cachear todo **excepto**
`/api/*` y `/socket.io/*` (esos nunca se cachean). Por defecto Cloudflare ya
respeta los headers, pero conviene excluir explícitamente esas rutas.

---

## ✅ Checklist de activación (Fase 1.1 de PLAN.md — el orden importa)

⚠️ **No definas `CLOUDFLARE_ORIGIN_SECRET` en Render antes del paso 3.** Si lo
haces, la app empieza a exigir el secreto en cada request a `/api` mientras
Cloudflare *todavía no lo está inyectando* → el sitio entero responde 403 hasta
que completes el Transform Rule. Sigue este orden exacto:

1. [ ] Pasos 1–6 de arriba: sitio agregado a Cloudflare, nameservers apuntando,
   DNS con proxy activado, SSL en *Full (strict)*, WAF/Bot Fight Mode activos.
2. [ ] En Render: define `BEHIND_CLOUDFLARE=true` **solo** (todavía sin el secreto).
   Verifica que el sitio siga funcionando normal por tu dominio.
3. [ ] En Cloudflare → **Rules → Transform Rules → Modify Request Header →
   Add** → header `x-cf-origin-secret` con un valor largo y aleatorio que
   generes ahora (guárdalo).
4. [ ] Recién ahora, en Render: define `CLOUDFLARE_ORIGIN_SECRET` con **ese
   mismo valor**. Guarda — dispara un redeploy.
5. [ ] Verifica de inmediato (ver "Comprobar que quedó bien" abajo): tu dominio
   debe seguir funcionando; `https://transpadilla-web.onrender.com/api/buses`
   directo debe dar **403**. Si tu dominio también da 403, revisa que el
   Transform Rule esté activo y bien escrito — revierte quitando
   `CLOUDFLARE_ORIGIN_SECRET` de Render si necesitas restaurar el acceso ya.

---

## Conectar con la app (ya implementado)

Define estas variables en Render (servicio `transpadilla-web`):

| Variable | Valor | Para qué |
|----------|-------|----------|
| `BEHIND_CLOUDFLARE` | `true` | La app toma la IP real del usuario de `CF-Connecting-IP`, así el rate-limit cuenta por usuario y no por la IP de Cloudflare. |
| `CLOUDFLARE_ORIGIN_SECRET` | una cadena larga secreta | `/api` solo acepta peticiones que traigan ese secreto → **impide esquivar Cloudflare** golpeando `transpadilla-web.onrender.com` directo. |

Para que Cloudflare inyecte ese secreto en cada request al origen:
**Rules → Transform Rules → Modify Request Header → Add** →
header `x-cf-origin-secret` con el mismo valor del secreto (puedes limitarlo a
`Hostname = tu dominio`). Los health checks (`/api/healthz`, `/api/readyz`)
quedan exentos para que Render pueda seguir comprobando el origen directamente.

> Sugerencia extra: en Render, restringe el acceso entrante a los **rangos de IP
> de Cloudflare** (https://www.cloudflare.com/ips/) si tu plan lo permite; así el
> origen ni siquiera responde a tráfico que no venga de Cloudflare.

---

## Comprobar que quedó bien
- `https://tu-dominio` carga la app y el mapa se mueve en vivo (WebSocket OK).
- Cabecera de respuesta `cf-cache-status` presente → pasa por Cloudflare.
- Golpear `https://transpadilla-web.onrender.com/api/buses` directo devuelve
  **403** (si configuraste `CLOUDFLARE_ORIGIN_SECRET`), pero por el dominio sí
  responde.
- En Cloudflare → **Analytics → Security** ves el tráfico filtrado.
