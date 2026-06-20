import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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
