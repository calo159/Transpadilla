import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usuarios } from "@workspace/db";
import { eq } from "drizzle-orm";
import { JWT_SECRET } from "../middleware/auth";
import { validarBody, requerido, correoValido, texto } from "../middleware/validate";
import { rateLimit } from "../middleware/rate-limit";

const router = Router();

// Frena fuerza bruta: máx. 10 intentos de login por IP cada 5 minutos.
const loginLimiter = rateLimit({ ventanaMs: 5 * 60_000, max: 10 });
// El registro también se limita: evita que un bot cree cuentas en masa.
const registerLimiter = rateLimit({ ventanaMs: 60 * 60_000, max: 20 });

router.post(
  "/auth/login",
  loginLimiter,
  validarBody(requerido("correo"), requerido("password")),
  async (req, res) => {
  const { correo, password } = req.body as {
    correo: string;
    password: string;
  };
  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.correo, correo.trim().toLowerCase()));
  if (!usuario) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  const valid = await bcrypt.compare(password, usuario.password);
  if (!valid) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  const token = jwt.sign(
    { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
    },
  });
});

// Registro PÚBLICO. Por seguridad SIEMPRE crea un usuario con rol "pasajero":
// el `rol` que venga en el body se ignora a propósito, de modo que nadie pueda
// auto-otorgarse permisos de conductor o administrador desde el cliente. Las
// cuentas de conductor las crea un administrador autenticado (POST /conductores).
router.post(
  "/auth/register",
  registerLimiter,
  validarBody(
    requerido("nombre"), texto("nombre", 2, 100),
    requerido("correo"), correoValido("correo"),
    requerido("password"), texto("password", 6, 200),
  ),
  async (req, res) => {
  const { nombre, correo, password } = req.body as {
    nombre: string;
    correo: string;
    password: string;
  };
  const correoNorm = correo.trim().toLowerCase();
  const [existing] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.correo, correoNorm));
  if (existing) {
    res.status(409).json({ error: "Ese correo ya está registrado" });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  const [nuevo] = await db
    .insert(usuarios)
    .values({ nombre: nombre.trim(), correo: correoNorm, password: hash, rol: "pasajero" })
    .returning({ id: usuarios.id, rol: usuarios.rol });
  res.status(201).json(nuevo);
});

export default router;
