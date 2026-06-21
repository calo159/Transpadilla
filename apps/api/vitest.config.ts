import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests secuenciales: los de integración comparten una única base de datos.
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
