import { apiFetch } from "./api";
import { fetchStreetRoute } from "./routing";
import { distanciaKm } from "./geo";
import type { Ruta } from "@workspace/api-client";

// Simulador de tráfico para el admin: crea buses TEMPORALES (placa "SIM-…") y
// los mueve por el trazado real de calles de una ruta (mismo OSRM que dibuja
// el mapa), a velocidad de bus urbano y repartidos parejo — para ver cómo se
// vería la app con varios buses circulando a la vez, sin depender de choferes
// reales. Vive en el módulo (no en el componente) para sobrevivir a que el
// admin cambie de pestaña dentro del panel (Dashboard se desmonta al salir).
//
// Es deliberadamente best-effort y no de nivel producción: si se cierra la
// pestaña del navegador sin apretar "Detener", los buses SIM quedan activos en
// la BD (se pueden borrar a mano desde la pestaña Buses). Por eso, al iniciar,
// primero limpia cualquier bus "SIM-" que haya quedado de una sesión anterior.

interface BusSimulado {
  id: number;
  coords: [number, number][];
  acumuladoM: number[];
  longitudTotalM: number;
  sM: number; // posición actual a lo largo del recorrido, en metros
  velocidadKmh: number;
}

const INTERVALO_MS = 2000;
const BUSES_POR_RUTA = 5;
const RUTAS_A_SIMULAR = 2;
const VELOCIDAD_MIN_KMH = 18;
const VELOCIDAD_MAX_KMH = 32;
const PLACA_PREFIJO = "SIM-";

let intervalId: ReturnType<typeof setInterval> | null = null;
let busesSimulados: BusSimulado[] = [];
let escuchas: Array<() => void> = [];

export function simulacionActiva(): boolean {
  return intervalId !== null;
}

/** Suscribe un callback a los cambios de estado (activa/inactiva). Devuelve el unsubscribe. */
export function suscribirseSimulacion(cb: () => void): () => void {
  escuchas.push(cb);
  return () => { escuchas = escuchas.filter((x) => x !== cb); };
}

function notificar(): void {
  escuchas.forEach((cb) => cb());
}

function construirAcumulado(coords: [number, number][]): { acumuladoM: number[]; totalM: number } {
  const acumuladoM = [0];
  for (let i = 1; i < coords.length; i++) {
    const [aLa, aLo] = coords[i - 1]!;
    const [bLa, bLo] = coords[i]!;
    acumuladoM.push(acumuladoM[i - 1]! + distanciaKm(aLa, aLo, bLa, bLo) * 1000);
  }
  return { acumuladoM, totalM: acumuladoM[acumuladoM.length - 1] ?? 0 };
}

/** Punto interpolado a `sM` metros a lo largo de `coords` (con wrap-around). */
function puntoEn(sM: number, coords: [number, number][], acumuladoM: number[], totalM: number): [number, number] {
  if (totalM <= 0 || coords.length === 0) return coords[0] ?? [0, 0];
  const s = ((sM % totalM) + totalM) % totalM;
  let i = 1;
  while (i < acumuladoM.length && acumuladoM[i]! < s) i++;
  i = Math.min(i, acumuladoM.length - 1);
  const dPrev = acumuladoM[i - 1]!;
  const dSeg = acumuladoM[i]! - dPrev;
  const t = dSeg > 0 ? (s - dPrev) / dSeg : 0;
  const [aLa, aLo] = coords[i - 1]!;
  const [bLa, bLo] = coords[i]!;
  return [aLa + t * (bLa - aLa), aLo + t * (bLo - aLo)];
}

async function limpiarBusesSimuladosPrevios(): Promise<void> {
  const res = await apiFetch("/api/buses");
  if (!res.ok) return;
  const todos = (await res.json()) as Array<{ id: number; placa: string }>;
  const sobrantes = todos.filter((b) => b.placa.startsWith(PLACA_PREFIJO));
  await Promise.all(sobrantes.map((b) => apiFetch(`/api/buses/${b.id}`, { method: "DELETE" }).catch(() => {})));
}

export async function iniciarSimulacion(rutas: Ruta[]): Promise<{ ok: boolean; error?: string }> {
  if (simulacionActiva()) return { ok: false, error: "Ya hay una simulación en curso." };

  const candidatas = rutas.filter((r) => r.paradas.length >= 2).slice(0, RUTAS_A_SIMULAR);
  if (candidatas.length < RUTAS_A_SIMULAR) {
    return { ok: false, error: `Se necesitan al menos ${RUTAS_A_SIMULAR} rutas con paradas para simular.` };
  }

  await limpiarBusesSimuladosPrevios();

  const nuevos: BusSimulado[] = [];
  try {
    for (const ruta of candidatas) {
      // Desempate estable por asignacion_id si dos paradas quedaran con el mismo orden.
      const paradasOrden = ruta.paradas.slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || (a.asignacion_id ?? 0) - (b.asignacion_id ?? 0));
      // Cierra el circuito (vuelta a la primera parada) para un recorrido continuo,
      // igual que el mapa trata las rutas como circuitos cerrados (ver lib/geo.ts).
      const coords = await fetchStreetRoute([...paradasOrden, paradasOrden[0]!]);
      const { acumuladoM, totalM } = construirAcumulado(coords);

      for (let i = 0; i < BUSES_POR_RUTA; i++) {
        const placa = `${PLACA_PREFIJO}${ruta.id}-${i + 1}`;
        const res = await apiFetch("/api/buses", {
          method: "POST",
          body: JSON.stringify({ placa, ruta_id: ruta.id }),
        });
        if (!res.ok) throw new Error(`No se pudo crear el bus simulado ${placa}`);
        const bus = (await res.json()) as { id: number };
        nuevos.push({
          id: bus.id,
          coords,
          acumuladoM,
          longitudTotalM: totalM,
          // Repartidos parejo a lo largo del recorrido (no amontonados).
          sM: (totalM / BUSES_POR_RUTA) * i,
          velocidadKmh: VELOCIDAD_MIN_KMH + Math.random() * (VELOCIDAD_MAX_KMH - VELOCIDAD_MIN_KMH),
        });
      }
    }
  } catch (err) {
    // Si algo falló a medio camino, no dejar buses fantasma creados.
    await Promise.all(nuevos.map((b) => apiFetch(`/api/buses/${b.id}`, { method: "DELETE" }).catch(() => {})));
    return { ok: false, error: err instanceof Error ? err.message : "Error al crear los buses simulados." };
  }

  busesSimulados = nuevos;
  intervalId = setInterval(() => { void tick(); }, INTERVALO_MS);
  notificar();
  return { ok: true };
}

async function tick(): Promise<void> {
  // Si se detuvo la simulación (intervalId=null) no seguir: evita que un tick que
  // ya estaba en vuelo mande pings tardíos que reactiven buses que están por borrarse.
  if (intervalId === null) return;
  const dtHoras = INTERVALO_MS / 1000 / 3600;
  await Promise.all(
    busesSimulados.map(async (b) => {
      b.sM += b.velocidadKmh * 1000 * dtHoras;
      const [lat, lng] = puntoEn(b.sM, b.coords, b.acumuladoM, b.longitudTotalM);
      // Re-chequeo por si se detuvo mientras se calculaba la posición de otros buses.
      if (intervalId === null) return;
      try {
        await apiFetch("/api/buses/gps", {
          method: "POST",
          body: JSON.stringify({ bus_id: b.id, lat, lng, velocidad: Math.round(b.velocidadKmh) }),
        });
      } catch {
        // Best-effort: si un ping falla, el próximo tick sigue el recorrido igual.
      }
    }),
  );
}

export async function detenerSimulacion(): Promise<void> {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  const idsBorrar = busesSimulados.map((b) => b.id);
  busesSimulados = [];
  notificar();
  await Promise.all(idsBorrar.map((id) => apiFetch(`/api/buses/${id}`, { method: "DELETE" }).catch(() => {})));
}
