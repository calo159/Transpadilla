// Tipos de dominio compartidos entre páginas y hooks.

/** Posición en vivo de un bus, tal como llega por Socket.IO ("bus:ubicacion"). */
export interface BusLocation {
  busId: number;
  lat: number;
  lng: number;
  velocidad?: number;
  rutaId?: number;
}

/** Reporte de novedad de un bus, recibido por Socket.IO ("bus:novedad"). */
export interface Novedad {
  busId: number;
  novedad: string;
  placa?: string;
  rutaId?: number;
}

/** Conductor tal como lo devuelve el API en el panel Admin (GET /conductores). */
export interface Conductor {
  id: number;
  nombre: string;
  correo: string;
  identificacion: string | null;
}
