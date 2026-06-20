// ─── Constantes de marca / contacto TransPadilla ─────────────────────────────
// Punto único de verdad: cámbialos aquí y se reflejan en toda la app (Login,
// Pasajero, etc.). Para actualizar el WhatsApp basta tocar WHATSAPP_NUMERO.

export const WHATSAPP_NUMERO = "3144167656";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMERO}`;
export const INSTAGRAM_URL = "https://www.instagram.com/transpadilla.co";
export const TARIFA_COP = "$3.000";

// Opciones rápidas de novedad que el conductor puede reportar (panel Conductor).
export const NOVEDAD_OPCIONES: { label: string; texto: string }[] = [
  { label: "Tráfico", texto: "Tráfico — demora estimada" },
  { label: "Accidente", texto: "Accidente en la vía — espera obligatoria" },
  { label: "En reparación", texto: "Bus en reparación — demora" },
  { label: "Desvío", texto: "Desvío por vía cerrada" },
];

// Paleta para asignar color a las rutas nuevas (panel Admin).
export const COLORES: { label: string; value: string }[] = [
  { label: "Azul TransPadilla", value: "#1757C2" },
  { label: "Rojo",    value: "#e74c3c" },
  { label: "Verde",   value: "#2ecc71" },
  { label: "Naranja", value: "#f39c12" },
  { label: "Púrpura", value: "#9b59b6" },
  { label: "Cian",    value: "#1abc9c" },
  { label: "Rosa",    value: "#e91e63" },
  { label: "Amarillo TransPadilla", value: "#F5C200" },
];
