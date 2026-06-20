import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, buses, usuarios } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, requireRol } from "../middleware/auth";
import { validarBody, requerido, texto, correoValido } from "../middleware/validate";

// Toda la gestión de conductores es exclusiva del administrador autenticado.
const router = Router();
router.use(authMiddleware, requireRol("admin"));

const idParam = (raw: unknown): number => parseInt(String(raw));

router.get("/conductores", async (_req, res) => {
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

router.delete("/conductores/:id", async (req, res) => {
  const id = idParam(req.params["id"]);
  // Libera el bus que tuviera asignado antes de borrar al conductor.
  await db.update(buses).set({ conductor_id: null }).where(eq(buses.conductor_id, id));
  await db.delete(usuarios).where(eq(usuarios.id, id));
  res.json({ mensaje: "Conductor eliminado" });
});

// Asignar / desasignar el conductor de un bus.
router.patch("/buses/:id/conductor", async (req, res) => {
  const { conductor_id } = req.body as { conductor_id: number | null };
  await db
    .update(buses)
    .set({ conductor_id: conductor_id ?? null })
    .where(eq(buses.id, idParam(req.params["id"])));
  res.json({ mensaje: "Conductor actualizado" });
});

export default router;
