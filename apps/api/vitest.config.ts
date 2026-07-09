import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests secuenciales: los de integración comparten una única base de datos.
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Vitest NO carga .env (ver CLAUDE.md), y middleware/auth.ts exige JWT_SECRET
    // fuera de NODE_ENV=development (fail-fast contra el fallback inseguro) — sin
    // esto, solo importar el middleware rompería la suite. Mismo valor que usa CI
    // (.github/workflows/ci.yml), nunca uno real.
    env: {
      JWT_SECRET: "ci-secret-no-usar-en-produccion",
    },
  },
});
