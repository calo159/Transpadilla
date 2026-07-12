// Orígenes de terceros permitidos para llamar a esta API: el WebView del APK
// (Capacitor carga el bundle localmente, así que su origen no es el dominio del
// sitio) más los que se agreguen por entorno (CORS_ORIGIN, separado por comas).
// Se reutiliza en CORS (app.ts) y en el chequeo anti-CSRF por Origin (auth.ts):
// ambos necesitan la misma lista de "quién más, aparte de este mismo sitio,
// puede llamar a la API con credenciales".
const CAPACITOR_ORIGINS = ["https://localhost", "capacitor://localhost"];

export function allowedOrigins(): string[] {
  const desdeEnv = (process.env["CORS_ORIGIN"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...desdeEnv, ...CAPACITOR_ORIGINS];
}
