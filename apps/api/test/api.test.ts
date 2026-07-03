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

  // Regresión: la guarda global de conductores llegó a bloquear estas lecturas
  // públicas (la vista del pasajero no cargaba). Deben responder 200 sin token.
  it("las lecturas del mapa son públicas (rutas, paradas, stats)", async () => {
    for (const ruta of ["/api/rutas", "/api/rutas/paradas/todas", "/api/stats"]) {
      const res = await request(app).get(ruta);
      expect(res.status, `${ruta} debe ser pública`).toBe(200);
    }
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

  it("reportes: público no puede; admin recibe el resumen", async () => {
    // Sin token → 401
    const anon = await request(app).get("/api/reportes/resumen");
    expect(anon.status).toBe(401);

    // Admin (sembrado con SEED_DEMO=true) → 200 con la forma esperada
    const login = await request(app)
      .post("/api/auth/login")
      .send({ correo: "admin@transpadilla.co", password: "admin123" });
    if (login.status !== 200) return; // sin admin demo, nada que comprobar
    const token = login.body.token as string;
    const res = await request(app)
      .get("/api/reportes/resumen?dias=7")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("km_total");
    expect(Array.isArray(res.body.rutas)).toBe(true);
  });

  it("auditoría: público 401; admin recibe la lista paginada", async () => {
    const anon = await request(app).get("/api/auditoria");
    expect(anon.status).toBe(401);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ correo: "admin@transpadilla.co", password: "admin123" });
    if (login.status !== 200) return;
    const token = login.body.token as string;
    const res = await request(app)
      .get("/api/auditoria?limite=10")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.registros)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });

  it("metrics: público 401; admin recibe el snapshot de observabilidad", async () => {
    const anon = await request(app).get("/api/metrics");
    expect(anon.status).toBe(401);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ correo: "admin@transpadilla.co", password: "admin123" });
    if (login.status !== 200) return;
    const token = login.body.token as string;
    const res = await request(app)
      .get("/api/metrics")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.uptime_s).toBe("number");
    expect(typeof res.body.requests).toBe("number");
    expect(res.body.por_estado).toHaveProperty("2xx");
    expect(Array.isArray(res.body.ultimos_errores)).toBe(true);
  });

  it("cerrar sesión revoca el token (queda inválido)", async () => {
    const correo = `logout_${Date.now()}@ejemplo.com`;
    await request(app).post("/api/auth/register").send({ nombre: "LO", correo, password: "secreto123" });
    const login = await request(app).post("/api/auth/login").send({ correo, password: "secreto123" });
    const token = login.body.token as string;

    // Con el token vigente, cambiar contraseña funciona (401 solo por clave incorrecta, no por token)
    const antes = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ actual: "secreto123", nueva: "secreto456" });
    expect(antes.status).toBe(200);

    // Cierra sesión → revoca el token
    const salir = await request(app).post("/api/auth/cerrar-sesion").set("Authorization", `Bearer ${token}`);
    expect(salir.status).toBe(200);

    // El MISMO token ahora es rechazado (401) aunque el JWT siga sin expirar
    const despues = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ actual: "secreto456", nueva: "secreto789" });
    expect(despues.status).toBe(401);
  });

  it("mutaciones admin sobre recursos inexistentes → 404 (no éxito falso)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ correo: "admin@transpadilla.co", password: "admin123" });
    if (login.status !== 200) return; // sin admin demo, nada que comprobar
    const token = login.body.token as string;
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);

    expect((await auth(request(app).delete("/api/rutas/999999"))).status).toBe(404);
    expect((await auth(request(app).patch("/api/rutas/999999/activa").send({ activa: true }))).status).toBe(404);
    expect((await auth(request(app).delete("/api/rutas/paradas/999999"))).status).toBe(404);
    expect((await auth(request(app).delete("/api/buses/999999"))).status).toBe(404);
    expect((await auth(request(app).delete("/api/conductores/999999"))).status).toBe(404);
    // id no numérico → 400, no 500
    expect((await auth(request(app).delete("/api/rutas/abc"))).status).toBe(400);
  });

  it("validaciones runtime: activa boolean, color hex, conductor con rol real", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ correo: "admin@transpadilla.co", password: "admin123" });
    if (login.status !== 200) return;
    const token = login.body.token as string;
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);

    const rutas = await request(app).get("/api/rutas");
    const rutaId = rutas.body[0]?.id;
    if (!rutaId) return;

    // activa debe ser boolean real
    expect((await auth(request(app).patch(`/api/rutas/${rutaId}/activa`).send({ activa: "si" }))).status).toBe(400);
    // color debe ser hex
    expect((await auth(request(app).patch(`/api/rutas/${rutaId}`).send({ color: "rojo" }))).status).toBe(400);

    // no se puede asignar como conductor a alguien que no es conductor (el admin mismo)
    const buses = await request(app).get("/api/buses");
    const busId = buses.body[0]?.id;
    if (!busId) return;
    const admin = await auth(request(app).get("/api/conductores"));
    expect(admin.status).toBe(200);
    // id inexistente → 404
    expect((await auth(request(app).patch(`/api/buses/${busId}/conductor`).send({ conductor_id: 999999 }))).status).toBe(404);
    // borrar por este endpoint a un usuario que NO es conductor → 404 (no borra admins)
    expect((await auth(request(app).delete("/api/conductores/1"))).status).toBe(404);
  });

  it("GET /api/rutas/:id/eta devuelve la forma esperada", async () => {
    const rutas = await request(app).get("/api/rutas");
    expect(rutas.status).toBe(200);
    expect(Array.isArray(rutas.body)).toBe(true);
    const rutaId = rutas.body[0]?.id;
    if (!rutaId) return; // sin rutas sembradas, nada que comprobar
    const res = await request(app).get(`/api/rutas/${rutaId}/eta`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ruta_id");
    expect(res.body).toHaveProperty("buses_activos");
    expect(Array.isArray(res.body.paradas)).toBe(true);
  });
});
