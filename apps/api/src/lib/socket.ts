import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./logger";
import { allowedOrigins } from "./allowed-origins";

let io: Server | null = null;

// Misma lógica que clienteIp() (lib/client-ip.ts) pero para el handshake de
// Socket.IO (no hay un Request de Express aquí). Se repite en vez de compartir
// función porque las formas de "headers" difieren (Record<string,string|string[]>
// vs los getters de Express).
function ipDelSocket(socket: Socket): string {
  if (
    process.env["BEHIND_CLOUDFLARE"] === "true" &&
    process.env["CLOUDFLARE_ORIGIN_SECRET"]
  ) {
    const cf = socket.handshake.headers["cf-connecting-ip"];
    const valor = Array.isArray(cf) ? cf[0] : cf;
    if (valor?.trim()) return valor.trim();
  }
  return socket.handshake.address || "desconocida";
}

// Tope de conexiones WebSocket simultáneas por IP: el throttle de eventos ya
// existente frena el spam DESPUÉS de conectar, pero nada impedía que una misma
// IP abriera miles de conexiones (agotamiento de sockets/memoria). Van en un
// Map propio (no el de rate-limit.ts, que es por ventana de tiempo/HTTP; esto
// es un conteo de conexiones ACTIVAS que baja al desconectar).
const MAX_CONEXIONES_POR_IP = 30;
const conexionesPorIp = new Map<string, number>();

// Orígenes permitidos para el socket: en producción, la misma lista que usa CORS
// para la API (CORS_ORIGIN + orígenes del WebView de Capacitor, ver
// allowed-origins.ts); en desarrollo, cualquiera para no estorbar. La web
// same-origin no pasa por CORS.
function corsOrigin(): string[] | boolean {
  if (process.env["NODE_ENV"] !== "production") return true;
  return allowedOrigins();
}

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: corsOrigin(), methods: ["GET", "POST"] },
    // Endurecimiento anti-abuso:
    maxHttpBufferSize: 10_000,   // los mensajes del cliente son diminutos ({rutaId})
    pingTimeout: 20_000,         // corta conexiones zombi
    pingInterval: 25_000,
    connectTimeout: 10_000,      // no dejar handshakes colgados
  });

  // El socket es SOLO de difusión servidor→cliente para datos públicos del mapa.
  // Las posiciones de los buses NO se aceptan por aquí: el conductor las envía por
  // el endpoint REST autenticado (POST /buses/gps), que valida identidad y bus, y
  // ese handler es el único que emite "bus:ubicacion". Así un cliente no puede
  // falsear la ubicación de un bus conectándose al socket.
  io.on("connection", (socket) => {
    // Tope de conexiones simultáneas por IP (ver MAX_CONEXIONES_POR_IP arriba):
    // rechaza ANTES de registrar handlers si la IP ya tiene demasiadas abiertas.
    const ip = ipDelSocket(socket);
    const actuales = conexionesPorIp.get(ip) ?? 0;
    if (actuales >= MAX_CONEXIONES_POR_IP) {
      socket.disconnect(true);
      return;
    }
    conexionesPorIp.set(ip, actuales + 1);
    socket.on("disconnect", () => {
      const n = (conexionesPorIp.get(ip) ?? 1) - 1;
      if (n <= 0) conexionesPorIp.delete(ip);
      else conexionesPorIp.set(ip, n);
    });

    // Throttle por socket: frena a un cliente que spamee eventos (flood de capa 7).
    let ventana = Date.now();
    let eventos = 0;
    const permitido = (): boolean => {
      const ahora = Date.now();
      if (ahora - ventana > 10_000) { ventana = ahora; eventos = 0; }
      eventos++;
      if (eventos > 40) { socket.disconnect(true); return false; }
      return true;
    };

    socket.onAny(() => permitido());

    socket.on("subscribe_ruta", ({ rutaId }: { rutaId: number }) => {
      // Validar la entrada del cliente y acotar a una sola room a la vez (evita
      // que un cliente acumule miles de rooms).
      if (!Number.isInteger(rutaId) || rutaId <= 0) return;
      for (const room of socket.rooms) {
        if (room.startsWith("ruta_")) socket.leave(room);
      }
      socket.join(`ruta_${rutaId}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

/**
 * Emite un evento a todos los clientes sin reventar si Socket.IO aún no está
 * inicializado (p. ej. en tests o durante el arranque). Centraliza el patrón
 * try/catch que de otro modo se repetiría en cada handler que notifica cambios.
 *
 * Con `sala` definida, emite SOLO a esa room (p. ej. `ruta_5`) en vez de a todos
 * los clientes — clave para escalar: la posición de un bus llega únicamente a los
 * pasajeros que miran esa ruta, no a los miles conectados.
 */
export function emitirSeguro(evento: string, payload: unknown, sala?: string): void {
  try {
    const io = getIO();
    (sala ? io.to(sala) : io).emit(evento, payload);
  } catch (err) {
    // Best-effort: si Socket.IO aún no está listo (arranque/tests) no rompemos,
    // pero lo dejamos en logs de debug para no esconder fallos de sincronización.
    logger.debug({ err, evento }, "emit omitido (Socket.IO no inicializado)");
  }
}
