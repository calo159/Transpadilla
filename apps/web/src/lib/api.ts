import { getToken } from "@/lib/auth";

/**
 * `fetch` hacia la API con el token de sesión inyectado automáticamente en la
 * cabecera `Authorization`, y `Content-Type: application/json` cuando hay body.
 *
 * Centraliza el patrón que antes se repetía en cada página (montar las cabeceras
 * de auth a mano). Devuelve la `Response` cruda para que cada llamada decida cómo
 * tratar `res.ok` y el cuerpo. Para las lecturas del mapa se siguen usando los
 * hooks generados de `@workspace/api-client`; esto es para las mutaciones que no
 * pasan por esos hooks.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(path, { ...options, headers });
}
