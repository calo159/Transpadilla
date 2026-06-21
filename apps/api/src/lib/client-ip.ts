import type { Request } from "express";

/**
 * IP real del cliente, usada para el rate limiting por IP.
 *
 * Detrás de Cloudflare la IP de origen que ve el servidor es la de Cloudflare,
 * no la del usuario; Cloudflare pone la real en la cabecera `CF-Connecting-IP`.
 * Solo se confía en esa cabecera cuando BEHIND_CLOUDFLARE=true (si no, un cliente
 * podría falsearla golpeando el origen directamente).
 */
export function clienteIp(req: Request): string {
  if (process.env["BEHIND_CLOUDFLARE"] === "true") {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.trim()) return cf.trim();
  }
  return req.ip || req.socket.remoteAddress || "desconocida";
}
