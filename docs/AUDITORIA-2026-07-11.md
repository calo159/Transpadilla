# Auditoría de seguridad y mejoras — TransPadilla

**Fecha:** 2026-07-11
**Alcance:** todo el proyecto — backend (`apps/api`), frontend (`apps/web`), app Android
(Capacitor), base de datos (`packages/db`), infraestructura (Docker/Render), CI/CD y cadena de
suministro.
**Método:** revisión de solo lectura, tres barridos paralelos con evidencia `archivo:línea`.

---

## Veredicto general

**Postura sólida. Cero hallazgos críticos o altos explotables hoy.** Todas las correcciones
de las rondas anteriores siguen vigentes y verificadas (ver checklist abajo). Lo que resta son
**endurecimientos de defensa en profundidad**, **una tarea de configuración operativa** (el
secreto de origen de Cloudflare) y **mejoras de calidad/rendimiento**.

| Severidad | Cantidad | ¿Explotable hoy? |
|-----------|----------|------------------|
| 🔴 Crítica | 0 | — |
| 🟠 Alta | 0 | — |
| 🟡 Media | 3 | Parcial / dependiente de config |
| 🟢 Baja | 7 | No (defensa en profundidad) |
| ⚪ Info | ~6 | No |

---

## ✅ Confirmado correcto (correcciones previas intactas)

- **Autorización:** las 15 rutas revisadas; toda mutación admin/conductor con
  `authMiddleware` + `requireRol`/`busAutorizado`. `busAutorizado` resuelve el bus desde el JWT
  e ignora el `bus_id` del cliente → sin IDOR entre buses. `DELETE /conductores/:id` filtra por
  `rol='conductor'` (no se pueden borrar admins).
- **Inyección SQL:** 100% parametrizado (`$1,$2…`), incluido `reportes.ts`/`stats.ts`. Sin
  concatenación de entrada de usuario.
- **Mass assignment:** no existe ningún `.values(req.body)`/`.set(req.body)`; `rol`/`id`/
  `token_version` se fijan siempre en el servidor.
- **Sesión:** dual — cookie `httpOnly` en web (token no legible por JS) + Bearer en el APK;
  revocación de token fail-closed (`token_version` + lista negra).
- **XSS:** todo texto de la API en popups/íconos de Leaflet va con `escHtml`; todo color con
  `colorSeguro`. Cero `dangerouslySetInnerHTML`/`innerHTML` en `apps/web/src`.
- **Secretos:** `.env`, `.mcp.json`, `*.key`, keystore **fuera de git** (no en el historial de
  482 commits); rotados por el usuario; `.dockerignore` evita hornearlos en la imagen.
- **CSP** estricta (`script-src 'self'`, sin `unsafe-inline` en scripts) — cabecera del backend
  + `<meta>` en el build para el APK.
- **Android:** `allowBackup=false`, `usesCleartextTraffic=false`, sin deep links secuestrables,
  sin `allowNavigation`, trust-anchors solo del sistema.
- **CI/CD:** permisos mínimos (`contents: read`), sin `pull_request_target`, sin inyección por
  título/cuerpo de PR. `pnpm audit --prod` limpio hoy. Contenedor `USER node`.
- **RLS:** activada; `FORCE` deliberadamente comentado (modelo owner, documentado); `usuarios`
  y tablas internas sin política pública → blindadas al exterior.

---

## 🟡 Hallazgos MEDIA

### M1 · Socket.IO sin límite de conexiones por IP
**`apps/api/src/lib/socket.ts:35-58`, `apps/api/src/app.ts:187-191`**
El throttle existente es **por socket** (40 eventos/10 s), pero **nada limita cuántas
conexiones WebSocket abre una misma IP**. Además `/socket.io` queda **fuera** del `apiLimiter`
y del gate de `CLOUDFLARE_ORIGIN_SECRET` (ambos solo cubren `/api`). Un atacante puede abrir
miles de conexiones concurrentes → agotamiento de sockets/memoria del proceso.
- **Explotable:** parcialmente hoy (mitigable en el borde con Cloudflare → por eso es defensa
  en profundidad, pero es el hueco más concreto).
- **Fix sugerido:** contador de conexiones por IP en el handler `connection` (rechazar > N) y/o
  incluir `/socket.io` en el gate del origin-secret.

### M2 · Spoofing de IP si `BEHIND_CLOUDFLARE=true` sin secreto de origen
**`apps/api/src/app.ts:18-19`, `apps/api/src/lib/client-ip.ts:18-27`**
Con `trust proxy=2` y **sin** `CLOUDFLARE_ORIGIN_SECRET`, un atacante que golpee Render directo
puede rotar `X-Forwarded-For` y **evadir todos los rate-limits por IP** (login/registro/global).
Ya hay un warning de arranque; es **riesgo de configuración, no de código**.
- **Acción (operación):** configurar `CLOUDFLARE_ORIGIN_SECRET` en producción es **obligatorio**
  para que el rate-limit por IP sea real. Sin él, el lockout por cuenta sigue frenando el
  brute-force de login, pero el resto de límites quedan evadibles.

### M3 · Comodines amplios en la CSP del cliente
**`apps/web/vite.config.ts:28,30`**
`connect-src 'self' https: wss: ws:` e `img-src 'self' data: blob: https:` permiten cualquier
host `https:`. Ante un hipotético XSS, facilitaría exfiltrar datos a cualquier dominio. El `ws:`
(texto plano) es redundante bajo HTTPS.
- **Fix sugerido:** restringir a los orígenes reales (proveedor de tiles + OSRM + API) y quitar
  `ws:`. Mantener en sync con la CSP del backend (`apps/api/src/app.ts:61-78`).

---

## 🟢 Hallazgos BAJA

- **B1 · IDOR en favoritos** (`routes/favoritos.ts:22-58`): `cliente_id` viene del body. Dato
  anónimo, id no enumerable, endpoint público por diseño (el pasajero no tiene cuenta) →
  **aceptado**, documentado en `docs/SEGURIDAD.md`.
- **B2 · Alerta P1 sin throttle ante 500** (`app.ts:275`, `lib/alertas.ts:30`): la corrección
  previa cerró el vector de 4xx, pero cualquier `throw` no capturado que devuelva 500 sigue
  disparando una alerta P1 sin límite (p. ej. `POST /buses` con placa duplicada → 500). *Fix:*
  throttle/dedup también para P1, o cap por ventana.
- **B3 · `credentials` no explícito en `apiFetch`** (`apps/web/src/lib/api.ts:12-21`): funciona
  por el default `same-origin` de `fetch`, pero es inconsistente con `custom-fetch.ts` que sí lo
  fija. Hacerlo explícito. Defensa en profundidad.
- **B4 · Key de MapTiler en el bundle** (`apps/web/src/lib/map-config.ts`): si se configura
  `VITE_MAP_TILES_URL` con `?key=…`, la key queda en el bundle (inevitable en mapas de cliente).
  *Mitigación:* restringir la key por dominio en el panel de MapTiler. Hoy el default es OSM sin
  key → sin exposición.
- **B5 · Acciones de CI ancladas a tag, no a SHA** (`.github/workflows/ci.yml`, `codeql.yml`):
  `@v4` es mutable. Son acciones oficiales de GitHub (riesgo bajo). *Fix:* pin a SHA + Dependabot
  `github-actions`.
- **B6 · Remoto de backup por `git://`** (sin cifrar/autenticar): informativo si es LAN/local;
  evitar sobre redes no confiables. No afecta el repo público.
- **B7 · Credenciales demo en `.env.example:139-141`** (`admin123`, etc.): visibles en el repo,
  pero solo funcionan con `SEED_DEMO=true` (bloqueado en prod). Aceptado/informativo.

---

## ⚪ Informativo

- **PII de conductores en el mapa público** (`routes/buses.ts:34-35`): `GET /buses` (sin auth)
  devuelve `nombre_conductor` (nombre completo) a cualquier anónimo. Evaluar si el nombre
  completo es necesario en el canal público.
- **`err.message` en `/api/metrics`** (`lib/metrics.ts:33-38`): gated a admin y ya no va a la
  alerta externa; solo se nota que fragmentos de SQL/host quedan visibles para el admin.
- **`backup-bd.sh` con `DATABASE_URL` inline en el cron de ejemplo** (`scripts/backup-bd.sh:22`):
  deja la contraseña visible en `ps`/logs. Cargarla desde un env-file `600`.
- **`render.yaml:51` `JWT_SECRET: generateValue`** vs. el secreto rotado a mano: `generateValue`
  no re-genera en re-apply; verificar que el valor en el panel de Render sea el rotado.
- **Color crudo en `L.polyline`** (`Pasajero.tsx:391`, `DashboardTab.tsx:59`): no es un sink de
  HTML (Leaflet usa `setAttribute`), pero envolver en `colorSeguro` daría una política única.
- **`html2canvas`** usado en el chunking pero es dependencia transitiva de `jspdf` (no declarada
  en `package.json`).

---

## 🔧 Mejoras NO-seguridad (calidad, rendimiento, operación)

### Backend
1. **N+1 en el camino más caliente (GPS):** cada ping del conductor hace 2 queries (SELECT del
   bus en `busAutorizado` + UPDATE). Colapsable a un solo `UPDATE … WHERE conductor_id=$user
   RETURNING id, ruta_id`. Es el endpoint de mayor frecuencia. (`buses.ts:129-166`,
   `bus-autorizado.ts:42-46`)
2. **Haversine calculado dos veces por fila** en `reportes.ts:196-213` (en el `SUM` y en el
   `FILTER`). Extraer a un CTE lo computa una sola vez.
3. **Éxito falso en `POST /buses/gps` de admin sobre bus inexistente** (`buses.ts:144-162`):
   responde `200` aunque el UPDATE no afecte filas. Devolver 404 como ya hacen novedad/finalizar.
4. **`POST /buses` con placa duplicada** (`buses.ts:62-65`): lanza 500 genérico (y P1). Un
   chequeo/catch de la constraint daría un 409 limpio.

### Frontend
5. **`Pasajero.tsx` es un god-component (~2200 líneas):** extraer la lógica de mapa/marcadores,
   socket y ETA a hooks (`use-bus-markers`, `use-realtime`, `use-eta`). Reduce riesgo de
   regresión y mejora testeo. (Ya lo señalaba `docs/REVISION-CODIGO` previa.)
6. **SVGs estáticos recreados por marcador** (`Pasajero.tsx:490-537`): izar `svgBus`/`svgAlerta`
   a constantes de módulo (hoy se re-crean en el hot path de GPS).
7. **Accesibilidad:** los marcadores/popups de Leaflet no tienen ARIA/alt; revisar contraste del
   dorado (`#F5B731`) sobre blanco en badges pequeños. Replicar el `role="application"` que ya
   usa el mapa admin.
8. **Fuentes de Google render-blocking** (`index.html:24-26`): self-hostear Inter/Plus Jakarta
   (woff2 en `/public`) mejora el LCP en móvil, quita 2 orígenes externos de la CSP y es
   coherente con el objetivo offline-first del APK.

### Infra / DX
9. **Reproducibilidad de build:** la imagen base es `node:22-slim` por tag y CI usa Node 24.
   Anclar a **digest** (`@sha256:…`) y alinear la versión de Node entre Docker, CI y Render.
10. **Healthcheck del contenedor `web`** en `docker-compose.yml` (ya existe `/api/healthz`); hoy
    solo `db` lo tiene.
11. **Observabilidad opt-in:** `ALERTA_WEBHOOK_URL` y `/api/metrics/prometheus` están
    documentados pero comentados en `render.yaml:91-96`. Activarlos en prod cierra el loop de
    detección de errores.
12. **Limpieza menor:** `pnpm-workspace.yaml:8` lista `packages/integrations/*` que no existe; y
    la doc menciona un "ZAP scan" que ya no está en `.github/workflows/`.

---

## Prioridad recomendada

1. **Operación (crítico para que el rate-limit sirva):** configurar `CLOUDFLARE_ORIGIN_SECRET`
   en producción (M2), y poner Cloudflare delante del dominio.
2. **Defensa en profundidad de bajo riesgo, alto valor:** límite de conexiones por IP en
   Socket.IO (M1); estrechar los comodines de la CSP (M3); throttle de alertas P1 (B2).
3. **Calidad/rendimiento:** N+1 del GPS y 404/409 correctos en las mutaciones de bus (backend
   #1, #3, #4).
4. **Deuda técnica (cuando haya tiempo):** dividir `Pasajero.tsx` en hooks; self-hostear fuentes.

> Nada de lo anterior requiere acción inmediata por explotabilidad. El sistema está listo para
> piloto; estas son mejoras para robustecerlo aún más.
