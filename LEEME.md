# TransPadilla — Guía rápida (local)

Sistema de rastreo de transporte público en tiempo real para Riohacha, La Guajira.
**Moviendo la Ciudad.**

> 🌐 App desplegada: **https://transpadilla-web.onrender.com**
> (Esta guía es solo para correr el proyecto en tu PC; para mostrarlo basta la URL.)
>
> 👩‍💻 ¿Eres desarrollador? Ve a **[README.md](README.md)** y **[docs/ONBOARDING.md](docs/ONBOARDING.md)**.

---

## ▶ Arrancar la app (uso diario)

Ya está todo instalado y configurado. Solo ejecuta:

```powershell
./iniciar.ps1
```

Esto abre dos ventanas (servidor API + frontend). Luego abre el navegador en:

> **http://localhost:5173**

Para detener: cierra las dos ventanas de PowerShell.

### Cuentas demo (solo local con `SEED_DEMO=true`)
Se crean automáticamente 3 cuentas de prueba (admin, conductor, pasajero) la primera vez que
arrancas con la base vacía. Las credenciales exactas están en `apps/api/src/lib/seed.ts` —
**nunca se crean en producción**.

---

## 🧩 ¿Qué hay instalado?

- **Node.js 24** + **pnpm 9** — entorno de ejecución
- **Base de datos PostgreSQL** — el proyecto usa **Supabase** (local y producción);
  también puede correr contra un PostgreSQL local. La conexión va en `DATABASE_URL` (`.env`).
- Dependencias del proyecto (`node_modules`) — ya instaladas
- Tablas de la base de datos — ya creadas
- Datos demo (3 rutas, 7 paradas, 3 buses) — ya cargados

La configuración está en el archivo **`.env`** (no lo subas a internet).

---

## 🛠 Comandos útiles

| Acción | Comando |
|--------|---------|
| Arrancar todo | `./iniciar.ps1` |
| Solo el API | `pnpm --filter @workspace/api run dev` |
| Solo el frontend | `pnpm --filter @workspace/web run dev` |
| Recrear tablas | `pnpm --filter @workspace/db push` |
| Recargar datos demo | `Invoke-RestMethod -Method Post http://localhost:8080/api/seed` |
| Pruebas del API | `pnpm --filter @workspace/api run test` |
| Build de producción | `pnpm --filter @workspace/web run build` |

---

## 🗺 Estructura

```
apps/
  web/            → Frontend React (mapa, login, conductor, admin)
  api/            → Backend Express + Socket.IO (puerto 8080)
packages/
  db/             → Esquema de base de datos (Drizzle ORM)
  api-client/     → Hooks React generados (TanStack Query)
  api-types/      → Tipos Zod generados
  api-spec/       → Especificación OpenAPI + orval
docs/
  ONBOARDING.md               → Empieza aquí (guía para desarrolladores)
  DESPLIEGUE-PRODUCCION.md    → Guía para despliegue 24/7 (VPS / Render)
  SUPABASE.md                 → Base de datos + RLS
  CAPACITOR-ANDROID.md        → App nativa Android (APK conductor)
  (+ SEGURIDAD, CLOUDFLARE, MAPA, UI-SKILL)
```

> Cada `apps/*` y `packages/*` tiene su propio `README.md` explicando su rol.

---

## 📞 Contacto / Marca

- WhatsApp atención al cliente: configurado en `Pasajero.tsx` y `Login.tsx`
- Instagram: [@transpadilla.co](https://www.instagram.com/transpadilla.co)
- Tarifa: $3.000 COP

> Para cambiar el número de WhatsApp, edita la constante `WHATSAPP_NUMERO`
> en `apps/web/src/pages/Pasajero.tsx` y `Login.tsx`.
