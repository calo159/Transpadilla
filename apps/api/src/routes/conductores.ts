import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, buses, usuarios } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { validarBody, requerido, texto, correoValido, parseIdParam } from "../middleware/validate";
import { registrarAuditoria } from "../lib/auditoria";

// Toda la gestión de conductores es exclusiva del administrador autenticado.
// IMPORTANTE: la guarda se aplica POR RUTA (no con un router.use global), porque
// este router se monta sin prefijo junto a los demás; un middleware global aquí
// bloquearía también las rutas públicas montadas después (rutas, paradas, eta…).
const router = Router();
const soloAdmin = [authMiddleware, requireRol("admin")] as const;

router.get("/conductores", ...soloAdmin, async (_req, res) => {
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
});

// Alta de conductores. El rol "conductor" se fija en el SERVIDOR (no se acepta
// del cliente), de modo que otorgar privilegios es siempre decisión del backend.
router.post(
  "/conductores",
  ...soloAdmin,
  validarBody(
    requerido("nombre"), texto("nombre", 2, 100),
    requerido("correo"), correoValido("correo"),
    requerido("password"), texto("password", 8, 200),
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
    registrarAuditoria(req.usuario?.id, "crear_conductor", "conductor", nuevo?.id, { nombre: nombre.trim(), correo: correoNorm });
    res.status(201).json(nuevo);
  },
);

router.delete("/conductores/:id", ...soloAdmin, async (req, res) => {
  const id = parseIdParam(req.params["id"]);
  if (id === null) { res.status(400).json({ error: "Id de conductor inválido" }); return; }
  // SOLO usuarios con rol conductor: sin este filtro, el endpoint podía borrar
  // CUALQUIER usuario por id (incluidos otros admins) — escalada accidental.
  const [borrado] = await db
    .delete(usuarios)
    .where(and(eq(usuarios.id, id), eq(usuarios.rol, "conductor")))
    .returning({ id: usuarios.id });
  if (!borrado) { res.status(404).json({ error: "Conductor no encontrado" }); return; }
  // Su bus queda libre solo: la FK buses.conductor_id es ON DELETE SET NULL.
  registrarAuditoria(req.usuario?.id, "eliminar_conductor", "conductor", id);
  res.json({ mensaje: "Conductor eliminado" });
});

// Asignar / desasignar el conductor de un bus.
router.patch("/buses/:id/conductor", ...soloAdmin, async (req, res) => {
  const { conductor_id } = req.body as { conductor_id?: number | null };
  const busId = parseIdParam(req.params["id"]);
  if (busId === null) { res.status(400).json({ error: "Id de bus inválido" }); return; }
  let nuevoConductor: number | null = null;
  if (conductor_id !== null && conductor_id !== undefined) {
    const cid = Number(conductor_id);
    if (!Number.isInteger(cid) || cid <= 0) {
      res.status(400).json({ error: "conductor_id inválido" });
      return;
    }
    // Debe existir y SER conductor (no se puede asignar un admin/pasajero a un bus).
    const [existe] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.id, cid), eq(usuarios.rol, "conductor")));
    if (!existe) { res.status(404).json({ error: "Conductor no encontrado" }); return; }
    nuevoConductor = cid;
  }
  const [actualizado] = await db
    .update(buses)
    .set({ conductor_id: nuevoConductor })
    .where(eq(buses.id, busId))
    .returning({ id: buses.id });
  if (!actualizado) { res.status(404).json({ error: "Bus no encontrado" }); return; }
  registrarAuditoria(req.usuario?.id, "asignar_conductor", "bus", busId, { conductor_id: nuevoConductor });
  res.json({ mensaje: "Conductor actualizado" });
});

export default router;
