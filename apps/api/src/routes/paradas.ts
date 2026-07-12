import { Router } from "express";
import { db, paradas, ruta_paradas, rutas } from "@workspace/db";
import { eq, asc, and, desc } from "drizzle-orm";
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
      asignacion_id: ruta_paradas.id,
    })
    .from(ruta_paradas)
    .innerJoin(paradas, eq(ruta_paradas.parada_id, paradas.id))
    .where(eq(ruta_paradas.ruta_id, rutaId))
    // Desempate estable por id de asignación (ver rutas.ts): si dos paradas
    // quedaran con el mismo `orden`, el orden de salida es siempre el mismo.
    .orderBy(asc(ruta_paradas.orden), asc(ruta_paradas.id));
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
    // La ruta debe existir (si no, el insert revienta con error de FK → 500 confuso).
    const [rutaExiste] = await db.select({ id: rutas.id }).from(rutas).where(eq(rutas.id, rutaId));
    if (!rutaExiste) { res.status(404).json({ error: "Ruta no encontrada" }); return; }
    // Una misma parada SÍ puede repetirse en el recorrido de una ruta (p. ej. un
    // circuito que vuelve a pasar por el mismo paradero): no se bloquea.
    // Si no se especifica `orden`, la parada se agrega AL FINAL del recorrido
    // (max actual + 1), no en 0, para no colisionar con las existentes.
    let ordenNum: number;
    if (Number.isFinite(Number(orden))) {
      ordenNum = Number(orden);
      // El "Orden" del formulario admin se escribe a mano: si ya existe otra
      // parada de esta ruta con ese mismo número, dos paradas quedan empatadas y
      // el recorrido sale ambiguo (por dónde va primero) — esto ya pasó una vez
      // en producción (Ruta B) y el mapa la trazaba distinto en cada carga.
      const [choque] = await db
        .select({ nombre: paradas.nombre })
        .from(ruta_paradas)
        .innerJoin(paradas, eq(ruta_paradas.parada_id, paradas.id))
        .where(and(eq(ruta_paradas.ruta_id, rutaId), eq(ruta_paradas.orden, ordenNum)));
      if (choque) {
        res.status(409).json({ error: `Ese orden ya lo tiene "${choque.nombre}" en esta ruta` });
        return;
      }
    } else {
      const [ultima] = await db
        .select({ orden: ruta_paradas.orden })
        .from(ruta_paradas)
        .where(eq(ruta_paradas.ruta_id, rutaId))
        .orderBy(desc(ruta_paradas.orden))
        .limit(1);
      ordenNum = ultima ? ultima.orden + 1 : 0;
    }
    await db.insert(ruta_paradas).values({ ruta_id: rutaId, parada_id: pid, orden: ordenNum });
    registrarAuditoria(req, "asignar_parada", "ruta", rutaId, { parada_id: pid, orden: ordenNum });
    res.status(201).json({ mensaje: "Parada asignada" });
  },
);

// Reordenar (definir el SENTIDO de circulación de) las paradas de una ruta. El
// body trae `orden`: los ids de ASIGNACIÓN (ruta_paradas.id, no de parada — una
// misma parada puede repetirse en el recorrido) en el orden deseado; se asigna
// `ruta_paradas.orden = índice`. "Invertir sentido" = el frontend manda el array al revés.
router.put(
  "/rutas/:id/paradas/orden",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const rutaId = parseIdParam(req.params["id"]);
    if (rutaId === null) { res.status(400).json({ error: "Id de ruta inválido" }); return; }
    const { orden } = req.body as { orden?: unknown };
    if (!Array.isArray(orden) || orden.length === 0 || !orden.every((x) => Number.isInteger(x) && Number(x) > 0)) {
      res.status(400).json({ error: "orden debe ser un arreglo de ids de asignación" });
      return;
    }
    const ids = orden.map((x) => Number(x));
    if (new Set(ids).size !== ids.length) {
      res.status(400).json({ error: "orden tiene ids repetidos" });
      return;
    }
    // Todos los ids deben ser asignaciones (ruta_paradas.id) actuales de la ruta.
    const actuales = await db
      .select({ id: ruta_paradas.id })
      .from(ruta_paradas)
      .where(eq(ruta_paradas.ruta_id, rutaId));
    const setActuales = new Set(actuales.map((r) => r.id));
    if (setActuales.size !== ids.length || !ids.every((id) => setActuales.has(id))) {
      res.status(400).json({ error: "orden debe incluir exactamente las asignaciones de la ruta" });
      return;
    }
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(ruta_paradas)
          .set({ orden: i })
          .where(and(eq(ruta_paradas.ruta_id, rutaId), eq(ruta_paradas.id, ids[i]!)));
      }
    });
    registrarAuditoria(req, "reordenar_paradas", "ruta", rutaId, { orden: ids });
    res.json({ mensaje: "Orden actualizado" });
  },
);

// Quitar UNA ocurrencia de una parada de una ruta (desasignar por id de
// asignación, no de parada — así se puede quitar solo una de varias repeticiones
// sin afectar las demás). Se elimina la relación, no la parada en sí.
router.delete(
  "/rutas/:rutaId/asignaciones/:asignacionId",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const rutaId = parseIdParam(req.params["rutaId"]);
    const asignacionId = parseIdParam(req.params["asignacionId"]);
    if (rutaId === null || asignacionId === null) { res.status(400).json({ error: "Id inválido" }); return; }
    const [quitada] = await db
      .delete(ruta_paradas)
      .where(and(eq(ruta_paradas.ruta_id, rutaId), eq(ruta_paradas.id, asignacionId)))
      .returning({ id: ruta_paradas.id, parada_id: ruta_paradas.parada_id });
    if (!quitada) { res.status(404).json({ error: "Esa asignación no existe en esa ruta" }); return; }
    registrarAuditoria(req, "desasignar_parada", "ruta", rutaId, { parada_id: quitada.parada_id, asignacion_id: asignacionId });
    res.json({ mensaje: "Parada quitada de la ruta" });
  },
);

export default router;
