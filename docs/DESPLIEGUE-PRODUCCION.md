# 🚀 Guía de despliegue en producción — TransPadilla

Esta guía describe cómo dejar TransPadilla corriendo **24/7** de forma confiable.
Hay dos caminos; elige según presupuesto y capacidad técnica.

---

## Opción A — Render (la más simple)
Ya está soportada con [`render.yaml`](../render.yaml). Para uso real:
1. Subir a planes **de pago** (los gratuitos se duermen).
2. En el servicio `transpadilla-web`, para arrancar sin datos demo:
   `SEED_DEMO=false`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
3. Activar **backups** de la base (plan de pago de PostgreSQL) y un monitor de uptime.

## Opción B — VPS propio con Docker (más económico) ⭐
Todo en **un solo servidor** (DigitalOcean/Hetzner/AWS Lightsail, ~US$6–12/mes).

### Pasos
1. Crea un VPS (Ubuntu) e instala Docker + Docker Compose.
2. Clona el repo y crea el `.env` con **secretos fuertes**:
   ```bash
   POSTGRES_PASSWORD=...           # contraseña fuerte
   JWT_SECRET=...                  # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   DJANGO_SECRET_KEY=...           # cadena larga aleatoria
   # Producción real (sin datos demo):
   SEED_DEMO=false
   ADMIN_EMAIL=admin@alcaldia.gov.co
   ADMIN_PASSWORD=...
   ```
3. Levanta todo:
   ```bash
   docker compose up -d --build
   ```
   Esto inicia PostgreSQL + el servidor web (API + WebSockets + sirve el frontend).
4. **HTTPS + dominio**: pon **Caddy** o **Nginx** como proxy inverso delante del
   puerto 8080, apuntando tu dominio. Caddy saca el certificado HTTPS solo:
   ```
   transpadilla.tudominio.gov.co {
       reverse_proxy localhost:8080
   }
   ```

---

## Operación 24/7 (independiente de la opción)

- **HTTPS obligatorio**: el GPS del conductor solo funciona sobre HTTPS.
- **Backups de la base**: programa un `pg_dump` diario (cron) y guárdalo fuera del
  servidor. Ejemplo:
  ```bash
  0 3 * * * docker exec <db> pg_dump -U postgres transpadilla | gzip > /backups/tp_$(date +\%F).sql.gz
  ```
- **Monitoreo de uptime**: configura UptimeRobot o Healthchecks (gratis) apuntando a
  `https://tu-dominio/api/healthz` (vivo) y `https://tu-dominio/api/readyz` (verifica
  también la base de datos). Activa alertas por correo/WhatsApp ante caídas.
- **Alertas de errores**: el API registra cada error con pino (`req.log.error`). Configura
  **alertas sobre los logs** (Render Log Streams / un destino externo) para enterarte de
  fallos sin revisar manualmente. (Una integración con Sentry es posible, pero requiere
  ajustar el empaquetado esbuild: su SDK arrastra OpenTelemetry y no bundlea en un solo
  `.mjs`; por eso no viene incluida.)
- **En Supabase**: usa el plan **Pro** para respaldos point-in-time (el free no garantiza
  backups). El historial de posiciones se autopoda (`HISTORIAL_RETENCION_DIAS`, default 30).
- **Rotación de secretos**: rota periódicamente `DATABASE_URL`, `JWT_SECRET` y la API key
  de mapas; restringe la key de mapas por dominio.
- **Mapas y rutas con SLA**: define en el build del frontend
  `VITE_MAP_TILES_URL`, `VITE_MAP_ATTRIBUTION` y `VITE_OSRM_URL` para usar un
  proveedor con garantía o un OSRM propio. Por defecto usa los
  servidores públicos de demostración (no recomendados para producción).
- **Actualizaciones**: `git pull && docker compose up -d --build`. La PWA del
  frontend se auto-actualiza en los dispositivos.

---

## Variables de entorno (resumen)

| Variable | Servicio | Para qué |
|----------|----------|----------|
| `DATABASE_URL` | Node | Conexión a PostgreSQL |
| `JWT_SECRET` | Node | Firma de sesiones (obligatorio en prod) |
| `SEED_DEMO` | Node | `false` = arranque limpio (solo admin) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Node | Admin inicial en arranque limpio |
| `CORS_ORIGIN` | Node | Orígenes permitidos (opcional) |
| `DB_POOL_MAX` | Node | Conexiones del pool (default 20, opcional) |
| `HISTORIAL_RETENCION_DIAS` | Node | Días de historial a conservar (default 30) |
| `VITE_MAP_TILES_URL` / `VITE_OSRM_URL` | Frontend (build) | Proveedor de mapas/rutas |

> ⚠️ Los Dockerfiles y `docker-compose.yml` son una base lista para usar; prueba
> `docker compose build` en el servidor destino antes de la puesta en marcha.
