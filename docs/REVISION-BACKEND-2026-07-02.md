# Revision backend - Tal-Cual / TransPadilla

Fecha: 2026-07-02  
Alcance: `apps/api`, `packages/db`, rutas, middlewares, autenticacion, base de datos, jobs, sockets, push, reportes y despliegue relacionado.

## Veredicto corto

El backend esta bien planteado para una demo avanzada o piloto: tiene separacion por rutas, seguridad basica seria, roles, rate limit, auditoria, metricas, historial, Web Push, Socket.IO y tests.

Antes de produccion real, arreglaria cuatro cosas: revocacion de tokens, seed demo, validaciones/404 en CRUD y estrategia de migraciones.

## Arquitectura observada

### API

Ubicacion: `apps/api/src`

La app se monta desde:

- `app.ts`: Express, middlewares globales, CORS, CSP, rate limit, frontend estatico en produccion.
- `index.ts`: arranque HTTP, DB init, Socket.IO, job de historial y apagado ordenado.
- `routes/index.ts`: monta todos los routers.

Rutas principales:

- `auth.ts`: login, registro, cambio de password, logout real.
- `buses.ts`: lectura publica, administracion de flota, GPS conductor/admin, novedades, ocupacion.
- `conductores.ts`: CRUD de conductores y asignacion a buses.
- `rutas.ts`: CRUD de rutas.
- `paradas.ts`: CRUD de paradas y asignacion a rutas.
- `eta.ts`: calculo publico de llegada por ruta.
- `reportes.ts`: reportes historicos para admin.
- `stats.ts`: conteos publicos.
- `metrics.ts`: metricas internas solo admin.
- `push.ts`: suscripcion Web Push publica.
- `seed.ts`: endpoint admin para sembrar datos.
- `auditoria.ts`: historial admin.

### Base de datos

Ubicaciones:

- `packages/db/src/schema/index.ts`
- `apps/api/src/lib/init-db.ts`
- `packages/db/drizzle`

Tablas principales:

- `usuarios`
- `rutas`
- `paradas`
- `ruta_paradas`
- `buses`
- `posiciones_historial`
- `auditoria`
- `suscripciones_push`
- `tokens_revocados`

## Fortalezas

### Seguridad general

- `x-powered-by` deshabilitado.
- CSP definida manualmente.
- Headers de seguridad sin depender de Helmet.
- Body limit pequeno: JSON `32kb`, urlencoded `16kb`.
- CORS restringido en produccion.
- `JWT_SECRET` obligatorio en produccion.
- Rate limit global por IP.
- Rate limit especifico para login, registro y cambio de password.
- Registro publico ignora rol del cliente y crea solo `pasajero`.

### Autorizacion

- `authMiddleware` verifica JWT.
- `requireRol` centraliza permisos por rol.
- `busAutorizado` evita IDOR: el conductor no puede operar buses ajenos mandando otro `bus_id`.
- Admin puede operar cualquier bus, conductor solo el suyo.

### Tiempo real

- Socket.IO no acepta ubicacion de buses desde clientes.
- El GPS entra por REST autenticado.
- Socket solo difunde eventos del servidor.
- Las salas por ruta reducen fan-out.
- Hay throttling basico por socket.

### Operacion

- Job de historial cada 60s, no en cada ping de GPS.
- Poda historial viejo y tokens revocados expirados.
- Health checks no pasan por rate limit.
- Apagado ordenado con `SIGTERM` / `SIGINT`.
- Logs con pino.

### Calidad

- Tests de libs y middlewares pasan.
- Typecheck API pasa.
- Build de produccion pasa.
- Hay comentarios utiles explicando decisiones.

## Hallazgos y mejoras

## Alta prioridad

### 1. Revocacion de tokens falla abierta

Archivo: `apps/api/src/middleware/auth.ts`

Problema:

El middleware verifica primero el JWT. Luego consulta `tokens_revocados`. Si esa consulta falla, el catch permite continuar:

```ts
} catch {
  // Si la comprobacion falla (BD caida), no bloqueamos: el token ya es valido.
}
req.usuario = payload;
next();
```

Impacto:

- Si la BD falla, un token ya revocado vuelve a funcionar.
- Si la tabla `tokens_revocados` no existe o hay error temporal, logout deja de ser real.
- Rompe una garantia de seguridad que el codigo promete.

Recomendacion:

- Cambiar a fail-closed en produccion.
- Responder `503` si no se puede comprobar revocacion.
- Si se quiere conservar fail-open para desarrollo, hacerlo con variable explicita:
  - `AUTH_REVOCATION_FAIL_OPEN=true`

Pruebas necesarias:

- Token valido + DB OK + no revocado -> pasa.
- Token valido + DB OK + revocado -> 401.
- Token valido + DB falla -> 503/401.
- Token invalido -> 401.

### 2. Seed demo crea credenciales conocidas si no se configura bien

Archivo: `apps/api/src/lib/seed.ts`

Problema:

El modo demo es el default porque solo se evita cuando `SEED_DEMO === "false"`.

Ese modo crea:

- `admin@transpadilla.co / admin123`
- `conductor@transpadilla.co / conductor123`
- `pasajero@transpadilla.co / pasajero123`

Render esta configurado con `SEED_DEMO=false`, lo cual reduce el riesgo en ese despliegue. El problema queda para despliegues fuera de Render o variables mal cargadas.

Impacto:

- Si se despliega con base vacia y falta `SEED_DEMO=false`, queda un admin conocido.
- Riesgo alto si la URL es publica.

Recomendacion:

- Cambiar default a seguro:
  - demo solo si `SEED_DEMO === "true"`.
  - produccion nunca crea credenciales demo.
- En `NODE_ENV=production`, si `SEED_ON_START !== "false"` y faltan `ADMIN_EMAIL` / `ADMIN_PASSWORD`, fallar el arranque con error claro.

### 3. Vulnerabilidades de dependencias

Comando ejecutado:

```sh
pnpm audit --audit-level moderate
```

Resultado:

- 13 vulnerabilidades.
- 9 high.
- 3 moderate.
- 1 low.

Rutas principales:

- `@capacitor/assets@3.0.5 > @capacitor/cli@5.7.8 > tar@6.2.1`
- `@capacitor/assets@3.0.5 > @trapezedev/project > replace > minimatch@3.0.5`
- `drizzle-kit > @esbuild-kit > esbuild@0.18.20`

Impacto:

- La mayoria afecta tooling/build, no el runtime directo del API.
- Igual importa para CI, generacion de assets y builds locales.

Recomendacion:

- Actualizar `@capacitor/assets`.
- Revisar si `@capacitor/assets` esta realmente necesario en runtime o solo como herramienta puntual.
- Usar `overrides` si hace falta:
  - `tar >= 7.5.16`
  - `minimatch >= 3.1.4`
  - `uuid >= 11.1.1`
- Volver a correr audit.

## Prioridad media

### 4. Mutaciones admin no devuelven 404 cuando el recurso no existe

Archivos:

- `apps/api/src/routes/rutas.ts`
- `apps/api/src/routes/paradas.ts`
- `apps/api/src/routes/conductores.ts`
- `apps/api/src/routes/buses.ts`

Problema:

Varios `update` y `delete` responden exito sin confirmar que se afecto una fila.

Ejemplos:

- Borrar ruta inexistente responde "Ruta eliminada".
- Actualizar parada inexistente responde "Parada actualizada".
- Borrar conductor inexistente registra auditoria igual.

Impacto:

- UI puede mostrar exito falso.
- Auditoria queda con acciones que no pasaron.
- Dificulta soporte.

Recomendacion:

- Usar `.returning({ id: tabla.id })`.
- Si no retorna fila, responder `404`.
- Registrar auditoria solo despues de confirmar el cambio.

### 5. Validacion runtime incompleta

Archivo base: `apps/api/src/middleware/validate.ts`

El middleware de validacion esta bien, pero no cubre todo.

Faltan reglas utiles:

- `idEntero(campo)`
- `booleano(campo)`
- `colorHex(campo)`
- `enteroPositivo(campo)`
- `rolValido(campo)`
- `ocupacionValida(campo)`

Casos a endurecer:

- `PATCH /rutas/:id/activa`: validar boolean real.
- `PATCH /rutas/:id`: validar color hex.
- `PATCH /buses/:id/conductor`: validar que el conductor exista y tenga rol `conductor`.
- `PATCH /rutas/paradas/:id`: validar lat/lng con rango.
- `idParam`: no usar `parseInt` sin validar resultado.

### 6. SQL manual de arranque puede desviarse del schema Drizzle

Archivos:

- `packages/db/src/schema/index.ts`
- `apps/api/src/lib/init-db.ts`
- `packages/db/drizzle`

Problema:

Hay tres fuentes de verdad:

1. Schema Drizzle.
2. Migraciones Drizzle.
3. SQL manual en `init-db.ts`.

Impacto:

- Cambios futuros pueden quedar en un lado y no en otro.
- `CREATE TABLE IF NOT EXISTS` no corrige cambios de tipo, constraints o renombres.
- Riesgo de drift silencioso entre dev y prod.

Recomendacion:

- Elegir una fuente de verdad.
- Preferible: migraciones Drizzle en deploy.
- Dejar `ensureSchema` solo como bootstrap inicial o eliminarlo gradualmente.
- Agregar script:

```sh
pnpm db:migrate
```

### 7. Push publico necesita limitacion propia

Archivo: `apps/api/src/routes/push.ts`

Problema:

`/push/suscribir` y `/push/desuscribir` son publicos. Eso es normal porque pasajeros no tienen cuenta, pero ahora dependen del rate limit global.

Impacto:

- Posible abuso llenando `suscripciones_push`.
- Endpoints falsos pueden inflar DB.
- El rate limit global es generoso para no afectar el mapa.

Recomendacion:

- Rate limit especifico para push.
- Max length para `endpoint`, `p256dh`, `auth`.
- Purga de suscripciones antiguas.
- Rechazar endpoints demasiado largos o no HTTPS, salvo localhost en desarrollo.

### 8. Reportes hacen queries pesadas sin cache

Archivo: `apps/api/src/routes/reportes.ts`

Los reportes estan protegidos por admin y acotan `dias` a 1-90, eso esta bien. Pero algunas queries sobre `posiciones_historial` podrian crecer fuerte con meses de uso.

Impacto:

- Panel admin lento.
- Carga sobre Supabase si hay muchos buses y snapshots.

Recomendacion:

- Mantener retencion razonable.
- Considerar cache por admin/reportes por 30-60s.
- A futuro: tablas agregadas diarias por ruta.

## Prioridad baja

### 9. `stats` publico expone conteos operativos

Archivo: `apps/api/src/routes/stats.ts`

No es grave. Son conteos generales. Pero si el sistema llega a produccion real, revisar si esos datos deben ser publicos.

Recomendacion:

- Mantener publico si alimenta landing/demo.
- Si no es necesario, mover a admin o devolver solo datos no sensibles.

### 10. Alertas externas pueden contener mensajes internos

Archivo: `apps/api/src/app.ts`

El error handler manda al webhook el `err.message` truncado.

Impacto:

- No va al cliente, bien.
- Pero si el webhook es Discord/Slack/Telegram, podria exponer detalles internos.

Recomendacion:

- Alertas externas: ruta, metodo, status, id de incidente.
- Logs internos: error completo.

### 11. Rate limit en memoria

Archivo: `apps/api/src/middleware/rate-limit.ts`

Esta bien para una sola instancia Render. Si escalan a multiples instancias, cada instancia tendra su propio contador.

Recomendacion:

- Para una instancia: dejar asi.
- Para multiples instancias: Redis/Upstash o rate limit en Cloudflare.

## Plan de arreglo recomendado

### Paso 1 - Seguridad

1. Cambiar revocacion JWT a fail-closed.
2. Cambiar seed demo a opt-in.
3. Resolver `pnpm audit`.
4. Agregar tests para esos tres puntos.

### Paso 2 - Correctness API

1. Crear validadores faltantes.
2. Centralizar `idParam` seguro.
3. Arreglar 404 en `update/delete`.
4. Validar relaciones: conductor existe, ruta existe, parada existe.

### Paso 3 - Base de datos

1. Decidir migraciones Drizzle vs SQL runtime.
2. Crear script de migracion.
3. Documentar flujo de deploy.
4. Evitar drift entre `schema/index.ts` e `init-db.ts`.

### Paso 4 - Operacion

1. Rate limit especifico en push.
2. Cache liviano en reportes.
3. Politica de retencion para historial.
4. Revisar `stats` publico.

## Orden exacto que yo seguiria

1. `authMiddleware`: fail-closed.
2. `seedIfEmpty`: demo solo con `SEED_DEMO=true`.
3. Tests de auth/seed.
4. `pnpm audit` y overrides/updates.
5. Helper `parseIdParam` seguro.
6. 404 reales en CRUD admin.
7. Validadores faltantes.
8. Push rate limit.
9. Migraciones.
10. Reportes/cache/retencion.

## Conclusion

El backend no esta mal; al contrario, tiene buenas decisiones. El mayor problema no es arquitectura, sino cerrar huecos de produccion: fallos de seguridad por configuracion, validacion incompleta y consistencia de datos.

Con una ronda enfocada de arreglos, queda mucho mas listo para piloto real.


---

## Estado (2026-07-02, tras la ronda de arreglos)

Ver la tabla de estado detallada al final de `REVISION-CODIGO-2026-07-02.md` (los hallazgos se
solapan). Resumen: **#1 (auth fail-closed), #2 (seed opt-in), #3 (audit 13→0), #4 (404 reales),
#5 (validadores), #7 (push rate limit + límites) y #10 (alertas sin mensajes internos) quedaron
arreglados el mismo día**, con tests unitarios y de integración nuevos. Además se corrigió algo
peor que lo documentado: `DELETE /conductores/:id` podía borrar cualquier usuario (incluidos
admins); ahora exige `rol='conductor'`.

Descartado: #6 (migraciones — coexistencia deliberada documentada en `packages/db/README.md`).
Pendiente aceptado: #8 (cache de reportes), #9 (stats público — decisión de producto), #11
(rate limit distribuido — solo aplica con múltiples instancias).
