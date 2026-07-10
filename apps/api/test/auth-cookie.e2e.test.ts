import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";

// Verifica el flujo REAL de la cookie de sesión (cookie-parser + res.cookie/
// clearCookie de Express), que los tests de middleware (auth.test.ts) no cubren
// porque simulan `req.cookies` a mano. Requiere Postgres real (igual que
// api.test.ts); se salta si no hay DATABASE_URL.
const tieneDB = !!process.env["DATABASE_URL"];
const suite = tieneDB ? describe : describe.skip;

suite("Sesión por cookie httpOnly (E2E)", () => {
  let app: Express;

  beforeAll(async () => {
    const { ensureSchema } = await import("../src/lib/init-db");
    const { seedIfEmpty } = await import("../src/lib/seed");
    await ensureSchema();
    await seedIfEmpty();
    app = (await import("../src/app")).default;
  });

  it("login fija una cookie tp_session httpOnly + SameSite=Lax, y el body sigue trayendo el token", async () => {
    const correo = `cookie_${Date.now()}@ejemplo.com`;
    await request(app)
      .post("/api/auth/register")
      .send({ nombre: "Cookie Test", correo, password: "Secreto123!Fuerte" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ correo, password: "Secreto123!Fuerte" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string"); // el APK sigue leyendo esto igual que hoy

    const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
    expect(setCookie).toBeDefined();
    const cookieSesion = setCookie!.find((c) => c.startsWith("tp_session="));
    expect(cookieSesion).toBeDefined();
    expect(cookieSesion).toMatch(/HttpOnly/i);
    expect(cookieSesion).toMatch(/SameSite=Lax/i);
    expect(cookieSesion).toMatch(/Path=\//i);
  });

  it("una ruta protegida funciona enviando SOLO la cookie (sin Authorization)", async () => {
    const correo = `cookie2_${Date.now()}@ejemplo.com`;
    await request(app)
      .post("/api/auth/register")
      .send({ nombre: "Cookie Test 2", correo, password: "Secreto123!Fuerte" });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ correo, password: "Secreto123!Fuerte" });
    const setCookie = login.headers["set-cookie"] as unknown as string[];
    const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");

    // /auth/cambiar-password exige authMiddleware; sin header Authorization, solo cookie.
    const res = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Cookie", cookieHeader)
      .send({ actual: "Secreto123!Fuerte", nueva: "OtraClaveFuerte456!" });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe("Contraseña actualizada");
  });

  it("cerrar-sesion limpia la cookie (Set-Cookie expirado) y revoca el token", async () => {
    const correo = `cookie3_${Date.now()}@ejemplo.com`;
    await request(app)
      .post("/api/auth/register")
      .send({ nombre: "Cookie Test 3", correo, password: "Secreto123!Fuerte" });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ correo, password: "Secreto123!Fuerte" });
    const setCookie = login.headers["set-cookie"] as unknown as string[];
    const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");

    const logout = await request(app)
      .post("/api/auth/cerrar-sesion")
      .set("Cookie", cookieHeader);
    expect(logout.status).toBe(200);

    const logoutSetCookie = logout.headers["set-cookie"] as unknown as string[] | undefined;
    const cleared = logoutSetCookie?.find((c) => c.startsWith("tp_session="));
    expect(cleared).toBeDefined();
    // Express clearCookie fija Expires en el pasado (1970) para borrar la cookie.
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);

    // El token ya revocado no debe servir aunque se reenvíe la misma cookie.
    const res = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Cookie", cookieHeader)
      .send({ actual: "OtraClaveFuerte456!", nueva: "TerceraClave789!" });
    expect(res.status).toBe(401);
  });

  it("Bearer sigue funcionando exactamente igual (regresión del flujo del APK)", async () => {
    const correo = `cookie4_${Date.now()}@ejemplo.com`;
    await request(app)
      .post("/api/auth/register")
      .send({ nombre: "Cookie Test 4", correo, password: "Secreto123!Fuerte" });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ correo, password: "Secreto123!Fuerte" });
    const token = login.body.token as string;

    const res = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ actual: "Secreto123!Fuerte", nueva: "OtraClaveFuerte456!" });
    expect(res.status).toBe(200);
  });
});
