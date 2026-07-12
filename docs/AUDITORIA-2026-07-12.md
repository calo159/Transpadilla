# Auditoría de seguridad y mejoras — 2026-07-12

Revisión enfocada en lo agregado desde la auditoría anterior (`docs/AUDITORIA-2026-07-11.md`):
CSRF por Origin/Referer, rate limiting de `/auth/cerrar-sesion` y `/reportes`, unificación de
`allowed-origins.ts`, y sobre todo la **feature nueva "lugares"** (búsqueda de destino por
nombre: tabla + endpoint + UI pasajero + pestaña admin). Tres agentes en paralelo (backend/DB,
frontend/PWA/Android, infra/CI/secretos), cada uno con el contexto de lo ya cerrado para no
repetir hallazgos viejos.

| Severidad | Cantidad |
|---|---|
| Crítica | 0 |
| Alta | 0 |
| Media | 2 |
| Baja | 4 |
| Informativo / muy baja | 5 |

---

## 🟡 Hallazgos MEDIA

### M1 — Tabla `lugares` sin Row Level Security
**Confirmado por los 3 agentes de forma independiente.**

`packages/db/rls.sql` activa RLS explícitamente en las 11 tablas del sistema (incluidas
internas como `tokens_revocados` o `auditoria`) precisamente como defensa en profundidad: "si
se filtra la `anon key` de Supabase, no debe poder tocarse nada salvo lo explícitamente
permitido" (comentario propio del archivo). La tabla **`lugares` (nueva, de este commit) no
aparece en `rls.sql`** — ni `ENABLE ROW LEVEL SECURITY` ni política alguna, y tampoco en la
query de verificación del final del archivo.

Efecto práctico: como Postgres no habilita RLS por defecto en tablas nuevas, si la `anon key`
de Supabase se filtrara, un cliente podría leer **y escribir** en `lugares` directo vía
PostgREST, saltándose por completo `requireRol("admin")` de `apps/api/src/routes/lugares.ts`.
Impacto acotado (son solo nombres/categorías/coordenadas de sitios públicos, sin PII), pero
rompe la invariante "RLS en todas las tablas" que el propio `CLAUDE.md` declara garantizada.

**Fix:**
```sql
ALTER TABLE lugares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_all_lugares ON lugares;
CREATE POLICY service_all_lugares ON lugares FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_read_lugares_activos ON lugares;
CREATE POLICY anon_read_lugares_activos ON lugares FOR SELECT TO anon USING (activo = true);
```
y agregar `lugares` a la query de verificación al final del archivo.

### M2 — `elegirLugar` no resetea `selectedRutaId` si el lugar no tiene ruta cercana
`apps/web/src/pages/Pasajero.tsx` (función `elegirLugar`).

A diferencia de `armarDestino()` (el flujo de "tocar el mapa"), que siempre limpia
`selectedRutaId` antes de que el usuario elija destino, `elegirLugar` solo llama
`handleSelectRuta(sug.ruta.id)` **si `recomendarRuta` devuelve una sugerencia**. Si el lugar
buscado queda a más de 1.2 km de cualquier parada (`MAX_CAMINATA_KM` en `lib/sugerencia.ts`),
`recomendarRuta` devuelve `null` y `selectedRutaId` conserva el valor previo.

Reproducción: el usuario tiene abierta la "Ruta 3" (sheet con detalle en vivo), busca un lugar
lejano (p. ej. el aeropuerto si queda fuera de cobertura) y lo toca. El panel de destino
muestra correctamente "Ninguna ruta pasa cerca", pero justo debajo el sheet sigue mostrando la
tarjeta completa de "Ruta 3" — mensaje contradictorio.

**Fix:** en `elegirLugar`, hacer `setSelectedRutaId(null)` antes de evaluar `sug` (igual patrón
que `armarDestino`).

---

## 🟢 Hallazgos BAJA

### B1 — `lugares.nombre` sin restricción única + seed sin protección de concurrencia
Nada impide crear dos lugares con el mismo nombre (a diferencia de `usuarios.correo` o
`buses.placa`, que sí son `unique`) — genera resultados duplicados/confusos en el buscador. Y
`seedLugaresIfEmpty()` (`apps/api/src/lib/seed.ts`) hace `SELECT...LIMIT 1` + `INSERT` sin
transacción ni `ON CONFLICT`: si el día de mañana se escala a más de una instancia (ya
planeado en `docs/ESCALADO-MULTI-INSTANCIA.md`, que no menciona este caso), dos arranques
simultáneos contra una base recién creada podrían duplicar los 6 lugares semilla. Hoy (plan
Render `free`, una sola instancia) no aplica, pero conviene cerrarlo antes de escalar.
**Fix:** agregar `.unique()` a `lugares.nombre` + `ON CONFLICT (nombre) DO NOTHING` en el
insert del seed; anotar el caso en `docs/ESCALADO-MULTI-INSTANCIA.md`.

### B2 — Validación del admin de Lugares más laxa que el backend
`apps/web/src/pages/admin/LugaresTab.tsx`: el cliente solo valida "no vacío", pero el backend
exige mínimo 2 caracteres (`texto("nombre", 2, 100)`). Si el admin escribe un solo carácter, el
backend responde 400 pero el frontend solo muestra un toast genérico "Error al crear el lugar"
(no lee `res.json()` para mostrar el motivo real) — mismo patrón heredado de `ParadasTab.tsx`.
**Fix:** validar `nombre.trim().length >= 2` en el cliente, y/o leer el `error` de la respuesta
en el catch para mostrar el mensaje real del backend.

### B3 — Enfocar el buscador con `setTimeout(120ms)` puede no abrir el teclado en iOS Safari
`empezarPorDestino` (`Pasajero.tsx`) difiere el `.focus()` del buscador con un `setTimeout`.
iOS Safari (y algunos WebViews estrictos) solo abren el teclado virtual si el `.focus()` ocurre
de forma síncrona dentro del gesto del usuario; al diferirlo, el input puede quedar enfocado a
nivel de DOM pero sin teclado visible — justo en el botón pensado como "camino fácil" para
usuarios nuevos. No afecta al WebView de Android (más permisivo).
**Fix:** probar sin `setTimeout` (o con `requestAnimationFrame`); si en iOS Safari real no abre
el teclado, es una limitación conocida de esa plataforma sin solución limpia vía JS.

### B4 — `docs/SEGURIDAD.md` no documenta las defensas agregadas hoy
La tabla de rate limits no incluye `logoutLimiter` (`POST /auth/cerrar-sesion`) ni el limitador
global del router `/reportes`; la sección de autenticación tampoco menciona el chequeo CSRF por
Origin/Referer (`origenPermitidoParaCookie` en `middleware/auth.ts`), que es justamente la
defensa que cerró la alerta de CodeQL de ayer. El propio documento se declara como "lo que
debe respetar cualquier cambio de código", así que vale la pena mantenerlo al día.

---

## ⚪ Informativo / muy baja

- **Sin índice en `lugares`** (`activo`, `nombre`): el resto del schema indexa todas las
  columnas de filtro/orden; `lugares` no tiene ninguno. Irrelevante al volumen actual (decenas
  de filas, filtrado en cliente), pero rompe la convención si el catálogo crece mucho.
- **Ícono "ocultar/mostrar" en LugaresTab no cambia según el estado**: el botón siempre
  renderiza `EyeOff`, tanto para lugares activos como ya ocultos (solo cambia el tooltip).
  Fix cosmético: `{l.activo ? <EyeOff/> : <Eye/>}`.
- **`docs/ARQUITECTURA.md`** (preexistente, no de hoy): el diagrama de tablas menciona algunas
  que no existen como tal y dice "RLS FORCE en todas las tablas" cuando `rls.sql` desactiva
  FORCE a propósito; tampoco menciona `lugares`, `favoritos`, `banners`, etc.
- **`.env.example`** (preexistente): la instrucción de sembrar vía `POST /api/seed` sin token
  ya no funciona tal cual (la ruta exige admin desde hace varios commits); un desarrollador
  nuevo siguiendo el paso a paso literal recibe 401.
- **`Dockerfile` en `node:22-slim`** mientras CI y `CLAUDE.md` usan Node 24 (preexistente,
  inconsistencia menor si se usa la ruta VPS/Docker en vez de Render).

---

## ✅ Confirmado correcto (verificado a fondo, sin hallazgos)

- **`router.use("/lugares", rateLimit(...))`**: se verificó el matcher real de Express 5 —
  el patrón compilado exige `/` o fin de cadena tras el prefijo, así que cubre `/lugares`,
  `/lugares/todos`, `/lugares/123`, sin falsos positivos ni negativos. Correcto.
- **Validación de entrada en `routes/lugares.ts`**: nombre, categoría, latitud/longitud y
  `activo` completamente cubiertos, incluido el PATCH parcial. Sin huecos.
- **IDOR en `lugares`**: catálogo global sin dueño ni PII, CRUD detrás de `requireRol("admin")`,
  la única ruta pública es de solo lectura. Riesgo bajo, confirmado.
- **XSS en `nombre`/`categoria`**: ni el buscador del pasajero ni `LugaresTab` usan
  `dangerouslySetInnerHTML`; el único punto que toca el DOM de Leaflet (`bindTooltip` en el
  mini-mapa admin) ya usa `escHtml` correctamente.
- **`origenPermitidoParaCookie` (chequeo CSRF)**: `METODOS_SEGUROS` cubre GET/HEAD/OPTIONS,
  todo lo demás exige Origin/Referer válido; el fallback a Referer no es explotable (el
  navegador siempre pone la URL real del documento que dispara la petición); si faltan ambos
  headers, falla cerrado (403). No depende de si el body es JSON o form-urlencoded. Sin bypass.
- **Unificación de `allowed-origins.ts`**: comparado byte a byte contra la lógica duplicada
  que reemplazó en `app.ts` y `lib/socket.ts` — equivalente exacta, sin regresión de orígenes
  permitidos en ningún consumidor (`app.ts`, `lib/socket.ts`, `middleware/auth.ts`).
- **`RutaCard.tsx` — cálculo de índices de "Pasa por"**: probado mentalmente con 4 a 100
  paradas; siempre da 3 índices distintos y dentro de rango (el caso ≤3 ya está cubierto
  aparte, y hay un `Math.min` de respaldo). Sin bug.
- **Invalidación de caché en `LugaresTab`**: `refrescar()` invalida tanto el caché admin como
  el público (`["lugares"]`) tras crear/editar/eliminar. Correcto.
- **Android**: sin cambios desde la auditoría anterior, nada nuevo que revisar.

---

## Prioridad recomendada
1. **M1** (RLS de `lugares`) — cerrarlo antes de operar en producción real; es la misma clase
   de gap que el proyecto ya blindó en las otras 11 tablas.
2. **M2** (`elegirLugar` no resetea la ruta seleccionada) — bug de UX visible, fix de una línea.
3. **B1-B4** — bajo impacto hoy (una sola instancia, admin de confianza), pero baratos de
   resolver de una vez ya que se tocó el mismo código.
4. Informativos — opcionales, sin apuro.
