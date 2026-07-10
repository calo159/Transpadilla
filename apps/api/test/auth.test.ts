import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";

// Mock de @workspace/db ANTES de importar el middleware: evita que el import
// real exija DATABASE_URL y nos deja controlar pool.query en cada caso.
// Nota: función plana (no vi.fn) — el tracking de resultados de vi.fn crea una
// promesa derivada de la rechazada sin handler, y vitest la reporta como
// "unhandled rejection" aunque el middleware sí capture el error.
let queryImpl: () => Promise<{ rows: Array<{ token_version: number; revocado: boolean }> }>;
let queryCalls = 0;
vi.mock("@workspace/db", () => ({
  pool: { query: () => { queryCalls++; return queryImpl(); } },
}));

const { authMiddleware, JWT_SECRET } = await import("../src/middleware/auth");

function mockReqRes(token?: string) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cookies: {},
  } as unknown as Request;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  } as unknown as Response & { statusCode: number; body: unknown };
  const next = vi.fn();
  return { req, res, next };
}

// Simula la sesión llegando SOLO por la cookie httpOnly (sin header Authorization),
// como hace el navegador web tras el cambio a cookies (ver middleware/auth.ts).
function mockReqResCookie(cookieToken?: string, bearerToken?: string) {
  const req = {
    headers: bearerToken ? { authorization: `Bearer ${bearerToken}` } : {},
    cookies: cookieToken ? { tp_session: cookieToken } : {},
  } as unknown as Request;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  } as unknown as Response & { statusCode: number; body: unknown };
  const next = vi.fn();
  return { req, res, next };
}

// tv=0 coincide con el token_version por defecto que devuelve el mock de BD.
const tokenValido = (tv = 0) => jwt.sign({ id: 1, correo: "a@b.co", rol: "admin", tv }, JWT_SECRET);

describe("authMiddleware — revocación y token_version, fail-closed", () => {
  beforeEach(() => {
    queryCalls = 0;
    queryImpl = () => Promise.resolve({ rows: [{ token_version: 0, revocado: false }] });
  });

  it("token válido, no revocado y token_version vigente → next()", async () => {
    const { req, res, next } = mockReqRes(tokenValido());
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.usuario?.rol).toBe("admin");
  });

  it("token revocado → 401 y NO next()", async () => {
    queryImpl = () => Promise.resolve({ rows: [{ token_version: 0, revocado: true }] });
    const { req, res, next } = mockReqRes(tokenValido());
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("token_version vieja (contraseña cambiada después de firmar) → 401 y NO next()", async () => {
    // El usuario cambió su clave: la BD quedó en token_version=1, pero este
    // token se firmó antes (tv=0) → debe rechazarse aunque no esté revocado.
    queryImpl = () => Promise.resolve({ rows: [{ token_version: 1, revocado: false }] });
    const { req, res, next } = mockReqRes(tokenValido(0));
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("usuario borrado (sin fila) → 401 y NO next()", async () => {
    queryImpl = () => Promise.resolve({ rows: [] });
    const { req, res, next } = mockReqRes(tokenValido());
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("fallo de BD al comprobar sesión → 503 (fail-closed), NO next()", async () => {
    queryImpl = () => Promise.reject(new Error("db down"));
    const { req, res, next } = mockReqRes(tokenValido());
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it("token inválido → 401 sin tocar la BD", async () => {
    const { req, res, next } = mockReqRes("token.basura.xxx");
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(queryCalls).toBe(0);
  });

  it("sin header Authorization → 401", async () => {
    const { req, res, next } = mockReqRes();
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("authMiddleware — sesión vía cookie (navegador web)", () => {
  beforeEach(() => {
    queryCalls = 0;
    queryImpl = () => Promise.resolve({ rows: [{ token_version: 0, revocado: false }] });
  });

  it("token válido solo en la cookie (sin Bearer) → next()", async () => {
    const { req, res, next } = mockReqResCookie(tokenValido());
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.usuario?.rol).toBe("admin");
  });

  it("sin Bearer y sin cookie → 401", async () => {
    const { req, res, next } = mockReqResCookie();
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("cookie revocada → 401 y NO next() (misma lista negra que Bearer)", async () => {
    queryImpl = () => Promise.resolve({ rows: [{ token_version: 0, revocado: true }] });
    const { req, res, next } = mockReqResCookie(tokenValido());
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("con Bearer Y cookie presentes, gana el Bearer (no rompe el flujo del APK)", async () => {
    const bearerToken = tokenValido(0);
    const cookieToken = "token.de.cookie.distinto.no.deberia.usarse";
    const { req, res, next } = mockReqResCookie(cookieToken, bearerToken);
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.tokenCrudo).toBe(bearerToken);
  });
});
