import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

let io: Server | null = null;

// Orígenes permitidos para el socket: en producción, mismo origen (o la lista
// CORS_ORIGIN si se define); en desarrollo, cualquiera para no estorbar.
function corsOrigin(): string[] | boolean {
  if (process.env["NODE_ENV"] !== "production") return true;
  const lista = (process.env["CORS_ORIGIN"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.length > 0 ? lista : false;
}

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: corsOrigin(), methods: ["GET", "POST"] },
  });

  // El socket es SOLO de difusión servidor→cliente para datos públicos del mapa.
  // Las posiciones de los buses NO se aceptan por aquí: el conductor las envía por
  // el endpoint REST autenticado (POST /buses/gps), que valida identidad y bus, y
  // ese handler es el único que emite "bus:ubicacion". Así un cliente no puede
  // falsear la ubicación de un bus conectándose al socket.
  io.on("connection", (socket) => {
    socket.on("subscribe_ruta", ({ rutaId }: { rutaId: number }) => {
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
  } catch {
    // Socket.IO todavía no está listo: la emisión es best-effort, se ignora.
  }
}
