import { describe, it, expect, vi } from "vitest";

// seed.ts importa @workspace/db (exige DATABASE_URL); se mockea porque aquí
// solo se prueba la función pura modoSeed.
vi.mock("@workspace/db", () => ({ db: {}, usuarios: {}, rutas: {}, paradas: {}, ruta_paradas: {}, buses: {} }));

const { modoSeed } = await import("../src/lib/seed");

describe("modoSeed — el demo es opt-in y producción exige admin", () => {
  it("SEED_DEMO=true en desarrollo → demo", () => {
    expect(modoSeed({ SEED_DEMO: "true" })).toBe("demo");
  });

  it("SEED_DEMO=true en PRODUCCIÓN → error (nunca credenciales conocidas en prod)", () => {
    expect(modoSeed({ SEED_DEMO: "true", NODE_ENV: "production" })).toBe("error");
  });

  it("sin SEED_DEMO, con admin envs → admin (el default seguro)", () => {
    expect(modoSeed({ ADMIN_EMAIL: "a@b.co", ADMIN_PASSWORD: "x" })).toBe("admin");
    expect(modoSeed({ NODE_ENV: "production", ADMIN_EMAIL: "a@b.co", ADMIN_PASSWORD: "x" })).toBe("admin");
  });

  it("SEED_DEMO=false se comporta igual que ausente (admin si hay envs)", () => {
    expect(modoSeed({ SEED_DEMO: "false", ADMIN_EMAIL: "a@b.co", ADMIN_PASSWORD: "x" })).toBe("admin");
  });

  it("producción sin admin envs → error (arranque debe fallar claro)", () => {
    expect(modoSeed({ NODE_ENV: "production" })).toBe("error");
    expect(modoSeed({ NODE_ENV: "production", ADMIN_EMAIL: "  " })).toBe("error");
  });

  it("desarrollo sin nada configurado → nada (solo warn, no revienta)", () => {
    expect(modoSeed({})).toBe("nada");
  });
});
