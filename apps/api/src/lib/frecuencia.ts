// Estimación de la FRECUENCIA de una ruta (headway = intervalo entre buses) a
// partir del historial de posiciones. Es un PROXY del "tiempo de espera": no hay
// dato real de espera, así que se aproxima con cada cuánto "aparece" un bus.
//
// Criterio: por ruta, se agrupan las muestras por bus; los timestamps de cada bus
// se parten en "apariciones" (una nueva aparición empieza si pasó más de
// `gapUmbralMin` sin ver a ese bus). Se juntan las horas de inicio de TODAS las
// apariciones de la ruta, se ordenan, y el headway = mediana de los intervalos
// entre apariciones consecutivas. El tiempo de espera ≈ headway / 2.

export interface MuestraFrec {
  rutaId: number;
  busId: number;
  t: number; // epoch en milisegundos
}

export interface FrecuenciaRuta {
  ruta_id: number;
  headway_min: number | null; // null = datos insuficientes
  apariciones: number;
}

export interface ResultadoFrecuencia {
  global_headway_min: number | null;
  rutas: FrecuenciaRuta[];
}

function mediana(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function calcularFrecuencia(muestras: MuestraFrec[], gapUmbralMin = 5): ResultadoFrecuencia {
  const gapMs = gapUmbralMin * 60_000;

  // Agrupar por ruta → por bus.
  const porRuta = new Map<number, Map<number, number[]>>();
  for (const m of muestras) {
    let buses = porRuta.get(m.rutaId);
    if (!buses) { buses = new Map(); porRuta.set(m.rutaId, buses); }
    const arr = buses.get(m.busId);
    if (arr) arr.push(m.t); else buses.set(m.busId, [m.t]);
  }

  const rutas: FrecuenciaRuta[] = [];
  for (const [rutaId, buses] of porRuta) {
    // Horas de inicio de cada "aparición" de cada bus.
    const inicios: number[] = [];
    for (const tiempos of buses.values()) {
      tiempos.sort((a, b) => a - b);
      let prev = -Infinity;
      for (const t of tiempos) {
        if (t - prev > gapMs) inicios.push(t); // nueva aparición
        prev = t;
      }
    }
    inicios.sort((a, b) => a - b);
    const apariciones = inicios.length;
    let headway_min: number | null = null;
    if (apariciones >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < inicios.length; i++) gaps.push(inicios[i]! - inicios[i - 1]!);
      headway_min = Math.round((mediana(gaps) / 60_000) * 10) / 10;
    }
    rutas.push({ ruta_id: rutaId, headway_min, apariciones });
  }

  rutas.sort((a, b) => a.ruta_id - b.ruta_id);
  const validos = rutas.map((r) => r.headway_min).filter((h): h is number => h !== null);
  const global_headway_min = validos.length ? Math.round(mediana(validos) * 10) / 10 : null;
  return { global_headway_min, rutas };
}
