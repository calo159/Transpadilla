import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usuarios, rutas, paradas, ruta_paradas, buses, lugares } from "@workspace/db";
import { logger } from "./logger";

/**
 * Decide qué debe sembrarse en una base VACÍA, a partir del entorno.
 * Función pura (testeable sin BD).
 *
 * - "demo":  SEED_DEMO === "true" explícito y NO producción. El modo demo crea
 *            credenciales CONOCIDAS (admin123…), así que es opt-in — nunca el
 *            default, y nunca en producción.
 * - "admin": el default — crea solo el administrador de ADMIN_EMAIL/ADMIN_PASSWORD.
 * - "error": configuración peligrosa o incompleta (demo pedido en producción, o
 *            producción sin credenciales de admin) — el arranque debe fallar claro
 *            en vez de dejar un sistema sin admin o con claves públicas.
 * - "nada":  desarrollo sin credenciales configuradas — no se siembra (warn).
 */
export function modoSeed(env: {
  SEED_DEMO?: string;
  NODE_ENV?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
}): "demo" | "admin" | "nada" | "error" {
  const esProd = env.NODE_ENV === "production";
  if (env.SEED_DEMO === "true") return esProd ? "error" : "demo";
  const tieneAdmin = !!env.ADMIN_EMAIL?.trim() && !!env.ADMIN_PASSWORD;
  if (tieneAdmin) return "admin";
  return esProd ? "error" : "nada";
}

/**
 * Prepara la base de datos en su primer arranque (solo si está vacía):
 *
 * - SEED_DEMO === "true" (opt-in, solo fuera de producción): carga datos DEMO
 *   completos (usuarios de prueba con claves conocidas, rutas, paradas y buses).
 * - Default: crea ÚNICAMENTE un administrador a partir de ADMIN_EMAIL /
 *   ADMIN_PASSWORD. Así el sistema arranca limpio, sin cuentas de prueba.
 * - En PRODUCCIÓN con base vacía y sin admin configurado, FALLA el arranque
 *   (mejor un error claro que un despliegue sin admin o con admin123 público).
 *
 * Es idempotente: si ya hay usuarios, no hace nada.
 */
export async function seedIfEmpty(): Promise<{ seeded: boolean }> {
  const [yaExiste] = await db.select().from(usuarios).limit(1);
  if (yaExiste) return { seeded: false };

  const modo = modoSeed(process.env);

  if (modo === "error") {
    throw new Error(
      "FATAL: base de datos vacía en producción sin configuración segura de seed. " +
        "Define ADMIN_EMAIL y ADMIN_PASSWORD (y nunca SEED_DEMO=true en producción).",
    );
  }

  if (modo === "nada") {
    logger.warn(
      "Base de datos vacía y sin ADMIN_EMAIL/ADMIN_PASSWORD: no se sembró nada. " +
        "Define esas variables (o SEED_DEMO=true solo en desarrollo) para crear el primer usuario.",
    );
    return { seeded: false };
  }

  // Modo admin (default): solo el administrador configurado por entorno.
  if (modo === "admin") {
    const email = process.env["ADMIN_EMAIL"]!.trim().toLowerCase();
    const pass = process.env["ADMIN_PASSWORD"]!;
    const hash = await bcrypt.hash(pass, 10);
    await db.insert(usuarios).values({
      nombre: "Administrador",
      correo: email,
      password: hash,
      rol: "admin",
    });
    return { seeded: true };
  }

  const adminHash = await bcrypt.hash("admin123", 10);
  const conductorHash = await bcrypt.hash("conductor123", 10);
  const pasajeroHash = await bcrypt.hash("pasajero123", 10);

  const [, conductor] = await db
    .insert(usuarios)
    .values([
      { nombre: "Administrador", correo: "admin@transpadilla.co", password: adminHash, rol: "admin" },
      { nombre: "Carlos Pérez", correo: "conductor@transpadilla.co", password: conductorHash, rol: "conductor" },
      { nombre: "María García", correo: "pasajero@transpadilla.co", password: pasajeroHash, rol: "pasajero" },
    ])
    .returning();

  const [ruta1, ruta2, ruta3] = await db
    .insert(rutas)
    .values([
      { nombre: "Ruta Norte - Centro", color: "#e74c3c", activa: true },
      { nombre: "Ruta Sur - Muelle", color: "#3498db", activa: true },
      { nombre: "Ruta Oriental - Aeropuerto", color: "#2ecc71", activa: true },
    ])
    .returning();

  const paradaData = [
    { nombre: "Terminal de Transporte", latitud: 11.535, longitud: -72.905 },
    { nombre: "Parque Simón Bolívar", latitud: 11.5444, longitud: -72.9072 },
    { nombre: "Hospital Nuestra Señora de los Remedios", latitud: 11.549, longitud: -72.91 },
    { nombre: "Mercado Central", latitud: 11.542, longitud: -72.906 },
    { nombre: "Muelle Turístico", latitud: 11.55, longitud: -72.918 },
    { nombre: "Aeropuerto Almirante Padilla", latitud: 11.525, longitud: -72.926 },
    { nombre: "Barrio La Esperanza", latitud: 11.558, longitud: -72.899 },
  ];

  const insertedParadas = await db.insert(paradas).values(paradaData).returning();
  const [p1, p2, p3, p4, p5, p6, p7] = insertedParadas;

  if (ruta1 && p7 && p3 && p2) {
    await db.insert(ruta_paradas).values([
      { ruta_id: ruta1.id, parada_id: p7.id, orden: 1 },
      { ruta_id: ruta1.id, parada_id: p3.id, orden: 2 },
      { ruta_id: ruta1.id, parada_id: p2.id, orden: 3 },
    ]);
  }
  if (ruta2 && p1 && p4 && p5) {
    await db.insert(ruta_paradas).values([
      { ruta_id: ruta2.id, parada_id: p1.id, orden: 1 },
      { ruta_id: ruta2.id, parada_id: p4.id, orden: 2 },
      { ruta_id: ruta2.id, parada_id: p5.id, orden: 3 },
    ]);
  }
  if (ruta3 && p2 && p6) {
    await db.insert(ruta_paradas).values([
      { ruta_id: ruta3.id, parada_id: p2.id, orden: 1 },
      { ruta_id: ruta3.id, parada_id: p6.id, orden: 2 },
    ]);
  }

  if (ruta1 && ruta2 && ruta3 && conductor) {
    await db.insert(buses).values([
      { placa: "GUA-001", ruta_id: ruta1.id, conductor_id: conductor.id, estado: "inactivo" },
      { placa: "GUA-002", ruta_id: ruta2.id, estado: "inactivo" },
      { placa: "GUA-003", ruta_id: ruta3.id, estado: "inactivo" },
    ]);
  }

  return { seeded: true };
}

// Lugares de referencia de Riohacha para que la BÚSQUEDA POR DESTINO del pasajero
// sirva desde el primer arranque (el admin luego agrega/edita el resto en su
// panel). Coordenadas reales, alineadas con las paradas del seed demo.
const LUGARES_INICIALES = [
  { nombre: "Hospital Nuestra Señora de los Remedios", categoria: "Salud", latitud: 11.549, longitud: -72.91 },
  { nombre: "Mercado Nuevo", categoria: "Comercio", latitud: 11.542, longitud: -72.906 },
  { nombre: "Terminal de Transporte", categoria: "Transporte", latitud: 11.535, longitud: -72.905 },
  { nombre: "Aeropuerto Almirante Padilla", categoria: "Transporte", latitud: 11.525, longitud: -72.926 },
  { nombre: "Parque Simón Bolívar (Centro)", categoria: "Centro", latitud: 11.5444, longitud: -72.9072 },
  { nombre: "Muelle Turístico", categoria: "Turismo", latitud: 11.55, longitud: -72.918 },
];

/**
 * Siembra los lugares de referencia SOLO si la tabla está vacía. Es independiente
 * del seed de usuarios/rutas (corre también en producción con SEED_DEMO=false),
 * para que la búsqueda por destino funcione de entrada. Idempotente por el chequeo
 * de "vacía". (Edge case aceptado: si el admin borra TODOS los lugares, reaparecen
 * en el siguiente reinicio; en la práctica siempre habrá al menos uno.)
 */
export async function seedLugaresIfEmpty(): Promise<{ seeded: boolean }> {
  const [yaExiste] = await db.select().from(lugares).limit(1);
  if (yaExiste) return { seeded: false };
  await db.insert(lugares).values(LUGARES_INICIALES);
  return { seeded: true };
}
