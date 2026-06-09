import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usuarios, rutas, paradas, ruta_paradas, buses } from "@workspace/db";

const router = Router();

router.post("/seed", async (_req, res) => {
  const [adminExists] = await db
    .select()
    .from(usuarios)
    .limit(1);
  if (adminExists) {
    res.json({ mensaje: "Base de datos ya inicializada" });
    return;
  }

  const adminHash = await bcrypt.hash("admin123", 10);
  const conductorHash = await bcrypt.hash("conductor123", 10);
  const pasajeroHash = await bcrypt.hash("pasajero123", 10);

  const [admin, conductor] = await db
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
    { nombre: "Terminal de Transporte", latitud: 11.5350, longitud: -72.9050 },
    { nombre: "Parque Simón Bolívar", latitud: 11.5444, longitud: -72.9072 },
    { nombre: "Hospital Nuestra Señora de los Remedios", latitud: 11.5490, longitud: -72.9100 },
    { nombre: "Mercado Central", latitud: 11.5420, longitud: -72.9060 },
    { nombre: "Muelle Turístico", latitud: 11.5500, longitud: -72.9180 },
    { nombre: "Aeropuerto Almirante Padilla", latitud: 11.5250, longitud: -72.9260 },
    { nombre: "Barrio La Esperanza", latitud: 11.5580, longitud: -72.8990 },
  ];

  const insertedParadas = await db
    .insert(paradas)
    .values(paradaData)
    .returning();

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

  if (ruta1 && conductor) {
    await db.insert(buses).values([
      { placa: "GUA-001", ruta_id: ruta1.id, conductor_id: conductor.id, estado: "inactivo" },
      { placa: "GUA-002", ruta_id: ruta2.id, estado: "inactivo" },
      { placa: "GUA-003", ruta_id: ruta3.id, estado: "inactivo" },
    ]);
  }

  res.json({ mensaje: "Datos de prueba creados exitosamente" });
});

export default router;
