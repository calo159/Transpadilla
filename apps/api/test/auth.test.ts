import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";

// Mock de @workspace/db ANTES de importar el middleware: evita que el import
// real exija DATABASE_URL y nos deja controlar pool.query en cada caso.
// Nota: función plana (no vi.fn) — el tracking de resultados de vi.fn crea una
// promesa derivada de la rechazada sin handler, y vitest la reporta como
// "unhandled rejection" aunque el middleware sí capture el error.
let queryImpl: () => Promise<{ rowCount: number }>;
let queryCalls = 0;
vi.mock("@workspace/db", () => ({
  pool: { query: () => { queryCalls++; return queryImpl(); } },
}));

const { authMiddleware, JWT_SECRET } = await import("../src/middleware/auth");

function mockReqRes(token?: string) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
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

const tokenValido = () => jwt.sign({ id: 1, correo: "a@b.co", rol: "admin" }, JWT_SECRET);

describe("authMiddleware — revocación fail-closed", () => {
  beforeEach(() => {
    queryCalls = 0;
    queryImpl = () => Promise.resolve({ rowCount: 0 });
  });

  it("token válido y no revocado → next()", async () => {
    const { req, res, next } = mockReqRes(tokenValido());
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.usuario?.rol).toBe("admin");
  });

  it("token revocado → 401 y NO next()", async () => {
    queryImpl = () => Promise.resolve({ rowCount: 1 });
    const { req, res, next } = mockReqRes(tokenValido());
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("fallo de BD al comprobar revocación → 503 (fail-closed), NO next()", async () => {
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
