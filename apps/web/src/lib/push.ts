// Cliente de Web Push del pasajero (sin cuenta). Se suscribe al PushManager del
// navegador con la clave VAPID pública del servidor y registra las rutas favoritas.
import { apiFetch } from "./api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSoportado(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** ¿El servidor tiene el push habilitado (claves VAPID configuradas)? */
export async function pushDisponibleEnServidor(): Promise<boolean> {
  try {
    const info = (await (await apiFetch("/api/push/clave-publica")).json()) as { habilitado?: boolean };
    return !!info.habilitado;
  } catch {
    return false;
  }
}

export async function estadoSuscripcion(): Promise<boolean> {
  if (!pushSoportado()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}

export type ResultadoPush = { ok: boolean; motivo?: "no-soportado" | "permiso-denegado" | "servidor-sin-vapid" };

/** Pide permiso, se suscribe al push y registra las rutas favoritas en el backend. */
export async function activarNotificaciones(rutas: number[]): Promise<ResultadoPush> {
  if (!pushSoportado()) return { ok: false, motivo: "no-soportado" };
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { ok: false, motivo: "permiso-denegado" };

  const info = (await (await apiFetch("/api/push/clave-publica")).json()) as {
    habilitado: boolean;
    clave: string | null;
  };
  if (!info.habilitado || !info.clave) return { ok: false, motivo: "servidor-sin-vapid" };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(info.clave) as BufferSource,
    });
  }
  const res = await apiFetch("/api/push/suscribir", {
    method: "POST",
    body: JSON.stringify({ subscription: sub.toJSON(), rutas }),
  });
  return { ok: res.ok };
}

/** Actualiza las rutas seguidas de la suscripción existente (si la hay). */
export async function actualizarRutas(rutas: number[]): Promise<void> {
  if (!pushSoportado()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await apiFetch("/api/push/suscribir", {
      method: "POST",
      body: JSON.stringify({ subscription: sub.toJSON(), rutas }),
    });
  }
}

/** Cancela la suscripción local y en el servidor. */
export async function desactivarNotificaciones(): Promise<void> {
  if (!pushSoportado()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await apiFetch("/api/push/desuscribir", {
      method: "POST",
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }
}
