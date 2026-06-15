# 🚌 TransPadilla — Rastreo de Transporte Público en Tiempo Real

**Moviendo la Ciudad.** Sistema web para rastrear los buses del servicio de
transporte público de **Riohacha, La Guajira** en tiempo real, con monitoreo de
tráfico calculado a partir de la velocidad real de los buses.

> Proyecto Final — **Programación Avanzada**, Universidad de La Guajira (2026-I)
> Docente: Eduardo Sierra.

---

## 🎯 El problema que resuelve

En Riohacha no existe forma de saber **dónde está el bus** ni **cuánto falta para
que pase**. Los pasajeros esperan sin información, los conductores no reportan
novedades y la empresa no tiene visibilidad de su flota ni del estado de las vías.

**TransPadilla** resuelve esto con tres vistas según el usuario:

- **Pasajero** (sin necesidad de cuenta): abre el mapa y ve los buses moverse en
  vivo, las rutas, las paradas y los tiempos. Botón de atención al cliente por
  WhatsApp.
- **Conductor**: inicia su recorrido, transmite su ubicación GPS y reporta
  novedades (accidente, desvío, demora) que los pasajeros ven al instante.
- **Administrador**: gestiona rutas, paradas y buses, y monitorea el **tráfico**
  de la ciudad como un mapa tipo Google (verde = fluido, amarillo = lento,
  rojo = detenido).

El destinatario real es la **empresa TransPadilla** y la **Gobernación de La
Guajira**, como herramienta para mejorar y supervisar el servicio.

---

## ✨ Funcionalidades principales

1. **Mapa público en tiempo real** — posición de buses en vivo (WebSockets), rutas
   dibujadas sobre las calles reales y paradas, sin requerir inicio de sesión.
2. **Autenticación por roles** (JWT) — pasajero, conductor y administrador, cada
   uno con su propia interfaz.
3. **Panel del conductor** — transmisión de GPS real, inicio/fin de recorrido y
   reporte de novedades en vivo. El bus lo asigna el administrador.
4. **Panel de administración (CRUD)** — gestión de rutas, paradas y buses con
   persistencia en base de datos.
5. **Monitoreo de tráfico (microservicio Python/Django)** — clasifica cada tramo
   de vía según la velocidad real de los buses y lo colorea en el mapa.

---

## 🧱 Arquitectura y tecnologías

```
┌──────────────┐   WebSocket/HTTP   ┌────────────────┐   proxy /api/trafico  ┌──────────────────┐
│   Frontend   │ ─────────────────► │   API Server   │ ────────────────────► │  Microservicio   │
│ React + Vite │                    │ Express + IO   │                       │  Tráfico (Python)│
│  (Leaflet)   │ ◄───────────────── │   (Node.js)    │ ◄──────────────────── │  Django + DRF    │
└──────────────┘                    └───────┬────────┘                       └────────┬─────────┘
                                            │                                         │
                                            ▼                                         ▼
                                    ┌─────────────────────────────────────────────────┐
                                    │              PostgreSQL (una sola base)           │
                                    └─────────────────────────────────────────────────┘
```

- **Microservicio de Tráfico (Python):** **Django 5** + **Django REST Framework**,
  `psycopg2`, `python-dotenv`. Expone una API REST (`/api/estado/`,
  `/api/procesar/`) y contiene la lógica de negocio del proyecto: genera los tramos
  de vía dinámicamente desde las rutas, asigna cada bus al tramo más cercano
  (distancia punto-a-segmento con fórmula de Haversine) y clasifica la congestión.
- **Frontend:** React + Vite + TypeScript, Leaflet (mapas), TanStack Query,
  Tailwind, PWA instalable.
- **API Server:** Node.js + Express + Socket.IO (tiempo real) + Drizzle ORM.
- **Base de datos:** PostgreSQL (compartida entre el API Node y el microservicio
  Python, que la lee con modelos `managed = False`).

> El componente **Python/Django** es responsable de todo el módulo de tráfico:
> modelos, migraciones, servicio de clasificación y API REST. Ver
> [`django/trafico/`](django/trafico/).

---

## ⚙️ Instalación y ejecución

### Requisitos
- **Node.js 20+** y **pnpm** — `npm install -g pnpm`
- **Python 3.12+**
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
pnpm --filter @workspace/api-server run dev   # API en :8080
pnpm --filter @workspace/transpadilla run dev # frontend en :5173
```
Cargar datos demo (con el API corriendo):
```bash
curl -X POST http://localhost:8080/api/seed
```

### 4. Microservicio de Tráfico (Python/Django)
```bash
cd django
python -m venv venv
venv\Scripts\activate        # Windows   (source venv/bin/activate en Linux/Mac)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

### En Windows (atajo)
Hay scripts que automatizan todo lo anterior:
```powershell
./configurar-trafico.ps1   # solo la primera vez (venv + dependencias + migraciones)
./iniciar.ps1              # arranca frontend + API + Django juntos
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

El repo incluye un **Blueprint** ([`render.yaml`](render.yaml)) que despliega los
tres componentes con un solo clic:

| Recurso | Qué es |
|---------|--------|
| `transpadilla-web` | Node: API + Socket.IO **y** sirve el frontend React ya construido (un solo dominio con HTTPS). Render detecta pnpm por el `pnpm-lock.yaml` y el campo `packageManager`. |
| `transpadilla-trafico` | Django + Gunicorn: microservicio de tráfico. |
| `transpadilla-db` | PostgreSQL gestionado, compartido por ambos. |

### Pasos

1. **Sube el repo a GitHub** (el `.env` no se sube; los secretos se configuran en
   Render). Verifica que `.env` siga en `.gitignore`.
2. En [Render](https://render.com): **New → Blueprint** → conecta tu repositorio →
   **Apply**. Render lee `render.yaml`, crea los 3 recursos y los enlaza
   (la `DATABASE_URL` y los secretos `JWT_SECRET` / `DJANGO_SECRET_KEY` se generan
   solos).
3. **Único paso manual:** cuando el servicio `transpadilla-trafico` termine de
   desplegarse, copia su URL pública (algo como
   `https://transpadilla-trafico.onrender.com`) y pégala en la variable
   **`TRAFICO_URL`** del servicio `transpadilla-web` (Environment → Save). El
   servicio se reinicia y el tab de Tráfico queda conectado.
4. Abre la URL de `transpadilla-web`. En el primer arranque, el servidor **crea las
   tablas y carga los datos demo automáticamente** (`SEED_ON_START=true`), así que
   ya puedes entrar con las cuentas demo de arriba.

> **Nota sobre el plan gratuito:** los servicios free de Render se "duermen" tras
> unos minutos de inactividad (la primera petición tarda ~30 s en despertar) y la
> base de datos gratuita tiene vigencia limitada. Para una demo o entrega es
> suficiente; para uso real conviene un plan de pago.

### Migraciones / esquema
- Las tablas del backend Node se crean solas al arrancar (idempotente, ver
  [`init-db.ts`](artifacts/api-server/src/lib/init-db.ts)) — **no** se usa
  `drizzle-kit push` en producción para no interferir con las tablas de Django.
- Las tablas de Django se crean en su `buildCommand` con `manage.py migrate`.

---

## 🤖 Uso de IA

Durante el desarrollo se utilizó **Claude (Anthropic), mediante Claude Code**, como
asistente de programación en estas tareas:

- Configuración del entorno local en Windows (Node, Python, PostgreSQL).
- Implementación del módulo de tráfico en Django: modelos `managed = False` que
  leen las tablas de la base, la función `sincronizar_tramos()` que genera los
  tramos desde las rutas, y el algoritmo de distancia punto-a-segmento para asignar
  buses a cada tramo.
- Ajustes de diseño responsive, branding y la configuración de los scripts de
  arranque.

Todo el código fue revisado y es comprendido por el equipo. La IA se usó como
herramienta de apoyo y aceleración, no como reemplazo del entendimiento del
proyecto.

---

## 📁 Estructura del proyecto

```
artifacts/
  transpadilla/     Frontend React (mapa, login, conductor, admin, tráfico)
  api-server/       API Node.js (Express + Socket.IO + Drizzle)
lib/
  db/               Esquema de base de datos (Drizzle ORM)
django/             Microservicio de Tráfico (Python / Django + DRF)
  trafico/          App Django: models, views, traffic_service, migrations
  trafico_config/   Configuración del proyecto Django
  requirements.txt  Dependencias de Python
```

---

## 👥 Integrantes

<!-- Completar con los nombres reales de TODOS los integrantes del grupo -->
- Nombre Apellido — [usuario GitHub]
- Nombre Apellido — [usuario GitHub]
- _(2 a 4 integrantes)_

---

_Programación Avanzada · Universidad de La Guajira · 2026-I_
