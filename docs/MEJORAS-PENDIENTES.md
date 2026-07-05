# Mejoras Pendientes — TransPadilla

Fecha: 2026-07-03
Fuentes:
- `REVISION-BACKEND-2026-07-02.md` (hallazgos previos)
- `SEGURIDAD.md` (postura actual)
- Auditoría de seguridad automatizada (`node security-audit.js`)
- Load test con Artillery (`load-test-2000.yml`): 2100 usuarios, 10175 requests

---

## Como usar este documento

Cada seccion describe un cambio concreto que Claude Code puede implementar.
Formato:

```
## Prioridad 🔴/🟡/🟢 — Titulo

Archivos: ...
Problema: ...
Impacto: ...
Solucion: ...
```

---

# 🔴 Criticas — Corregir antes de produccion real

## 🔴 0. Credenciales demo expuestas en README publico

**Archivos:** `README.md`, `LEEME.md`

**Problema:**
Ambos archivos contienen una tabla con credenciales reales de cuentas demo:
```
| Admin    | admin@transpadilla.co    | admin123    |
| Conductor | conductor@transpadilla.co | conductor123 |
| Pasajero  | pasajero@transpadilla.co  | pasajero123 |
```

El repositorio es publico (o puede volverse publico). Cualquier persona que
encuentre el repo puede ver estas credenciales.

**Impacto:**
- Si alguien despliega el proyecto con `SEED_DEMO=true` (o por omision si el fix
  del seed no esta aplicado), esas credenciales funcionan en produccion.
- Aunque en Render actual `SEED_DEMO=false`, las credenciales quedan documentadas
  para siempre en el historial del repo.
- Un atacante puede probarlas en cualquier deploy de TransPadilla que encuentre.

**Solucion concreta:**

1. Reemplazar las credenciales por marcadores de posicion en los README:
   ```
   | Admin    | (se crea al desplegar) | (configurado via ADMIN_EMAIL/PASSWORD) |
   | Conductor | (se crea desde el panel admin) | — |
   | Pasajero  | (registro publico) | (el usuario elige) |
   ```

2. Si se quiere mantener la tabla de referencia para desarrollo local, moverla a
   `docs/ONBOARDING.md` con una advertencia clara de que SOLO funciona en local
   con `SEED_DEMO=true`.

3. Tambien verificar `CLAUDE.md` (linea ~20) que tambien referencia estas mismas
   credenciales.

**Verificacion:**
```bash
grep -r "admin123\|conductor123\|pasajero123" --include="*.md" .
# Debe dar 0 resultados (o solo en docs/ no-publicos si se decide mantener)
```

## 🔴 1. Body >32KB causa 500 en vez de 413

**Archivos:** `apps/api/src/app.ts`

**Problema:**
Express.json tiene `limit: "32kb"`, pero cuando el body excede ese limite,
Express arroja un error no manejado que cae al handler global y retorna 500
en vez de 413 (Payload Too Large).

**Evidencia:**
```bash
# Payload de 35KB → Status 500
curl -X POST https://transpadilla-web.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d "$(python -c 'print("x"*35000)')"
# Respuesta: {"error":"Error interno del servidor"}
```

**Impacto:**
- Un atacante puede enviar requests de ~40KB a ~50 req/s y forzar excepciones
  internas continuas, degradando el rendimiento del proceso Node.
- No se distingue entre un error real del servidor y un mero payload muy grande,
  complicando el monitoreo.

**Solucion concreta:**

En `apps/api/src/app.ts`, agregar un middleware **antes** de `express.json()`
que verifique `Content-Length` y devuelva 413 sin parsear el body:

```typescript
// Antes de express.json()
app.use((req, res, next) => {
  const len = parseInt(req.headers["content-length"] ?? "0", 10);
  if (len > 33_000) {
    res.status(413).json({ error: "Payload demasiado grande" });
    return;
  }
  next();
});
```

Alternativamente, corregir el error handler global para que, cuando el error
sea `SyntaxError` o `PayloadTooLargeError` de Express, devuelva 413 en vez de 500:

```typescript
// En el error handler global (app.ts ~linea 195)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Express lanza error 413 cuando excede el limit
  if (err.type === "entity.too.large" || err.status === 413) {
    res.status(413).json({ error: "Payload demasiado grande" });
    return;
  }
  // resto del handler...
});
```

**Verificacion:**
```bash
curl -X POST https://transpadilla-web.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"data":"<35000 chars>"}' -w "\n%{http_code}"
# Debe retornar 413
```

El mismo fix aplica a `express.urlencoded({ limit: "16kb" })`.

---

## 🔴 2. Revocacion JWT fail-open (ya corregido? verificar)

**Archivos:** `apps/api/src/middleware/auth.ts`

**Problema documentado en REVISION-BACKEND:**
El catch del middleware auth ignora errores de BD al verificar tokens_revocados,
permitiendo que tokens revocados vuelvan a funcionar si la BD falla.

**REVISION-BACKEND-2026-07-02.md dice "arreglado el mismo dia".**
Verificar que el fix esta desplegado en produccion:
- Buscar `fail-closed` o `503` en `auth.ts`
- Test: revocar token, forzar error de BD, ver que el token no funcione

Si no esta desplegado, implementar:
```typescript
// En lugar de catch silencioso:
} catch {
  if (process.env["AUTH_REVOCATION_FAIL_OPEN"] !== "true") {
    return res.status(503).json({ error: "Error de autenticacion" });
  }
  // fail-open solo si AUTH_REVOCATION_FAIL_OPEN=true
}
```

---

## 🔴 3. Seed demo es opt-IN, no opt-OUT (ya corregido? verificar)

**Archivos:** `apps/api/src/lib/seed.ts`

**Problema documentado:**
El seed demo se ejecuta a menos que `SEED_DEMO === "false"`. Deberia ejecutarse
solo si `SEED_DEMO === "true"`.

**REVISION-BACKEND dice "arreglado".** Verificar que el cambio esta desplegado.

---

## 🔴 4. Vulnerabilidades de dependencias (ya corregido? verificar)

**Archivos:** `package.json` (overrides)

**Problema documentado:** 13 vulnerabilidades (9 high).

**REVISION-BACKEND dice "arreglado".** Verificar:
```bash
pnpm audit --audit-level moderate
# Debe dar 0 vulnerabilidades
```

---

# 🟡 Prioridad Media — Mejoras de correctness y seguridad

## 🟡 5. GET /rutas/:id/eta retorna 200 para rutas inexistentes

**Archivos:** `apps/api/src/routes/eta.ts`

**Problema:**
Solicitar ETA de una ruta que no existe (ej. `/api/rutas/99999/eta`) retorna
200 con datos vacios en vez de 404:

```json
{"ruta_id":99999,"buses_activos":0,"paradas":[]}
```

**Impacto:**
- Facilita enumeracion de rutas: un atacante puede iterar IDs para descubrir
  cuales existen y cuales no.
- Comportamiento inconsistente con el resto de la API (DELETE /rutas/:id,
  GET /rutas/:id/paradas, etc. que si devuelven 404).

**Solucion:**
En `eta.ts`, antes de calcular el ETA, verificar que la ruta exista:

```typescript
const ruta = await db
  .select({ id: rutas.id })
  .from(rutas)
  .where(eq(rutas.id, rutaId))
  .limit(1);

if (!ruta.length) {
  res.status(404).json({ error: "Ruta no encontrada" });
  return;
}
```

**Verificacion:**
```bash
curl -s https://transpadilla-web.onrender.com/api/rutas/99999/eta | jq .
# Debe retornar 404
```

---

## 🟡 6. Mutaciones admin sin 404 en recursos inexistentes (ya corregido? verificar)

**Archivos:** `apps/api/src/routes/rutas.ts`, `paradas.ts`, `conductores.ts`, `buses.ts`

**Problema documentado:**
DELETE/PATCH sobre recursos inexistentes responden exito ("Ruta eliminada",
"Parada actualizada") aunque no se haya modificado nada.

**REVISION-BACKEND dice "arreglado".** Verificar que los endpoints ahora usan
`.returning()` y devuelven 404 si no se afecto ninguna fila.

---

## 🟡 7. Validacion runtime incompleta (ya corregido? verificar)

**Archivos:** `apps/api/src/middleware/validate.ts`

**Faltan validadores documentados:**
- `idEntero(campo)`
- `booleano(campo)`
- `colorHex(campo)`
- `enteroPositivo(campo)`
- `rolValido(campo)`
- `ocupacionValida(campo)`

**REVISION-BACKEND dice "arreglado".** Verificar existencia y cobertura.

---

## 🟡 8. Push notifications necesitan rate limit propio

**Archivos:** `apps/api/src/routes/push.ts`

**Problema:**
`POST /push/suscribir` y `POST /push/desuscribir` son publicos pero solo
dependen del rate limit global (600/min), no tienen limite propio.

**Impacto:**
- Un atacante puede llenar la tabla `suscripciones_push` con entradas falsas.
- Sin limite de longitud en `endpoint`, `p256dh` o `auth`.

**Solucion:**
```typescript
import { rateLimit } from "../middleware/rate-limit";
const pushLimiter = rateLimit({ ventanaMs: 60_000, max: 10 });

router.post("/push/suscribir", pushLimiter, validarBody(...), handler);
router.post("/push/desuscribir", pushLimiter, validarBody(...), handler);
// Bonus: validar longitud maxima de campos
```

La REVISION-BACKEND dice que esto quedo "arreglado". Verificar.

---

## 🟡 9. Reportes sin cache

**Archivos:** `apps/api/src/routes/reportes.ts`

**Problema documentado:**
Las queries de `posiciones_historial` pueden crecer con el uso y relentizar
el panel admin.

**Impacto:** Panel admin lento con muchos datos.

**REVISION-BACKEND dice "pendiente aceptado".** Aun por implementar.

**Solucion posible:**
```typescript
// Cache en memoria simple de 60s
const reporteCache = new Map<string, { data: any; expires: number }>();

function getCachedOrFetch<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
  const cached = reporteCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const data = await fetch();
  reporteCache.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}
```

---

## 🟡 10. Stats publicos exponen conteos operativos

**Archivos:** `apps/api/src/routes/stats.ts`

**Problema:** `GET /stats` expone total de buses, activos, rutas, paradas, etc.
sin requerir autenticacion.

**Impacto:** Bajo para una app de transporte publico, pero a considerar si se
quiere limitar informacion operativa.

**REVISION-BACKEND dice "pendiente aceptado".** Decision de producto.

---

# 🟢 Prioridad Baja — Mejoras de rendimiento y operacion

## 🟢 11. Rate limit en memoria no escala a multi-instancia

**Archivos:** `apps/api/src/middleware/rate-limit.ts`

**Problema documentado:**
El rate limit usa un Map en memoria. Si se escala a multiples instancias de
Node, cada una tiene su propio contador.

**Impacto:** Un atacante puede hacer 600 req/min × N instancias.

**REVISION-BACKEND dice "pendiente aceptado".**

**Solucion futura:** Reemplazar el store interno por Redis o Upstash, o delegar
el rate limit a Cloudflare.

---

## 🟢 12. Server header expone "cloudflare"

**Problema:**
El header `Server: cloudflare` se filtra a los clientes. Es Cloudflare quien lo
pone, no la app, pero confirma que el trafico pasa por Cloudflare.

**Impacto:** Bajo. No expone tecnologia interna de la app.

**Opcion:** Configurar Cloudflare para ocultar el server header via Transform Rules.

---

## 🟢 13. Alertas externas pueden contener mensajes internos

**Archivos:** `apps/api/src/app.ts` (error handler)

**Problema documentado:**
El webhook de alertas recibe `err.message` truncado. No va al cliente, pero
si el webhook es Discord/Slack/Telegram, podria exponer detalles internos.

**REVISION-BACKEND dice "arreglado".** Verificar.

---

# 📊 Resultados de pruebas de carga

## Load test: 2100 usuarios simultaneos

| Metrica | Valor |
|---------|-------|
| VUs | 2100 |
| Requests | 10175 |
| Pico | 127 req/s |
| 200 OK | 9128 (89.7%) |
| 429 | 1047 (10.3%) |
| 5xx / timeouts | **0** |
| Mediana respuesta | 242ms |
| P95 | 279ms |
| P99 | 327ms |

**Conclusion:** La app soporta 2100 usuarios sin errores de servidor.
El rate limit global (600 req/min/IP) empezo a actuar a ~127 req/s.
Sin rate limit, el rendimiento seria aun mayor.

**Sugerencia:** Ajustar `API_RATE_LIMIT` si se espera mas trafico legitimo.

---

# 🚀 Plan de ejecucion para Claude Code

## Paso 1 — Verificar que los fixes de REVISION-BACKEND esten desplegados

```
Buscar en codigo actual:
- auth.ts: fail-closed (503 si falla DB)
- seed.ts: demo solo si SEED_DEMO="true"
- pnpm audit: 0 vulnerabilidades
- CRUD admin: 404 en recursos inexistentes
- validate.ts: validadores faltantes
- push.ts: rate limit propio
- app.ts: alertas sin err.message interno
```

## Paso 2 — Implementar fixes nuevos

```
1. app.ts: body >32kb → 413 (no 500)
2. eta.ts: ruta inexistente → 404 (no 200)
```

## Paso 3 — Mejora continua

```
3. reportes.ts: cache de 60s
4. stats.ts: decision publico/restringido
5. rate-limit.ts: documentar limite multi-instancia
```

---

## Checklist rapido (verificado contra el codigo el 2026-07-03)

- [x] 🔴 Body >32KB no causa 500 ✅ (desplegado, `app.ts`)
- [x] 🔴 Revocacion JWT fail-closed ✅ (verificado, `auth.ts` responde 503)
- [x] 🔴 Seed demo opt-in ✅ (verificado, `modoSeed()` en `seed.ts`)
- [x] 🔴 pnpm audit en 0 ✅ (verificado, `pnpm audit --audit-level moderate` → 0 vulns)
- [x] 🔴 Credenciales demo removidas de README/LEEME/CLAUDE.md ✅ (reemplazadas por
      referencia a `seed.ts`, ya no aparecen en texto plano en esos 3 archivos)
- [x] 🟡 ETA retorna 404 para ruta inexistente ✅ (desplegado, `eta.ts`)
- [x] 🟡 CRUD admin con 404 reales ✅ (verificado, `rutas/paradas/buses/conductores.ts`)
- [x] 🟡 Validacion runtime completa ✅ (verificado, `booleano`/`colorHex`/`parseIdParam`)
- [x] 🟡 Push rate limit propio ✅ (verificado, `push.ts`)
- [x] 🟡 Reportes con cache ✅ (implementado, TTL 60s por `dias` en `reportes.ts`,
      mismo patron que el cache de ETA)
- [ ] 🟡 Stats publicos: decision tomada — **pendiente, decision de producto** (se
      mantiene publico por ahora; revisar si algun dia deja de alimentar el mapa)
- [x] 🟢 Error handler sin mensajes internos ✅ (verificado, `notificarAlerta` sin `err.message`)
- [ ] 🟢 Rate limit multi-instancia — solo aplica si se escala a mas de una instancia
- [ ] 🟢 Header `Server: cloudflare` — se configura en Cloudflare, no en el codigo
