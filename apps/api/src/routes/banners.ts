import { Router } from "express";
import { db, banners } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { validarBody, requerido, texto, booleano, dataUrlImagen, parseIdParam } from "../middleware/validate";
import { registrarAuditoria } from "../lib/auditoria";

// Banners / anuncios a pantalla completa que el admin publica al pasajero. La
// imagen viaja como data URL (base64) en `imagen_url`. Regla de negocio: solo un
// banner puede estar `activo` a la vez; al crear/activar uno se desactivan los demás
// (en transacción). El límite de body para POST /api/banners se eleva en app.ts.
const router = Router();

// Lectura pública: el banner activo (lo consume la vista Pasajero al entrar).
// 204 si no hay ninguno activo, para que el frontend sepa que no debe mostrar nada.
router.get("/banners/activo", async (_req, res) => {
  const [banner] = await db.select().from(banners).where(eq(banners.activo, true)).limit(1);
  if (!banner) { res.status(204).end(); return; }
  res.json(banner);
});

// Lista completa (admin): incluye el data URL de cada imagen.
router.get("/banners", authMiddleware, requireRol("admin"), async (_req, res) => {
  const lista = await db.select().from(banners).orderBy(desc(banners.creado_en));
  res.json(lista);
});

router.post(
  "/banners",
  authMiddleware,
  requireRol("admin"),
  validarBody(requerido("imagen_url"), dataUrlImagen("imagen_url"), texto("titulo", 0, 120), booleano("activo")),
  async (req, res) => {
    const { imagen_url, titulo = null, activo = true } = req.body as {
      imagen_url: string;
      titulo?: string | null;
      activo?: boolean;
    };
    const tituloLimpio = typeof titulo === "string" && titulo.trim() ? titulo.trim() : null;
    const nuevo = await db.transaction(async (tx) => {
      if (activo) await tx.update(banners).set({ activo: false }).where(eq(banners.activo, true));
      const [b] = await tx
        .insert(banners)
        .values({ imagen_url, titulo: tituloLimpio, activo })
        .returning();
      return b;
    });
    registrarAuditoria(req, "crear_banner", "banner", nuevo?.id, { titulo: tituloLimpio, activo });
    res.status(201).json(nuevo);
  },
);

// Activar un banner: se desactivan todos y se marca este como el único activo.
router.patch(
  "/banners/:id/activo",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const bid = parseIdParam(req.params["id"]);
    if (bid === null) { res.status(400).json({ error: "Id de banner inválido" }); return; }
    const actualizado = await db.transaction(async (tx) => {
      await tx.update(banners).set({ activo: false }).where(eq(banners.activo, true));
      const [b] = await tx.update(banners).set({ activo: true }).where(eq(banners.id, bid)).returning();
      return b;
    });
    if (!actualizado) { res.status(404).json({ error: "Banner no encontrado" }); return; }
    registrarAuditoria(req, "activar_banner", "banner", bid);
    res.json(actualizado);
  },
);

router.delete(
  "/banners/:id",
  authMiddleware,
  requireRol("admin"),
  async (req, res) => {
    const bid = parseIdParam(req.params["id"]);
    if (bid === null) { res.status(400).json({ error: "Id de banner inválido" }); return; }
    const [borrado] = await db.delete(banners).where(eq(banners.id, bid)).returning({ id: banners.id });
    if (!borrado) { res.status(404).json({ error: "Banner no encontrado" }); return; }
    registrarAuditoria(req, "eliminar_banner", "banner", bid);
    res.json({ mensaje: "Banner eliminado" });
  },
);

export default router;
