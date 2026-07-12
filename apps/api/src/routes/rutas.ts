import { Router } from "express";
import { db, rutas, paradas, ruta_paradas } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { validarBody, requerido, texto, booleano, colorHex, parseIdParam } from "../middleware/validate";
import { agruparRutasConParadas } from "../lib/agrupar-rutas";
import { crearCacheTtl } from "../lib/cache";
import { registrarAuditoria } from "../lib/auditoria";

// Rutas (líneas de transporte). La asignación de paradas vive en paradas.ts.
const router = Router();

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
      ruta_parada_id: ruta_paradas.id,
      parada_id: paradas.id,
      parada_nombre: paradas.nombre,
      latitud: paradas.latitud,
      longitud: paradas.longitud,
      orden: ruta_paradas.orden,
    })
    .from(rutas)
    .leftJoin(ruta_paradas, eq(ruta_paradas.ruta_id, rutas.id))
    .leftJoin(paradas, eq(ruta_paradas.parada_id, paradas.id))
    // Desempate estable por el id de la asignación: si dos paradas quedaran con
    // el mismo `orden` (un dato inconsistente, no debería pasar pero ya pasó una
    // vez por el panel admin), el recorrido sale igual en cada carga en vez de
    // salir distinto al azar según el orden físico de la tabla.
    .orderBy(asc(rutas.id), asc(ruta_paradas.orden), asc(ruta_paradas.id));
  return agruparRutasConParadas(rows);
});

router.get("/rutas", async (_req, res) => {
  res.json(await rutasCache.obtener());
});

router.post(
  "/rutas",
  authMiddleware,
  requireRol("admin"),
  validarBody(requerido("nombre"), texto("nombre", 2, 100), colorHex("color")),
  async (req, res) => {
    const { nombre, color = "#3498db" } = req.body as { nombre: string; color?: string };
    const [ruta] = await db.insert(rutas).values({ nombre, color }).returning();
    registrarAuditoria(req, "crear_ruta", "ruta", ruta?.id, { nombre, color });
    res.status(201).json({ ...ruta, paradas: [] });
  },
);

router.delete(
  "/rutas/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const rid = parseIdParam(req.params["id"]);
    if (rid === null) { res.status(400).json({ error: "Id de ruta inválido" }); return; }
    const [borrada] = await db.delete(rutas).where(eq(rutas.id, rid)).returning({ id: rutas.id });
    if (!borrada) { res.status(404).json({ error: "Ruta no encontrada" }); return; }
    registrarAuditoria(req, "eliminar_ruta", "ruta", rid);
    res.json({ mensaje: "Ruta eliminada" });
  },
);

router.patch(
  "/rutas/:id/activa",
  authMiddleware,
  requireRol("admin"),
  validarBody(requerido("activa"), booleano("activa")),
  async (req, res) => {
    const { activa } = req.body as { activa: boolean };
    const rid = parseIdParam(req.params["id"]);
    if (rid === null) { res.status(400).json({ error: "Id de ruta inválido" }); return; }
    const [actualizada] = await db.update(rutas).set({ activa }).where(eq(rutas.id, rid)).returning({ id: rutas.id });
    if (!actualizada) { res.status(404).json({ error: "Ruta no encontrada" }); return; }
    registrarAuditoria(req, "editar_ruta", "ruta", rid, { activa });
    res.json({ mensaje: "Ruta actualizada" });
  },
);

// Renombrar / cambiar color de una ruta (sin borrarla).
router.patch(
  "/rutas/:id",
  authMiddleware,
  requireRol("admin"),
  validarBody(texto("nombre", 2, 100), colorHex("color")),
  async (req, res) => {
    const { nombre, color } = req.body as { nombre?: string; color?: string };
    const cambios: { nombre?: string; color?: string } = {};
    if (nombre?.trim()) cambios.nombre = nombre.trim();
    if (color?.trim()) cambios.color = color.trim();
    if (Object.keys(cambios).length === 0) {
      res.status(400).json({ error: "Nada que actualizar" });
      return;
    }
    const rid = parseIdParam(req.params["id"]);
    if (rid === null) { res.status(400).json({ error: "Id de ruta inválido" }); return; }
    const [actualizada] = await db.update(rutas).set(cambios).where(eq(rutas.id, rid)).returning({ id: rutas.id });
    if (!actualizada) { res.status(404).json({ error: "Ruta no encontrada" }); return; }
    registrarAuditoria(req, "editar_ruta", "ruta", rid, cambios);
    res.json({ mensaje: "Ruta actualizada" });
  },
);

export default router;
