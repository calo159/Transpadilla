import { Router } from "express";
import { db, rutas, paradas, ruta_paradas } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { validarBody, requerido, texto } from "../middleware/validate";
import { agruparRutasConParadas } from "../lib/agrupar-rutas";
import { crearCacheTtl } from "../lib/cache";
import { registrarAuditoria } from "../lib/auditoria";

// Rutas (líneas de transporte). La asignación de paradas vive en paradas.ts.
const router = Router();

const idParam = (raw: unknown): number => parseInt(String(raw));

// Lectura pública: cada ruta con sus paradas en orden (la usa el mapa).
// Una sola query (LEFT JOIN) + agrupación en memoria → evita el N+1 anterior.
// Caché de 3 s: las rutas cambian poco; colapsa los polls de miles de pasajeros.
const rutasCache = crearCacheTtl(3000, async () => {
  const rows = await db
    .select({
      id: rutas.id,
      nombre: rutas.nombre,
      color: rutas.color,
      activa: rutas.activa,
      parada_id: paradas.id,
      parada_nombre: paradas.nombre,
      latitud: paradas.latitud,
      longitud: paradas.longitud,
      orden: ruta_paradas.orden,
    })
    .from(rutas)
    .leftJoin(ruta_paradas, eq(ruta_paradas.ruta_id, rutas.id))
    .leftJoin(paradas, eq(ruta_paradas.parada_id, paradas.id))
    .orderBy(asc(rutas.id), asc(ruta_paradas.orden));
  return agruparRutasConParadas(rows);
});

router.get("/rutas", async (_req, res) => {
  res.json(await rutasCache.obtener());
});

router.post(
  "/rutas",
  authMiddleware,
  requireRol("admin"),
  validarBody(requerido("nombre"), texto("nombre", 2, 100)),
  async (req, res) => {
    const { nombre, color = "#3498db" } = req.body as { nombre: string; color?: string };
    const [ruta] = await db.insert(rutas).values({ nombre, color }).returning();
    registrarAuditoria(req.usuario?.id, "crear_ruta", "ruta", ruta?.id, { nombre, color });
    res.status(201).json({ ...ruta, paradas: [] });
  },
);

router.delete(
  "/rutas/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const rid = idParam(req.params["id"]);
    await db.delete(rutas).where(eq(rutas.id, rid));
    registrarAuditoria(req.usuario?.id, "eliminar_ruta", "ruta", rid);
    res.json({ mensaje: "Ruta eliminada" });
  },
);

router.patch(
  "/rutas/:id/activa",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const { activa } = req.body as { activa: boolean };
    const rid = idParam(req.params["id"]);
    await db.update(rutas).set({ activa }).where(eq(rutas.id, rid));
    registrarAuditoria(req.usuario?.id, "editar_ruta", "ruta", rid, { activa });
    res.json({ mensaje: "Ruta actualizada" });
  },
);

// Renombrar / cambiar color de una ruta (sin borrarla).
router.patch(
  "/rutas/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const { nombre, color } = req.body as { nombre?: string; color?: string };
    const cambios: { nombre?: string; color?: string } = {};
    if (nombre?.trim()) cambios.nombre = nombre.trim();
    if (color?.trim()) cambios.color = color.trim();
    if (Object.keys(cambios).length === 0) {
      res.status(400).json({ error: "Nada que actualizar" });
      return;
    }
    const rid = idParam(req.params["id"]);
    await db.update(rutas).set(cambios).where(eq(rutas.id, rid));
    registrarAuditoria(req.usuario?.id, "editar_ruta", "ruta", rid, cambios);
    res.json({ mensaje: "Ruta actualizada" });
  },
);

export default router;
