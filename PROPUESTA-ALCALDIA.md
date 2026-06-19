# 📄 Propuesta y presupuesto — TransPadilla para la Alcaldía

**Sistema de rastreo de transporte público en tiempo real para Riohacha, La Guajira.**
Documento para evaluar la puesta en operación **24/7** del sistema.

> Los valores son **estimados** (los precios de los proveedores cambian). Se dan en
> USD con equivalente aproximado en COP (tasa de referencia ~$4.000/US$1). Verificar
> al momento de contratar.

---

## 1. Resumen ejecutivo

TransPadilla permite a la ciudadanía ver **en vivo** dónde están los buses, cuánto
tardan en llegar y el estado del servicio; a los conductores reportar su recorrido,
ocupación y novedades; y a la Alcaldía/empresa **supervisar la flota y el tráfico**.

El sistema **ya está construido, probado y funcionando** en una versión de
demostración. Para operar de forma **continua y confiable (24/7)** se requiere una
inversión modesta en infraestructura y operación, detallada abajo.

**No existe software “sin errores” al 100%.** Lo que esta inversión garantiza es
**alta disponibilidad** (que no se caiga), **detección temprana de fallos**,
**respaldo de datos** y **mantenimiento** para corregir rápido cualquier incidencia.

---

## 2. Mejoras ya realizadas para producción (sin costo) ✅

Se implementó —sin costo adicional— el endurecimiento técnico para que el sistema sea
apto para una entidad pública:

- **Seguridad**: secretos obligatorios en producción, cabeceras de seguridad,
  límite de intentos de login (anti fuerza bruta), validación de todos los datos de
  entrada, y restricción de orígenes (CORS).
- **Robustez**: manejo global de errores, verificación de la base de datos
  (`/api/readyz` para monitoreo), apagado ordenado para reinicios 24/7, y pantalla
  de recuperación ante fallos (sin “pantallas blancas”).
- **Datos**: arranque **limpio** configurable (solo el administrador real, sin datos
  de prueba) para el entorno de la Alcaldía.
- **Flexibilidad de proveedores**: el mapa y el cálculo de rutas se pueden cambiar a
  un proveedor con garantía **sin reprogramar** (solo configuración).
- **GPS del conductor**: la pantalla se **mantiene encendida** durante el recorrido
  (Wake Lock) y el GPS se reactiva al volver a la app, para no cortar la transmisión.
- **Operación**: archivos de **Docker** y guía de despliegue para hospedar todo en un
  solo servidor económico, con respaldos y monitoreo.

---

## 3. Lo que requiere financiamiento (para 24/7) 💵

### 3.1 Infraestructura (hospedaje) — OBLIGATORIO
La versión de demostración usa un plan gratuito que **se apaga por inactividad**.
Para 24/7 se necesita hospedaje pagado. Dos alternativas:

| Alternativa | Detalle | Costo mensual aprox. |
|---|---|---|
| **VPS único (recomendado)** | Un servidor (Hetzner/DigitalOcean) con Docker: base de datos + Django + web | **US$6–15** (~$24.000–60.000 COP) |
| Render (servicios gestionados) | Web + Django + PostgreSQL con backups | US$20–50 (~$80.000–200.000 COP) |

### 3.2 Mapas y cálculo de rutas — RECOMENDADO
Los servicios públicos actuales (OpenStreetMap/OSRM de demo) **no tienen garantía**
para uso intensivo.

| Ítem | Opción | Costo mensual aprox. |
|---|---|---|
| Mapa (tiles) | MapTiler/Mapbox (tienen capa gratuita) | US$0–50 (~$0–200.000 COP) |
| Cálculo de rutas | OSRM propio en el mismo VPS | **US$0** (incluido) |

### 3.3 GPS de los buses — el rubro principal 🚍
Es la decisión más importante: **cómo reporta su posición cada bus**. El reto técnico
es la **transmisión continua**, sobre todo con la pantalla apagada o el teléfono en
segundo plano.

> Nota técnica: una **app web** (la actual) **no puede** transmitir con la pantalla
> totalmente apagada — es un límite de los navegadores. Ya se implementó (sin costo)
> que **la pantalla se mantenga encendida** durante el recorrido (Wake Lock), lo que
> cubre el caso común. Para transmisión 100% en segundo plano se requiere app nativa
> o rastreador dedicado.

**Tres caminos (de menor a mayor confiabilidad):**

| Opción | Confiabilidad | Inversión inicial | Mensual por bus | Depende del conductor |
|---|---|---|---|---|
| **A) Web actual + Wake Lock** (ya hecho) | Media (pantalla encendida) | Smartphone (si no tienen) | Datos US$5–10 | Sí (debe dejar la app abierta) |
| **B) App nativa Android** (Capacitor) | Alta (GPS en segundo plano) | ~US$25 cuenta Google Play (una vez) + desarrollo + plugin opcional ~US$300 | Datos US$5–10 | Sí (debe llevar el teléfono) |
| **C) Rastreador GPS dedicado** (recomendado) | **Máxima** | Equipo US$30–80 por bus (una vez) | SIM datos US$3–8 | **No** (transmite solo) |

> Notas:
> - **Solo el conductor** necesitaría app nativa; pasajeros y administración siguen
>   funcionando como web. El alcance de la app nativa es acotado (reusa el código actual
>   vía Capacitor, no se reescribe).
> - **Android es suficiente** (los conductores usan Android) → se evita el costo de
>   Apple (US$99/año + Mac).
> - Ejemplo flota de **20 buses** con **rastreadores**: inicial ~US$600–1.600
>   (~$2.4M–6.4M COP) + mensual ~US$60–160 (~$240.000–640.000 COP).
>
> **Recomendación:** para una operación institucional 24/7, el **rastreador dedicado**
> es lo más confiable (no depende de que cada conductor cargue/abra el teléfono). La
> **app nativa** es un buen intermedio si se quiere evitar comprar hardware.

### 3.4 Confiabilidad y operación — RECOMENDADO

| Ítem | Para qué | Costo aprox. |
|---|---|---|
| Dominio propio (`.gov.co`/`.com`) | Imagen institucional | US$10–40 / año |
| Monitoreo de uptime (UptimeRobot) | Aviso si se cae | US$0–10 / mes |
| Rastreo de errores (Sentry) | Detectar fallos en vivo | US$0–26 / mes |
| Respaldos de base de datos | No perder información | Incluido en VPS / plan DB |

### 3.5 Mantenimiento y soporte — CLAVE para “sin errores”
Todo sistema 24/7 necesita **mantenimiento continuo**: parches de seguridad,
soporte, ajustes y monitoreo. Es lo que sostiene la confiabilidad en el tiempo. Se
cotiza por **horas de desarrollador** o un **contrato de soporte mensual** (a
acordar según el alcance que defina la Alcaldía).

---

## 4. Presupuesto consolidado

### Costos únicos (una vez)
| Concepto | Estimado |
|---|---|
| Dominio (primer año) | ~US$15 (~$60.000 COP) |
| Rastreadores GPS (opcional, por bus) | ~US$30–80 c/u |
| Configuración inicial / puesta en marcha | a acordar (mantenimiento) |

### Costos recurrentes mensuales — **escenario económico (VPS)**
| Concepto | Estimado mensual |
|---|---|
| Hospedaje (VPS único) | US$6–15 |
| Mapas con SLA (opcional) | US$0–50 |
| Monitoreo + errores | US$0–30 |
| Datos GPS por bus | US$5–10 × nº de buses |
| **Núcleo sin GPS ni soporte** | **~US$10–60/mes** (~$40.000–240.000 COP) |

> El **mantenimiento/soporte** es adicional y se acuerda aparte; es lo que garantiza
> la operación continua sin fallos.

---

## 5. Plan de implementación sugerido

1. **Fase 1 — Puesta en marcha (1–2 semanas):** contratar VPS + dominio, desplegar,
   activar HTTPS, backups y monitoreo. Cargar rutas y paradas reales. Crear cuentas
   de administrador y conductores.
2. **Fase 2 — Piloto (2–4 buses):** equipar con GPS (celular o rastreador),
   capacitar conductores, validar en campo.
3. **Fase 3 — Escalado:** equipar la flota completa, ajustar y comunicar a la
   ciudadanía.
4. **Continuo — Operación:** monitoreo, respaldos y soporte/mantenimiento.

---

## 6. Conclusión

El producto **ya existe y funciona**; la inversión solicitada es principalmente
**operativa** (hospedaje, GPS de los buses y soporte), no de desarrollo desde cero.
Con un presupuesto modesto, la Alcaldía puede ofrecer a la ciudadanía un servicio de
transporte **moderno, transparente y supervisable en tiempo real**.

_TransPadilla — Moviendo la Ciudad · Riohacha, La Guajira_
