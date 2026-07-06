/**
 * Lista local de contraseñas/patrones demasiado comunes (Fase 1.4 de PLAN.md).
 * Deliberadamente NO se usa una API externa (ej. HaveIBeenPwned) en el flujo de
 * login/registro: evita latencia de red y un punto de fallo externo en un paso
 * crítico. La comparación es case-insensitive.
 */
export const PASSWORDS_COMUNES: ReadonlySet<string> = new Set(
  [
    "password", "password1", "password123", "12345678", "123456789", "1234567890",
    "qwerty123", "qwertyuiop", "administrador", "administrator", "contraseña",
    "contrasena", "contrasena123", "iloveyou", "welcome123", "letmein123",
    "trustno1", "abc123456", "123123123", "111111111", "000000000",
    "admin12345", "transpadilla", "transpadilla123", "riohacha123",
    "colombia123", "guajira123", "cambiar123", "cambiame123", "usuario123",
    "prueba1234", "test123456", "temporal123", "bienvenido123",
    "cambiar2024!", "transpadilla2024!", "admin2024!",
  ].map((p) => p.toLowerCase()),
);

/** true si la contraseña (normalizada) está en la lista de comunes. */
export function esPasswordComun(password: string): boolean {
  return PASSWORDS_COMUNES.has(password.trim().toLowerCase());
}
