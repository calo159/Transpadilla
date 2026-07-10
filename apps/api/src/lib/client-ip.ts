import type { Request } from "express";

/**
 * IP real del cliente, usada para el rate limiting por IP.
 *
 * Detrás de Cloudflare la IP de origen que ve el servidor es la de Cloudflare,
 * no la del usuario; Cloudflare pone la real en la cabecera `CF-Connecting-IP`.
 *
 * Esa cabecera SOLO es confiable si la petición de verdad pasó por Cloudflare.
 * `BEHIND_CLOUDFLARE=true` por sí solo NO lo garantiza: si el origen (Render)
 * sigue siendo alcanzable directo, cualquiera puede golpearlo sin pasar por
 * Cloudflare y falsear `CF-Connecting-IP` (rotándolo en cada request evade
 * TODOS los rate-limits por IP). La garantía real la da
 * `CLOUDFLARE_ORIGIN_SECRET` (verificado en app.ts ANTES de llegar aquí, en
 * cada request a /api): solo si ese secreto está configurado Y coincidió, se
 * sabe que Cloudflare — no un atacante directo — puso la cabecera.
 */
export function clienteIp(req: Request): string {
  if (
    process.env["BEHIND_CLOUDFLARE"] === "true" &&
    process.env["CLOUDFLARE_ORIGIN_SECRET"]
  ) {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.trim()) return cf.trim();
  }
  return req.ip || req.socket.remoteAddress || "desconocida";
}
