import type { Request, Response, NextFunction } from "express";

/**
 * Kit de validación de entradas sin dependencias externas. Cada "regla" recibe el
 * body y devuelve un mensaje de error (string) o `null` si es válido. El middleware
 * `validarBody(...reglas)` aplica las reglas y responde 400 con el primer error.
 */
type Body = Record<string, unknown>;
export type Regla = (body: Body) => string | null;

export function validarBody(...reglas: Regla[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = (req.body ?? {}) as Body;
    for (const regla of reglas) {
      const error = regla(body);
      if (error) {
        res.status(400).json({ error });
        return;
      }
    }
    next();
  };
}

// ── Reglas reutilizables ─────────────────────────────────────────────────────

export const requerido = (campo: string): Regla => (b) => {
  const v = b[campo];
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    return `El campo "${campo}" es obligatorio.`;
  }
  return null;
};

export const texto = (campo: string, min = 1, max = 500): Regla => (b) => {
  const v = b[campo];
  if (v === undefined || v === null) return null; // usar junto a requerido() si es obligatorio
  if (typeof v !== "string") return `"${campo}" debe ser texto.`;
  const len = v.trim().length;
  if (len < min) return `"${campo}" debe tener al menos ${min} caracteres.`;
  if (len > max) return `"${campo}" no puede superar ${max} caracteres.`;
  return null;
};

export const correoValido = (campo: string): Regla => (b) => {
  const v = b[campo];
  if (typeof v !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) {
    return `"${campo}" no es un correo válido.`;
  }
  return null;
};

export const numeroEnRango = (campo: string, min: number, max: number): Regla => (b) => {
  const v = b[campo];
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || Number.isNaN(n)) return `"${campo}" debe ser un número.`;
  if (n < min || n > max) return `"${campo}" debe estar entre ${min} y ${max}.`;
  return null;
};

export const enLista = (campo: string, valores: readonly string[]): Regla => (b) => {
  const v = b[campo];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || !valores.includes(v)) {
    return `"${campo}" debe ser uno de: ${valores.join(", ")}.`;
  }
  return null;
};

export const booleano = (campo: string): Regla => (b) => {
  const v = b[campo];
  if (v === undefined || v === null) return null; // usar junto a requerido() si es obligatorio
  if (typeof v !== "boolean") return `"${campo}" debe ser true o false.`;
  return null;
};

/** Color CSS hex (#RGB o #RRGGBB) — lo que pinta rutas y buses en el mapa. */
export const colorHex = (campo: string): Regla => (b) => {
  const v = b[campo];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim())) {
    return `"${campo}" debe ser un color hex (#RGB o #RRGGBB).`;
  }
  return null;
};

/**
 * Parsea un :id de la URL a entero positivo, o `null` si no lo es.
 * (parseInt("abc") da NaN y parseInt("12abc") da 12 — ambos inaceptables
 * como id; esto exige que TODO el segmento sea un entero > 0.)
 */
export function parseIdParam(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
