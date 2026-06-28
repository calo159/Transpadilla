import { Router } from "express";
import { db, buses, rutas, usuarios } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { busAutorizado } from "../middleware/bus-autorizado";
import { emitirSeguro } from "../lib/socket";
import { validarBody, requerido, texto, numeroEnRango } from "../middleware/validate";

const router = Router();

const OCUPACIONES = ["vacio", "medio", "lleno"] as const;

// id de parámetro de ruta → entero (Express 5 tipa params como string | string[]).
const idParam = (raw: unknown): number => parseInt(String(raw));

// ─── Lectura pública (la usa el mapa del pasajero, sin login) ─────────────────

router.get("/buses", async (_req, res) => {
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

  res.json(
    rows.map((b) => ({ ...b, actualizado: b.actualizado?.toISOString() ?? null })),
  );
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
    res.status(201).json({ ...bus, actualizado: null });
  },
);

router.delete(
  "/buses/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    await db.delete(buses).where(eq(buses.id, idParam(req.params["id"])));
    res.json({ mensaje: "Bus eliminado" });
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
    // Conserva el reporte activo: si el bus tiene una novedad, se mantiene en
    // "demora" hasta que el conductor la retire; no se borra al moverse.
    const [actual] = await db
      .select({ novedad: buses.novedad })
      .from(buses)
      .where(eq(buses.id, busId));
    await db
      .update(buses)
      .set({
        lat,
        lng,
        velocidad: velocidad ?? null,
        estado: actual?.novedad ? "demora" : "activo",
        actualizado: new Date(),
      })
      .where(eq(buses.id, busId));

    emitirSeguro("bus:ubicacion", { busId, lat, lng, velocidad });
    res.json({ mensaje: "GPS actualizado" });
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
      .returning({ placa: buses.placa });
    if (!actualizado) { res.status(404).json({ error: "Bus no encontrado" }); return; }

    emitirSeguro("bus:novedad", { busId, novedad, placa: actualizado.placa });
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
