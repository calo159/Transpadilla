import { describe, it, expect } from "vitest";
import { suscripcionesParaRuta, hostEndpointValido } from "../src/lib/push-util";

describe("suscripcionesParaRuta", () => {
  const subs = [
    { id: 1, rutas: [1, 2] },
    { id: 2, rutas: [3] },
    { id: 3, rutas: [] },
    { id: 4, rutas: [2, 5] },
  ];

  it("devuelve solo las suscripciones que siguen la ruta", () => {
    expect(suscripcionesParaRuta(subs, 2).map((s) => s.id)).toEqual([1, 4]);
    expect(suscripcionesParaRuta(subs, 3).map((s) => s.id)).toEqual([2]);
  });

  it("ruta sin seguidores → vacío", () => {
    expect(suscripcionesParaRuta(subs, 99)).toEqual([]);
  });

  it("tolera rutas no-array", () => {
    const raras = [{ id: 1, rutas: undefined as unknown as number[] }];
    expect(suscripcionesParaRuta(raras, 1)).toEqual([]);
  });
});

describe("hostEndpointValido", () => {
  it("acepta los hosts reales de los servicios de push", () => {
    expect(hostEndpointValido("https://fcm.googleapis.com/fcm/send/abc123", true)).toBe(true);
    expect(hostEndpointValido("https://updates.push.services.mozilla.com/wpush/v2/abc", true)).toBe(true);
    expect(hostEndpointValido("https://wns2-abc.notify.windows.com/w/?token=x", true)).toBe(true);
    expect(hostEndpointValido("https://web.push.apple.com/abc", true)).toBe(true);
  });

  it("rechaza IPs (SSRF: metadata de nube, loopback, redes privadas)", () => {
    expect(hostEndpointValido("https://169.254.169.254/latest/meta-data", true)).toBe(false);
    expect(hostEndpointValido("https://127.0.0.1/admin", true)).toBe(false);
    expect(hostEndpointValido("https://10.0.0.5/internal", true)).toBe(false);
    expect(hostEndpointValido("https://192.168.1.1/", true)).toBe(false);
    expect(hostEndpointValido("https://[::1]/", true)).toBe(false);
  });

  it("rechaza dominios ajenos que no son un push service conocido", () => {
    expect(hostEndpointValido("https://evil.example.com/push", true)).toBe(false);
    expect(hostEndpointValido("https://fcm.googleapis.com.evil.com/x", true)).toBe(false);
  });

  it("rechaza HTTP salvo localhost fuera de producción", () => {
    expect(hostEndpointValido("http://localhost:8080/x", false)).toBe(true);
    expect(hostEndpointValido("http://localhost:8080/x", true)).toBe(false);
    expect(hostEndpointValido("http://fcm.googleapis.com/x", true)).toBe(false);
  });

  it("rechaza URLs inválidas", () => {
    expect(hostEndpointValido("no-es-una-url", true)).toBe(false);
    expect(hostEndpointValido("", true)).toBe(false);
  });
});
