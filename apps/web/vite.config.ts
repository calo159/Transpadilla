import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

const port = Number(process.env.PORT ?? "5173");
const basePath = process.env.BASE_PATH ?? "/";
// HTTPS local (necesario para que el GPS del conductor funcione en el celular).
// Se activa con la variable de entorno HTTPS=true (ver iniciar-https.ps1).
const useHttps = process.env.HTTPS === "true";

export default defineConfig(({ mode }) => ({
  base: basePath,
  // En producción elimina `console.*` y `debugger` del bundle (no filtra logs ni
  // deja puntos de depuración); en dev se conservan para poder depurar.
  esbuild: {
    drop: mode === "production" ? (["console", "debugger"] as const).slice() : [],
  },
  plugins: [
    ...(useHttps ? [basicSsl()] : []),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "TransPadilla — Transporte Público Riohacha",
        short_name: "TransPadilla",
        description: "Sistema de rastreo de buses en tiempo real para Riohacha, La Guajira. Moviendo la Ciudad.",
        theme_color: "#0D2461",
        background_color: "#090E1A",
        display: "standalone",
        orientation: "portrait",
        scope: basePath,
        start_url: basePath,
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [
          { src: "screenshot-wide.png", sizes: "1280x720", type: "image/png", form_factor: "wide", label: "TransPadilla — Vista del mapa de Riohacha" },
          { src: "screenshot-mobile.png", sizes: "390x844", type: "image/png", form_factor: "narrow", label: "TransPadilla — Seguimiento en tiempo real" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Añade los handlers de Web Push (push / notificationclick) al SW generado,
        // sin cambiar a injectManifest. El archivo vive en public/push-sw.js.
        importScripts: ["push-sw.js"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.maptiler\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "maptiler-tiles",
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/[a-z]\.tile\.openstreetmap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    // Fuerza UNA sola instancia de estas libs. Crítico para @tanstack/react-query:
    // el QueryClient vive en un React Context; si pnpm instala dos copias (web y
    // api-client resuelven variaciones de peers distintas), Vite empaqueta ambas y
    // los hooks generados de api-client NO ven el <QueryClientProvider> del app
    // → "No QueryClient set" y la página cae en el ErrorBoundary.
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Sin source maps en producción: no se exponen los fuentes originales (.ts/.tsx)
    // ni la estructura del proyecto en DevTools. (Es el default de Vite; explícito por seguridad.)
    sourcemap: false,
    rollupOptions: {
      output: {
        // Separa las librerías grandes (que cambian poco) en chunks cacheables,
        // así un redeploy de la app no invalida el caché del vendor del navegador.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("leaflet")) return "leaflet";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react-vendor";
          if (id.includes("@tanstack") || id.includes("socket.io")) return "data-vendor";
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    https: useHttps ? {} : undefined,
    fs: { strict: true },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: "http://localhost:8080",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
}));