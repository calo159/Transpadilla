import { getToken } from "@/lib/auth";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

/**
 * `fetch` hacia la API con el token de sesión inyectado automáticamente en la
 * cabecera `Authorization`, y `Content-Type: application/json` cuando hay body.
 *
 * Cuando VITE_API_URL está definido (APK Capacitor), prepone la URL absoluta del
 * backend a cualquier ruta relativa (/api/...) para que funcione sin servidor local.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = API_BASE && path.startsWith("/") ? `${API_BASE}${path}` : path;
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // Explícito (aunque "same-origin" ya es el default de fetch): consistente con
  // custom-fetch.ts (el cliente generado), que sí lo fija. Es lo que permite que
  // la cookie de sesión httpOnly viaje en las llamadas same-origin de la web.
  return fetch(url, { ...options, headers, credentials: options.credentials ?? "same-origin" });
}
