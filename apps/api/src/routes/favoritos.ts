import { Router } from "express";
import { pool } from "@workspace/db";
import { rateLimit } from "../middleware/rate-limit";

// Registro de favoritos del pasajero. PÚBLICO: el pasajero no tiene cuenta; se
// identifica por un id anónimo generado en su navegador (localStorage). Sirve de
// base para el reporte "ruta más solicitada" (COUNT DISTINCT cliente_id por ruta).
const router = Router();

// Límite propio: endpoint público que escribe en la BD. Sin esto, un bot podría
// inflar la tabla con clientes falsos. La UI del pasajero lo llama pocas veces
// (al montar y al cambiar sus favoritos).
const favoritosLimiter = rateLimit({
  ventanaMs: 60_000,
  max: 10, // los clientes legítimos llaman poco (al montar y al cambiar favoritos)
  mensaje: "Demasiados cambios de favoritos. Espera un minuto.",
});

// Reemplaza TODO el conjunto de favoritos de un cliente. Idempotente: sirve para
// agregar, quitar y para el backfill inicial de los favoritos que ya estaban en
// el localStorage del pasajero.
router.post("/favoritos", favoritosLimiter, async (req, res) => {
  const { cliente_id, rutas } = req.body as { cliente_id?: unknown; rutas?: unknown };

  // cliente_id: cadena de 8–64 chars (un UUID entra de sobra). Corta basura.
  if (typeof cliente_id !== "string" || cliente_id.length < 8 || cliente_id.length > 64) {
    res.status(400).json({ error: "cliente_id inválido" });
    return;
  }
  // Sanea la lista de rutas (enteros positivos, únicos, máx 50).
  const rutasArr = Array.isArray(rutas)
    ? [...new Set(rutas.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50)
    : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM favoritos WHERE cliente_id = $1`, [cliente_id]);
    if (rutasArr.length > 0) {
      // INSERT vía SELECT contra `rutas`: ignora ids inexistentes (p. ej. una ruta
      // borrada) sin violar la FK, y el ON CONFLICT cubre duplicados.
      await client.query(
        `INSERT INTO favoritos (cliente_id, ruta_id)
           SELECT $1, r.id FROM rutas r WHERE r.id = ANY($2::int[])
         ON CONFLICT (cliente_id, ruta_id) DO NOTHING`,
        [cliente_id, rutasArr],
      );
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    // Best-effort: no rompas la experiencia del pasajero por esto.
    res.status(500).json({ error: "No se pudo guardar" });
    return;
  } finally {
    client.release();
  }
  res.json({ ok: true });
});

export default router;
