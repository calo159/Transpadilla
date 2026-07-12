import { Router } from "express";
import { db, lugares } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { validarBody, requerido, texto, numeroEnRango, booleano, parseIdParam } from "../middleware/validate";
import { rateLimit } from "../middleware/rate-limit";
import { registrarAuditoria } from "../lib/auditoria";

// Lugares / puntos de interés (hospital, mercado, terminal, universidad…) que el
// admin registra para que el pasajero busque su DESTINO por nombre; al elegir uno,
// la app recomienda la mejor ruta hacia él. La lectura de los activos es pública
// (la consume el buscador del pasajero); crear/editar/borrar es solo de admin.
const router = Router();

// Tope por IP: la lectura pública es liviana y cacheable, pero el CRUD toca la BD
// tras la verificación de sesión; un token de admin robado no debería machacarla.
// Generoso para no estorbar el uso normal del buscador ni del panel admin.
router.use("/lugares", rateLimit({ ventanaMs: 60_000, max: 120 }));

// Lectura PÚBLICA: solo los lugares activos, ordenados por nombre. Lo usa el
// buscador de destino del pasajero.
router.get("/lugares", async (_req, res) => {
  const activos = await db
    .select()
    .from(lugares)
    .where(eq(lugares.activo, true))
    .orderBy(asc(lugares.nombre));
  res.json(activos);
});

// Lista COMPLETA (admin): incluye los inactivos, para gestionarlos.
router.get("/lugares/todos", authMiddleware, requireRol("admin"), async (_req, res) => {
  const todos = await db.select().from(lugares).orderBy(asc(lugares.nombre));
  res.json(todos);
});

router.post(
  "/lugares",
  authMiddleware,
  requireRol("admin"),
  validarBody(
    requerido("nombre"), texto("nombre", 2, 100),
    requerido("latitud"), numeroEnRango("latitud", -90, 90),
    requerido("longitud"), numeroEnRango("longitud", -180, 180),
    texto("categoria", 0, 40),
    booleano("activo"),
  ),
  async (req, res) => {
    const { nombre, categoria = null, latitud, longitud, activo = true } = req.body as {
      nombre: string;
      categoria?: string | null;
      latitud: number;
      longitud: number;
      activo?: boolean;
    };
    const categoriaLimpia = typeof categoria === "string" && categoria.trim() ? categoria.trim() : null;
    const [lugar] = await db
      .insert(lugares)
      .values({ nombre: nombre.trim(), categoria: categoriaLimpia, latitud, longitud, activo })
      .returning();
    registrarAuditoria(req, "crear_lugar", "lugar", lugar?.id, { nombre: nombre.trim() });
    res.status(201).json(lugar);
  },
);

// Editar un lugar (nombre, categoría, ubicación o estado activo). Todos opcionales.
router.patch(
  "/lugares/:id",
  authMiddleware,
  requireRol("admin"),
  validarBody(
    texto("nombre", 2, 100),
    numeroEnRango("latitud", -90, 90),
    numeroEnRango("longitud", -180, 180),
    texto("categoria", 0, 40),
    booleano("activo"),
  ),
  async (req, res) => {
    const id = parseIdParam(req.params["id"]);
    if (id === null) { res.status(400).json({ error: "Id de lugar inválido" }); return; }
    const { nombre, categoria, latitud, longitud, activo } = req.body as {
      nombre?: string;
      categoria?: string | null;
      latitud?: number;
      longitud?: number;
      activo?: boolean;
    };
    const cambios: Partial<typeof lugares.$inferInsert> = {};
    if (nombre?.trim()) cambios.nombre = nombre.trim();
    if (categoria !== undefined) cambios.categoria = typeof categoria === "string" && categoria.trim() ? categoria.trim() : null;
    if (typeof latitud === "number" && !Number.isNaN(latitud)) cambios.latitud = latitud;
    if (typeof longitud === "number" && !Number.isNaN(longitud)) cambios.longitud = longitud;
    if (typeof activo === "boolean") cambios.activo = activo;
    if (Object.keys(cambios).length === 0) {
      res.status(400).json({ error: "Nada que actualizar" });
      return;
    }
    const [actualizado] = await db.update(lugares).set(cambios).where(eq(lugares.id, id)).returning();
    if (!actualizado) { res.status(404).json({ error: "Lugar no encontrado" }); return; }
    registrarAuditoria(req, "editar_lugar", "lugar", id, cambios);
    res.json(actualizado);
  },
);

router.delete(
  "/lugares/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const id = parseIdParam(req.params["id"]);
    if (id === null) { res.status(400).json({ error: "Id de lugar inválido" }); return; }
    const [borrado] = await db.delete(lugares).where(eq(lugares.id, id)).returning({ id: lugares.id });
    if (!borrado) { res.status(404).json({ error: "Lugar no encontrado" }); return; }
    registrarAuditoria(req, "eliminar_lugar", "lugar", id);
    res.json({ mensaje: "Lugar eliminado" });
  },
);

export default router;
