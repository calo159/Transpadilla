import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuración base de Capacitor para empaquetar TransPadilla como app nativa
 * de Android (principalmente para el conductor).
 *
 * Estrategia inicial (la más simple): la app actúa como "shell nativo" del sitio
 * ya desplegado (server.url). Así siempre muestra la última versión y las rutas
 * /api y /socket.io funcionan igual que en la web. Ideal para tener un APK
 * instalable rápido.
 *
 * Fase 2 (GPS en segundo plano real): se cambia a empaquetar la app localmente
 * (quitar server.url, usar webDir) e integrar un plugin de geolocalización en
 * segundo plano. Ver CAPACITOR-ANDROID.md.
 */
const config: CapacitorConfig = {
  appId: "co.transpadilla.app",
  appName: "TransPadilla",
  webDir: "dist/public",
  server: {
    // Shell del sitio desplegado. Para el build local (fase 2) se comenta esto.
    url: "https://transpadilla-web.onrender.com",
    cleartext: false,
  },
};

export default config;
