import L from "leaflet";
import { distanciaKm } from "@/lib/geo";

/** Rumbo (grados, 0 = norte, sentido horario) del punto A al punto B. */
function rumbo(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(bLng - aLng)) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLng - aLng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function flechaIcon(anguloDeg: number, color: string): L.DivIcon {
  // Flecha que apunta al norte por defecto; se rota `anguloDeg` (horario, como el rumbo).
  return L.divIcon({
    className: "tp-flecha-ruta",
    html: `<div style="transform: rotate(${anguloDeg}deg); width:16px; height:16px; display:flex; align-items:center; justify-content:center;">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M7 1 L12 11 L7 8.5 L2 11 Z" fill="${color}" stroke="white" stroke-width="1" stroke-linejoin="round" />
      </svg></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/**
 * Coloca marcadores de flecha a lo largo de una polilínea (cada ~`cadaMetros`),
 * apuntando en el sentido del recorrido, para indicar HACIA DÓNDE va la ruta.
 * Devuelve un `L.LayerGroup` con las flechas (para agregarlo/quitarlo del mapa).
 * CSP-safe: el SVG va inline, sin recursos externos.
 */
export function crearFlechasDireccion(
  latlngs: [number, number][],
  color: string,
  cadaMetros = 400,
): L.LayerGroup {
  const grupo = L.layerGroup();
  if (latlngs.length < 2) return grupo;
  let dist = 0;
  let next = cadaMetros * 0.5; // primera flecha a mitad del primer intervalo
  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = latlngs[i]!;
    const b = latlngs[i + 1]!;
    const segM = distanciaKm(a[0], a[1], b[0], b[1]) * 1000;
    if (segM <= 0) continue;
    const ang = rumbo(a[0], a[1], b[0], b[1]);
    while (next <= dist + segM) {
      const t = (next - dist) / segM;
      const lat = a[0] + t * (b[0] - a[0]);
      const lng = a[1] + t * (b[1] - a[1]);
      L.marker([lat, lng], { icon: flechaIcon(ang, color), interactive: false, keyboard: false }).addTo(grupo);
      next += cadaMetros;
    }
    dist += segM;
  }
  return grupo;
}
