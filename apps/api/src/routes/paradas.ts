import { Router } from "express";
import { db, paradas, ruta_paradas } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { validarBody, requerido, texto, numeroEnRango } from "../middleware/validate";

// Paradas y su asignación a rutas. Las lecturas son públicas (las usa el mapa);
// crear/editar/borrar/asignar es solo de administrador.
const router = Router();

const idParam = (raw: unknown): number => parseInt(String(raw));

// ─── Catálogo de paradas ──────────────────────────────────────────────────────

router.get("/rutas/paradas/todas", async (_req, res) => {
  const all = await db.select().from(paradas).orderBy(paradas.nombre);
  res.json(all);
});

router.post(
  "/rutas/paradas/nueva",
  authMiddleware,
  requireRol("admin"),
  validarBody(
    requerido("nombre"), texto("nombre", 2, 100),
    requerido("latitud"), numeroEnRango("latitud", -90, 90),
    requerido("longitud"), numeroEnRango("longitud", -180, 180),
  ),
  async (req, res) => {
    const { nombre, latitud, longitud } = req.body as {
      nombre: string;
      latitud: number;
      longitud: number;
    };
    const [parada] = await db.insert(paradas).values({ nombre, latitud, longitud }).returning();
    res.status(201).json(parada);
  },
);

// Renombrar / reubicar una parada (sin borrarla).
router.patch(
  "/rutas/paradas/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const { nombre, latitud, longitud } = req.body as {
      nombre?: string;
      latitud?: number;
      longitud?: number;
    };
    const cambios: { nombre?: string; latitud?: number; longitud?: number } = {};
    if (nombre?.trim()) cambios.nombre = nombre.trim();
    if (typeof latitud === "number" && !Number.isNaN(latitud)) cambios.latitud = latitud;
    if (typeof longitud === "number" && !Number.isNaN(longitud)) cambios.longitud = longitud;
    if (Object.keys(cambios).length === 0) {
      res.status(400).json({ error: "Nada que actualizar" });
      return;
    }
    await db.update(paradas).set(cambios).where(eq(paradas.id, idParam(req.params["id"])));
    res.json({ mensaje: "Parada actualizada" });
  },
);

router.delete(
  "/rutas/paradas/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const id = idParam(req.params["id"]);
    await db.delete(ruta_paradas).where(eq(ruta_paradas.parada_id, id));
    await db.delete(paradas).where(eq(paradas.id, id));
    res.json({ mensaje: "Parada eliminada" });
  },
);

// ─── Asignación de paradas a una ruta (tabla ruta_paradas) ────────────────────

router.get("/rutas/:id/paradas", async (req, res) => {
  const rutaId = idParam(req.params["id"]);
  const stops = await db
    .select({
      id: paradas.id,
      nombre: paradas.nombre,
      latitud: paradas.latitud,
      longitud: paradas.longitud,
      orden: ruta_paradas.orden,
    })
    .from(ruta_paradas)
    .innerJoin(paradas, eq(ruta_paradas.parada_id, paradas.id))
    .where(eq(ruta_paradas.ruta_id, rutaId))
    .orderBy(asc(ruta_paradas.orden));
  res.json(stops);
});

router.post(
  "/rutas/:id/paradas",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const rutaId = idParam(req.params["id"]);
    const { parada_id, orden } = req.body as { parada_id: number; orden: number };
    await db.insert(ruta_paradas).values({ ruta_id: rutaId, parada_id, orden });
    res.status(201).json({ mensaje: "Parada asignada" });
  },
);

// Quitar una parada de una ruta (desasignar): se elimina la relación, no la parada.
router.delete(
  "/rutas/:rutaId/paradas/:paradaId",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const rutaId = idParam(req.params["rutaId"]);
    const paradaId = idParam(req.params["paradaId"]);
    await db
      .delete(ruta_paradas)
      .where(and(eq(ruta_paradas.ruta_id, rutaId), eq(ruta_paradas.parada_id, paradaId)));
    res.json({ mensaje: "Parada quitada de la ruta" });
  },
);

export default router;
