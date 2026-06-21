import { describe, it, expect } from "vitest";
import { requerido, texto, correoValido, numeroEnRango, enLista } from "../src/middleware/validate";

describe("requerido", () => {
  it("falla si falta o está vacío", () => {
    expect(requerido("nombre")({})).toMatch(/obligatorio/);
    expect(requerido("nombre")({ nombre: "   " })).toMatch(/obligatorio/);
  });
  it("pasa si hay valor", () => {
    expect(requerido("nombre")({ nombre: "Ana" })).toBeNull();
  });
});

describe("texto", () => {
  it("respeta min/max", () => {
    expect(texto("x", 3, 5)({ x: "ab" })).toMatch(/al menos 3/);
    expect(texto("x", 3, 5)({ x: "abcdef" })).toMatch(/superar 5/);
    expect(texto("x", 3, 5)({ x: "abcd" })).toBeNull();
  });
});

describe("correoValido", () => {
  it("rechaza correos inválidos", () => {
    expect(correoValido("c")({ c: "no-es-correo" })).toMatch(/correo válido/);
  });
  it("acepta correos válidos", () => {
    expect(correoValido("c")({ c: "a@b.co" })).toBeNull();
  });
});

describe("numeroEnRango", () => {
  it("valida el rango", () => {
    expect(numeroEnRango("lat", -90, 90)({ lat: 200 })).toMatch(/entre/);
    expect(numeroEnRango("lat", -90, 90)({ lat: 11.5 })).toBeNull();
  });
});

describe("enLista", () => {
  it("solo acepta valores de la lista", () => {
    expect(enLista("rol", ["a", "b"])({ rol: "c" })).toMatch(/uno de/);
    expect(enLista("rol", ["a", "b"])({ rol: "a" })).toBeNull();
  });
});
