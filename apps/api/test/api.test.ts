import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";

// Estos tests necesitan PostgreSQL. Si no hay DATABASE_URL (p. ej. en una
// máquina sin DB), se saltan en vez de fallar. En CI se provee un Postgres.
const tieneDB = !!process.env["DATABASE_URL"];
const suite = tieneDB ? describe : describe.skip;

suite("API (integración)", () => {
  let app: Express;

  beforeAll(async () => {
    // Import dinámico: @workspace/db exige DATABASE_URL al importarse.
    const { ensureSchema } = await import("../src/lib/init-db");
    const { seedIfEmpty } = await import("../src/lib/seed");
    await ensureSchema();
    await seedIfEmpty(); // datos demo (admin/conductor/pasajero + rutas/buses)
    app = (await import("../src/app")).default;
  });

  it("GET /api/buses es público y devuelve un array", async () => {
    const res = await request(app).get("/api/buses");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("rechaza mutaciones sin token (401)", async () => {
    const res = await request(app).post("/api/rutas").send({ nombre: "Hack" });
    expect(res.status).toBe(401);
  });

  it("el registro público SIEMPRE crea rol pasajero (no admin)", async () => {
    const correo = `test_${Date.now()}@ejemplo.com`;
    const res = await request(app)
      .post("/api/auth/register")
      .send({ nombre: "Test", correo, password: "secreto123", rol: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.rol).toBe("pasajero");
  });

  it("login: credenciales inválidas → 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ correo: "noexiste@x.co", password: "x" });
    expect(res.status).toBe(401);
  });

  it("un pasajero no puede crear rutas (403)", async () => {
    const correo = `pas_${Date.now()}@ejemplo.com`;
    await request(app).post("/api/auth/register").send({ nombre: "Pas", correo, password: "secreto123" });
    const login = await request(app).post("/api/auth/login").send({ correo, password: "secreto123" });
    const token = login.body.token as string;
    const res = await request(app)
      .post("/api/rutas")
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "Ruta X" });
    expect(res.status).toBe(403);
  });

  it("cambio de contraseña: verifica la actual y aplica la nueva", async () => {
    const correo = `cp_${Date.now()}@ejemplo.com`;
    await request(app).post("/api/auth/register").send({ nombre: "CP", correo, password: "viejo123" });
    const login = await request(app).post("/api/auth/login").send({ correo, password: "viejo123" });
    const token = login.body.token as string;

    // Clave actual incorrecta → 401
    const malo = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ actual: "incorrecta", nueva: "nuevo123" });
    expect(malo.status).toBe(401);

    // Correcta → 200 y luego se puede iniciar sesión con la nueva
    const ok = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ actual: "viejo123", nueva: "nuevo123" });
    expect(ok.status).toBe(200);

    const reLogin = await request(app).post("/api/auth/login").send({ correo, password: "nuevo123" });
    expect(reLogin.status).toBe(200);
  });

  it("GET /api/rutas/:id/eta devuelve la forma esperada", async () => {
    const rutas = await request(app).get("/api/rutas");
    const rutaId = rutas.body[0]?.id;
    if (!rutaId) return; // sin rutas sembradas, nada que comprobar
    const res = await request(app).get(`/api/rutas/${rutaId}/eta`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ruta_id");
    expect(res.body).toHaveProperty("buses_activos");
    expect(Array.isArray(res.body.paradas)).toBe(true);
  });
});
