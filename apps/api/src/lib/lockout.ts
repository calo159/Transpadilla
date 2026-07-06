import { eq, sql } from "drizzle-orm";
import { db, usuarios } from "@workspace/db";

/**
 * Bloqueo de cuenta por fuerza bruta (Fase 1.3 de PLAN.md). Complementa —no
 * reemplaza— el rate-limit por IP: un atacante que rote de IP igual choca con
 * el bloqueo de la cuenta específica que intenta adivinar.
 */
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

export interface UsuarioBloqueable {
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
}

export function estaBloqueado(usuario: UsuarioBloqueable): boolean {
  return usuario.bloqueado_hasta != null && usuario.bloqueado_hasta.getTime() > Date.now();
}

/** Minutos restantes de bloqueo (mínimo 1, para no mostrar "0 minutos"). */
export function minutosRestantes(usuario: UsuarioBloqueable): number {
  if (!usuario.bloqueado_hasta) return 0;
  return Math.max(1, Math.ceil((usuario.bloqueado_hasta.getTime() - Date.now()) / 60_000));
}

/**
 * Incrementa el contador de fallos; si llega al máximo, fija `bloqueado_hasta`
 * en una sola query atómica (evita condición de carrera entre leer y escribir
 * el contador ante intentos concurrentes).
 */
export async function registrarFallo(id: number): Promise<void> {
  await db
    .update(usuarios)
    .set({
      intentos_fallidos: sql`${usuarios.intentos_fallidos} + 1`,
      bloqueado_hasta: sql`CASE WHEN ${usuarios.intentos_fallidos} + 1 >= ${MAX_INTENTOS}
        THEN now() + (${BLOQUEO_MIN} || ' minutes')::interval
        ELSE ${usuarios.bloqueado_hasta} END`,
    })
    .where(eq(usuarios.id, id));
}

export async function limpiarIntentos(id: number): Promise<void> {
  await db.update(usuarios).set({ intentos_fallidos: 0, bloqueado_hasta: null }).where(eq(usuarios.id, id));
}
