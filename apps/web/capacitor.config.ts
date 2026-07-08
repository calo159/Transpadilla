import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuración base de Capacitor para empaquetar TransPadilla como app nativa
 * de Android (principalmente para el conductor).
 *
 * El APK empaqueta el build de producción LOCAL (`webDir: "dist/public"`), minificado
 * y sin source maps. NO se usa `server.url`.
 *
 * ⚠️ SEGURIDAD — NO agregar `server.url`:
 *   - Jamás apuntarlo a un dev server de Vite (p. ej. http://<IP>:5173). El dev server
 *     sirve los ARCHIVOS FUENTE (`/src/*.tsx`) en vivo → quedarían visibles en DevTools/
 *     inspección del WebView. Ese es exactamente el filtrado de código que hay que evitar.
 *   - El APK que se distribuye debe ser el **release** firmado (minificado, `debuggable=false`,
 *     WebView debug off en MainActivity), construido tras `vite build` + `npx cap sync android`.
 *   Ver docs/CAPACITOR-ANDROID.md.
 */
const config: CapacitorConfig = {
  appId: "co.transpadilla.app",
  appName: "TransPadilla",
  webDir: "dist/public",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      backgroundColor: "#1B3B6F",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
