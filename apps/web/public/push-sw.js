/* Handlers de Web Push para TransPadilla. El SW generado por vite-plugin-pwa
   (Workbox) lo importa vía importScripts. Muestra la notificación entrante y, al
   tocarla, enfoca/abre la app. */
/* eslint-disable no-undef */

self.addEventListener("push", (event) => {
  let data = { titulo: "TransPadilla", cuerpo: "Novedad en tu ruta", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_e) {
    if (event.data) data.cuerpo = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.titulo, {
      body: data.cuerpo,
      icon: "/pwa-192x192.png",
      badge: "/favicon-32x32.png",
      data: { url: data.url || "/" },
      tag: "transpadilla",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ("focus" in cliente) return cliente.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
