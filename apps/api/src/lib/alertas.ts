import { logger } from "./logger";

// Alertas por webhook (Slack/Discord/Telegram/etc.). Si ALERTA_WEBHOOK_URL no
// está definido, es no-op. Usa fetch global (Node 18+), sin dependencias → no
// afecta el bundle. Throttled para no inundar el canal ante ráfagas de errores.
const WEBHOOK = process.env["ALERTA_WEBHOOK_URL"];
const THROTTLE_MS = Number(process.env["ALERTA_THROTTLE_MS"] ?? 60_000);
let ultimoEnvio = 0;
// P1 ignora el throttle general a propósito (no debe perderse un error crítico
// real), pero sin tope alguien podía inundar el webhook repitiendo la MISMA
// petición que dispara un 500 (p. ej. una placa duplicada antes de que la ruta
// devolviera 409). Este cap acota cuántos P1 salen por ventana; el primero
// SIEMPRE sale de inmediato, los siguientes de la misma ráfaga se descartan.
const P1_MAX_POR_VENTANA = Number(process.env["ALERTA_P1_MAX_POR_VENTANA"] ?? 5);
let p1VentanaInicio = 0;
let p1Conteo = 0;

export const alertasHabilitadas = Boolean(WEBHOOK);

// Niveles de severidad (Fase 4.4). P1 es crítico e ignora el throttle (siempre
// sale); P2–P4 se throttlean para no inundar el canal. El escalamiento real
// (PagerDuty/Opsgenie/turnos) se configura sobre el webhook — ver docs/MONITOREO.md.
export type Severidad = "P1" | "P2" | "P3" | "P4";
const ETIQUETA: Record<Severidad, string> = {
  P1: "🔴 P1 (crítico)",
  P2: "🟠 P2 (alto)",
  P3: "🟡 P3 (medio)",
  P4: "⚪ P4 (bajo)",
};

/**
 * Envía una alerta al webhook (best-effort). No-op si no hay webhook. P1 siempre
 * se envía; P2–P4 respetan el throttle para no inundar el canal.
 */
export function notificarAlerta(texto: string, sev: Severidad = "P2"): void {
  if (!WEBHOOK) return;
  const ahora = Date.now();
  if (sev === "P1") {
    if (ahora - p1VentanaInicio > THROTTLE_MS) { p1VentanaInicio = ahora; p1Conteo = 0; }
    p1Conteo++;
    if (p1Conteo > P1_MAX_POR_VENTANA) return; // tope de la ventana alcanzado
  } else {
    if (ahora - ultimoEnvio < THROTTLE_MS) return;
    ultimoEnvio = ahora;
  }

  const mensaje = `[${ETIQUETA[sev]}] ${texto}`;
  void fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // "content"/"text" cubren los formatos de Discord y Slack respectivamente.
    body: JSON.stringify({ content: mensaje, text: mensaje }),
  }).catch((err) => logger.debug({ err }, "No se pudo enviar la alerta al webhook"));
}
