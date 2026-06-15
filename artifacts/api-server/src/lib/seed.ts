import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usuarios, rutas, paradas, ruta_paradas, buses } from "@workspace/db";

/**
 * Inserta datos de demostración (usuarios, rutas, paradas y buses) solo si la
 * base de datos está vacía. Es idempotente: si ya hay usuarios, no hace nada.
 *
 * Se usa tanto desde el endpoint POST /api/seed como desde el arranque del
 * servidor (ver lib/init-db.ts), para que un despliegue nuevo quede listo para
 * usar sin pasos manuales.
 */
export async function seedIfEmpty(): Promise<{ seeded: boolean }> {
  const [yaExiste] = await db.select().from(usuarios).limit(1);
  if (yaExiste) return { seeded: false };

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
