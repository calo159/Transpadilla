import * as Sentry from "@sentry/node";

// Captura de errores opcional. Si SENTRY_DSN no está definido, todo es no-op:
// la app arranca y funciona igual, sin enviar nada. Se inicializa al importar
// este módulo (debe importarse lo más temprano posible en el arranque).
const dsn = process.env["SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    // Sin trazas de performance por defecto (solo errores) para no gastar cuota.
    tracesSampleRate: 0,
  });
}

export const sentryActivo = !!dsn;

/** Envía un error a Sentry si está configurado; si no, no hace nada. */
export function capturarError(err: unknown): void {
  if (dsn) Sentry.captureException(err);
}
