# Mapa — Protomaps (gratis a escala de producción)

TransPadilla dibuja el mapa con **Leaflet**. Por defecto usa los tiles públicos
de **OpenStreetMap**, que están bien para desarrollo y demos, pero **su política
prohíbe el uso de producción pesado**: con miles de usuarios te bloquean.

Para producción a escala usamos **Protomaps**: el mapa de tu región vive en **un
solo archivo `.pmtiles`** que tú alojas en almacenamiento estático barato o
gratis. **Sin API key, sin tarjeta y sin costo por petición** — a diferencia de
Google/Mapbox/MapTiler, que cobran pasada una cuota mensual.

El código ya está integrado: si defines la variable `VITE_MAP_PMTILES_URL`, el
mapa usa Protomaps; si no, cae a OpenStreetMap automáticamente (nada se rompe).

---

## Cómo activarlo (3 pasos)

### 1. Generar el archivo `.pmtiles` de tu región
Tienes dos formas:

**A) Web (la más fácil, sin instalar nada)**
1. Entra a <https://app.protomaps.com>.
2. Dibuja un recuadro (bounding box) que cubra **Riohacha / La Guajira**
   (puedes abarcar toda Colombia si quieres; el archivo pesa más).
3. Descarga el `.pmtiles` generado (por ejemplo `riohacha.pmtiles`).

**B) Línea de comandos (`pmtiles` CLI)**
```bash
# Instala el CLI: https://github.com/protomaps/go-pmtiles/releases
# Extrae SOLO el área que te interesa desde el build diario global
# (descarga por rangos, no baja el planeta entero).
# bbox = oeste,sur,este,norte  (aprox. La Guajira)
pmtiles extract https://build.protomaps.com/20250101.pmtiles riohacha.pmtiles \
  --bbox=-73.5,10.9,-71.0,12.5
```
Ajusta la fecha del build y el `--bbox` a tu zona.

### 2. Hospedar el archivo
El archivo debe servirse por HTTP con **soporte de "Range requests"** y **CORS**
habilitado para el dominio de tu app. Opciones:

- **Cloudflare R2 (recomendado — gratis, sin costo de salida):**
  1. Crea un bucket R2 y sube `riohacha.pmtiles`.
  2. Habilita acceso público (R2.dev) o conéctalo a un dominio.
  3. En **Settings → CORS Policy** del bucket, permite tu origen
     (`https://transpadilla-web.onrender.com`) con métodos `GET, HEAD`.
  4. Copia la URL pública del archivo.
- **Tu propio VPS** (el del `docker-compose`): sirve el archivo con Nginx/Caddy
  (la mayoría ya soporta Range por defecto). Habilita CORS.

> Para **probar sin hospedar nada**, puedes apuntar temporalmente al demo bucket
> de Protomaps: `https://demo-bucket.protomaps.com/v4.pmtiles` (planeta completo,
> **solo para pruebas**, sin SLA — no lo uses en producción real).

### 3. Configurar la variable en el build del frontend
En **Render** (o donde compiles el frontend), define:

```
VITE_MAP_PMTILES_URL=https://TU-BUCKET.r2.dev/riohacha.pmtiles
VITE_MAP_FLAVOR=light
```

`VITE_MAP_FLAVOR` controla el tema del mapa: `light` (por defecto), `dark`,
`white`, `grayscale` o `black`.

Vuelve a desplegar. Listo: el mapa ahora corre con Protomaps, **sin key, sin
tarjeta y sin costo por uso**, aguantando miles de usuarios.

---

## Detalles técnicos

- Integración: [`apps/web/src/hooks/use-leaflet-map.ts`](../apps/web/src/hooks/use-leaflet-map.ts)
  decide la capa base; [`apps/web/src/lib/map-config.ts`](../apps/web/src/lib/map-config.ts)
  lee las variables. Lo usan las tres pantallas con mapa (Pasajero, Conductor,
  Admin → Paradas) sin cambios adicionales.
- Librería: `protomaps-leaflet` (renderiza el `.pmtiles` vectorial en un canvas
  dentro de Leaflet). Los marcadores, polilíneas de ruta y popups siguen igual.
- Atribución: se muestra "© OpenStreetMap · Protomaps" (los datos son de OSM).
- Fallback: sin `VITE_MAP_PMTILES_URL`, se usan tiles OSM. Es seguro desplegar
  antes de tener el archivo hospedado.
- Mejora futura: cachear el `.pmtiles` en el service worker (hoy se apoya en el
  caché HTTP del navegador con range requests).
