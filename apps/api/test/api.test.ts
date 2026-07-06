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
      .send({ nombre: "Test", correo, password: "Secreto123!Fuerte", rol: "admin" });
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
    await request(app).post("/api/auth/register").send({ nombre: "Pas", correo, password: "Secreto123!Fuerte" });
    const login = await request(app).post("/api/auth/login").send({ correo, password: "Secreto123!Fuerte" });
    const token = login.body.token as string;
    const res = await request(app)
      .post("/api/rutas")
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "Ruta X" });
    expect(res.status).toBe(403);
  });

  it("cambio de contraseña: verifica la actual y aplica la nueva", async () => {
    const correo = `cp_${Date.now()}@ejemplo.com`;
    await request(app).post("/api/auth/register").send({ nombre: "CP", correo, password: "ViejoClave2024!" });
    const login = await request(app).post("/api/auth/login").send({ correo, password: "ViejoClave2024!" });
    const token = login.body.token as string;

    // Clave actual incorrecta → 401
    const malo = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ actual: "incorrecta", nueva: "NuevaClave2024!" });
    expect(malo.status).toBe(401);

    // Correcta → 200 y luego se puede iniciar sesión con la nueva
    const ok = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ actual: "ViejoClave2024!", nueva: "NuevaClave2024!" });
    expect(ok.status).toBe(200);

    const reLogin = await request(app).post("/api/auth/login").send({ correo, password: "NuevaClave2024!" });
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
    await request(app).post("/api/auth/register").send({ nombre: "LO", correo, password: "Secreto123!Fuerte" });
    const login = await request(app).post("/api/auth/login").send({ correo, password: "Secreto123!Fuerte" });
    const token = login.body.token as string;

    // Con el token vigente, cambiar contraseña funciona (401 solo por clave incorrecta, no por token)
    const antes = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ actual: "Secreto123!Fuerte", nueva: "Secreto456!Fuerte" });
    expect(antes.status).toBe(200);

    // Cierra sesión → revoca el token
    const salir = await request(app).post("/api/auth/cerrar-sesion").set("Authorization", `Bearer ${token}`);
    expect(salir.status).toBe(200);

    // El MISMO token ahora es rechazado (401) aunque el JWT siga sin expirar
    const despues = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ actual: "Secreto456!Fuerte", nueva: "Secreto789!Fuerte" });
    expect(despues.status).toBe(401);
  });

  it("al cerrar sesión, el conductor apaga su bus (no queda 'fantasma' activo)", async () => {
    // Usa el conductor demo (seed): correo conductor@transpadilla.co con GUA-001 asignado.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ correo: "conductor@transpadilla.co", password: "conductor123" });
    if (login.status !== 200) return; // sin conductor demo, nada que comprobar
    const token = login.body.token as string;

    // Enciende el recorrido: una posición GPS deja el bus en estado "activo".
    const gps = await request(app)
      .post("/api/buses/gps")
      .set("Authorization", `Bearer ${token}`)
      .send({ lat: 11.5444, lng: -72.9072, velocidad: 20 });
    expect(gps.status).toBe(200);

    // GET /buses tiene caché de 2 s; hacemos polling hasta ver el estado esperado.
    const esperarEstado = async (esperado: string): Promise<string | undefined> => {
      let estado: string | undefined;
      for (let i = 0; i < 15; i++) {
        const lista = (await request(app).get("/api/buses")).body as Array<{ placa: string; estado: string }>;
        estado = lista.find((b) => b.placa === "GUA-001")?.estado;
        if (estado === esperado) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      return estado;
    };
    expect(await esperarEstado("activo")).toBe("activo");

    // Cierra sesión → el backend debe apagar SU bus.
    const salir = await request(app).post("/api/auth/cerrar-sesion").set("Authorization", `Bearer ${token}`);
    expect(salir.status).toBe(200);

    expect(await esperarEstado("inactivo")).toBe("inactivo");
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

  it("favoritos (público) alimentan 'seguidores' en /reportes/rutas", async () => {
    const rutas = await request(app).get("/api/rutas");
    const rutaId = rutas.body[0]?.id as number | undefined;
    if (!rutaId) return;
    const login = await request(app).post("/api/auth/login").send({ correo: "admin@transpadilla.co", password: "admin123" });
    if (login.status !== 200) return; // sin admin demo, nada que comprobar
    const token = login.body.token as string;
    const clienteId = `test_${Date.now()}`;

    // Marca la ruta como favorita para un cliente anónimo único.
    const add = await request(app).post("/api/favoritos").send({ cliente_id: clienteId, rutas: [rutaId] });
    expect(add.status).toBe(200);

    // Se lee con una clave de periodo fresca (evita el caché de 60 s de otros tests).
    const r1 = await request(app).get("/api/reportes/rutas?dias=11").set("Authorization", `Bearer ${token}`);
    expect(r1.status).toBe(200);
    const antes = (r1.body.rutas as { ruta_id: number; seguidores: number }[]).find((r) => r.ruta_id === rutaId);
    expect(antes?.seguidores ?? 0).toBeGreaterThanOrEqual(1);

    // Al quitarla (reemplazo por conjunto vacío), su aporte desaparece.
    const del = await request(app).post("/api/favoritos").send({ cliente_id: clienteId, rutas: [] });
    expect(del.status).toBe(200);
    const r2 = await request(app).get("/api/reportes/rutas?dias=13").set("Authorization", `Bearer ${token}`);
    const despues = (r2.body.rutas as { ruta_id: number; seguidores: number }[]).find((r) => r.ruta_id === rutaId);
    expect(despues?.seguidores ?? 0).toBe((antes?.seguidores ?? 0) - 1);

    // Validación: cliente_id demasiado corto → 400.
    expect((await request(app).post("/api/favoritos").send({ cliente_id: "x", rutas: [rutaId] })).status).toBe(400);
  });

  it("registro: rechaza contraseñas débiles (Fase 1.4)", async () => {
    const correo = `debil_${Date.now()}@ejemplo.com`;
    expect((await request(app).post("/api/auth/register").send({ nombre: "Debil", correo, password: "abc12345" })).status).toBe(400);
    expect((await request(app).post("/api/auth/register").send({ nombre: "Debil", correo, password: "SinSimbolo1234" })).status).toBe(400);
    expect((await request(app).post("/api/auth/register").send({ nombre: "Debil", correo, password: "Cambiar2024!" })).status).toBe(400); // común
  });

  it("bloqueo de cuenta: 5 logins fallidos bloquean incluso con la clave correcta (Fase 1.3)", async () => {
    const correo = `lockout_${Date.now()}@ejemplo.com`;
    const passwordOk = "Bloqueo123!Test";
    // IP propia (vía X-Forwarded-For, con trust proxy=1) para no compartir el
    // contador del rate-limit por IP con el resto de la suite (que ya hace
    // varios logins) ni disparar un 429 de rate-limit en vez del de bloqueo.
    const ip = "203.0.113.50";
    await request(app).post("/api/auth/register").send({ nombre: "LK", correo, password: passwordOk });

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send({ correo, password: "incorrecta" });
      expect(res.status).toBe(401);
    }
    // Ya bloqueada: incluso la clave CORRECTA es rechazada (429, no 200).
    const bloqueado = await request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send({ correo, password: passwordOk });
    expect(bloqueado.status).toBe(429);
  });

  it("auditoría registra ip y user-agent en mutaciones admin (Fase 1.2)", async () => {
    const login = await request(app).post("/api/auth/login").send({ correo: "admin@transpadilla.co", password: "admin123" });
    if (login.status !== 200) return; // sin admin demo, nada que comprobar
    const token = login.body.token as string;
    const nombre = `Ruta Auditoria ${Date.now()}`;
    const crear = await request(app)
      .post("/api/rutas")
      .set("Authorization", `Bearer ${token}`)
      .set("User-Agent", "vitest-suite/1.0")
      .send({ nombre, color: "#123456" });
    expect(crear.status).toBe(201);

    const { pool } = await import("@workspace/db");
    const { rows } = await pool.query(
      `SELECT ip, user_agent FROM auditoria WHERE accion = 'crear_ruta' AND entidad_id = $1`,
      [crear.body.id],
    );
    expect(rows[0]?.user_agent).toBe("vitest-suite/1.0");
    expect(rows[0]?.ip).toBeTruthy();
  });

  it("GET /.well-known/security.txt responde texto plano (Fase 1.6)", async () => {
    const res = await request(app).get("/.well-known/security.txt");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Contact: mailto:/);
  });
});
