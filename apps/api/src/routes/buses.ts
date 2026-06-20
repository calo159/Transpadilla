import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { buses, rutas, usuarios } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { getIO } from "../lib/socket";
import { validarBody, requerido, texto, numeroEnRango, correoValido } from "../middleware/validate";

const router = Router();

/**
 * Resuelve QUÉ bus puede operar el usuario autenticado, en el BACKEND (nunca se
 * confía en el `bus_id` que mande el cliente para un conductor):
 *  - conductor → SOLO su propio bus (el que tiene asignado `conductor_id`).
 *    Se ignora cualquier `bus_id` del body: así un conductor no puede mover,
 *    reportar ni finalizar el bus de otro conductor (evita IDOR/suplantación).
 *  - admin     → el `bus_id` que indique en el body (puede operar cualquiera).
 * Devuelve el id del bus autorizado o `null` si no hay ninguno válido.
 */
async function busAutorizado(req: Request): Promise<number | null> {
  const usuario = req.usuario;
  if (!usuario) return null;
  if (usuario.rol === "admin") {
    const id = Number((req.body as { bus_id?: unknown }).bus_id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  // Conductor: su bus se determina por su identidad (JWT), no por el cliente.
  const [propio] = await db
    .select({ id: buses.id })
    .from(buses)
    .where(eq(buses.conductor_id, usuario.id));
  return propio?.id ?? null;
}

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
    requerido("lat"), numeroEnRango("lat", -90, 90),
    requerido("lng"), numeroEnRango("lng", -180, 180),
  ),
  async (req, res) => {
    const { lat, lng, velocidad } = req.body as {
      lat: number;
      lng: number;
      velocidad?: number;
    };
    const bus_id = await busAutorizado(req);
    if (!bus_id) {
      res.status(403).json({ error: "No tienes un bus asignado" });
      return;
    }
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
  validarBody(requerido("novedad"), texto("novedad", 1, 200)),
  async (req, res) => {
    const { novedad } = req.body as { novedad: string };
    const bus_id = await busAutorizado(req);
    if (!bus_id) {
      res.status(403).json({ error: "No tienes un bus asignado" });
      return;
    }
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
    const bus_id = await busAutorizado(req);
    if (!bus_id) {
      res.status(403).json({ error: "No tienes un bus asignado" });
      return;
    }
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
    const { ocupacion } = req.body as { ocupacion: string };
    const niveles = ["vacio", "medio", "lleno"];
    if (!niveles.includes(ocupacion)) {
      res.status(400).json({ error: "Nivel de ocupación inválido" });
      return;
    }
    const bus_id = await busAutorizado(req);
    if (!bus_id) {
      res.status(403).json({ error: "No tienes un bus asignado" });
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
    const bus_id = await busAutorizado(req);
    if (!bus_id) {
      res.status(403).json({ error: "No tienes un bus asignado" });
      return;
    }
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

// Alta de conductores: SOLO un administrador autenticado puede crearlos. El rol
// "conductor" se fija en el servidor (no se acepta del cliente), de modo que la
// asignación de privilegios es siempre una decisión del backend.
router.post(
  "/conductores",
  authMiddleware,
  requireRol("admin"),
  validarBody(
    requerido("nombre"), texto("nombre", 2, 100),
    requerido("correo"), correoValido("correo"),
    requerido("password"), texto("password", 6, 200),
    requerido("identificacion"), texto("identificacion", 3, 30),
  ),
  async (req, res) => {
    const { nombre, correo, password, identificacion } = req.body as {
      nombre: string;
      correo: string;
      password: string;
      identificacion: string;
    };
    const correoNorm = correo.trim().toLowerCase();
    const [existing] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.correo, correoNorm));
    if (existing) {
      res.status(409).json({ error: "Ese correo ya está registrado" });
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    const [nuevo] = await db
      .insert(usuarios)
      .values({
        nombre: nombre.trim(),
        correo: correoNorm,
        password: hash,
        rol: "conductor",
        identificacion: identificacion.trim(),
      })
      .returning({ id: usuarios.id, nombre: usuarios.nombre, correo: usuarios.correo, rol: usuarios.rol });
    res.status(201).json(nuevo);
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
