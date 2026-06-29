# @workspace/web — Frontend

Aplicación React (Vite + TypeScript) que sirve las tres vistas de TransPadilla y se
empaqueta como **PWA** y como **APK Android** (Capacitor).

## Stack
React 19 · Vite · Tailwind · Leaflet (mapas) · TanStack Query · Wouter (router) ·
Socket.IO client · recharts (reportes) · Capacitor (Android).

## Estructura
```
src/
  pages/        Una página por vista:
                  Pasajero.tsx   → mapa público en vivo (la landing "/")
                  Conductor.tsx  → panel del conductor (GPS, novedades)
                  Admin.tsx      → panel admin (+ admin/*Tab.tsx, incl. ReportesTab)
                  Login.tsx, Privacidad.tsx, Terminos.tsx
  components/   UI reutilizable (ui/ = shadcn) + LogoTP, LegalPage, diálogos
  hooks/        use-leaflet-map (mapa compartido), use-document-title, etc.
  lib/          api.ts (apiFetch), map-config, geo, routing, constants, types
  main.tsx      Punto de entrada; configura setBaseUrl para el APK (VITE_API_URL)
android/        Proyecto nativo generado por Capacitor (se commitea)
```

## Scripts
```bash
pnpm --filter @workspace/web run dev        # Vite dev server (:5173)
pnpm --filter @workspace/web run build      # build de producción → dist/public
pnpm --filter @workspace/web run typecheck
pnpm --filter @workspace/web run test       # Vitest + Testing Library
```

## Notas
- Las llamadas al API usan `apiFetch` (`src/lib/api.ts`) o los hooks de
  **`@workspace/api-client`** (generados); el socket vive en `Pasajero.tsx`.
- Para el APK se compila con `VITE_API_URL=https://...onrender.com` (apunta el bundle
  local al backend). Ver [docs/CAPACITOR-ANDROID.md](../../docs/CAPACITOR-ANDROID.md).
- La vista Pasajero sigue el estándar de diseño en [docs/UI-SKILL.md](../../docs/UI-SKILL.md).
