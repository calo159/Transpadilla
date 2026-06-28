import { defineConfig } from "vitest/config";
import path from "path";

// Config mínima para los tests unitarios de la lógica pura (lib/*). No carga los
// plugins de Vite/PWA: solo necesita el alias "@" → src y un entorno Node.
export default defineConfig({
  // Runtime automático de JSX (no hace falta importar React en cada .tsx).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    // Entorno node por defecto (tests de lógica, rápidos). Los tests de
    // componentes declaran su propio entorno con `// @vitest-environment jsdom`.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true, // habilita la limpieza automática de Testing Library entre tests
  },
});
