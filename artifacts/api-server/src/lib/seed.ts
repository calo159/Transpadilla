import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usuarios, rutas, paradas, ruta_paradas, buses } from "@workspace/db";

/**
 * Prepara la base de datos en su primer arranque (solo si está vacía):
 *
 * - SEED_DEMO !== "false" (por defecto): carga datos DEMO completos (usuarios de
 *   prueba, rutas, paradas y buses) — útil para demostraciones.
 * - SEED_DEMO === "false" (producción real, p.ej. la Alcaldía): NO crea datos
 *   demo; crea ÚNICAMENTE un administrador a partir de ADMIN_EMAIL / ADMIN_PASSWORD.
 *   Así el sistema arranca limpio, sin buses ni cuentas de prueba.
 *
 * Es idempotente: si ya hay usuarios, no hace nada.
 */
export async function seedIfEmpty(): Promise<{ seeded: boolean }> {
  const [yaExiste] = await db.select().from(usuarios).limit(1);
  if (yaExiste) return { seeded: false };

  // Modo producción: solo el admin configurado por entorno, sin datos demo.
  if (process.env["SEED_DEMO"] === "false") {
    const email = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
    const pass = process.env["ADMIN_PASSWORD"];
    if (!email || !pass) return { seeded: false };
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
