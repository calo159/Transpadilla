import { Router } from "express";
import { db, paradas, ruta_paradas, rutas } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { validarBody, requerido, texto, numeroEnRango, parseIdParam } from "../middleware/validate";
import { registrarAuditoria } from "../lib/auditoria";

// Paradas y su asignación a rutas. Las lecturas son públicas (las usa el mapa);
// crear/editar/borrar/asignar es solo de administrador.
const router = Router();

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
    registrarAuditoria(req, "crear_parada", "parada", parada?.id, { nombre });
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
    const pid = parseIdParam(req.params["id"]);
    if (pid === null) { res.status(400).json({ error: "Id de parada inválido" }); return; }
    const [actualizada] = await db.update(paradas).set(cambios).where(eq(paradas.id, pid)).returning({ id: paradas.id });
    if (!actualizada) { res.status(404).json({ error: "Parada no encontrada" }); return; }
    registrarAuditoria(req, "editar_parada", "parada", pid, cambios);
    res.json({ mensaje: "Parada actualizada" });
  },
);

router.delete(
  "/rutas/paradas/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const id = parseIdParam(req.params["id"]);
    if (id === null) { res.status(400).json({ error: "Id de parada inválido" }); return; }
    await db.delete(ruta_paradas).where(eq(ruta_paradas.parada_id, id));
    const [borrada] = await db.delete(paradas).where(eq(paradas.id, id)).returning({ id: paradas.id });
    if (!borrada) { res.status(404).json({ error: "Parada no encontrada" }); return; }
    registrarAuditoria(req, "eliminar_parada", "parada", id);
    res.json({ mensaje: "Parada eliminada" });
  },
);

// ─── Asignación de paradas a una ruta (tabla ruta_paradas) ────────────────────

router.get("/rutas/:id/paradas", async (req, res) => {
  const rutaId = parseIdParam(req.params["id"]);
  if (rutaId === null) { res.status(400).json({ error: "Id de ruta inválido" }); return; }
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
    const rutaId = parseIdParam(req.params["id"]);
    if (rutaId === null) { res.status(400).json({ error: "Id de ruta inválido" }); return; }
    const { parada_id, orden } = req.body as { parada_id: number; orden?: number };
    const pid = Number(parada_id);
    if (!Number.isInteger(pid) || pid <= 0) {
      res.status(400).json({ error: "parada_id inválido" });
      return;
    }
    const ordenNum = Number.isFinite(Number(orden)) ? Number(orden) : 0;
    // La ruta debe existir (si no, el insert revienta con error de FK → 500 confuso).
    const [rutaExiste] = await db.select({ id: rutas.id }).from(rutas).where(eq(rutas.id, rutaId));
    if (!rutaExiste) { res.status(404).json({ error: "Ruta no encontrada" }); return; }
    // Evita duplicar la misma parada en la misma ruta.
    const [existe] = await db
      .select({ id: ruta_paradas.id })
      .from(ruta_paradas)
      .where(and(eq(ruta_paradas.ruta_id, rutaId), eq(ruta_paradas.parada_id, pid)));
    if (existe) {
      res.status(409).json({ error: "Esa parada ya está en la ruta" });
      return;
    }
    await db.insert(ruta_paradas).values({ ruta_id: rutaId, parada_id: pid, orden: ordenNum });
    registrarAuditoria(req, "asignar_parada", "ruta", rutaId, { parada_id: pid, orden: ordenNum });
    res.status(201).json({ mensaje: "Parada asignada" });
  },
);

// Quitar una parada de una ruta (desasignar): se elimina la relación, no la parada.
router.delete(
  "/rutas/:rutaId/paradas/:paradaId",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const rutaId = parseIdParam(req.params["rutaId"]);
    const paradaId = parseIdParam(req.params["paradaId"]);
    if (rutaId === null || paradaId === null) { res.status(400).json({ error: "Id inválido" }); return; }
    const [quitada] = await db
      .delete(ruta_paradas)
      .where(and(eq(ruta_paradas.ruta_id, rutaId), eq(ruta_paradas.parada_id, paradaId)))
      .returning({ id: ruta_paradas.id });
    if (!quitada) { res.status(404).json({ error: "Esa parada no está asignada a esa ruta" }); return; }
    registrarAuditoria(req, "desasignar_parada", "ruta", rutaId, { parada_id: paradaId });
    res.json({ mensaje: "Parada quitada de la ruta" });
  },
);

export default router;
