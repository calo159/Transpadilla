import { Router } from "express";
import { db } from "@workspace/db";
import { buses, rutas, usuarios } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { getIO } from "../lib/socket";
import { validarBody, requerido, texto, numeroEnRango } from "../middleware/validate";

const router = Router();

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
    rows.map((b) => ({
      ...b,
      actualizado: b.actualizado?.toISOString() ?? null,
    })),
  );
});

router.post(
  "/buses",
  authMiddleware,
  requireRol("admin"),
  validarBody(requerido("placa"), texto("placa", 3, 20)),
  async (req, res) => {
  const { placa, ruta_id } = req.body as {
    placa: string;
    ruta_id?: number | null;
  };
  const [bus] = await db
    .insert(buses)
    .values({ placa: placa.toUpperCase(), ruta_id: ruta_id ?? null })
    .returning();
  res.status(201).json({ ...bus, actualizado: null });
});

router.delete(
  "/buses/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    await db.delete(buses).where(eq(buses.id, parseInt(String(req.params["id"]))));
    res.json({ mensaje: "Bus eliminado" });
  },
);

router.post(
  "/buses/gps",
  authMiddleware,
  requireRol("conductor", "admin"),
  validarBody(
    requerido("bus_id"),
    requerido("lat"), numeroEnRango("lat", -90, 90),
    requerido("lng"), numeroEnRango("lng", -180, 180),
  ),
  async (req, res) => {
    const { bus_id, lat, lng, velocidad } = req.body as {
      bus_id: number;
      lat: number;
      lng: number;
      velocidad?: number;
    };
    // Conserva el reporte activo: si el bus tiene una novedad, se mantiene en
    // "demora" hasta que el conductor la retire; no se borra al moverse.
    const [actual] = await db
      .select({ novedad: buses.novedad })
      .from(buses)
      .where(eq(buses.id, bus_id));
    await db
      .update(buses)
      .set({
        lat,
        lng,
        velocidad: velocidad ?? null,
        estado: actual?.novedad ? "demora" : "activo",
        actualizado: new Date(),
      })
      .where(eq(buses.id, bus_id));

    try {
      getIO().emit("bus:ubicacion", { busId: bus_id, lat, lng, velocidad });
    } catch {
      // socket.io not yet initialized during tests
    }

    res.json({ mensaje: "GPS actualizado" });
  },
);

router.post(
  "/buses/novedad",
  authMiddleware,
  requireRol("conductor", "admin"),
  async (req, res) => {
    const { bus_id, novedad } = req.body as {
      bus_id: number;
      novedad: string;
    };
    const [busRow] = await db
      .select()
      .from(buses)
      .where(eq(buses.id, bus_id));
    await db
      .update(buses)
      .set({ novedad, estado: "demora", actualizado: new Date() })
      .where(eq(buses.id, bus_id));

    try {
      getIO().emit("bus:novedad", {
        busId: bus_id,
        novedad,
        placa: busRow?.placa,
      });
    } catch {
      // socket.io not yet initialized
    }

    res.json({ mensaje: "Novedad reportada" });
  },
);

router.post(
  "/buses/limpiar-novedad",
  authMiddleware,
  requireRol("conductor", "admin"),
  async (req, res) => {
    const { bus_id } = req.body as { bus_id: number };
    const [busRow] = await db.select().from(buses).where(eq(buses.id, bus_id));
    await db
      .update(buses)
      .set({ novedad: null, estado: "activo", actualizado: new Date() })
      .where(eq(buses.id, bus_id));

    try {
      getIO().emit("bus:novedad", { busId: bus_id, novedad: null, placa: busRow?.placa });
    } catch {
      // socket.io not yet initialized
    }

    res.json({ mensaje: "Reporte retirado" });
  },
);

router.post(
  "/buses/ocupacion",
  authMiddleware,
  requireRol("conductor", "admin"),
  async (req, res) => {
    const { bus_id, ocupacion } = req.body as {
      bus_id: number;
      ocupacion: string;
    };
    const niveles = ["vacio", "medio", "lleno"];
    if (!niveles.includes(ocupacion)) {
      res.status(400).json({ error: "Nivel de ocupación inválido" });
      return;
    }
    await db
      .update(buses)
      .set({ ocupacion, actualizado: new Date() })
      .where(eq(buses.id, bus_id));

    try {
      getIO().emit("bus:ocupacion", { busId: bus_id, ocupacion });
    } catch {
      // socket.io not yet initialized
    }

    res.json({ mensaje: "Ocupación actualizada" });
  },
);

router.post(
  "/buses/finalizar",
  authMiddleware,
  requireRol("conductor", "admin"),
  async (req, res) => {
    const { bus_id } = req.body as { bus_id: number };
    await db
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
      .where(eq(buses.id, bus_id));
    res.json({ mensaje: "Recorrido finalizado" });
  },
);

router.get(
  "/conductores",
  authMiddleware,
  requireRol("admin"),
  async (_req, res) => {
    const rows = await db
      .select({
        id: usuarios.id,
        nombre: usuarios.nombre,
        correo: usuarios.correo,
        rol: usuarios.rol,
        identificacion: usuarios.identificacion,
      })
      .from(usuarios)
      .where(eq(usuarios.rol, "conductor"));
    res.json(rows);
  },
);

router.delete(
  "/conductores/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const id = parseInt(String(req.params["id"]));
    await db.update(buses).set({ conductor_id: null }).where(eq(buses.conductor_id, id));
    await db.delete(usuarios).where(eq(usuarios.id, id));
    res.json({ mensaje: "Conductor eliminado" });
  },
);

router.patch(
  "/buses/:id/conductor",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const { conductor_id } = req.body as { conductor_id: number | null };
    await db
      .update(buses)
      .set({ conductor_id: conductor_id ?? null })
      .where(eq(buses.id, parseInt(String(req.params["id"]))));
    res.json({ mensaje: "Conductor actualizado" });
  },
);

export default router;
