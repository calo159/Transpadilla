# Revision de codigo - Tal-Cual / TransPadilla

Fecha: 2026-07-02  
Alcance: monorepo `Tal-Cual` completo a nivel de arquitectura, seguridad, backend, frontend, build, dependencias y despliegue.

## Resumen ejecutivo

El proyecto esta bien encaminado: tiene monorepo ordenado, API Express, frontend React/Vite, paquetes compartidos, pruebas, typecheck, build de produccion, cabeceras de seguridad, rate limiting, CSP, auditoria, cache TTL, Socket.IO acotado por sala y despliegue documentado.

Los puntos mas importantes a arreglar son:

1. El middleware de autenticacion acepta tokens aunque falle la consulta de revocacion.
2. El modo seed demo puede crear credenciales conocidas si se despliega fuera del blueprint seguro.
3. `pnpm audit` reporta vulnerabilidades transitivas en herramientas de build/Capacitor.
4. Varias mutaciones administrativas no validan existencia antes de responder exito.
5. La pagina `Pasajero.tsx` esta demasiado grande y concentra demasiada logica.

## Verificacion ejecutada

- `pnpm test`: OK. 69 tests pasaron, 12 quedaron skipped.
- `pnpm --filter @workspace/api run typecheck`: OK.
- `pnpm --filter @workspace/web run typecheck`: OK.
- `pnpm run build:prod`: OK, con warnings de bundle/chunks.
- `pnpm audit --audit-level moderate`: falla con 13 vulnerabilidades reportadas.
- `git status --short`: limpio despues de la revision.

## Prioridad alta

### 1. Autenticacion falla abierta si la BD no responde

Archivo: `apps/api/src/middleware/auth.ts`

Actualmente, despues de verificar el JWT, se consulta `tokens_revocados`. Si esa consulta falla, el catch no bloquea la request y deja continuar:

- Impacto: un token revocado por logout podria seguir funcionando si la tabla no existe, la BD cae, hay error temporal de red o falla el pool.
- Riesgo: rompe la garantia de "cerrar sesion real".
- Recomendacion: cambiar a fail-closed para rutas protegidas. Si falla la consulta de revocacion, responder `503` o `401`.
- Alternativa: permitir fail-open solo con una variable explicita, por ejemplo `AUTH_REVOCATION_FAIL_OPEN=true`, y no usarla en produccion.

Prueba sugerida:

- Simular error en `pool.query` dentro de `authMiddleware`.
- Verificar que una ruta protegida no continue.

### 2. Seed demo con credenciales conocidas por defecto

Archivos:

- `apps/api/src/lib/seed.ts`
- `.env.example`
- `render.yaml`

`render.yaml` configura `SEED_DEMO=false`, lo cual es correcto para produccion. Pero el codigo deja el modo demo como default cuando `SEED_DEMO` no es exactamente `"false"`, y ese modo crea cuentas conocidas como `admin123`.

- Impacto: un despliegue fuera de Render, mal configurado o hecho rapido puede publicar un admin conocido.
- Riesgo: toma completa del panel admin si la base esta vacia y se auto-siembra.
- Recomendacion: invertir el default. Solo crear demo si `SEED_DEMO === "true"`.
- Recomendacion adicional: en produccion, si `SEED_ON_START=true` y faltan `ADMIN_EMAIL` / `ADMIN_PASSWORD`, fallar el arranque en vez de continuar silenciosamente.

Pruebas sugeridas:

- `NODE_ENV=production`, base vacia, sin `SEED_DEMO`: no debe crear demo.
- `SEED_DEMO=true`: si crea demo.
- `SEED_DEMO=false` sin admin env: debe fallar claro o registrar error fuerte.

### 3. Dependencias vulnerables en `pnpm audit`

Comando: `pnpm audit --audit-level moderate`

Resultado: 13 vulnerabilidades:

- 9 high
- 3 moderate
- 1 low

Principales rutas:

- `apps/web > @capacitor/assets@3.0.5 > @capacitor/cli@5.7.8 > tar@6.2.1`
- `apps/web > @capacitor/assets@3.0.5 > @trapezedev/project@7.1.4 > replace@1.2.2 > minimatch@3.0.5`
- `packages/db > drizzle-kit@0.31.10 > @esbuild-kit/esm-loader... > esbuild@0.18.20`

Impacto:

- Afecta principalmente tooling/build/dev, no necesariamente runtime del servidor.
- Sigue siendo importante porque el proyecto genera assets Android/PWA y corre builds locales/CI.

Recomendacion:

- Actualizar `@capacitor/assets` si existe version que arrastre dependencias corregidas.
- Si no basta, usar `overrides` para `tar >= 7.5.16`, `minimatch >= 3.1.4` y `uuid >= 11.1.1`, verificando que no rompa el tooling.
- Revisar si el override de esbuild ya cubre todo; el audit aun detecta una ruta via `@esbuild-kit`.
- Correr de nuevo `pnpm audit --audit-level moderate`.

## Prioridad media

### 4. Mutaciones responden exito aunque no exista el recurso

Archivos:

- `apps/api/src/routes/rutas.ts`
- `apps/api/src/routes/paradas.ts`
- `apps/api/src/routes/conductores.ts`

Ejemplos:

- `DELETE /rutas/:id` responde "Ruta eliminada" aunque el id no exista.
- `PATCH /rutas/:id/activa` responde "Ruta actualizada" aunque no haya fila.
- `PATCH /rutas/paradas/:id` responde "Parada actualizada" aunque no haya fila.
- `DELETE /conductores/:id` responde exito aunque no haya conductor.

Impacto:

- El frontend puede creer que una accion funciono cuando realmente no cambio nada.
- Auditoria puede registrar acciones sobre entidades inexistentes.
- Dificulta debugging y soporte.

Recomendacion:

- Usar `.returning({ id: ... })` en updates/deletes.
- Si no retorna fila, responder `404`.
- Validar `idParam` con `Number.isInteger` y `> 0`; `parseInt("abc")` produce `NaN` y llega a la query.

### 5. Falta validacion fuerte en varios PATCH/POST administrativos

Archivos:

- `apps/api/src/routes/rutas.ts`
- `apps/api/src/routes/paradas.ts`
- `apps/api/src/routes/conductores.ts`
- `apps/api/src/routes/buses.ts`

Casos:

- Color de ruta acepta cualquier string.
- `activa` acepta cualquier valor y lo castea implicitamente por TypeScript, no por runtime.
- `conductor_id` en asignacion de bus no valida que sea conductor ni que exista.
- Algunos PATCH no reutilizan `validarBody`.

Impacto:

- Datos inconsistentes.
- Posibles errores de UI si se guardan colores invalidos o relaciones raras.

Recomendacion:

- Crear validadores reutilizables: `idEntero`, `booleano`, `colorHex`, `rolValido`.
- En asignar conductor, verificar que `usuarios.id` exista y `rol === "conductor"`.
- Mantener la politica actual: validacion en backend, no confiar en el cliente.

### 6. Migraciones mezcladas con SQL manual de arranque

Archivo: `apps/api/src/lib/init-db.ts`

El proyecto tiene Drizzle y carpeta `packages/db/drizzle`, pero produccion crea/ajusta tablas con SQL manual `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE`.

Impacto:

- Puede haber drift entre schema Drizzle, migraciones y SQL runtime.
- Cambios futuros como renombrar columnas, cambiar tipos o constraints seran dificiles.

Recomendacion:

- Mantener `ensureSchema` solo como bootstrap inicial o eliminarlo gradualmente.
- Definir flujo unico de migraciones: Drizzle migrations en deploy/CI o script `pnpm db:migrate`.
- Agregar check de CI que compare schema esperado y migraciones.

### 7. Endpoint publico de push sin rate limit especifico

Archivo: `apps/api/src/routes/push.ts`

`/push/suscribir` y `/push/desuscribir` son publicos. Tienen validacion basica, pero dependen solo del rate limit global.

Impacto:

- Un atacante podria llenar/actualizar muchas suscripciones con endpoints falsos, generando basura en DB.
- El limite global es generoso para no romper el mapa.

Recomendacion:

- Agregar rate limit especifico para push, por IP.
- Limitar longitud maxima de `endpoint`, `p256dh`, `auth`.
- Opcional: purga periodica de suscripciones viejas o que fallen.

### 8. JWT en `localStorage`

Archivo: `apps/web/src/lib/auth.ts`

El token se guarda en `localStorage`.

Impacto:

- Si aparece un XSS, el atacante puede leer el token.
- La app ya escapa HTML en popups Leaflet, lo cual reduce riesgo, pero no elimina toda superficie.

Recomendacion:

- Corto plazo: mantener CSP estricta, no relajar `script-src`, y auditar cualquier `innerHTML`.
- Mediano plazo: migrar a cookie `HttpOnly; Secure; SameSite=Lax/Strict` si el flujo web/APK lo permite.
- Si Capacitor complica cookies, documentar el tradeoff y reducir expiracion JWT.

## Prioridad baja / mejora tecnica

### 9. `Pasajero.tsx` es demasiado grande

Archivo: `apps/web/src/pages/Pasajero.tsx`

Tiene ~2174 lineas y concentra mapa, sockets, rutas, favoritos, PWA install, popups Leaflet, mobile sheet, estados vacios, busqueda y geolocalizacion.

Impacto:

- Dificulta cambios sin romper algo.
- Dificulta testear logica por separado.
- Aumenta costo de mantenimiento.

Recomendacion:

- Extraer hooks:
  - `usePassengerSocket`
  - `useRouteSelection`
  - `useFavorites`
  - `useEta`
  - `usePwaInstallPrompt`
- Extraer componentes:
  - `PassengerTopBar`
  - `RouteCard`
  - `MobileSheet`
  - `MapStatusChips`
  - `NovedadesStack`
- Mover helpers Leaflet a `src/lib/map-popups.ts` o similar.

### 10. Bundle web grande y warning de chunks

Archivo: `apps/web/vite.config.ts`

`pnpm run build:prod` genero:

- `vendor-*.js`: ~1.4 MB minificado, ~419 KB gzip.
- Warning de chunk circular: `vendor -> data-vendor -> vendor`.
- Warning por import dinamico/estatico de `src/lib/api.ts`.

Impacto:

- Carga inicial mas pesada, especialmente en celular.
- Caching menos efectivo si chunks quedan acoplados.

Recomendacion:

- Revisar `manualChunks`.
- Separar librerias pesadas: `jspdf`, `recharts`, `leaflet`, `socket.io-client`, Radix si aplica.
- Lazy-load admin/reportes/PDF si no son necesarios para pasajero.
- Medir con `rollup-plugin-visualizer` o `vite-bundle-visualizer`.

### 11. Plan Render en free

Archivo: `render.yaml`

El blueprint usa `plan: free`.

Impacto:

- Duerme por inactividad.
- No es adecuado para tiempo real con buses y pasajeros.

Recomendacion:

- Para demo: `free` esta bien.
- Para piloto real: minimo `starter`.
- Para produccion con uso municipal: `standard` o superior, segun carga real.

### 12. Tests API principales estan skipped

Resultado de `pnpm test`: `apps/api/test/api.test.ts` tiene 12 tests skipped.

Impacto:

- La cobertura de flujos end-to-end de API queda incompleta.
- Justo ahi estan login, permisos, CRUD y rutas principales.

Recomendacion:

- Revisar por que estan skipped.
- Activarlos con DB de test aislada o mocks consistentes.
- Agregar tests para:
  - token revocado
  - revocation DB failure
  - seed seguro
  - 404 en updates/deletes inexistentes
  - asignacion de conductor invalido

### 13. Logs/alertas pueden filtrar mensajes internos

Archivo: `apps/api/src/app.ts`

El handler global toma `err.message` y lo envia al webhook de alerta, truncado.

Impacto:

- No se manda al cliente, bien.
- Pero si el webhook es externo, podria recibir detalles sensibles de errores de DB o integraciones.

Recomendacion:

- Mantener logs completos en logger interno.
- En alertas externas, enviar solo metodo/ruta/status y un id de incidente.
- Guardar detalle tecnico en logs privados.

## Fortalezas observadas

- API con headers de seguridad y CSP.
- `x-powered-by` deshabilitado.
- Rate limit global y limites especificos para auth.
- CORS restringido en produccion.
- JWT secret obligatorio en produccion.
- Registro publico fuerza rol `pasajero`.
- Conductores no pueden elegir `bus_id`; el backend decide el bus autorizado.
- Socket.IO no acepta ubicacion de buses por socket, solo difunde desde REST autenticado.
- Popups Leaflet usan `escHtml`.
- `.env` y `.mcp.json` estan ignorados y no aparecen versionados.
- Tests y typecheck pasan.
- Build de produccion pasa.

## Plan recomendado

### Sprint 1 - Seguridad y correctness

1. Cambiar revocation check a fail-closed.
2. Invertir default de seed demo.
3. Arreglar vulnerabilidades de `pnpm audit`.
4. Agregar 404 real en mutaciones sobre recursos inexistentes.
5. Validar `idParam` y cuerpos PATCH/POST faltantes.

### Sprint 2 - Calidad de mantenimiento

1. Activar tests skipped de API.
2. Unificar estrategia de migraciones.
3. Extraer `Pasajero.tsx` en hooks/componentes.
4. Agregar tests unitarios para helpers nuevos.

### Sprint 3 - Performance y produccion

1. Analizar bundle con visualizer.
2. Ajustar chunks/lazy-loading.
3. Revisar plan Render para piloto real.
4. Definir politica de sesiones: localStorage vs cookie HttpOnly.
5. Mejorar alertas externas para no enviar mensajes internos.

## Orden sugerido de implementacion

1. `authMiddleware` fail-closed.
2. `seedIfEmpty` seguro por default.
3. `pnpm audit` / overrides.
4. Validaciones y 404 en rutas admin.
5. Tests API skipped.
6. Refactor progresivo de `Pasajero.tsx`.
7. Optimizacion de bundle.


---

## Estado (2026-07-02, tras la ronda de arreglos)

Implementado el mismo día (ver commits `fix(seguridad)`, `chore(deps)`, `fix(api)`, `feat(api)`):

| # | Hallazgo | Estado |
|---|----------|--------|
| 1 | Auth falla abierta | ✅ Arreglado — fail-closed (503) + 5 tests unitarios (`test/auth.test.ts`) |
| 2 | Seed demo por default | ✅ Arreglado — demo solo con `SEED_DEMO=true` y nunca en producción; prod con BD vacía sin admin envs falla el arranque. Tests en `test/seed-modo.test.ts` |
| 3 | `pnpm audit` (13 vulns) | ✅ Arreglado — 0 vulnerabilidades (incluso `--audit-level low` con dev-deps). Causa raíz: los overrides vivían en `pnpm-workspace.yaml`, que pnpm 9 NO lee (config muerta); ahora están en `package.json` → `pnpm.overrides` |
| 4 | Mutaciones sin 404 | ✅ Arreglado — `.returning()` + 404 en rutas/paradas/buses/conductores; `parseIdParam` estricto (400 si no es entero > 0); auditoría solo tras confirmar el cambio. **Extra encontrado**: `DELETE /conductores/:id` podía borrar CUALQUIER usuario (incluidos admins) — ahora filtra `rol='conductor'` |
| 5 | Validación runtime incompleta | ✅ Arreglado — reglas `booleano()` y `colorHex()`; `activa` exige boolean real; color exige hex; asignar conductor verifica existencia y rol |
| 7 | Push sin rate limit propio | ✅ Arreglado — 10/min por IP + límites de tamaño + solo HTTPS |
| 13 | Alertas con mensajes internos | ✅ Arreglado — la alerta externa manda solo método + ruta |

Descartado con justificación:

- **#6 (unificar migraciones)**: la coexistencia `ensureSchema` (red de seguridad de arranque) +
  migraciones Drizzle versionadas es una decisión deliberada, documentada con su flujo en
  `packages/db/README.md`. No se cambia.
- **#12 (tests skipped)**: corren en CI (el workflow provee Postgres y `DATABASE_URL`); el skip
  local es intencional (`api.test.ts:7-8`). Se AGREGARON casos nuevos a esa suite (404s,
  validaciones, regla de rol).

Pendiente (aceptado, sin fecha):

- **#8** JWT en localStorage → cookie HttpOnly (evaluar impacto en el APK Capacitor).
- **#9** Refactor de `Pasajero.tsx` en hooks/componentes.
- **#10** Optimización de bundle (manualChunks / lazy-load).
- **#11** Plan Render de pago para piloto real (decisión de negocio, no de código).
