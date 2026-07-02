import { logger } from "./logger";

// Alertas por webhook (Slack/Discord/Telegram/etc.). Si ALERTA_WEBHOOK_URL no
// está definido, es no-op. Usa fetch global (Node 18+), sin dependencias → no
// afecta el bundle. Throttled para no inundar el canal ante ráfagas de errores.
const WEBHOOK = process.env["ALERTA_WEBHOOK_URL"];
const THROTTLE_MS = Number(process.env["ALERTA_THROTTLE_MS"] ?? 60_000);
let ultimoEnvio = 0;

export const alertasHabilitadas = Boolean(WEBHOOK);

/** Envía una alerta al webhook (best-effort, throttled). No-op si no hay webhook. */
export function notificarAlerta(texto: string): void {
  if (!WEBHOOK) return;
  const ahora = Date.now();
  if (ahora - ultimoEnvio < THROTTLE_MS) return;
  ultimoEnvio = ahora;

  void fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // "content"/"text" cubren los formatos de Discord y Slack respectivamente.
    body: JSON.stringify({ content: texto, text: texto }),
  }).catch((err) => logger.debug({ err }, "No se pudo enviar la alerta al webhook"));
}
