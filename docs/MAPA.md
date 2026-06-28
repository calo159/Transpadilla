# Mapa de producción (proveedor de tiles)

TransPadilla dibuja el mapa con **Leaflet**. Por defecto usa los tiles **públicos
de OpenStreetMap**, que sirven para desarrollo/demo pero **NO están permitidos a
escala de producción** (su política prohíbe el uso pesado y te bloquean).

Para producción, el mapa lee la variable **`VITE_MAP_TILES_URL`** (y la atribución
`VITE_MAP_ATTRIBUTION`). Apuntándola a un proveedor con su API key, tienes un mapa
de producción **sin tocar código**. La CSP del backend ya permite tiles por HTTPS
de cualquier dominio (`img-src ... https:`), así que no hay que configurar nada más.

## Opción recomendada para arrancar: MapTiler

1. Crea una cuenta en **https://www.maptiler.com** (plan gratis).
2. En tu panel, copia tu **API key**.
3. En **Render** → tu servicio `transpadilla-web` → **Environment** → agrega:

   | Variable | Valor |
   |----------|-------|
   | `VITE_MAP_TILES_URL` | `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=TU_API_KEY` |
   | `VITE_MAP_ATTRIBUTION` | `© MapTiler © OpenStreetMap` |

4. **Re-despliega** (Manual Deploy → Deploy latest commit). Son variables del
   **build** del frontend, así que se aplican al recompilar.

> Otros estilos de MapTiler: `streets-v2`, `basic-v2`, `bright-v2`, `outdoor-v2`,
> `satellite` (cambia el nombre en la URL). Deja `/256/` (tamaño de tile estándar).

### Probarlo en local
En tu `.env` de la raíz (NO se sube a git) agrega las mismas dos variables y corre
`pnpm --filter @workspace/web run dev`. Verás el mapa de MapTiler en `:5173`.

## Notas
- **La key NO es un secreto fuerte**: como es del frontend, queda embebida en el
  bundle (es normal con tiles). Protégela en el panel de MapTiler restringiéndola
  por **dominio/URL** (allowed origins) a `transpadilla-web.onrender.com`.
- **Costo:** gratis hasta la cuota mensual del proveedor; pasada esa, se paga por
  uso. Si más adelante quieres costo cero garantizado a cualquier escala, se puede
  migrar a **Protomaps** (mapa vectorial auto-hospedado, sin key) — solo cambia la
  integración del mapa, no el resto de la app.
- **Otros proveedores** con el mismo formato `{z}/{x}/{y}`: Stadia Maps,
  Thunderforest, Mapbox (todos con su key).
- **Barrios:** ningún proveedor inventa los barrios; todos muestran lo que
  OpenStreetMap tenga de Riohacha. Para nombres de barrios completos se necesita
  una **capa propia** (aparte del proveedor de tiles).

## Líneas de ruta (OSRM)
El trazado de las rutas por calle usa **OSRM**. El servidor demo
(`router.project-osrm.org`) no es para producción; define `VITE_OSRM_URL` con tu
propio OSRM o uno con SLA cuando lo necesites.
