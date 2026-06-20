import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

let io: Server | null = null;

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    socket.on("subscribe_ruta", ({ rutaId }: { rutaId: number }) => {
      socket.join(`ruta_${rutaId}`);
    });

    socket.on(
      "gps_update",
      (data: { busId: number; lat: number; lng: number; rutaId?: number }) => {
        io!.emit("bus:ubicacion", {
          busId: data.busId,
          lat: data.lat,
          lng: data.lng,
        });
      }
    );
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
