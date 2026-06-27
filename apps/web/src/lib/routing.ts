import { OSRM_URL } from "./map-config";

interface StopCoord {
  latitud: number;
  longitud: number;
}

export async function fetchStreetRoute(
  paradas: StopCoord[]
): Promise<[number, number][]> {
  if (paradas.length < 2) {
    return paradas.map((p) => [p.latitud, p.longitud]);
  }
  try {
    const coords = paradas
      .map((p) => `${p.longitud},${p.latitud}`)
      .join(";");
    const url = `${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM error");
    const data = (await res.json()) as {
      routes: Array<{ geometry: { coordinates: [number, number][] } }>;
    };
    const geoCoords = data.routes[0]!.geometry.coordinates;
    return geoCoords.map(([lng, lat]) => [lat, lng]);
  } catch {
    return paradas.map((p) => [p.latitud, p.longitud]);
  }
}
