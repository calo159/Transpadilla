import { Router } from "express";
import { db } from "@workspace/db";
import { rutas, paradas, ruta_paradas } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";

const router = Router();

router.get("/rutas", async (_req, res) => {
  const allRutas = await db.select().from(rutas).orderBy(rutas.id);

  const result = await Promise.all(
    allRutas.map(async (ruta) => {
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
        .where(eq(ruta_paradas.ruta_id, ruta.id))
        .orderBy(asc(ruta_paradas.orden));
      return { ...ruta, paradas: stops };
    }),
  );

  res.json(result);
});

router.post(
  "/rutas",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const { nombre, color = "#3498db" } = req.body as {
      nombre: string;
      color?: string;
    };
    if (!nombre?.trim()) {
      res.status(400).json({ error: "Nombre requerido" });
      return;
    }
    const [ruta] = await db
      .insert(rutas)
      .values({ nombre, color })
      .returning();
    res.status(201).json({ ...ruta, paradas: [] });
  },
);

router.delete(
  "/rutas/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    await db.delete(rutas).where(eq(rutas.id, parseInt(String(req.params["id"]))));
    res.json({ mensaje: "Ruta eliminada" });
  },
);

router.patch(
  "/rutas/:id/activa",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const { activa } = req.body as { activa: boolean };
    await db
      .update(rutas)
      .set({ activa })
      .where(eq(rutas.id, parseInt(String(req.params["id"]))));
    res.json({ mensaje: "Ruta actualizada" });
  },
);

router.get("/rutas/paradas/todas", async (_req, res) => {
  const all = await db.select().from(paradas).orderBy(paradas.nombre);
  res.json(all);
});

router.post(
  "/rutas/paradas/nueva",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const { nombre, latitud, longitud } = req.body as {
      nombre: string;
      latitud: number;
      longitud: number;
    };
    const [parada] = await db
      .insert(paradas)
      .values({ nombre, latitud, longitud })
      .returning();
    res.status(201).json(parada);
  },
);

router.get("/rutas/:id/paradas", async (req, res) => {
  const rutaId = parseInt(String(req.params["id"]));
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
    const rutaId = parseInt(String(req.params["id"]));
    const { parada_id, orden } = req.body as {
      parada_id: number;
      orden: number;
    };
    await db
      .insert(ruta_paradas)
      .values({ ruta_id: rutaId, parada_id, orden });
    res.status(201).json({ mensaje: "Parada asignada" });
  },
);

export default router;
