import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./logger";

let io: Server | null = null;

// Orígenes permitidos para el socket: en producción, la lista CORS_ORIGIN más los
// orígenes del WebView de Capacitor (el APK carga el bundle local → cross-origin);
// en desarrollo, cualquiera para no estorbar. La web same-origin no pasa por CORS.
function corsOrigin(): string[] | boolean {
  if (process.env["NODE_ENV"] !== "production") return true;
  const lista = (process.env["CORS_ORIGIN"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...lista, "https://localhost", "http://localhost", "capacitor://localhost"];
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
 */
export function emitirSeguro(evento: string, payload: unknown): void {
  try {
    getIO().emit(evento, payload);
  } catch (err) {
    // Best-effort: si Socket.IO aún no está listo (arranque/tests) no rompemos,
    // pero lo dejamos en logs de debug para no esconder fallos de sincronización.
    logger.debug({ err, evento }, "emit omitido (Socket.IO no inicializado)");
  }
}
