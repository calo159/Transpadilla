// Caché en memoria de TTL corto para lecturas públicas idénticas (GET /rutas,
// GET /buses). Una sola instancia de Node (Render) → caché consistente.
//
// Dos beneficios:
//  1. Sirve la respuesta cacheada mientras esté vigente (no toca la BD).
//  2. Deduplica peticiones concurrentes: si llegan N requests mientras se está
//     cargando, todas comparten la MISMA promesa (evita "thundering herd").

export interface CacheTtl<T> {
  obtener(): Promise<T>;
  invalidar(): void;
}

export function crearCacheTtl<T>(ttlMs: number, cargar: () => Promise<T>): CacheTtl<T> {
  let valor: T;
  let tiene = false;
  let expira = 0;
  let enVuelo: Promise<T> | null = null;

  return {
    obtener(): Promise<T> {
      const ahora = Date.now();
      if (tiene && ahora < expira) return Promise.resolve(valor);
      if (enVuelo) return enVuelo; // una carga ya está en curso → compartirla

      enVuelo = cargar()
        .then((v) => {
          valor = v;
          tiene = true;
          expira = Date.now() + ttlMs;
          return v;
        })
        .finally(() => { enVuelo = null; }); // los errores NO quedan cacheados
      return enVuelo;
    },
    invalidar(): void {
      tiene = false;
      expira = 0;
    },
  };
}
