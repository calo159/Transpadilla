# Plan de Recuperación ante Desastres (DRP) — TransPadilla

Fase 2.5 de [`PLAN.md`](../PLAN.md). Define qué hacer, quién y en cuánto tiempo, si algo grave
falla en producción. Complementa (no reemplaza) el runbook operativo de la Fase 6 de `PLAN.md`
(`docs/RUNBOOK.md`, aún no creado) — ese cubrirá incidentes del día a día; este documento cubre
**desastres**: pérdida de datos o servicio prolongada.

---

## Objetivos de recuperación

| Métrica | Objetivo | Qué significa |
|---|---|---|
| **RPO** (Recovery Point Objective) | **1 hora** | En el peor caso, se pierde como máximo 1 hora de datos (posiciones GPS, reportes, cambios admin) desde el último backup/snapshot válido. |
| **RTO** (Recovery Time Objective) | **4 horas** | Desde que se detecta el desastre hasta que el servicio vuelve a operar (aunque sea en modo degradado), no deben pasar más de 4 horas. |

El RPO de 1 hora se sostiene con: el job de historial (snapshot cada ~60 s, ver
`HISTORIAL_INTERVALO_MS`) y backups diarios de BD (`scripts/backup-bd.sh`) + el **point-in-time
recovery de Supabase** si el proyecto está en plan Pro (recupera a cualquier segundo, no solo al
backup diario — ver `docs/SUPABASE.md`). Sin Supabase Pro, el RPO real depende del último
`backup-bd.sh` exitoso (por eso corre diario, no semanal).

---

## Escenarios y procedimientos

### 1. Caída del servidor web (Render no responde / healthz falla)
**Detección:** `GET /api/healthz` deja de responder 200; monitor de uptime alerta.
1. Revisar Render → el servicio `transpadilla-web` → **Logs** y **Events** (¿crasheó, OOM,
   deploy fallido?).
2. Si es un deploy roto: Render → **Deploys** → **Rollback** al deploy anterior verde.
3. Si es OOM/recursos: revisar plan (free se duerme; considerar `standard`, ver `render.yaml`).
4. Si Render mismo está caído (raro): [status.render.com](https://status.render.com); esperar o
   evaluar failover a VPS (`docker-compose.yml`, ver `docs/DESPLIEGUE-PRODUCCION.md` Opción B).
5. Verificar recuperación: `curl https://transpadilla-web.onrender.com/api/healthz` → `200`.

**RTO estimado:** minutos (rollback) a 1 hora (si requiere intervención manual).

### 2. Caída o corrupción de la base de datos (Supabase)
**Detección:** `GET /api/readyz` responde `db: error`; login/mapa fallan; sesión anterior de
esta misma conversación tuvo un caso real (contraseña de Supabase rotada sin actualizar
`DATABASE_URL` en Render → mismo síntoma).
1. Confirmar el síntoma exacto: `curl https://transpadilla-web.onrender.com/api/readyz`.
2. Si es credenciales/URL: Supabase → Project Settings → Database → **Connect** → copiar la
   cadena del **Session pooler** actual → Render → Environment → actualizar `DATABASE_URL` → Save
   (redeploy automático).
3. Si Supabase reporta una incidencia de su lado: [status.supabase.com](https://status.supabase.com).
4. Si hay corrupción de datos (no solo caída de conexión): ir al escenario 3.

**RTO estimado:** 15–30 min (rotación de credenciales) a varias horas (incidencia de Supabase).

### 3. Corrupción de datos (borrado accidental, bug de migración, ataque)
1. **Detener escritura si es posible** (poner el servicio en mantenimiento o escalar a 0
   instancias en Render) para no seguir dañando datos ni sobrescribir el backup bueno.
2. Identificar el último backup **anterior** a la corrupción:
   `ls -la backups/` (o el storage remoto de `BACKUP_REMOTE`).
3. Restaurar en una **base nueva/vacía** primero (nunca directo sobre la de prod):
   `./scripts/restore-bd.sh <archivo.dump> "<DATABASE_URL de una base de prueba>"`.
4. Verificar los datos restaurados (rutas, buses, usuarios clave presentes y correctos).
5. Solo entonces, restaurar sobre el destino real y volver a levantar el servicio.
6. Documentar qué causó la corrupción (bug, error humano, ataque) para prevenirlo.

**RTO estimado:** 1–4 horas (depende del tamaño de la BD y cuánto haya que investigar antes
de restaurar).

### 4. Ataque (ransomware / intrusión)
1. **Aislar primero:** revocar credenciales expuestas (rotar `DATABASE_URL`, `JWT_SECRET`,
   `ADMIN_PASSWORD`); si hay sospecha de acceso no autorizado a Supabase, rotar la contraseña de
   la cuenta de Supabase también.
2. Activar Cloudflare "I'm Under Attack Mode" si está configurado (`docs/CLOUDFLARE.md`).
3. Revisar `GET /api/metrics` (admin) y la tabla `auditoria` (con IP/user-agent desde la Fase
   1.2) para reconstruir qué se hizo y desde dónde.
4. Si hubo modificación/borrado de datos: seguir el escenario 3 (restaurar desde backup limpio
   **anterior** al momento de la intrusión).
5. Notificar al contacto de la entidad si hay datos de ciudadanos potencialmente afectados
   (obligación bajo la Ley 1581 de 2012) — el plan de comunicación detallado es la Fase 6.2 de
   `PLAN.md` (`docs/INCIDENT-COMMS.md`, aún no creado).

**RTO estimado:** varía mucho; priorizar contener antes que restaurar.

### 5. Desastre regional (la región `oregon` de Render tiene un problema mayor)
1. Verificar [status.render.com](https://status.render.com) por región.
2. Como Supabase y Render son proveedores distintos, la BD probablemente sigue viva — el plan de
   contingencia es desplegar el servicio web en **otra región de Render** (o el VPS de respaldo,
   Opción B de `docs/DESPLIEGUE-PRODUCCION.md`) apuntando a la misma `DATABASE_URL`.
3. Actualizar DNS/Cloudflare si el dominio apuntaba a un origen fijo.

**RTO estimado:** 2–4 horas (depende de cuánto tarde el nuevo despliegue en estar listo).

---

## Roles y responsabilidades

| Rol | Responsabilidad en un desastre |
|---|---|
| **Operador de turno** | Detecta la alerta, ejecuta el primer diagnóstico (escenarios de arriba), escala si no puede resolver en 30 min. |
| **Desarrollador responsable** | Ejecuta restauraciones, rollbacks, rotación de credenciales; decide si se activa el escenario de ataque. |
| **Contacto de la entidad (alcaldía/empresa)** | Recibe la notificación de incidente mayor; autoriza comunicación a ciudadanos si aplica. |

## Contactos de emergencia (completar)

| Quién | Rol | Contacto |
|---|---|---|
| _(nombre)_ | Desarrollador responsable | _(teléfono/correo)_ |
| _(nombre)_ | Contacto de la entidad | _(teléfono/correo)_ |
| Render | Soporte de plataforma | https://render.com/docs (portal de soporte según plan) |
| Supabase | Soporte de base de datos | https://supabase.com/support |

---

## Pruebas de DR (trimestral)

Cada trimestre, documentar en este archivo (o en un `docs/DRP-LOG.md` si se prefiere historial
separado) el resultado de:

1. **Restore test:** tomar el backup más reciente y restaurarlo en una base de prueba con
   `scripts/restore-bd.sh`, confirmar que los datos son coherentes y que la app arranca contra
   ella (`DATABASE_URL` apuntando a esa base de prueba + `pnpm --filter @workspace/api run dev`).
2. **Simulacro de rollback:** confirmar que el último deploy verde en Render permite un rollback
   de 1 clic sin sorpresas.
3. Registrar: fecha, quién lo hizo, cuánto tardó, qué falló (si algo), y ajustar este documento.

| Fecha | Restore test OK | Rollback test OK | Notas |
|---|---|---|---|
| _(pendiente primera ejecución)_ | | | |
