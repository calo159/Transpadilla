# 📱 App nativa Android (Capacitor) — TransPadilla

Guía para empaquetar TransPadilla como **app nativa de Android** reutilizando el
código web actual (no se reescribe nada). Pensada sobre todo para el **conductor**.

> Solo el conductor necesita la app nativa (para GPS en segundo plano). Pasajeros y
> administración siguen usando la web normal.

---

## Requisitos (en tu PC)
- **Android Studio** instalado (incluye el SDK de Android y el emulador).
- **Node.js + pnpm** (ya los tienes).
- Java JDK (viene con Android Studio).

---

## Fase 1 — APK instalable (shell del sitio desplegado)
La forma más rápida de tener un APK: la app abre el sitio ya desplegado dentro de un
contenedor nativo. La config ya está en [`capacitor.config.ts`](../apps/web/capacitor.config.ts).

```bash
cd apps/web

# 1. Instalar Capacitor (una sola vez)
pnpm add @capacitor/core
pnpm add -D @capacitor/cli
pnpm add @capacitor/android

# 2. Generar el proyecto Android (crea la carpeta android/)
npx cap add android

# 3. Sincronizar la config
npx cap sync android

# 4. Abrir en Android Studio
npx cap open android
```
En Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**. El `.apk`
queda en `android/app/build/outputs/apk/…` y se puede instalar en cualquier teléfono.

> Con esta fase ya tienes una app instalable que muestra siempre la última versión.
> El GPS funciona con la pantalla encendida (Wake Lock, ya implementado), igual que
> en la web.

> ⚠️ **Esta fase 1 (`server.url`) ya no es la configuración actual del proyecto.**
> El `capacitor.config.ts` de hoy empaqueta el build localmente (`webDir`, sin
> `server.url`) — ver la Fase 2 y la sección de **build seguro** más abajo. Si alguna
> vez reactivas `server.url` para probar algo, **nunca lo apuntes a un dev server de
> Vite** (`http://<IP>:5173`): ese servidor entrega los archivos fuente `.tsx` sin
> empaquetar, y quedarían visibles al inspeccionar el WebView.

---

## Fase 2 — GPS en segundo plano real (pantalla apagada)
Para que el GPS transmita con la **pantalla apagada / app en segundo plano** hay que:

1. **Empaquetar la app localmente** (no como shell remoto):
   - En `capacitor.config.ts`, **quitar/comentar** el bloque `server.url`.
   - Construir el frontend apuntando al backend por URL absoluta:
     ```bash
     # La app local debe llamar al backend por URL completa (no rutas relativas).
     # Define la base del API en el build (requiere un pequeño ajuste en el código
     # para usar VITE_API_URL en fetch y en socket.io).
     VITE_API_URL=https://transpadilla-web.onrender.com pnpm run build
     npx cap sync android
     ```

2. **Instalar un plugin de geolocalización en segundo plano**. Opciones:
   - Gratuito: `@capacitor-community/background-geolocation` (funciona, con detalles
     según el modelo de teléfono).
   - Profesional/confiable (de pago, ~US$300 licencia única):
     `@transistorsoft/capacitor-background-geolocation`.

3. **Permisos en Android** (`android/app/src/main/AndroidManifest.xml`):
   `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`.
   El conductor debe **permitir ubicación "Todo el tiempo"** y desactivar la
   optimización de batería para la app.

4. En el panel del conductor, usar el plugin (en vez de `navigator.geolocation`)
   para enviar la posición a `POST /api/buses/gps` aunque la app esté en segundo plano.

> **Publicar en Google Play** (opcional): cuenta de desarrollador US$25 (única vez).
> El permiso de ubicación en segundo plano requiere una justificación en la revisión
> de Google (viable para uso institucional de flota).

---

## Build seguro para producción (release) — evitar exponer el código fuente

El código fuente (`.ts`/`.tsx`) **nunca debe verse** al inspeccionar la app instalada.
El proyecto ya está configurado para eso, pero hay que generar el APK correcto:

```bash
cd apps/web
pnpm run build              # build de producción: minificado, SIN source maps
npx cap sync android        # copia dist/public → android/app/src/main/assets/public

cd android
./gradlew assembleRelease   # o: Android Studio → Build > Generate Signed Bundle/APK
```

Distribuye **solo** `android/app/build/outputs/apk/release/app-release.apk` (firmado).
**Nunca** el `app-debug.apk` (variante `debug`): esa se compila sin minificar
(`minifyEnabled false`) y con la depuración remota del WebView activable.

Qué garantiza que el release no exponga nada:
- `vite.config.ts` → `build.sourcemap: false` (sin `.map`) y en modo producción
  elimina `console.*`/`debugger` del bundle (`esbuild.drop`).
- `capacitor.config.ts` → `webDir` local, **sin `server.url`** (no depende de ningún
  servidor externo ni de un dev server).
- `MainActivity.java` → `WebView.setWebContentsDebuggingEnabled(false)` +
  `FLAG_SECURE` (bloquea capturas de pantalla y la inspección remota vía
  `chrome://inspect`).
- `AndroidManifest.xml` → `android:debuggable="false"`.
- `build.gradle` (`buildTypes.release`) → `minifyEnabled true` + `shrinkResources
  true` + ProGuard.

Verificación rápida tras el build: en `apps/web/dist/public` no debe haber ningún
`*.map`, y `android/app/src/main/assets/public` no debe contener `src/` ni archivos
`.ts`/`.tsx` (solo `assets/*.js` minificados con hash).

---

## ¿App nativa o rastreador GPS?
- **App nativa**: evita comprar hardware; depende de que el conductor lleve el teléfono
  cargado y con permisos correctos.
- **Rastreador GPS dedicado**: máxima confiabilidad, transmite solo; tiene costo por
  bus. Recomendado para flota 24/7.
