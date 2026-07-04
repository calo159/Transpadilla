# Escalado a múltiples instancias — guía para cuando llegue el día

Este documento **no aplica todavía**. TransPadilla corre hoy en Render con `plan: free`, que
opera **una sola instancia** y ni siquiera permite escalar horizontalmente sin subir de plan. Con
una sola instancia, nada de lo que sigue hace falta — el sistema ya funciona correctamente tal
como está.

Este documento existe para el día en que `render.yaml` suba a `plan: standard` (o superior) **y**
se active más de una instancia (la función "Scaling" de Render, que requiere un plan de pago).
Ese día, hay que hacer los cambios de abajo *antes* de activar la segunda instancia — si no, una
fracción de los pasajeros dejaría de recibir actualizaciones en tiempo real según a qué instancia
los balanceara Render.

## Diagnóstico: qué se rompe con 2+ instancias (y qué no)

### Sí se rompe — hay que arreglarlo

- **Socket.IO sin adapter compartido** (`apps/api/src/lib/socket.ts`). Las "rooms" por ruta
  (`ruta_<id>`) que usa `emitirSeguro()` viven en la memoria de cada proceso Node. Si un pasajero
  está conectado por WebSocket a la instancia A, y el POST `/buses/gps` que actualiza su bus llega
  (por el balanceador) a la instancia B, esa instancia B no tiene forma de avisarle a la A que hay
  un cliente esperando ese evento — **el pasajero simplemente no vería el bus moverse**. Esto
  pasaría de forma intermitente y aleatoria según el balanceo, muy difícil de diagnosticar en vivo.

- **Rate limit en memoria** (`apps/api/src/middleware/rate-limit.ts`). Cada instancia lleva su
  propio contador por IP. Con N instancias, el límite efectivo por IP se multiplica por N (ya
  documentado como pendiente aceptado en `docs/MEJORAS-PENDIENTES.md`, punto 🟢 #11). Menos grave
  que lo de Socket.IO, pero vale la pena resolverlo en la misma pasada.

### No hace falta tocar — ya funciona bien multi-instancia

- **`tokens_revocados`** (revocación de JWT en logout): vive en Postgres/Supabase, centralizado.
  Cualquier instancia ve la misma tabla — funciona igual con 1 o con 10 instancias.
- **Verificación de JWT**: `jsonwebtoken.verify()` es una función pura sobre el secreto compartido
  (`JWT_SECRET`, ya viene de una env var común a todas las instancias) — no depende de estado en
  memoria.
- **Caches TTL en memoria** (`crearCacheTtl` usado en `rutas.ts`, `eta.ts`, `reportes.ts`): en el
  peor caso, cada instancia golpea la base de datos de forma independiente durante la ventana de
  TTL (3-60s según el endpoint). Es redundancia tolerable, no un bug de correctness — los pasajeros
  siguen viendo datos correctos, solo se pierde algo de eficiencia de cache. Se puede optimizar
  después (compartir vía Redis) pero no es urgente.
- **Métricas y alertas** (`metrics.ts`, `alertas.ts`): quedarían con visibilidad *por instancia*
  (cada una reporta solo lo que pasó en ella). Es una limitación aceptable, no un bug — si hace
  falta una vista agregada más adelante, se puede sumar Redis para centralizarlas, pero no bloquea
  nada funcionalmente.

## Paso 1 — Socket.IO Redis adapter (el cambio obligatorio)

Paquetes nuevos: `@socket.io/redis-adapter` + `ioredis`.

En `apps/api/src/lib/socket.ts`, dentro de `initSocketIO()`, después de crear `io`:

```ts
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";

// Solo si REDIS_URL está definida (multi-instancia); si no, sigue exactamente
// igual que hoy en una sola instancia — cero riesgo de romper el modo actual.
const redisUrl = process.env["REDIS_URL"];
if (redisUrl) {
  const pubClient = new Redis(redisUrl);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
}
```

**Importante:** esto NO requiere tocar `emitirSeguro()` (`apps/api/src/lib/socket.ts`) ni ningún
handler de rutas que ya llama a `emitirSeguro(evento, payload, sala)`. El adapter opera de forma
transparente por debajo del mecanismo de rooms que ya existe — cuando está activo, `io.to(sala)`
difunde a los clientes conectados a *cualquier* instancia, no solo a la que emitió el evento. Es
un cambio quirúrgico y de bajo riesgo, justo porque el código de aplicación no cambia.

**Proveedor sugerido: [Upstash Redis](https://upstash.com/)** — capa gratuita de ~10.000 comandos
al día, más que suficiente para esta escala (2.000 pasajeros / 70 buses), sin servidor propio que
mantener ni costo adicional mientras el tráfico se mantenga en ese rango.

## Paso 2 — Rate limit distribuido (elegir uno, en el momento)

No hay que decidir esto ahora; son dos caminos igual de válidos:

**(a) Reusar el mismo Redis del paso 1.** Reemplazar el `Map` en memoria de
`apps/api/src/middleware/rate-limit.ts` por `INCR` + `EXPIRE` sobre la misma instancia de Redis
que ya se trajo para Socket.IO — una sola dependencia nueva, ambos problemas resueltos con el
mismo servicio.

**(b) Mover el rate-limit al borde con Cloudflare.** Usar las Rate Limiting Rules de Cloudflare
(gratis en el plan free), reutilizando el mecanismo `CLOUDFLARE_ORIGIN_SECRET` que ya existe en
`apps/api/src/app.ts` para bloquear el acceso directo a Render. Ver `docs/CLOUDFLARE.md` para
activar Cloudflare (hoy el código ya está preparado para esto, pero Cloudflare no está activado).
Con este camino, el rate-limit en memoria de Express se puede dejar como defensa secundaria (no
hace falta borrarlo).

## `render.yaml` — qué cambiar ese día

- `plan: free` → `plan: standard` (~US$25/mes) como mínimo para poder escalar (Render no permite
  múltiples instancias en `free` ni en `starter`).
- Activar la función "Scaling" de Render (número de instancias, o autoscaling — este último es una
  capacidad adicional de pago). Se configura desde el dashboard de Render, no en `render.yaml`.
- Añadir `REDIS_URL` como variable de entorno (con `sync: false`, igual que `DATABASE_URL`).

## Checklist de verificación (ese día, antes de activar la segunda instancia en producción)

1. Levantar 2 instancias localmente (o en un entorno de staging) con `REDIS_URL` configurada.
2. Conectar un pasajero (navegador) a la instancia A, seleccionar una ruta.
3. Simular un POST `/buses/gps` de esa ruta dirigido a la instancia B.
4. Confirmar que el pasajero conectado a la instancia A recibe el evento `bus:ubicacion` de todas
   formas (prueba de que el adapter de Redis está funcionando).
5. Confirmar que el rate-limit cuenta igual sin importar a qué instancia caiga cada request (hacer
   ráfagas contra ambas instancias y verificar que el límite se respeta de forma conjunta).
6. Solo entonces, activar la segunda instancia en producción.

## Fuera de alcance (a propósito)

Los caches TTL en memoria y las métricas/alertas quedan per-instancia deliberadamente — son
limitaciones aceptadas, no pendientes. Si en el futuro hace falta una vista agregada de métricas o
caches compartidos, se puede revisar entonces, pero no bloquean el escalado a multi-instancia.
