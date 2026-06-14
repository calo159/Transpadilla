# TransPadilla — Guía rápida (local)

Sistema de rastreo de transporte público en tiempo real para Riohacha, La Guajira.
**Moviendo la Ciudad.**

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
- **Python 3.12** + **Django 5** — microservicio de tráfico (`django/venv`)
- Dependencias del proyecto (`node_modules`) — ya instaladas
- Tablas de la base de datos — ya creadas
- Datos demo (3 rutas, 7 paradas, 3 buses) — ya cargados

## 🚦 Módulo de Tráfico (Python/Django)

El tab **Tráfico** del panel Admin colorea las vías según la congestión
(verde = fluido, amarillo = lento, rojo = detenido), calculada con la velocidad
real de los buses. Lo gestiona un microservicio **Django** (puerto 8000 interno).

- Ya está configurado. `iniciar.ps1` lo arranca junto con el resto.
- Si alguna vez falta, ejecuta una vez: **`configurar-trafico.ps1`**.
- Los tramos se **generan solos** desde las rutas y paradas que creas en el panel
  Admin (cada par de paradas consecutivas = un tramo). No hay que configurarlos.
- Para ver colores en vivo: entra como **conductor**, activa el **modo simulación**
  y los buses se moverán; en el tab Tráfico verás los tramos cambiar de color.

La configuración está en el archivo **`.env`** (no lo subas a internet).

---

## 🛠 Comandos útiles

| Acción | Comando |
|--------|---------|
| Arrancar todo | `./iniciar.ps1` |
| Solo el API | `pnpm --filter @workspace/api-server run dev` |
| Solo el frontend | `pnpm --filter @workspace/transpadilla run dev` |
| Recrear tablas | `pnpm --filter @workspace/db push` |
| Recargar datos demo | `Invoke-RestMethod -Method Post http://localhost:8080/api/seed` |
| Configurar tráfico (1 vez) | `./configurar-trafico.ps1` |
| Build de producción | `pnpm --filter @workspace/transpadilla run build` |

---

## 🗺 Estructura

```
artifacts/
  transpadilla/   → Frontend React (mapa, login, conductor, admin)
  api-server/     → Backend Express + Socket.IO (puerto 8080)
lib/
  db/             → Esquema de base de datos (Drizzle ORM)
  api-client-react/, api-zod/, api-spec/  → Cliente y tipos generados
django/           → Microservicio de tráfico (opcional, no requerido)
```

---

## 📞 Contacto / Marca

- WhatsApp atención al cliente: configurado en `Pasajero.tsx` y `Login.tsx`
- Instagram: [@transpadilla.co](https://www.instagram.com/transpadilla.co)
- Tarifa: $3.000 COP

> Para cambiar el número de WhatsApp, edita la constante `WHATSAPP_NUMERO`
> en `artifacts/transpadilla/src/pages/Pasajero.tsx` y `Login.tsx`.
