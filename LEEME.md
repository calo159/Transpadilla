# TransPadilla — Guía rápida (local)

Sistema de rastreo de transporte público en tiempo real para Riohacha, La Guajira.
**Moviendo la Ciudad.**

> 🌐 App desplegada: **https://transpadilla-web.onrender.com**
> (Esta guía es solo para correr el proyecto en tu PC; para mostrarlo basta la URL.)

---

## ▶ Arrancar la app (uso diario)

Ya está todo instalado y configurado. Solo ejecuta:

```powershell
./iniciar.ps1
```

Esto abre dos ventanas (servidor API + frontend). Luego abre el navegador en:

> **http://localhost:5173**

Para detener: cierra las dos ventanas de PowerShell.

### Cuentas demo
| Rol | Correo | Contraseña |
|-----|--------|-----------|
| Admin | admin@transpadilla.co | admin123 |
| Conductor | conductor@transpadilla.co | conductor123 |
| Pasajero | pasajero@transpadilla.co | pasajero123 |

---

## 🧩 ¿Qué hay instalado?

- **Node.js 24** + **pnpm** — entorno de ejecución
- **PostgreSQL 17** — base de datos (servicio automático de Windows)
  - Usuario: `postgres` · Contraseña: `postgres` · Base: `transpadilla`
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
  PROPUESTA-ALCALDIA.md       → Presupuesto y propuesta para la Alcaldía
  generar-propuesta-word.py   → Genera la propuesta en Word (.docx)
  DESPLIEGUE-PRODUCCION.md    → Guía para despliegue 24/7 (VPS / Render)
  CAPACITOR-ANDROID.md        → App nativa Android (APK conductor)
```

---

## 📞 Contacto / Marca

- WhatsApp atención al cliente: configurado en `Pasajero.tsx` y `Login.tsx`
- Instagram: [@transpadilla.co](https://www.instagram.com/transpadilla.co)
- Tarifa: $3.000 COP

> Para cambiar el número de WhatsApp, edita la constante `WHATSAPP_NUMERO`
> en `apps/web/src/pages/Pasajero.tsx` y `Login.tsx`.
