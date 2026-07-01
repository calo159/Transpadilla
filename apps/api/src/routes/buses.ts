import { Router } from "express";
import { db, buses, rutas, usuarios } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { busAutorizado } from "../middleware/bus-autorizado";
import { emitirSeguro } from "../lib/socket";
import { validarBody, requerido, texto, numeroEnRango } from "../middleware/validate";
import { crearCacheTtl } from "../lib/cache";
import { registrarAuditoria } from "../lib/auditoria";
import { enviarPushARuta, notificarProximidad } from "../lib/push";

const router = Router();

const OCUPACIONES = ["vacio", "medio", "lleno"] as const;

// id de parámetro de ruta → entero (Express 5 tipa params como string | string[]).
const idParam = (raw: unknown): number => parseInt(String(raw));

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
    const [bus] = await db
      .insert(buses)
      .values({ placa: placa.toUpperCase(), ruta_id: ruta_id ?? null })
      .returning();
    registrarAuditoria(req.usuario?.id, "crear_bus", "bus", bus?.id, { placa: placa.toUpperCase(), ruta_id: ruta_id ?? null });
    res.status(201).json({ ...bus, actualizado: null });
  },
);

router.delete(
  "/buses/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const bid = idParam(req.params["id"]);
    await db.delete(buses).where(eq(buses.id, bid));
    registrarAuditoria(req.usuario?.id, "eliminar_bus", "bus", bid);
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
    const [actualizado] = await db
      .update(buses)
      .set(cambios)
      .where(eq(buses.id, idParam(req.params["id"])))
      .returning({ id: buses.id });
    if (!actualizado) { res.status(404).json({ error: "Bus no encontrado" }); return; }
    registrarAuditoria(req.usuario?.id, "editar_bus", "bus", actualizado.id, cambios);
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
  busAutorizado,
  async (req, res) => {
    const busId = req.busId!;
    const { lat, lng, velocidad } = req.body as { lat: number; lng: number; velocidad?: number };
    // Una sola query: el estado se decide en SQL (si hay novedad activa se mantiene
    // en "demora" hasta que el conductor la retire) y devolvemos ruta_id para emitir
    // SOLO a la sala de esa ruta.
    const [row] = await db
      .update(buses)
      .set({
        lat,
        lng,
        velocidad: velocidad ?? null,
        estado: sql`CASE WHEN ${buses.novedad} IS NOT NULL THEN 'demora' ELSE 'activo' END`,
        actualizado: new Date(),
      })
      .where(eq(buses.id, busId))
      .returning({ rutaId: buses.ruta_id });

    const rutaId = row?.rutaId ?? null;
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

    emitirSeguro("bus:novedad", { busId, novedad, placa: actualizado.placa });
    // Notificación push a quienes siguen esta ruta (best-effort).
    if (actualizado.rutaId != null) {
      void enviarPushARuta(actualizado.rutaId, {
        titulo: "⚠️ Novedad en tu ruta",
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
      .returning({ placa: buses.placa });
    if (!actualizado) { res.status(404).json({ error: "Bus no encontrado" }); return; }

    emitirSeguro("bus:novedad", { busId, novedad: null, placa: actualizado.placa });
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
