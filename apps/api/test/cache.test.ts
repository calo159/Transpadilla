import { describe, it, expect } from "vitest";
import { crearCacheTtl } from "../src/lib/cache";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("crearCacheTtl", () => {
  it("dentro del TTL, el loader se llama una sola vez", async () => {
    let n = 0;
    const cache = crearCacheTtl(1000, async () => { n++; return n; });
    const a = await cache.obtener();
    const b = await cache.obtener();
    expect(n).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("recarga cuando expira el TTL", async () => {
    let n = 0;
    const cache = crearCacheTtl(20, async () => { n++; return n; });
    expect(await cache.obtener()).toBe(1);
    await sleep(35);
    expect(await cache.obtener()).toBe(2);
    expect(n).toBe(2);
  });

  it("deduplica peticiones concurrentes (una sola carga)", async () => {
    let n = 0;
    let resolver: (v: number) => void = () => {};
    const cache = crearCacheTtl(1000, () => new Promise<number>((res) => { n++; resolver = res; }));
    const p1 = cache.obtener();
    const p2 = cache.obtener(); // mientras la primera está en vuelo
    resolver(42);
    const [a, b] = await Promise.all([p1, p2]);
    expect(n).toBe(1);
    expect(a).toBe(42);
    expect(b).toBe(42);
  });

  it("invalidar() fuerza recarga en la siguiente obtención", async () => {
    let n = 0;
    const cache = crearCacheTtl(10_000, async () => { n++; return n; });
    expect(await cache.obtener()).toBe(1);
    cache.invalidar();
    expect(await cache.obtener()).toBe(2);
  });

  it("no cachea errores: la siguiente llamada reintenta", async () => {
    let n = 0;
    const cache = crearCacheTtl(10_000, async () => {
      n++;
      if (n === 1) throw new Error("boom");
      return n;
    });
    await expect(cache.obtener()).rejects.toThrow("boom");
    expect(await cache.obtener()).toBe(2);
  });
});
