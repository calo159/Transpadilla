# Plan de trabajo — TransPadilla para la Alcaldía

Plan completo para llevar TransPadilla de un proyecto funcional a un sistema
listo para producción en una entidad gubernamental. Incluye mejoras de
organización, seguridad, infraestructura, monitoreo, cumplimiento legal y
calidad.

---

## Fases

| Fase | Área | Prioridad | Esfuerzo estimado |
|------|------|-----------|-------------------|
| 0 | Organización del proyecto | Hecho | — |
| 1 | Seguridad crítica | 🔴 Alta | 2-3 semanas |
| 2 | Infraestructura y disponibilidad | 🔴 Alta | 2-3 semanas |
| 3 | Cumplimiento legal | 🔴 Alta | 2-3 semanas |
| 4 | Monitoreo y observabilidad | 🟡 Media | 1-2 semanas |
| 5 | DevOps y CI-CD | 🟡 Media | 2-3 semanas |
| 6 | Documentación operativa | 🟡 Media | 1-2 semanas |
| 7 | Pruebas y calidad | 🟢 Baja | 2-4 semanas |

---

## Fase 0 — Organización del proyecto (COMPLETADA)

Reorganización de archivos y creación de documentación base. Ya ejecutado.

### 0.1 Archivos reubicados

| Origen (raíz) | Destino |
|---|---|
| `iniciar.ps1` | `scripts/iniciar.ps1` |
| `iniciar-https.ps1` | `scripts/iniciar-https.ps1` |
| `habilitar-celular.ps1` | `scripts/habilitar-celular.ps1` |
| `security-audit.js` | `scripts/security-audit.js` |
| `load-test.yml` | `tests/load/load-test.yml` |
| `load-test.mjs` | `tests/load/load-test.mjs` |
| `load-test-2000.yml` | `tests/load/load-test-2000.yml` |
| `load-test-report.json` | `tests/load/reports/load-test-report.json` |
| `load-test-2000-report.json` | `tests/load/reports/load-test-2000-report.json` |
| `zap-scan.yml` | `.github/workflows/zap-scan.yml` |

### 0.2 Archivos creados

- `docs/ARQUITECTURA.md` — Diagrama de flujo completo, stack, decisiones arquitectónicas
- `.claude/settings.json` → unificado en `../.claude/settings.local.json`
- `tests/load/reports/.gitkeep`

### 0.3 Archivos modificados

- `CLAUDE.md` — Reglas de organización, convenciones de nombres, qué no modificar, flujo de generación de código, estilo de código
- `package.json` — Scripts `load-test` y `load-test:report` apuntan a `tests/load/`
- `tests/load/load-test.mjs` — Path actualizado a `tests/load/load-test.yml`
- `scripts/iniciar.ps1` — `$raiz` ahora apunta al directorio raíz
- `scripts/iniciar-https.ps1` — Ídem
- `../.claude/settings.local.json` — Unificadas las `customInstructions`

---

## Fase 1 — Seguridad crítica 🔴

### 1.1 Activar Cloudflare

Cloudflare está implementado en código pero desactivado. Hay que activarlo.

**Archivos a modificar:**
- `render.yaml` — Descomentar `BEHIND_CLOUDFLARE`, `CLOUDFLARE_ORIGIN_SECRET`
- `docs/CLOUDFLARE.md` — Seguir paso a paso para configurar el dominio

**Verificación:**
- El sitio solo debe ser accesible vía Cloudflare
- Golpear la IP de Render directamente debe dar error
- Cabecera `x-cf-origin-secret` debe estar presente

### 1.2 Auditoría completa en todas las mutaciones admin

Algunos endpoints admin no llaman `registrarAuditoria()`.

**Archivos a revisar y modificar:**
- `apps/api/src/routes/buses.ts`
- `apps/api/src/routes/rutas.ts`
- `apps/api/src/routes/paradas.ts`
- `apps/api/src/routes/conductores.ts`

**Qué hacer:**
1. Revisar cada ruta que modifique datos (POST, PUT, PATCH, DELETE)
2. Asegurar que todas llamen `registrarAuditoria()` con:
   - `usuarioId` (del JWT)
   - `accion` (ej: "crear_ruta", "eliminar_bus")
   - `detalle` (qué se modificó, valores relevantes)
   - `ip` (`req.ip` o `clientIp`)
   - `userAgent`
3. En la tabla `auditoria`, asegurar que solo se hagan INSERTs (nunca UPDATE/DELETE)

**Verificación:**
- Hacer mutaciones admin y verificar que aparecen en `GET /auditoria`

### 1.3 Bloqueo de cuenta por fuerza bruta

Hoy hay rate-limit por IP, pero un atacante con VPN rotante puede probar contraseñas indefinidamente.

**Archivos a crear:**
- `apps/api/src/middleware/account-lockout.ts`

**Archivos a modificar:**
- `apps/api/src/routes/auth.ts` — Integrar account-lockout en login
- `packages/db/src/schema/index.ts` — Agregar columna `intentos_fallidos` y `bloqueado_hasta` a tabla `usuarios`

**Qué hacer:**
1. Agregar columnas a tabla `usuarios`:
   - `intentos_fallidos integer default 0`
   - `bloqueado_hasta timestamp` (nullable)
2. Crear middleware `account-lockout`:
   - En login fallido: incrementar `intentos_fallidos`
   - Si `intentos_fallidos >= 5`: setear `bloqueado_hasta = now() + 15 minutes`
   - En login exitoso: resetear `intentos_fallidos = 0`, `bloqueado_hasta = null`
   - Antes de validar password: verificar si `bloqueado_hasta > now()`
3. Notificar al admin si una cuenta es bloqueada (opcional, se puede dejar para después)

**Verificación:**
- 5 logins fallidos → cuenta bloqueada por 15 min
- Login con credenciales correctas durante bloqueo → rechazado
- Después de 15 min → login funciona de nuevo

### 1.4 Política de contraseñas robusta

Hoy solo se exigen 8 caracteres.

**Archivos a modificar:**
- `apps/api/src/middleware/validate.ts` — Agregar reglas de complejidad
- `apps/api/src/routes/auth.ts` — Validar en registro y cambio de password

**Qué hacer:**
Agregar validación de contraseña:
- Mínimo 12 caracteres
- Al menos 1 mayúscula
- Al menos 1 minúscula
- Al menos 1 número
- Al menos 1 carácter especial (`!@#$%^&*()_+-=[]{}|;':\",./<>?`)
- No debe estar en lista de contraseñas comunes (usar HaveIBeenPwned API o lista local)

**Verificación:**
- Registrar con "abc123" → rechazado
- Registrar con "Admin123!" → rechazado (solo 9 chars)
- Registrar con "TransPadilla2024!" → aceptado

### 1.5 Refresh tokens

Hoy el JWT dura 3 días. Si se filtra, el atacante lo usa 3 días.

**Archivos a crear:**
- `apps/api/src/lib/tokens.ts` — Lógica de refresh tokens

**Archivos a modificar:**
- `apps/api/src/routes/auth.ts` — Endpoint `POST /auth/refresh`
- `packages/db/src/schema/index.ts` — Tabla `refresh_tokens`

**Qué hacer:**
1. Crear tabla `refresh_tokens`:
   - `id serial primary key`
   - `usuario_id integer references usuarios(id)`
   - `token text unique not null`
   - `expira_en timestamp not null`
   - `revocado boolean default false`
   - `creado_en timestamp default now()`
2. Bajar `JWT_EXPIRES_IN` a 1 hora
3. En login: devolver access_token (1h) + refresh_token (7 días, httpOnly cookie)
4. Endpoint `POST /auth/refresh`: recibir refresh_token, validar, rotar (revocar viejo, emitir nuevo)
5. En logout: revocar refresh_token

**Verificación:**
- Login → recibe access + refresh tokens
- Access token expirado → refresh funciona
- Refresh token usado dos veces → ambos revocados (detecta robo)
- Logout → refresh token revocado

### 1.6 security.txt y política de divulgación

**Archivos a crear:**
- `apps/web/public/.well-known/security.txt`
- `apps/api/src/routes/well-known.ts`

**Qué hacer:**
1. Crear endpoint `GET /.well-known/security.txt` que sirva:
   ```
   Contact: mailto:seguridad@transpadilla.co
   Expires: 2027-12-31T23:59:00.000Z
   Preferred-Languages: es, en
   Canonical: https://transpadilla-web.onrender.com/.well-known/security.txt
   Policy: https://transpadilla-web.onrender.com/terminos
   ```

**Verificación:**
- `curl https://.../.well-known/security.txt` → devuelve el contenido

---

## Fase 2 — Infraestructura y disponibilidad 🔴

### 2.1 Backup automatizado de BD

Hoy solo hay un comando `pg_dump` documentado, no implementado.

**Archivos a crear:**
- `scripts/backup-bd.sh` — Script de backup para Linux (producción)
- `scripts/backup-bd.ps1` — Script de backup para Windows (local)

**Archivos a modificar:**
- `docs/DESPLIEGUE-PRODUCCION.md` — Actualizar con instrucciones de backup automático

**Qué hacer:**
1. Crear script que:
   - Ejecute `pg_dump` con formato custom
   - Suba el backup a S3/Backblaze B2 (o storage externo)
   - Mantenga últimos 7 backups diarios + 4 semanales + 12 mensuales
   - Notifique si falla
2. Documentar cómo configurar cron diario
3. Crear script de restauración (`scripts/restore-bd.sh`)
4. Documentar procedimiento de restore test (trimestral)

**Verificación:**
- Ejecutar backup → archivo .dump creado
- Restaurar en base vacía → datos completos

### 2.2 Entorno staging

Hoy solo hay producción. No hay forma de probar cambios sin afectar el sitio en vivo.

**Archivos a crear:**
- No nuevos archivos (usar Render para staging)

**Archivos a modificar:**
- `.github/workflows/ci.yml` — Agregar deploy a staging
- `README.md` — Documentar entorno staging

**Qué hacer:**
1. En Render: crear nuevo Web Service `transpadilla-staging` (plan free o starter)
2. Configurar `DATABASE_URL` apuntando a base de datos separada (puede ser la misma Supabase con schema diferente)
3. Configurar despliegue automático desde PRs:
   - En GitHub: agregar step en CI que deploye a staging cuando se abra un PR
   - O usar Preview Environments de Render
4. Documentar URL de staging

**Verificación:**
- Push a rama no-main → no deploya a prod
- PR abierto → staging se actualiza automáticamente
- Staging funcional y accesible

### 2.3 Branch protection y code reviews

Cualquiera puede mergear a main sin revisión.

**Archivos a modificar:**
- No archivos de código (configuración en GitHub)

**Qué hacer:**
1. En GitHub → Settings → Branches → Add rule para `main`:
   - Require pull request reviews before merging (mínimo 1)
   - Dismiss stale pull request approvals when new commits are pushed
   - Require status checks to pass before merging (typecheck, build:prod, test)
   - Require branches to be up to date
   - Include administrators
   - Lock branch (opcional)

### 2.4 Multi-instancia + Redis para Socket.IO

Hoy hay single point of failure: una sola instancia Node.

**Archivos a modificar:**
- `render.yaml` — Escalar a 2+ instancias
- `apps/api/src/lib/socket.ts` — Agregar Redis adapter
- `apps/api/src/lib/cache.ts` — Migrar caché a Redis (opcional)
- `apps/api/src/middleware/rate-limit.ts` — Migrar a Redis distribuido
- `package.json` — Agregar dependencia `@socket.io/redis-adapter` y `ioredis`
- `docker-compose.yml` — Agregar servicio Redis para VPS

**Qué hacer:**
1. Agregar `UPSTASH_REDIS_URL` o `REDIS_URL` a variables de entorno
2. Instalar `@socket.io/redis-adapter` y `ioredis`
3. En `socket.ts`: configurar adapter con Redis
4. En `rate-limit.ts`: migrar de Map en memoria a Redis (usando fixed window)
5. En `render.yaml`: cambiar a `plan: standard` con `minInstances: 2`, `maxInstances: 4`
6. En `docker-compose.yml`: agregar servicio Redis

**Verificación:**
- Con 2+ instancias, WebSocket funciona entre instancias
- Rate-limit es global (no por instancia)
- Matar una instancia → la otra sigue sirviendo

### 2.5 Disaster Recovery Plan

**Archivos a crear:**
- `docs/DRP.md` — Plan de recuperación ante desastres

**Qué debe contener:**
1. **RPO y RTO definidos:**
   - RPO (pérdida máxima de datos): 1 hora
   - RTO (tiempo máximo de recuperación): 4 horas
2. **Escenarios documentados:**
   - Caída del servidor web
   - Caída de la base de datos
   - Corrupción de datos
   - Ataque de ransomware
   - Desastre natural (región de Oregón)
3. **Procedimientos paso a paso para cada escenario**
4. **Roles y responsabilidades** (quién hace qué)
5. **Lista de contactos de emergencia**
6. **Pruebas de DR** (frecuencia trimestral, cómo documentarlas)

---

## Fase 3 — Cumplimiento legal 🔴

### 3.1 Consentimiento de datos en registro

Al registrar un conductor o admin, no se muestra aviso de privacidad ni se solicita consentimiento explícito.

**Archivos a modificar:**
- `apps/api/src/routes/auth.ts` — Agregar campo `consentimiento` en registro
- `packages/db/src/schema/index.ts` — Agregar columna `consentimiento_aceptado` y `consentimiento_version`
- `apps/web/src/pages/Login.tsx` — Agregar checkbox de consentimiento

**Qué hacer:**
1. Agregar columna a `usuarios`:
   - `consentimiento_aceptado boolean not null default false`
   - `consentimiento_version text`
   - `consentimiento_ip inet`
   - `consentimiento_fecha timestamp`
2. En el formulario de registro: agregar checkbox obligatorio "Acepto la política de privacidad" con enlace
3. En backend: validar que `consentimiento` sea `true`, almacenar IP y versión
4. Tabla `consentimientos` aparte (histórico):

```sql
create table consentimientos (
  id serial primary key,
  usuario_id integer references usuarios(id),
  tipo text not null, -- 'privacidad', 'terminos_condiciones', 'terminos_conductor'
  version text not null,
  aceptado boolean not null,
  ip inet,
  user_agent text,
  creado_en timestamp default now()
);
```

**Verificación:**
- Registro sin aceptar → rechazado
- Registro aceptando → consentimiento guardado en BD

### 3.2 Endpoint de derechos ARCO

La política menciona derechos pero no hay mecanismo automatizado.

**Archivos a crear:**
- `apps/api/src/routes/arco.ts`
- `packages/db/src/schema/arco.ts`

**Archivos a modificar:**
- `apps/api/src/routes/index.ts` — Montar ruta `/arco`
- `apps/web/src/pages/Privacidad.tsx` — Agregar formulario ARCO

**Qué hacer:**
1. Crear tabla `solicitudes_arco`:
   ```sql
   create table solicitudes_arco (
     id serial primary key,
     radicado text unique not null, -- TP-ARCO-2026-0001
     tipo text not null, -- acceso, rectificacion, cancelacion, oposicion
     solicitante_nombre text not null,
     solicitante_email text not null,
     solicitante_documento text,
     descripcion text,
     estado text default 'recibida', -- recibida, en_proceso, completada, rechazada
     respuesta text,
     creado_en timestamp default now(),
     actualizado_en timestamp
   );
   ```
2. Endpoint `POST /api/arco/solicitar`:
   - Recibe datos del solicitante
   - Genera radicado
   - Guarda en BD
   - Devuelve número de radicado
   - Notifica al DPO por email/webhook
3. Endpoint `GET /api/arco/estado/:radicado` — Consultar estado
4. Endpoint `GET /api/arco/solicitudes` — Admin: listar todas
5. En frontend: formulario en página de privacidad

**Verificación:**
- Solicitar derecho ARCO → recibe radicado
- Consultar radicado → estado "recibida"

### 3.3 DPO y datos de contacto

**Archivos a modificar:**
- `apps/web/src/pages/Privacidad.tsx` — Agregar datos del DPO

**Qué hacer:**
1. Agregar sección en política de privacidad:
   ```
   **Delegado de Protección de Datos (DPO)**
   Nombre: [Nombre del DPO]
   Correo: dpo@transpadilla.co
   Teléfono: [Teléfono]
   ```

### 3.4 Términos para conductores

Los conductores tienen responsabilidades diferentes y deberían tener términos específicos.

**Archivos a crear:**
- `apps/web/src/pages/TerminosConductor.tsx`

**Archivos a modificar:**
- `apps/web/src/App.tsx` — Agregar ruta `/terminos-conductor`
- `apps/web/src/pages/Conductor.tsx` — Mostrar términos al primer login

**Qué hacer:**
1. Crear página de términos para conductores:
   - Responsabilidad sobre datos GPS
   - Privacidad de ubicación
   - Uso del APK
   - Obligaciones del conductor
2. En backend: agregar columna `terminos_conductor_aceptados` en `usuarios`
3. En frontend: al primer login del conductor, mostrar términos y pedir aceptación

**Verificación:**
- Conductor nuevo → ve términos antes de usar la app
- No puede continuar sin aceptar

### 3.5 SLA formal y ley aplicable

**Archivos a modificar:**
- `apps/web/src/pages/Terminos.tsx` — Agregar cláusulas

**Qué agregar:**
1. Ley aplicable y jurisdicción:
   ```
   Estos términos se rigen por las leyes de la República de Colombia.
   Cualquier controversia será sometida a los juzgados de Riohacha, La Guajira.
   ```
2. SLA definido (disponibilidad, tiempos de respuesta, ventanas de mantenimiento):
   ```
   Disponibilidad objetivo: 99.5% mensual.
   Tiempo máximo de respuesta para incidentes críticos: 1 hora.
   Ventana de mantenimiento programado: domingos 2:00 AM - 4:00 AM.
   ```

### 3.6 Banner de cookies

**Archivos a crear:**
- `apps/web/src/components/CookieBanner.tsx`

**Archivos a modificar:**
- `apps/web/src/App.tsx` — Agregar CookieBanner

**Qué hacer:**
1. Banner simple informando del uso de cookies de autenticación (JWT)
2. Enlace a política de privacidad
3. Botón "Aceptar" (guarda preferencia en localStorage)
4. No bloquear navegación (solo informativo)

**Verificación:**
- Primera visita → banner visible
- Aceptar → banner desaparece
- Recargar → banner no aparece

---

## Fase 4 — Monitoreo y observabilidad 🟡

### 4.1 Logs centralizados a SIEM

Hoy los logs van a stdout del contenedor.

**Archivos a crear:**
- Ninguno (configuración externa)

**Archivos a modificar:**
- `apps/api/src/lib/logger.ts` — Agregar transport a SIEM

**Qué hacer:**
1. Elegir SIEM: Datadog, Grafana Loki, ELK, o Axiom
2. Agregar transport de Pino hacia el SIEM elegido:
   - `pino-datadog` para Datadog
   - `pino-loki` para Grafana Loki
   - `@axiomhq/pino` para Axiom
3. Los campos sensibles (JWT, passwords) ya están redactados
4. Configurar retención mínima de 1 año
5. Documentar en `docs/MONITOREO.md`

**Verificación:**
- App corriendo → logs aparecen en el SIEM
- Buscar por `req.id` → traza completa de una request

### 4.2 Dashboard de métricas (Prometheus + Grafana)

Hoy las métricas solo se ven vía `/api/metrics` sin histórico.

**Archivos a crear:**
- `docs/MONITOREO.md`

**Archivos a modificar:**
- `apps/api/src/lib/metrics.ts` — Exportar en formato Prometheus

**Qué hacer:**
1. Usar `prom-client` para exponer métricas en formato Prometheus
2. Endpoint `GET /api/metrics/prometheus` (protegido, solo admin)
3. Configurar Grafana (cloud o self-hosted) con:
   - Dashboard de rendimiento: P50/P95/P99 por endpoint
   - Dashboard de sistema: CPU, memoria, conexiones activas
   - Dashboard de negocio: buses activos, usuarios conectados, ETA promedio
4. Agregar alias en `package.json`: `"monitoring": "node scripts/monitoring/setup.js"`

**Métricas a exponer:**
```prometheus
# HELP http_request_duration_seconds Request duration by route and method
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/api/buses",le="0.1"} ...
http_request_duration_seconds_bucket{method="GET",route="/api/buses",le="0.5"} ...

# HELP http_requests_total Total requests by status and route
# TYPE http_requests_total counter
http_requests_total{status="200",route="/api/buses"} ...

# HELP db_pool_connections Database pool connections
# TYPE db_pool_connections gauge
db_pool_connections{state="active"} 5

# HELP ws_connections_active Active WebSocket connections
# TYPE ws_connections_active gauge
ws_connections_active 42
```

**Verificación:**
- `GET /api/metrics/prometheus` → devuelve texto Prometheus válido
- Grafana conectado → dashboards con datos

### 4.3 Uptime monitoring

**Archivos a crear:**
- `docs/MONITOREO.md` — Incluir sección de uptime

**Qué hacer:**
1. Configurar UptimeRobot, Better Uptime, o Checkly apuntando a:
   - `https://transpadilla-web.onrender.com/api/healthz` (cada 1 minuto)
   - `https://transpadilla-web.onrender.com/api/readyz` (cada 5 minutos)
   - Flujo crítico: GET /api/buses → 200 (cada 5 minutos)
2. Configurar alertas por:
   - Email al equipo técnico
   - SMS/WhatsApp (servicios de pago)
   - Slack/Discord webhook

### 4.4 Alertas con escalamiento

**Archivos a modificar:**
- `apps/api/src/lib/alertas.ts` — Mejorar sistema de alertas

**Qué hacer:**
1. Definir niveles de alerta:
   - **P1** (Crítico): app caída, BD caída, error 500 masivo → notificar inmediato
   - **P2** (Alto): latencia > 2s, errores 4xx > 5% → notificar en horario laboral
   - **P3** (Medio): CPU > 70%, memoria > 80% → notificar en resumen diario
   - **P4** (Bajo): certificado próximo a expirar → notificar semanal
2. Integrar con PagerDuty, Opsgenie, o al menos Telegram con turnos
3. Agregar heartbeats: si el sistema no reporta en 5 minutos, alerta

---

## Fase 5 — DevOps y CI-CD 🟡

### 5.1 SAST en CI (CodeQL o Semgrep)

Hoy solo hay `pnpm audit`.

**Archivos a modificar:**
- `.github/workflows/ci.yml` — Agregar step de SAST

**Qué hacer:**
Agregar CodeQL (gratuito en GitHub):
```yaml
- name: Initialize CodeQL
  uses: github/codeql-action/init@v3
  with:
    languages: javascript-typescript

- name: Perform CodeQL Analysis
  uses: github/codeql-action/analyze@v3
```

Alternativa más rápida: Semgrep:
```yaml
- name: Semgrep SAST
  uses: semgrep/semgrep-action@v1
```

**Verificación:**
- Push a main → workflow corre y reporta resultados
- CodeQL encuentra vulnerabilidades si existen

### 5.2 Secret scanning en CI

**Archivos a modificar:**
- `.github/workflows/ci.yml` — Agregar secret scanning
- `.husky/pre-commit` — Agregar hook local

**Qué hacer:**
Opción 1: GitHub secret scanning (ya incluido en repos públicos, habilitar en settings)
Opción 2: Agregar truffleHog:
```yaml
- name: Secret scanning
  uses: trufflesecurity/trufflehog@main
  with:
    extra_args: --only-verified
```

Opción 3: Gitleaks:
```yaml
- name: Gitleaks
  uses: gitleaks/gitleaks-action@v2
```

### 5.3 SBOM (Software Bill of Materials)

**Archivos a modificar:**
- `.github/workflows/ci.yml` — Agregar generación de SBOM

**Qué hacer:**
```yaml
- name: Generate SBOM
  run: |
    npm install -g @cyclonedx/cyclonedx-npm
    cyclonedx-npm --pnpm --output-format json > sbom.json

- name: Upload SBOM
  uses: actions/upload-artifact@v4
  with:
    name: sbom
    path: sbom.json
```

### 5.4 Load tests en CI

**Archivos a modificar:**
- `.github/workflows/ci.yml` — Agregar load test smoke

**Qué hacer:**
Agregar load test liviano en CI (no el de 2100 usuarios):
```yaml
- name: Smoke load test
  run: |
    npm install -g artillery
    artillery quick --duration 30 --arrival-rate 10 https://staging.transpadilla.co/api/healthz
```
Este step debe apuntar a staging, no a producción.

### 5.5 Versionado semántico y changelog

**Archivos a modificar:**
- `package.json` — Agregar scripts de versionado
- Crear `CHANGELOG.md`

**Qué hacer:**
1. Instalar `standard-version`:
```bash
pnpm add -D standard-version
```
2. Agregar script en `package.json`:
```json
"release": "standard-version"
```
3. Crear `CHANGELOG.md` con historial de versiones
4. Releases con tags Git: `v1.0.0`, `v1.1.0`, etc.

---

## Fase 6 — Documentación operativa 🟡

### 6.1 Runbook de operaciones

**Archivos a crear:**
- `docs/RUNBOOK.md`

**Escenarios a documentar:**

1. **Servicio caído (health check falla)**
   - Síntomas: health check devuelve != 200
   - Pasos:
     1. Verificar logs en Render: `render logs`
     2. Verificar estado de la BD: `pnpm --filter @workspace/db run check`
     3. Verificar memoria/CPU en dashboard Render
     4. Si OOM: aumentar plan o revisar memory leak
     5. Si error de código: revertir último deploy
   - Contactos: desarrollador de turno

2. **Base de datos lenta/caída**
   - Síntomas: queries tardan > 1s, errores de conexión
   - Pasos:
     1. Verificar pool de conexiones: `SELECT count(*) FROM pg_stat_activity`
     2. Verificar queries lentas: `SELECT * FROM pg_stat_activity WHERE state = 'active'`
     3. Verificar espacio: `SELECT pg_size_pretty(pg_database_size('transpadilla'))`
     4. Contactar soporte Supabase si es necesario
   - Contactos: DBA / Supabase support

3. **Alto uso de memoria/CPU**
   - Síntomas: alerta de CPU > 70% o memoria > 80%
   - Pasos:
     1. Identificar proceso: `top` o dashboard Render
     2. Verificar pico de tráfico: métricas de requests
     3. Si es tráfico legítimo: escalar instancias
     4. Si es ataque: activar Cloudflare, rate-limit más restrictivo

4. **Ataque detectado**
   - Síntomas: múltiples 401/403, IPs extrañas, pico de requests
   - Pasos:
     1. Bloquear IPs en Cloudflare WAF
     2. Revisar logs de rate-limit
     3. Si es fuerza bruta: verificar bloqueo de cuentas
     4. Notificar a seguridad de la alcaldía

5. **Certificado SSL próximo a expirar**
   - Síntomas: alerta de expiración en 30 días
   - Pasos:
     1. Render maneja SSL automáticamente para `*.onrender.com`
     2. Si es dominio propio: renovar en Cloudflare o donde esté el certificado
     3. Verificar: `openssl s_client -connect transpadilla-web.onrender.com:443`

6. **Backup fallido**
   - Síntomas: alerta de backup no ejecutado
   - Pasos:
     1. Verificar logs del cron
     2. Verificar espacio en destino de backup
     3. Verificar conectividad con S3/Backblaze
     4. Ejecutar backup manual: `pg_dump -Fc ...`

### 6.2 Plan de comunicación de incidentes

**Archivos a crear:**
- `docs/INCIDENT-COMMS.md`

**Qué debe contener:**
1. Canales de comunicación:
   - **Interno**: Slack/WhatsApp del equipo técnico
   - **Alcaldía**: correo + teléfono del contacto designado
   - **Ciudadanos**: banner en la app + redes sociales de la alcaldía
2. Plantillas de mensajes:
   - "Estamos experimentando una interrupción del servicio. Estamos trabajando para restaurarlo."
   - "El servicio ha sido restaurado. Disculpa las molestias."
3. Plazos:
   - Notificación interna: inmediato
   - Notificación a alcaldía: dentro de 30 minutos
   - Notificación a ciudadanos: dentro de 1 hora (si aplica)

### 6.3 Matriz de escalamiento

**Archivos a crear:**
- `docs/ESCALAMIENTO.md`

**Niveles:**
| Nivel | Rol | Disponibilidad | Medio de contacto |
|-------|-----|---------------|-------------------|
| L1 | Operador de turno | 24/7 | Teléfono + Slack |
| L2 | Desarrollador senior | Horario laboral + guardia | Teléfono + Slack |
| L3 | Arquitecto / Seguridad | Horario laboral | Email + Slack |
| L4 | Proveedor externo (Supabase, Render) | 24/7 | Portal de soporte |

### 6.4 Manual de operaciones diarias

**Archivos a crear:**
- `docs/OPERACIONES.md`

**Tareas diarias:**
- Verificar health checks (liveness + readiness)
- Revisar resumen de errores del día anterior
- Verificar número de usuarios activos

**Tareas semanales:**
- Revisar logs de errores no controlados
- Verificar espacio en BD
- Revisar cuentas de usuarios nuevas

**Tareas mensuales:**
- Rotar secretos (JWT_SECRET, etc.) si es política de la alcaldía
- Verificar backups
- Revisar métricas de rendimiento del mes
- Revisar cuentas inactivas

**Tareas trimestrales:**
- Prueba de restauración de backups
- Prueba de failover (si aplica)
- Revisión de accesos de administradores
- Actualizar runbook si es necesario

---

## Fase 7 — Pruebas y calidad 🟢

### 7.1 Pruebas E2E con Playwright

**Archivos a crear:**
- `apps/web/e2e/` — Carpeta de tests E2E
- `apps/web/e2e/pasajero.spec.ts`
- `apps/web/e2e/conductor.spec.ts`
- `apps/web/e2e/admin.spec.ts`
- `apps/web/playwright.config.ts`

**Qué hacer:**
1. Instalar Playwright: `pnpm --filter @workspace/web add -D @playwright/test`
2. Configurar `playwright.config.ts` apuntando a la URL de staging
3. Tests mínimos:

**Flujo pasajero:**
```typescript
test('Pasajero puede ver el mapa y los buses', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#map')).toBeVisible();
  // Esperar a que los buses se carguen
  await expect(page.locator('.bus-marker')).toBeVisible({ timeout: 10000 });
});

test('Pasajero puede seleccionar una ruta y ver ETA', async ({ page }) => {
  await page.goto('/');
  await page.click('.ruta-card');
  await expect(page.locator('.eta-info')).toBeVisible();
});
```

**Flujo conductor:**
```typescript
test('Conductor puede iniciar sesión y enviar GPS', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="correo"]', 'conductor@transpadilla.co');
  await page.fill('input[name="password"]', 'conductor123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/conductor');
  // Verificar que el GPS está activo
  await expect(page.locator('.gps-status')).toContainText('EN VIVO');
});
```

**Flujo admin:**
```typescript
test('Admin puede crear una nueva ruta', async ({ page }) => {
  await page.goto('/login');
  // Login como admin...
  await page.goto('/admin');
  await page.click('text=Rutas');
  await page.click('button:has-text("Nueva ruta")');
  await page.fill('input[name="nombre"]', 'Ruta Test E2E');
  await page.click('button:has-text("Guardar")');
  await expect(page.locator('text=Ruta Test E2E')).toBeVisible();
});
```

### 7.2 Cobertura de código

**Archivos a modificar:**
- `apps/api/vitest.config.ts` — Agregar coverage
- `.github/workflows/ci.yml` — Agregar step de coverage

**Qué hacer:**
1. En `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/app.ts', '**/*.test.ts'],
    },
  },
});
```
2. Agregar en CI:
```yaml
- name: Coverage
  run: pnpm --filter @workspace/api run test -- --coverage

- name: Upload coverage
  uses: actions/upload-artifact@v4
  with:
    name: coverage
    path: apps/api/coverage/
```

### 7.3 Contract testing (API vs OpenAPI spec)

**Archivos a modificar:**
- `.github/workflows/ci.yml` — Agregar contract testing
- O usar herramienta externa

**Qué hacer:**
Opción 1: Usar `@optvio/oas` o `express-oas-validator` en tiempo real
Opción 2: Usar Dredd:
```yaml
- name: Contract testing
  run: |
    npm install -g dredd
    dredd packages/api-spec/openapi.yaml http://localhost:8080
    --server "pnpm --filter @workspace/api start"
    --hookfiles ./tests/contract/hooks.js
```
Opción 3: Usar Schemathesis (recomendado para APIs REST):
```yaml
- name: API schema validation
  run: |
    pip install schemathesis
    st run --checks all packages/api-spec/openapi.yaml \
      --base-url https://staging.transpadilla.co
```

### 7.4 Stress testing

**Archivos a crear:**
- `tests/load/stress-test.yml`

**Qué hacer:**
Crear escenario de stress test incremental:
```yaml
config:
  target: "https://staging.transpadilla.co"
  phases:
    - duration: 60
      arrivalRate: 5
      rampTo: 20
      name: "Fase 1: Escalado a 20 req/s"
    - duration: 60
      arrivalRate: 20
      rampTo: 50
      name: "Fase 2: Escalado a 50 req/s"
    - duration: 60
      arrivalRate: 50
      rampTo: 100
      name: "Fase 3: Escalado a 100 req/s"
    - duration: 300
      arrivalRate: 100
      name: "Fase 4: Mantener 100 req/s (5 min)"
  http:
    pool: 100
  defaults:
    headers:
      Accept: "application/json"
```

Documentar: punto de quiebre (CPU 100%, OOM, timeout masivo, error 5xx > 1%).

### 7.5 Pruebas de accesibilidad

**Archivos a modificar:**
- `apps/web/vite.config.ts` — Nada
- O usar herramienta externa

**Qué hacer:**
1. Agregar `@axe-core/playwright` a los tests E2E:
```typescript
import { injectAxe, checkA11y } from 'axe-playwright';

test('Página principal no tiene violaciones de accesibilidad', async ({ page }) => {
  await page.goto('/');
  await injectAxe(page);
  await checkA11y(page, null, {
    includedImpacts: ['critical', 'serious'],
  });
});
```
2. Documentar conformidad WCAG 2.1 nivel AA en `docs/ACCESIBILIDAD.md`

---

## Priorización para ejecución

### 🔴 Hacer primero (semanas 1-4)
Estos items son requisitos mínimos para producción gubernamental:

1. **1.1** Activar Cloudflare
2. **1.3** Bloqueo de cuenta por fuerza bruta
3. **1.4** Política de contraseñas robusta
4. **2.1** Backup automatizado de BD
5. **2.2** Entorno staging
6. **2.3** Branch protection + code reviews
7. **3.1** Consentimiento de datos
8. **3.2** Endpoint derechos ARCO
9. **3.3** DPO designado

### 🟡 Siguiente (semanas 5-8)
1. **1.2** Auditoría completa
2. **1.5** Refresh tokens
3. **2.4** Multi-instancia + Redis
4. **2.5** Disaster Recovery Plan
5. **4.1** Logs a SIEM
6. **4.2** Dashboard de métricas
7. **4.3** Uptime monitoring
8. **5.1** SAST en CI
9. **5.4** Load tests en CI
10. **6.1** Runbook

### 🟢 Final (semanas 9-12)
1. **1.6** security.txt
2. **3.4** Términos conductores
3. **3.5** SLA + ley aplicable
4. **3.6** Banner cookies
5. **4.4** Alertas con escalamiento
6. **5.2** Secret scanning
7. **5.3** SBOM
8. **5.5** Versionado
9. **6.2** Comunicación de incidentes
10. **6.3** Matriz de escalamiento
11. **6.4** Manual de operaciones
12. **7.1** E2E tests
13. **7.2** Cobertura de código
14. **7.3** Contract testing
15. **7.4** Stress testing
16. **7.5** Accesibilidad
