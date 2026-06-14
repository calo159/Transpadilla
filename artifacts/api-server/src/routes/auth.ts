import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usuarios } from "@workspace/db";
import { eq } from "drizzle-orm";
import { JWT_SECRET } from "../middleware/auth";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const { correo, password } = req.body as {
    correo: string;
    password: string;
  };
  if (!correo || !password) {
    res.status(400).json({ error: "Correo y contraseña requeridos" });
    return;
  }
  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.correo, correo));
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

router.post("/auth/register", async (req, res) => {
  const { nombre, correo, password, rol = "pasajero", identificacion } = req.body as {
    nombre: string;
    correo: string;
    password: string;
    rol?: string;
    identificacion?: string;
  };
  if (!nombre || !correo || !password) {
    res.status(400).json({ error: "Todos los campos son requeridos" });
    return;
  }
  const [existing] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.correo, correo));
  if (existing) {
    res.status(409).json({ error: "Correo ya registrado" });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  const [nuevo] = await db
    .insert(usuarios)
    .values({ nombre, correo, password: hash, rol, identificacion: identificacion ?? null })
    .returning({ id: usuarios.id, rol: usuarios.rol });
  res.status(201).json(nuevo);
});

export default router;
