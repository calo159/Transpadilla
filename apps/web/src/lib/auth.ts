export interface AuthUser {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
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

export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem("transpadilla_token", token);
  localStorage.setItem("transpadilla_user", JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem("transpadilla_token");
  localStorage.removeItem("transpadilla_user");
}

/**
 * Cierre de sesión REAL: avisa al backend para revocar el token (lista negra) y
 * luego limpia el estado local. Best-effort: si la red falla, igual limpia local.
 */
export async function cerrarSesion(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      const { apiFetch } = await import("./api");
      await apiFetch("/api/auth/cerrar-sesion", { method: "POST" });
    } catch {
      /* red caída: se limpia local de todas formas */
    }
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
