import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import { rateLimit } from "../src/middleware/rate-limit";

function mockRes() {
  const res = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown };
  return {
    ...res,
    setHeader(k: string, v: string) { res.headers[k] = v; },
    status(c: number) { res.statusCode = c; return this as unknown as Response; },
    json(b: unknown) { res.body = b; return this as unknown as Response; },
    get _state() { return res; },
  } as unknown as Response & { _state: typeof res };
}

const reqDe = (ip: string) => ({ ip, socket: {} }) as unknown as Request;

describe("rateLimit", () => {
  it("permite hasta `max` y bloquea con 429 después", () => {
    const mw = rateLimit({ ventanaMs: 1000, max: 2 });
    const req = reqDe("1.2.3.4");
    let nexts = 0;
    const next = () => { nexts++; };

    mw(req, mockRes(), next);            // 1 — pasa
    mw(req, mockRes(), next);            // 2 — pasa
    const res3 = mockRes() as Response & { _state: { statusCode: number; headers: Record<string, string> } };
    mw(req, res3, next);                 // 3 — bloqueado

    expect(nexts).toBe(2);
    expect(res3._state.statusCode).toBe(429);
    expect(res3._state.headers["Retry-After"]).toBeDefined();
  });

  it("cuenta cada IP de forma independiente", () => {
    const mw = rateLimit({ ventanaMs: 1000, max: 1 });
    let nexts = 0;
    const next = () => { nexts++; };
    mw(reqDe("a"), mockRes(), next);
    mw(reqDe("b"), mockRes(), next);
    expect(nexts).toBe(2); // IPs distintas: ambas pasan
  });
});
