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

export function getToken(): string | null {
  return localStorage.getItem("transpadilla_token");
}
