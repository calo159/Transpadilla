import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usuarios, buses } from "@workspace/db";
import { eq } from "drizzle-orm";
import { pool } from "@workspace/db";
import { JWT_SECRET, authMiddleware, hashToken } from "../middleware/auth";
import { validarBody, requerido, correoValido, texto, passwordFuerte } from "../middleware/validate";
import { rateLimit } from "../middleware/rate-limit";
import { estaBloqueado, minutosRestantes, registrarFallo, limpiarIntentos } from "../lib/lockout";
import { clienteIp } from "../lib/client-ip";
import { registrarAuditoria } from "../lib/auditoria";

const router = Router();

// Versión vigente de los Términos de Conductor. Súbela cuando cambie el texto
// para forzar a que los conductores vuelvan a aceptar (Fase 3.4).
export const TERMINOS_CONDUCTOR_VERSION = "2026-07";

// Hash bcrypt "señuelo" para comparar cuando el usuario no existe: así el login
// tarda lo mismo exista o no la cuenta → evita enumeración de usuarios por timing.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

// Frena fuerza bruta: máx. 10 intentos de login por IP cada 5 minutos.
const loginLimiter = rateLimit({ ventanaMs: 5 * 60_000, max: 10 });
// El registro también se limita: evita que un bot cree cuentas en masa.
const registerLimiter = rateLimit({ ventanaMs: 60 * 60_000, max: 20 });
// Cambio de contraseña: limita reintentos de la clave actual por IP.
const passwordLimiter = rateLimit({ ventanaMs: 15 * 60_000, max: 20 });

router.post(
  "/auth/login",
  loginLimiter,
  validarBody(requerido("correo"), requerido("password")),
  async (req, res) => {
  const { correo, password } = req.body as {
    correo: string;
    password: string;
  };
  const correoNorm = correo.trim().toLowerCase();
  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.correo, correoNorm));
  if (!usuario) {
    await bcrypt.compare(password, DUMMY_HASH); // equaliza el tiempo (anti-enumeración)
    registrarAuditoria(req, "login_fallido", "usuario", null, { correo: correoNorm });
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  // Bloqueo de cuenta (Fase 1.3): se revisa ANTES de comparar el hash, para que
  // un atacante no pueda seguir probando contraseñas contra esta cuenta aunque
  // rote de IP (el rate-limit de arriba es por IP, esto es por cuenta).
  if (estaBloqueado(usuario)) {
    registrarAuditoria(req, "login_bloqueado", "usuario", usuario.id);
    res.status(429).json({
      error: `Cuenta bloqueada temporalmente por intentos fallidos. Espera ${minutosRestantes(usuario)} min e inténtalo de nuevo.`,
    });
    return;
  }
  const valid = await bcrypt.compare(password, usuario.password);
  if (!valid) {
    await registrarFallo(usuario.id);
    registrarAuditoria(req, "login_fallido", "usuario", usuario.id);
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  await limpiarIntentos(usuario.id);
  registrarAuditoria(req, "login_exitoso", "usuario", usuario.id);
  const token = jwt.sign(
    { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
    JWT_SECRET,
    {
      // Firma HS256 explícita (era el default); el verify fija este mismo algoritmo.
      algorithm: "HS256",
      // Duración de la sesión: configurable por JWT_EXPIRES_IN (ej. "3d", "12h").
      // Más corta = menor ventana si roban un token. Por defecto 3 días.
      expiresIn: (process.env["JWT_EXPIRES_IN"] ?? "3d") as jwt.SignOptions["expiresIn"],
    },
  );
  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      // El frontend del conductor usa esto para exigir aceptar los términos en el
      // primer ingreso (Fase 3.4). Se considera "pendiente" también si la versión
      // aceptada quedó vieja frente a la vigente.
      terminos_aceptados:
        usuario.terminos_conductor_aceptados &&
        usuario.terminos_conductor_version === TERMINOS_CONDUCTOR_VERSION,
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
    requerido("password"), passwordFuerte("password"),
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

// Cambio de contraseña del usuario autenticado. Verifica la clave actual antes
// de aplicar la nueva, para que un token robado no baste para secuestrar la
// cuenta. Sirve a admin y conductor (no hay otra forma de rotar su clave).
router.post(
  "/auth/cambiar-password",
  passwordLimiter,
  authMiddleware,
  validarBody(
    requerido("actual"),
    requerido("nueva"), passwordFuerte("nueva"),
  ),
  async (req, res) => {
    const { actual, nueva } = req.body as { actual: string; nueva: string };
    const id = req.usuario!.id;
    const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    if (!usuario) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    const valid = await bcrypt.compare(actual, usuario.password);
    if (!valid) {
      res.status(401).json({ error: "La contraseña actual es incorrecta" });
      return;
    }
    if (actual === nueva) {
      res.status(400).json({ error: "La nueva contraseña debe ser distinta de la actual" });
      return;
    }
    const hash = await bcrypt.hash(nueva, 10);
    await db.update(usuarios).set({ password: hash }).where(eq(usuarios.id, id));
    res.json({ mensaje: "Contraseña actualizada" });
  },
);

// Cierre de sesión REAL: revoca el token actual (lo agrega a la lista negra hasta
// su expiración). Requiere token válido; tras esto ese token deja de servir.
router.post("/auth/cerrar-sesion", authMiddleware, async (req, res) => {
  const token = req.headers.authorization!.slice(7);
  // exp del JWT (segundos epoch) → fecha de expiración para poder purgarlo luego.
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expira = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO tokens_revocados (token_hash, expira_en) VALUES ($1, $2)
     ON CONFLICT (token_hash) DO NOTHING`,
    [hashToken(token), expira],
  );

  // Si es conductor, apagar SU bus al cerrar sesión (mismo efecto que finalizar el
  // recorrido). Así el bus deja de aparecerles activo a los pasajeros aunque el
  // cliente no lo haya finalizado — p. ej. tras recargar la página, donde el flag
  // local `activo` vuelve a false y `salir()` ya no llama a /buses/finalizar, y el
  // bus quedaría "fantasma" (activo con su última posición congelada). Idempotente
  // y acotado a su propio bus (admin/pasajero no tienen bus con ese conductor_id).
  if (req.usuario!.rol === "conductor") {
    await db
      .update(buses)
      .set({
        estado: "inactivo",
        lat: null,
        lng: null,
        velocidad: null,
        novedad: null,
        ocupacion: null,
        actualizado: new Date(),
      })
      .where(eq(buses.conductor_id, req.usuario!.id));
  }

  res.json({ mensaje: "Sesión cerrada" });
});

// Aceptación de los Términos de Conductor (Fase 3.4). Registra el consentimiento
// (versión vigente, fecha e IP) para el conductor autenticado. El frontend lo
// llama desde el modal bloqueante del primer ingreso.
router.post("/auth/aceptar-terminos", authMiddleware, async (req, res) => {
  if (req.usuario!.rol !== "conductor") {
    res.status(403).json({ error: "Solo los conductores aceptan estos términos" });
    return;
  }
  await db
    .update(usuarios)
    .set({
      terminos_conductor_aceptados: true,
      terminos_conductor_version: TERMINOS_CONDUCTOR_VERSION,
      terminos_conductor_fecha: new Date(),
      terminos_conductor_ip: clienteIp(req),
    })
    .where(eq(usuarios.id, req.usuario!.id));
  res.json({ mensaje: "Términos aceptados", version: TERMINOS_CONDUCTOR_VERSION });
});

export default router;
