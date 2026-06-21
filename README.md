# 🚌 TransPadilla — Rastreo de Transporte Público en Tiempo Real

**Moviendo la Ciudad.** Sistema web para rastrear los buses del servicio de
transporte público de **Riohacha, La Guajira** en tiempo real, con estimación de
llegada del próximo bus (ETA) a cada parada.



### 🌐 App en vivo
**https://transpadilla-web.onrender.com**
> Plan gratuito: la primera carga puede tardar ~50 s mientras el servidor "despierta".

---

## 🎯 El problema que resuelve

En Riohacha no existe forma de saber **dónde está el bus** ni **cuánto falta para
que pase**. Los pasajeros esperan sin información, los conductores no reportan
novedades y la empresa no tiene visibilidad de su flota.

**TransPadilla** resuelve esto con tres vistas según el usuario:

- **Pasajero** (sin necesidad de cuenta): abre el mapa y ve los buses moverse en
  vivo, las rutas, las paradas y el **tiempo estimado de llegada**. Botón de
  atención al cliente por WhatsApp.
- **Conductor**: inicia su recorrido, transmite su ubicación GPS y reporta
  novedades (accidente, desvío, demora) que los pasajeros ven al instante.
- **Administrador**: gestiona rutas, paradas, buses y conductores.

El destinatario real es la **empresa TransPadilla**, como herramienta para mejorar y supervisar el servicio.

---

## ✨ Funcionalidades principales

1. **Mapa público en tiempo real** — posición de buses en vivo (WebSockets), rutas
   dibujadas sobre las calles reales y paradas, sin requerir inicio de sesión.
2. **Autenticación por roles** (JWT) — pasajero, conductor y administrador, cada
   uno con su propia interfaz.
3. **Panel del conductor** — transmisión de GPS real, inicio/fin de recorrido,
   reporte de **ocupación** (vacío/medio/lleno) y de **novedades** en vivo. El bus
   lo asigna el administrador.
4. **Panel de administración (CRUD)** — gestión de rutas, paradas, buses y
   conductores con persistencia en base de datos.
5. **ETA "próximo bus en ~X min"** — el backend estima el tiempo de llegada del
   próximo bus a cada parada (distancia Haversine ÷ velocidad real).
6. **Comodidad del pasajero** — rutas favoritas, "seguir mi bus" (el mapa lo
   sigue), botón de ubicación y ocupación visible en cada bus.
7. **Seguridad y calidad** — autorización por rol en el backend, cambio de
   contraseña self-service, pruebas automatizadas (Vitest) e integración continua.

---

## 🧱 Arquitectura y tecnologías

```
┌──────────────┐   WebSocket/HTTP   ┌────────────────┐
│   Frontend   │ ─────────────────► │   API Server   │
│ React + Vite │                    │ Express + IO   │
│  (Leaflet)   │ ◄───────────────── │   (Node.js)    │
└──────────────┘                    └───────┬────────┘
                                            │
                                            ▼
                                    ┌────────────────┐
                                    │   PostgreSQL   │
                                    └────────────────┘
```

Un **único servicio Node** sirve la API, los WebSockets, el cálculo del ETA y el
frontend ya construido (mismo dominio, sin CORS). Más simple de operar y desplegar.

- **Frontend:** React + Vite + TypeScript, Leaflet (mapas), TanStack Query,
  Tailwind, PWA instalable.
- **API Server:** Node.js + Express + Socket.IO (tiempo real) + Drizzle ORM. Sirve
  el frontend en producción y calcula el ETA del próximo bus (Haversine).
- **Base de datos:** PostgreSQL.
- **Calidad:** TypeScript estricto, pruebas con Vitest + Supertest y CI en GitHub Actions.

---

## ⚙️ Instalación y ejecución

### Requisitos
- **Node.js 20+** y **pnpm** — `npm install -g pnpm`
- **PostgreSQL 14+**

### 1. Base de datos
```bash
psql -U postgres -c "CREATE DATABASE transpadilla;"
```

### 2. Variables de entorno
Copia la plantilla y edita tus credenciales:
```bash
cp .env.example .env
```
`.env` (no se sube al repositorio):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/transpadilla
JWT_SECRET=algun_secreto_largo_aleatorio
PORT=8080
```

### 3. Frontend + API (Node)
```bash
pnpm install
pnpm --filter @workspace/db push          # crea las tablas
pnpm --filter @workspace/api run dev   # API en :8080
pnpm --filter @workspace/web run dev   # frontend en :5173
```
Cargar datos demo (con el API corriendo):
```bash
curl -X POST http://localhost:8080/api/seed
```

### Pruebas
```bash
pnpm --filter @workspace/api run test   # unitarias siempre; integración si hay DATABASE_URL
```

### En Windows (atajo)
```powershell
./iniciar.ps1   # arranca API + frontend juntos
```
Luego abre **http://localhost:5173**.

### Cuentas demo
| Rol | Correo | Contraseña |
|-----|--------|-----------|
| Admin | admin@transpadilla.co | admin123 |
| Conductor | conductor@transpadilla.co | conductor123 |
| Pasajero | pasajero@transpadilla.co | pasajero123 |

---

## ☁️ Despliegue en Render (producción)

El repo incluye un **Blueprint** ([`render.yaml`](render.yaml)) que despliega todo
con un solo clic:

| Recurso | Qué es |
|---------|--------|
| `transpadilla-web` | Node: API + Socket.IO **y** sirve el frontend React ya construido (un solo dominio con HTTPS). Render detecta pnpm por el `pnpm-lock.yaml` y el campo `packageManager`. |
| `transpadilla-db` | PostgreSQL gestionado. |

### Pasos

1. **Sube el repo a GitHub** (el `.env` no se sube; los secretos se configuran en
   Render). Verifica que `.env` siga en `.gitignore`.
2. En [Render](https://render.com): **New → Blueprint** → conecta tu repositorio →
   **Apply**. Render lee `render.yaml`, crea ambos recursos y los enlaza: la
   `DATABASE_URL` y el `JWT_SECRET` se configuran **solos**.
3. Define `ADMIN_EMAIL` / `ADMIN_PASSWORD` cuando Render los pida (van como
   `sync:false`, no en el repo); con `SEED_DEMO=false` la base arranca limpia y
   crea solo ese administrador.

> **Nota sobre el plan gratuito:** los servicios free de Render se "duermen" tras
> unos minutos de inactividad (la primera petición tarda ~30 s en despertar) y la
> base de datos gratuita tiene vigencia limitada. Para una demostración es
> suficiente; para uso institucional 24/7 se recomienda el plan de pago o un VPS.

### Migraciones / esquema
- Las tablas se crean solas al arrancar (idempotente, ver
  [`init-db.ts`](apps/api/src/lib/init-db.ts)); en local puedes usar
  `pnpm --filter @workspace/db push`.

---

## 📁 Estructura del proyecto

```
apps/
  web/              Frontend React (mapa, login, conductor, admin)
  api/              API Node.js (Express + Socket.IO + Drizzle + ETA), con tests
packages/
  db/               Esquema de base de datos (Drizzle ORM)
  api-client/       Hooks React generados (TanStack Query)
  api-types/        Tipos Zod generados
  api-spec/         Especificación OpenAPI + orval
docs/
  PROPUESTA-ALCALDIA.md       Presupuesto y propuesta para la Alcaldía
  generar-propuesta-word.py   Genera la propuesta en formato Word (.docx)
  DESPLIEGUE-PRODUCCION.md    Guía de despliegue 24/7 (VPS / Render)
  CAPACITOR-ANDROID.md        App nativa Android para el conductor
.github/workflows/ci.yml      Integración continua (typecheck, build, test, audit)
```

> Los scripts `.ps1` de la raíz (`iniciar.ps1`, `iniciar-https.ps1`,
> `habilitar-celular.ps1`) son lanzadores de Windows pensados para ejecutarse
> desde la raíz; por eso se dejan ahí a propósito.

---

## 📬 Contacto

Para cotizaciones, demos o soporte institucional, escríbenos al
[WhatsApp de TransPadilla](https://wa.me/573144167656) o por Instagram
[@transpadilla.co](https://www.instagram.com/transpadilla.co).
