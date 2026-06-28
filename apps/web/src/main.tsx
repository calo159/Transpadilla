import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client";
import App from "./App";
import "./index.css";

// En el APK de Capacitor la app corre como bundle local, sin servidor propio.
// VITE_API_URL apunta al backend de Render para que los hooks de orval funcionen.
if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL as string);
}

// Auto-actualización de la PWA: vite-plugin-pwa (registerType "autoUpdate") ya
// registra el service worker y recarga la página cuando hay una versión nueva.
// Aquí solo añadimos un chequeo periódico (cada minuto) mientras la app está
// abierta, para que detecte el nuevo despliegue sin tener que recargar a mano.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready
    .then((registration) => {
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60_000);
    })
    .catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
