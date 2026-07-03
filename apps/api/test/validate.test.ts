import { describe, it, expect } from "vitest";
import { requerido, texto, correoValido, numeroEnRango, enLista, booleano, colorHex, parseIdParam } from "../src/middleware/validate";

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

describe("booleano", () => {
  it("solo acepta boolean real (no strings ni números)", () => {
    expect(booleano("activa")({ activa: "true" })).toMatch(/true o false/);
    expect(booleano("activa")({ activa: 1 })).toMatch(/true o false/);
    expect(booleano("activa")({ activa: true })).toBeNull();
    expect(booleano("activa")({ activa: false })).toBeNull();
    expect(booleano("activa")({})).toBeNull(); // opcional si no se combina con requerido
  });
});

describe("colorHex", () => {
  it("acepta #RGB y #RRGGBB", () => {
    expect(colorHex("color")({ color: "#2558A5" })).toBeNull();
    expect(colorHex("color")({ color: "#fff" })).toBeNull();
  });
  it("rechaza lo demás", () => {
    expect(colorHex("color")({ color: "rojo" })).toMatch(/hex/);
    expect(colorHex("color")({ color: "#12345" })).toMatch(/hex/);
    expect(colorHex("color")({ color: "2558A5" })).toMatch(/hex/);
    expect(colorHex("color")({ color: "#2558A5; drop table" })).toMatch(/hex/);
  });
});

describe("parseIdParam", () => {
  it("acepta enteros positivos", () => {
    expect(parseIdParam("7")).toBe(7);
    expect(parseIdParam(" 42 ")).toBe(42);
  });
  it("rechaza NaN, parciales, negativos y cero", () => {
    expect(parseIdParam("abc")).toBeNull();
    expect(parseIdParam("12abc")).toBeNull(); // parseInt daría 12 — inaceptable
    expect(parseIdParam("-5")).toBeNull();
    expect(parseIdParam("0")).toBeNull();
    expect(parseIdParam("1.5")).toBeNull();
    expect(parseIdParam(undefined)).toBeNull();
  });
});
