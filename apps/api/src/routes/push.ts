import { Router } from "express";
import { pool } from "@workspace/db";
import { pushHabilitado, clavePublicaVapid } from "../lib/push";
import { hostEndpointValido } from "../lib/push-util";
import { rateLimit } from "../middleware/rate-limit";

// Suscripción a notificaciones Web Push. PÚBLICO: el pasajero no tiene cuenta;
// se identifica por el endpoint único de su suscripción del navegador.
const router = Router();

// Límite propio (además del global): estos endpoints son públicos y escriben
// en la BD — sin esto, un atacante podría inflar suscripciones_push con
// endpoints falsos al ritmo generoso del límite global del mapa.
const pushLimiter = rateLimit({
  ventanaMs: 60_000,
  max: 10,
  mensaje: "Demasiados cambios de notificaciones. Espera un minuto.",
});

router.get("/push/clave-publica", (_req, res) => {
  res.json({ habilitado: pushHabilitado, clave: clavePublicaVapid });
});

router.post("/push/suscribir", pushLimiter, async (req, res) => {
  const { subscription, rutas } = req.body as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    rutas?: unknown;
  };
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "Suscripción inválida" });
    return;
  }
  // Tamaños razonables (los endpoints reales de FCM/Mozilla rondan 150–400
  // caracteres) y el host debe ser un servicio de push real (nunca lo escribe
  // el usuario a mano) — corta basura, payloads inflados, y el SSRF ciego de
  // apuntar `webpush.sendNotification` (que corre en el servidor) a un host
  // interno o una IP arbitraria.
  const esProduccion = process.env["NODE_ENV"] === "production";
  if (
    endpoint.length > 600 || p256dh.length > 256 || auth.length > 128 ||
    !hostEndpointValido(endpoint, esProduccion)
  ) {
    res.status(400).json({ error: "Suscripción inválida" });
    return;
  }
  // Sanea la lista de rutas (enteros positivos, máx 50).
  const rutasArr = Array.isArray(rutas)
    ? rutas.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50)
    : [];

  await pool.query(
    `INSERT INTO suscripciones_push (endpoint, p256dh, auth, rutas)
       VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (endpoint)
       DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, rutas = EXCLUDED.rutas`,
    [endpoint, p256dh, auth, JSON.stringify(rutasArr)],
  );
  res.json({ ok: true });
});

router.post("/push/desuscribir", pushLimiter, async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (endpoint && typeof endpoint === "string" && endpoint.length <= 600) {
    await pool.query(`DELETE FROM suscripciones_push WHERE endpoint = $1`, [endpoint]);
  }
  res.json({ ok: true });
});

export default router;
