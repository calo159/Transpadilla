# Monitoreo y observabilidad — TransPadilla

Fase 4 del plan de trabajo original. Cómo saber si el sistema está sano y enterarse rápido cuando no
lo está. Parte ya viene en el código (endpoints y alertas); el resto son servicios externos que se
conectan siguiendo esta guía.

Lo que ya trae la app:
- `GET /api/healthz` — vivo (responde 200 si el proceso está arriba).
- `GET /api/readyz` — listo (verifica también la conexión a la base de datos).
- `GET /api/metrics` — JSON con uptime, memoria, requests por estado, tasa de error y últimos
  errores (**solo admin**).
- `GET /api/metrics/prometheus` — las mismas métricas en formato Prometheus (ver 4.2).
- Alertas por webhook con niveles P1–P4 (ver 4.4).

---

## 4.1 — Logs centralizados (SIEM)

Los logs ya salen como **JSON estructurado** (pino) a `stdout`, con los campos sensibles
redactados (no se registran contraseñas ni tokens; el serializer de `app.ts` quita el query string
de la URL). Eso significa que **no hay que cambiar código**: basta drenar el stdout a un SIEM.

**En Render:** el servicio → **Logs** → configura un **Log Stream** hacia el destino (Datadog,
Grafana Loki, Axiom, Better Stack, etc.). En un VPS con Docker, usa el logging driver del contenedor
o un agente (Vector/Fluent Bit) apuntando al SIEM.

Recomendaciones:
- Retención mínima de **1 año** (requisito típico para una entidad pública).
- Indexar por `req.id` (pino ya lo incluye) para reconstruir la traza completa de una petición.
- Alertas del SIEM sobre patrones (ej. pico de `statusCode>=500`, o mensajes de `Fatal startup`).

---

## 4.2 — Métricas Prometheus + Grafana

El endpoint `GET /api/metrics/prometheus` expone en formato de texto Prometheus:

| Métrica | Tipo | Qué es |
|---|---|---|
| `tp_uptime_seconds` | gauge | Segundos desde el arranque del proceso. |
| `tp_requests_total` | counter | Total de respuestas servidas. |
| `tp_responses_total{class}` | counter | Respuestas por clase (`2xx/3xx/4xx/5xx`). |
| `tp_errors_total` | counter | Errores no controlados (500). |
| `tp_memory_bytes{type}` | gauge | Memoria del proceso (`rss`, `heap_used`). |
| `tp_ws_connections` | gauge | Conexiones WebSocket (Socket.IO) activas. |
| `tp_db_pool{state}` | gauge | Pool de PostgreSQL (`total/idle/waiting`). |

**Autenticación del scraper:** define la env **`METRICS_TOKEN`** (una cadena larga y secreta). Con
ella, Prometheus/Grafana Agent puede autenticarse con un token estático que **no expira** como el
JWT de admin. Config de scrape (ejemplo):

```yaml
scrape_configs:
  - job_name: transpadilla
    metrics_path: /api/metrics/prometheus
    scheme: https
    authorization:
      credentials: "EL_VALOR_DE_METRICS_TOKEN"
    static_configs:
      - targets: ["transpadilla-web.onrender.com"]
```

> Sin `METRICS_TOKEN`, el endpoint solo responde a un admin autenticado (JWT), lo cual no es
> práctico para un scraper de larga vida — por eso se recomienda el token de máquina.

**Paneles sugeridos en Grafana:**
- Rendimiento: `rate(tp_requests_total[5m])`, `rate(tp_errors_total[5m])`, ratio de `5xx`.
- Sistema: `tp_memory_bytes`, `tp_db_pool`, `tp_ws_connections`.
- Negocio: complementar con lo que ya da `GET /api/reportes/*` (buses activos, ocupación).

---

## 4.3 — Monitoreo de uptime

Configura UptimeRobot, Better Uptime o Checkly apuntando a:

| Chequeo | Frecuencia | Espera |
|---|---|---|
| `GET /api/healthz` | 1 min | `200` (proceso vivo) |
| `GET /api/readyz` | 5 min | `200` + `db: ok` (base viva) |
| `GET /api/buses` (flujo crítico) | 5 min | `200` con un array JSON |

Alertas del monitor por correo, WhatsApp/SMS (servicios de pago) o webhook (Slack/Discord/Telegram).

> Nota: en el **plan free de Render** el servicio se duerme por inactividad; un monitor de uptime
> cada 1–5 min lo mantiene despierto (efecto secundario útil) además de avisarte de caídas reales.

---

## 4.4 — Alertas con niveles de severidad y escalamiento

El código ya envía alertas al webhook `ALERTA_WEBHOOK_URL` con niveles (ver `lib/alertas.ts`):

| Nivel | Cuándo lo usa el código / cuándo usarlo | Comportamiento |
|---|---|---|
| **P1** 🔴 crítico | Error 500 no controlado (app rota). App/BD caída. | Se envía **siempre** (ignora el throttle). |
| **P2** 🟠 alto | Latencia alta, tasa de 4xx elevada. | Throttled (1/min por defecto). |
| **P3** 🟡 medio | CPU/memoria altas — resumen. | Throttled. |
| **P4** ⚪ bajo | Certificado próximo a expirar — semanal. | Throttled. |

**Escalamiento:** el webhook es el punto de integración. Para turnos/guardias:
- **Telegram/Slack/Discord** directo con `ALERTA_WEBHOOK_URL` (lo más simple).
- **PagerDuty / Opsgenie:** crea un webhook de entrada en la herramienta y ponlo como
  `ALERTA_WEBHOOK_URL`; configura ahí las reglas de escalamiento (P1 → llamar de inmediato, P2 → en
  horario laboral, etc.) y los turnos.

**Heartbeats (opcional):** además de las alertas por error, un monitor externo (4.3) que revise
`/api/healthz` cada minuto actúa como heartbeat: si deja de responder, la caída se detecta aunque el
proceso no alcance a emitir una alerta P1.
