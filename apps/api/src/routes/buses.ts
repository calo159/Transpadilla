import { Router } from "express";
import { db, buses, rutas, usuarios } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { busAutorizado } from "../middleware/bus-autorizado";
import { emitirSeguro } from "../lib/socket";
import { validarBody, requerido, texto, numeroEnRango, parseIdParam } from "../middleware/validate";
import { crearCacheTtl } from "../lib/cache";
import { registrarAuditoria } from "../lib/auditoria";
import { enviarPushARuta, notificarProximidad } from "../lib/push";

const router = Router();

const OCUPACIONES = ["vacio", "medio", "lleno"] as const;

/**
 * true si `err` es una violación de constraint única de Postgres (23505). Drizzle
 * envuelve el error real del driver `pg` en un `_DrizzleQueryError` y deja el que
 * trae `.code` en `err.cause` (encadenado vía `Error.cause`), no en el propio
 * `err.code` — hay que mirar ambos para no depender de un detalle interno de
 * la versión de Drizzle.
 */
function esViolacionUnica(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// ─── Lectura pública (la usa el mapa del pasajero, sin login) ─────────────────

// Caché de 2 s: colapsa los refetch en ráfaga (polling + invalidaciones por
// socket). La posición en vivo del bus llega por socket, no por este poll.
const busesCache = crearCacheTtl(2000, async () => {
  const rows = await db
    .select({
      id: buses.id,
      placa: buses.placa,
      estado: buses.estado,
      lat: buses.lat,
      lng: buses.lng,
      velocidad: buses.velocidad,
      novedad: buses.novedad,
      ocupacion: buses.ocupacion,
      actualizado: buses.actualizado,
      ruta_id: buses.ruta_id,
      nombre_ruta: rutas.nombre,
      color_ruta: rutas.color,
      conductor_id: buses.conductor_id,
      nombre_conductor: usuarios.nombre,
    })
    .from(buses)
    .leftJoin(rutas, eq(buses.ruta_id, rutas.id))
    .leftJoin(usuarios, eq(buses.conductor_id, usuarios.id))
    .orderBy(buses.id);
  return rows.map((b) => ({ ...b, actualizado: b.actualizado?.toISOString() ?? null }));
});

router.get("/buses", async (_req, res) => {
  res.json(await busesCache.obtener());
});

// ─── Gestión de la flota (solo admin) ─────────────────────────────────────────

router.post(
  "/buses",
  authMiddleware,
  requireRol("admin"),
  validarBody(requerido("placa"), texto("placa", 3, 20)),
  async (req, res) => {
    const { placa, ruta_id } = req.body as { placa: string; ruta_id?: number | null };
    if (ruta_id !== null && ruta_id !== undefined && (!Number.isInteger(Number(ruta_id)) || Number(ruta_id) <= 0)) {
      res.status(400).json({ error: "ruta_id inválido" });
      return;
    }
    let bus: typeof buses.$inferSelect | undefined;
    try {
      [bus] = await db
        .insert(buses)
        .values({ placa: placa.toUpperCase(), ruta_id: ruta_id ?? null })
        .returning();
    } catch (err) {
      // unique_violation (Postgres): la placa ya existe. Sin este catch, caía al
      // 500 genérico del final de app.ts (y disparaba una alerta P1).
      if (esViolacionUnica(err)) {
        res.status(409).json({ error: "Ya existe un bus con esa placa" });
        return;
      }
      throw err;
    }
    registrarAuditoria(req, "crear_bus", "bus", bus?.id, { placa: placa.toUpperCase(), ruta_id: ruta_id ?? null });
    res.status(201).json({ ...bus, actualizado: null });
  },
);

router.delete(
  "/buses/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const bid = parseIdParam(req.params["id"]);
    if (bid === null) { res.status(400).json({ error: "Id de bus inválido" }); return; }
    const [borrado] = await db.delete(buses).where(eq(buses.id, bid)).returning({ id: buses.id });
    if (!borrado) { res.status(404).json({ error: "Bus no encontrado" }); return; }
    registrarAuditoria(req, "eliminar_bus", "bus", bid);
    res.json({ mensaje: "Bus eliminado" });
  },
);

// Editar un bus (reasignar ruta y/o renombrar placa) sin borrarlo ni perder su
// conductor. ruta_id puede ser un entero > 0 (asignar) o null (dejar sin ruta).
router.patch(
  "/buses/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const body = req.body as { ruta_id?: number | null; placa?: string };
    const cambios: { ruta_id?: number | null; placa?: string } = {};
    if ("ruta_id" in body) {
      if (body.ruta_id == null) {
        cambios.ruta_id = null;
      } else {
        const rid = Number(body.ruta_id);
        if (!Number.isInteger(rid) || rid <= 0) {
          res.status(400).json({ error: "ruta_id inválido" });
          return;
        }
        cambios.ruta_id = rid;
      }
    }
    if (typeof body.placa === "string" && body.placa.trim()) {
      cambios.placa = body.placa.trim().toUpperCase();
    }
    if (Object.keys(cambios).length === 0) {
      res.status(400).json({ error: "Nada que actualizar" });
      return;
    }
    const bid = parseIdParam(req.params["id"]);
    if (bid === null) { res.status(400).json({ error: "Id de bus inválido" }); return; }
    let actualizado: { id: number } | undefined;
    try {
      [actualizado] = await db
        .update(buses)
        .set(cambios)
        .where(eq(buses.id, bid))
        .returning({ id: buses.id });
    } catch (err) {
      // unique_violation: la placa ya la tiene otro bus (ver POST /buses).
      if (esViolacionUnica(err)) {
        res.status(409).json({ error: "Ya existe un bus con esa placa" });
        return;
      }
      throw err;
    }
    if (!actualizado) { res.status(404).json({ error: "Bus no encontrado" }); return; }
    registrarAuditoria(req, "editar_bus", "bus", actualizado.id, cambios);
    res.json({ mensaje: "Bus actualizado" });
  },
);

// ─── Operación del recorrido (conductor sobre SU bus, o admin sobre cualquiera) ─
// `busAutorizado` deja en `req.busId` el bus que el usuario puede operar.

router.post(
  "/buses/gps",
  authMiddleware,
  requireRol("conductor", "admin"),
  validarBody(
    requerido("lat"), numeroEnRango("lat", -90, 90),
    requerido("lng"), numeroEnRango("lng", -180, 180),
  ),
  // Sin busAutorizado a propósito: este es el endpoint de MAYOR frecuencia (un
  // ping por cada posición de GPS del conductor), así que aquí sí vale la pena
  // colapsar "resolver el bus" + "actualizarlo" en una sola query en vez de las
  // 2 que haría busAutorizado (SELECT del bus del conductor + UPDATE por id).
  // El resto de rutas de este archivo sí usan busAutorizado (no son el hot path).
  async (req, res) => {
    const usuario = req.usuario!;
    const { lat, lng, velocidad } = req.body as { lat: number; lng: number; velocidad?: number };
    const cambios = {
      lat,
      lng,
      velocidad: velocidad ?? null,
      // El estado se decide en SQL (si hay novedad activa se mantiene en "demora"
      // hasta que el conductor la retire).
      estado: sql`CASE WHEN ${buses.novedad} IS NOT NULL THEN 'demora' ELSE 'activo' END`,
      actualizado: new Date(),
    };

    let row: { id: number; rutaId: number | null } | undefined;
    if (usuario.rol === "admin") {
      // Admin: el bus_id lo indica el body (puede operar cualquiera); se ignora
      // cualquier otro campo — mismo criterio que busAutorizado. bus_id con
      // formato inválido/ausente → 403 (igual que busAutorizado); bus_id con
      // formato válido pero que no existe → 404 (distinto: aquí sí sabemos que
      // "parecía" una operación legítima, solo que ese bus no existe).
      const idRaw = Number((req.body as { bus_id?: unknown }).bus_id);
      const busIdAdmin = Number.isInteger(idRaw) && idRaw > 0 ? idRaw : null;
      if (!busIdAdmin) { res.status(403).json({ error: "No tienes un bus asignado" }); return; }
      [row] = await db
        .update(buses)
        .set(cambios)
        .where(eq(buses.id, busIdAdmin))
        .returning({ id: buses.id, rutaId: buses.ruta_id });
      if (!row) { res.status(404).json({ error: "Bus no encontrado" }); return; }
    } else {
      // Conductor: NUNCA se confía en un bus_id del cliente — se actualiza
      // directamente el bus cuyo conductor_id es el del JWT (una sola query,
      // sin el SELECT previo que haría busAutorizado). Sin fila → no tiene
      // ningún bus asignado (403, igual que el busAutorizado original).
      [row] = await db
        .update(buses)
        .set(cambios)
        .where(eq(buses.conductor_id, usuario.id))
        .returning({ id: buses.id, rutaId: buses.ruta_id });
      if (!row) { res.status(403).json({ error: "No tienes un bus asignado" }); return; }
    }

    const busId = row.id;
    const rutaId = row.rutaId;
    // Solo se difunde si el bus tiene ruta (los pasajeros solo ven buses por ruta).
    // rutaId va en el payload: el cliente filtra por él y la sala acota el fan-out.
    if (rutaId != null) {
      emitirSeguro("bus:ubicacion", { busId, lat, lng, velocidad, rutaId }, `ruta_${rutaId}`);
    }
    res.json({ mensaje: "GPS actualizado" });
    // Aviso push "tu bus está cerca" (best-effort, throttled; no frena la respuesta).
    void notificarProximidad(busId, rutaId, lat, lng, velocidad ?? null);
  },
);

router.post(
  "/buses/novedad",
  authMiddleware,
  requireRol("conductor", "admin"),
  validarBody(requerido("novedad"), texto("novedad", 1, 200)),
  busAutorizado,
  async (req, res) => {
    const busId = req.busId!;
    const { novedad } = req.body as { novedad: string };
    const [actualizado] = await db
      .update(buses)
      .set({ novedad, estado: "demora", actualizado: new Date() })
      .where(eq(buses.id, busId))
      .returning({ placa: buses.placa, rutaId: buses.ruta_id });
    if (!actualizado) { res.status(404).json({ error: "Bus no encontrado" }); return; }

    // Solo a quienes siguen esta ruta (room `ruta_<id>`), igual que el GPS.
    // Un bus sin ruta no se muestra a pasajeros, así que no se difunde.
    if (actualizado.rutaId != null) {
      emitirSeguro(
        "bus:novedad",
        { busId, novedad, placa: actualizado.placa, rutaId: actualizado.rutaId },
        `ruta_${actualizado.rutaId}`,
      );
    }
    // Notificación push a quienes siguen esta ruta (best-effort).
    if (actualizado.rutaId != null) {
      void enviarPushARuta(actualizado.rutaId, {
        titulo: "Novedad en tu ruta",
        cuerpo: novedad,
        url: "/",
      });
    }
    res.json({ mensaje: "Novedad reportada" });
  },
);

router.post(
  "/buses/limpiar-novedad",
  authMiddleware,
  requireRol("conductor", "admin"),
  busAutorizado,
  async (req, res) => {
    const busId = req.busId!;
    const [actualizado] = await db
      .update(buses)
      .set({ novedad: null, estado: "activo", actualizado: new Date() })
      .where(eq(buses.id, busId))
      .returning({ placa: buses.placa, rutaId: buses.ruta_id });
    if (!actualizado) { res.status(404).json({ error: "Bus no encontrado" }); return; }

    // El "novedad retirada" también solo a la room de la ruta, para que el ⚠ se
    // limpie en quienes la siguen (los demás nunca vieron la novedad).
    if (actualizado.rutaId != null) {
      emitirSeguro(
        "bus:novedad",
        { busId, novedad: null, placa: actualizado.placa, rutaId: actualizado.rutaId },
        `ruta_${actualizado.rutaId}`,
      );
    }
    res.json({ mensaje: "Reporte retirado" });
  },
);

router.post(
  "/buses/ocupacion",
  authMiddleware,
  requireRol("conductor", "admin"),
  busAutorizado,
  async (req, res) => {
    const busId = req.busId!;
    const { ocupacion } = req.body as { ocupacion: string };
    if (!OCUPACIONES.includes(ocupacion as (typeof OCUPACIONES)[number])) {
      res.status(400).json({ error: "Nivel de ocupación inválido" });
      return;
    }
    const [actualizado] = await db
      .update(buses)
      .set({ ocupacion, actualizado: new Date() })
      .where(eq(buses.id, busId))
      .returning({ id: buses.id });
    if (!actualizado) { res.status(404).json({ error: "Bus no encontrado" }); return; }

    emitirSeguro("bus:ocupacion", { busId, ocupacion });
    res.json({ mensaje: "Ocupación actualizada" });
  },
);

router.post(
  "/buses/finalizar",
  authMiddleware,
  requireRol("conductor", "admin"),
  busAutorizado,
  async (req, res) => {
    const busId = req.busId!;
    const [actualizado] = await db
      .update(buses)
      .set({
        estado: "inactivo",
        lat: null,
        lng: null,
        velocidad: null,
        novedad: null,
        ocupacion: null,
        actualizado: new Date(),
      })
      .where(eq(buses.id, busId))
      .returning({ id: buses.id });
    if (!actualizado) { res.status(404).json({ error: "Bus no encontrado" }); return; }
    res.json({ mensaje: "Recorrido finalizado" });
  },
);

export default router;
