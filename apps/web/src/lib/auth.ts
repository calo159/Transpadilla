import { Capacitor } from "@capacitor/core";

export interface AuthUser {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
  /** Conductor: si ya aceptó la versión vigente de los Términos (Fase 3.4). */
  terminos_aceptados?: boolean;
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem("transpadilla_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

// Doble modo de sesión: en el navegador web, el backend fija una cookie httpOnly
// (`tp_session`) que el JS ni puede ni necesita leer — por eso aquí NO se guarda
// el token crudo en localStorage. En el APK de Capacitor, en cambio, SÍ hace falta
// (llama a la API con `Authorization: Bearer`, ver setAuthTokenGetter en App.tsx):
// una cookie httpOnly no viaja bien en el WebView nativo cross-origin. Detectar la
// plataforma con Capacitor.isNativePlatform() evita romper el APK mientras cierra
// la exposición del JWT a JS en la web (mitiga robo de sesión vía XSS).
export function setAuth(token: string, user: AuthUser): void {
  if (Capacitor.isNativePlatform()) {
    localStorage.setItem("transpadilla_token", token);
  }
  localStorage.setItem("transpadilla_user", JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem("transpadilla_token");
  localStorage.removeItem("transpadilla_user");
}

/**
 * Cierre de sesión REAL: avisa al backend para revocar el token (lista negra) y
 * luego limpia el estado local. Best-effort: si la red falla, igual limpia local.
 *
 * Se llama SIEMPRE (no solo si `getToken()` devuelve algo): en la web la sesión
 * viaja por la cookie httpOnly, que el JS no puede leer, así que `getToken()`
 * siempre da `null` ahí aunque sí haya sesión activa. El backend responde 401 si
 * de verdad no había sesión — se ignora en el catch, es inofensivo.
 */
export async function cerrarSesion(): Promise<void> {
  try {
    const { apiFetch } = await import("./api");
    await apiFetch("/api/auth/cerrar-sesion", { method: "POST" });
  } catch {
    /* red caída o sin sesión: se limpia local de todas formas */
  }
  clearAuth();
}

export function getToken(): string | null {
  return localStorage.getItem("transpadilla_token");
}

/**
 * Ruta de inicio que corresponde a cada rol. Se usa para los guards de las
 * páginas: cada usuario debe permanecer en su propio panel.
 *  - admin     → /admin
 *  - conductor → /conductor
 *  - pasajero / sin sesión → / (mapa público)
 */
export function homeForRol(rol: string | undefined | null): string {
  if (rol === "admin") return "/admin";
  if (rol === "conductor") return "/conductor";
  return "/";
}
