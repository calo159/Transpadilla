import webpush from "web-push";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { haversineMetros, velEfectiva, precomputarCircuito, posEnCircuitoPre, distanciaAdelanteM } from "./geo";

export { suscripcionesParaRuta } from "./push-util";

// Web Push (VAPID). Si faltan las claves, TODO queda deshabilitado (no-op) y la
// app funciona igual. Genera claves con: npx web-push generate-vapid-keys
const PUBLIC = process.env["VAPID_PUBLIC_KEY"];
const PRIVATE = process.env["VAPID_PRIVATE_KEY"];
const SUBJECT = process.env["VAPID_SUBJECT"] ?? "mailto:soporte@transpadilla.co";

export const pushHabilitado = Boolean(PUBLIC && PRIVATE);
export const clavePublicaVapid = PUBLIC ?? null;

if (pushHabilitado) {
  webpush.setVapidDetails(SUBJECT, PUBLIC!, PRIVATE!);
  logger.info("Web Push habilitado (VAPID configurado)");
}

export interface PushPayload { titulo: string; cuerpo: string; url?: string }

/** Envía una notificación push a todos los suscriptores que siguen una ruta. */
export async function enviarPushARuta(rutaId: number, payload: PushPayload): Promise<void> {
  if (!pushHabilitado) return;
  const { rows } = await pool.query(
    `SELECT id, endpoint, p256dh, auth FROM suscripciones_push WHERE rutas @> $1::jsonb`,
    [JSON.stringify([rutaId])],
  );
  const data = JSON.stringify(payload);
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          data,
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // 404/410 = suscripción muerta → limpiarla.
        if (code === 404 || code === 410) {
          await pool.query(`DELETE FROM suscripciones_push WHERE id = $1`, [s.id]).catch(() => {});
        } else {
          logger.debug({ code }, "Envío push falló");
        }
      }
    }),
  );
}

// ── Proximidad (bus cerca) — con throttle para no spamear ────────────────────
const UMBRAL_MIN = Number(process.env["PUSH_UMBRAL_MIN"] ?? 5);
const THROTTLE_MS = Number(process.env["PUSH_THROTTLE_MS"] ?? 5 * 60_000);
const ultimaProx = new Map<number, number>(); // busId → timestamp del último aviso

/**
 * Best-effort: si un bus está a ≤ UMBRAL_MIN de alguna parada de su ruta y hay
 * suscriptores para esa ruta, envía un aviso (throttled por bus). Se llama
 * fire-and-forget desde el handler de GPS para no frenar la respuesta.
 */
export async function notificarProximidad(
  busId: number,
  rutaId: number | null,
  lat: number,
  lng: number,
  velocidad: number | null,
): Promise<void> {
  if (!pushHabilitado || rutaId == null) return;
  const ahora = Date.now();
  if ((ultimaProx.get(busId) ?? 0) + THROTTLE_MS > ahora) return;

  try {
    const { rows: [conteo] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM suscripciones_push WHERE rutas @> $1::jsonb`,
      [JSON.stringify([rutaId])],
    );
    if (!conteo || conteo.n === 0) return;

    // Paradas ORDENADAS por el sentido del recorrido (circuito cerrado).
    const paradas = await pool.query(
      `SELECT p.latitud, p.longitud FROM ruta_paradas rp JOIN paradas p ON p.id = rp.parada_id
       WHERE rp.ruta_id = $1 ORDER BY rp.orden ASC`,
      [rutaId],
    );
    if (paradas.rows.length === 0) return;
    const coords = paradas.rows.map((p) => ({ latitud: p.latitud as number, longitud: p.longitud as number }));

    // Distancia POR DELANTE (en el sentido de circulación) al próximo paradero: así el
    // aviso dispara cuando el bus VIENE hacia sus paradas, no cuando acaba de pasarlas.
    // Si no se puede proyectar sobre el circuito, se cae al mínimo en línea recta.
    let minMetros: number;
    const circ = precomputarCircuito(coords);
    const pos = circ ? posEnCircuitoPre(lat, lng, circ) : null;
    if (pos && circ) {
      // Posición `s` de cada parada = el acumulado ya calculado del circuito
      // (sin el vértice de cierre), en vez de reconstruirlo aparte.
      const paradasS = circ.acum.slice(0, coords.length);
      minMetros = Math.min(...paradasS.map((sParada) => distanciaAdelanteM(pos.s, sParada, pos.L)).filter((d) => d > 1));
    } else {
      minMetros = Math.min(...coords.map((p) => haversineMetros(lat, lng, p.latitud, p.longitud)));
    }
    const minutos = (minMetros / 1000) / velEfectiva(velocidad) * 60;
    if (minutos <= UMBRAL_MIN) {
      ultimaProx.set(busId, ahora);
      await enviarPushARuta(rutaId, {
        titulo: "Tu bus está cerca",
        cuerpo: `Un bus de tu ruta está a ~${Math.max(1, Math.round(minutos))} min de una parada.`,
        url: "/",
      });
    }
  } catch (err) {
    logger.debug({ err }, "notificarProximidad falló");
  }
}
