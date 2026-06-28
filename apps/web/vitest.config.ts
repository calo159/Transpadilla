import { defineConfig } from "vitest/config";
import path from "path";

// Config mínima para los tests unitarios de la lógica pura (lib/*). No carga los
// plugins de Vite/PWA: solo necesita el alias "@" → src y un entorno Node.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
