# 📄 Propuesta — TransPadilla para la Alcaldía de Riohacha

**Sistema de rastreo de transporte público en tiempo real para Riohacha, La Guajira.**
*Moviendo la Ciudad.*

> 🌐 **Demostración en vivo:** https://transpadilla-web.onrender.com
> (plan gratuito: la primera carga puede tardar ~30–50 s mientras el servidor "despierta").

> Los valores económicos son **estimados** (los precios de proveedores cambian) y se dan
> en USD con equivalente aproximado en COP (tasa de referencia ~$4.000/US$1). Verificar
> al contratar.

---

## 1. Resumen ejecutivo

En Riohacha no hay forma de saber **dónde está el bus** ni **cuánto falta para que
pase**. TransPadilla resuelve esto con una sola plataforma web:

- **Ciudadanía (sin necesidad de cuenta):** ve los buses moverse **en vivo** en el
  mapa, busca su ruta, consulta **en cuántos minutos llega el próximo bus** y, tocando
  su destino, recibe **qué ruta tomar y cuál es el bus más cercano**.
- **Conductores:** inician su recorrido, transmiten su ubicación y reportan ocupación
  y novedades (accidente, desvío, demora) que la gente ve al instante.
- **Administración (empresa/Alcaldía):** gestiona rutas, paradas, buses y conductores,
  y supervisa la flota.

El sistema **ya está construido, probado y funcionando** (ver demo). Para operarlo de
forma **continua y confiable (24/7)** se requiere una inversión principalmente
**operativa** (hospedaje, GPS de los buses y soporte), **no** un desarrollo desde cero.

> **No existe software 100% "sin errores".** Lo que la inversión garantiza es **alta
> disponibilidad**, **detección temprana de fallos**, **respaldo de datos** y
> **mantenimiento** para corregir rápido cualquier incidencia.

---

## 2. Qué hace el sistema (funcionalidades)

| Para | Funciones |
|---|---|
| **Pasajero** (público) | Mapa en vivo de buses · buscar/seleccionar ruta · **ETA del próximo bus** por parada · **"¿A dónde vas?"** (toca tu destino → ruta recomendada + bus más cercano) · seguir un bus · rutas favoritas · ver ocupación (vacío/medio/lleno) · alertas de novedades · **app instalable (PWA)** · atención por WhatsApp. **Sin instalar nada ni crear cuenta.** |
| **Conductor** | Iniciar/finalizar recorrido · transmisión de GPS · reportar **ocupación** y **novedades** en vivo · aviso si el GPS falla · cambio de contraseña. El bus se lo asigna el administrador. |
| **Administrador** | Gestión (alta/baja/edición) de **rutas, paradas, buses y conductores** · asignación de bus ↔ conductor · panel con estado de la flota · cambio de contraseña. |

---

## 3. Arquitectura y nivel técnico

- **Un solo servicio** (Node.js + Express + Socket.IO) que entrega la API, el tiempo
  real, el cálculo de tiempos de llegada **y** la aplicación web, con **una base de
  datos PostgreSQL**. Un solo servicio = **más simple, más barato y más fácil de
  operar y mantener** que arquitecturas con varios componentes.
- **Tiempo real** por WebSockets (los buses aparecen moviéndose sin recargar).
- **PWA instalable**: el ciudadano puede "instalar" la app desde el navegador.
- **Código con calidad de producto:** TypeScript estricto, **pruebas automatizadas**
  e **integración continua** (cada cambio se verifica solo antes de publicarse).

---

## 4. Seguridad (apto para una entidad pública)

Implementado **sin costo adicional**, pensado para uso institucional:

- **Autorización en el servidor, no en el cliente:** el registro público solo crea
  cuentas de *pasajero*; las de conductor las crea un administrador; un conductor solo
  puede operar **su** bus (evita suplantación). Las acciones de gestión exigen rol admin.
- **Contraseñas** cifradas (bcrypt) y **cambio de contraseña** autogestionado.
- **Defensa anti-abuso/DDoS de capa de aplicación:** límite de solicitudes por IP
  (login, registro y global), límites de tamaño de petición, tiempos de espera
  (anti *slow-loris*) y canal en tiempo real endurecido.
- **Listo para Cloudflare** (anti-DDoS de borde, gratis): la app ya coopera con
  Cloudflare para tomar la IP real del usuario y **rechazar tráfico que intente
  esquivarlo**. (Requiere un dominio propio.)
- **Cabeceras de seguridad**, HTTPS forzado en producción y secretos obligatorios.

> Detalle técnico en `docs/SEGURIDAD.md` y la guía `docs/CLOUDFLARE.md`.

---

## 5. Escala: pensado para crecer con la ciudad

- Riohacha tiene **≈ 330.000 habitantes**.
- Flota: **10 buses hoy**, con ampliación prevista a **70**.
- La arquitectura **soporta con holgura** ese volumen (70 buses transmitiendo y miles
  de ciudadanos consultando son carga baja para un solo servidor). El verdadero
  factor es el **plan de hospedaje**: el gratuito sirve para demostración; para 24/7
  se usa un plan de pago o un servidor propio (abajo).

---

## 6. Inversión para operar 24/7

### 6.1 Hospedaje — OBLIGATORIO
La demo usa un plan gratuito que **se apaga por inactividad**. Para 24/7:

| Alternativa | Detalle | Costo mensual aprox. |
|---|---|---|
| **VPS único (recomendado)** | Un servidor (Hetzner/DigitalOcean) con Docker: **web + base de datos** | **US$6–15** (~$24.000–60.000 COP) |
| Render (gestionado) | **web + PostgreSQL** con respaldos, casi sin administración | US$14–40 (~$56.000–160.000 COP) |

### 6.2 GPS de los buses — el rubro principal 🚍
La decisión más importante: **cómo reporta su posición cada bus**. El reto es la
**transmisión continua**, sobre todo con la pantalla apagada o el teléfono en segundo plano.

> Una **app web** no puede transmitir con la pantalla **totalmente apagada** (límite de
> los navegadores). Ya se implementó que **la pantalla se mantenga encendida** durante
> el recorrido (Wake Lock) y que el GPS se reactive al volver a la app, lo que cubre el
> caso común. Para 100% en segundo plano se requiere app nativa o rastreador dedicado.

| Opción | Confiabilidad | Inversión inicial | Mensual por bus | Depende del conductor |
|---|---|---|---|---|
| **A) Web actual + Wake Lock** (ya hecho) | Media (pantalla encendida) | Smartphone (si no tienen) | Datos US$5–10 | Sí (deja la app abierta) |
| **B) App nativa Android** (Capacitor, reusa el código) | Alta (GPS en segundo plano) | ~US$25 cuenta Google Play (una vez) + plugin opcional | Datos US$5–10 | Sí (lleva el teléfono) |
| **C) Rastreador GPS dedicado** (recomendado) | **Máxima** | Equipo US$30–80 por bus (una vez) | SIM datos US$3–8 | **No** (transmite solo) |

> Solo el **conductor** necesitaría app nativa; pasajeros y administración siguen como
> web. **Android es suficiente** (se evita el costo de Apple). Para operación
> institucional, el **rastreador dedicado** es lo más confiable.

### 6.3 Mapas y rutas — RECOMENDADO
Los servicios públicos de demostración (OpenStreetMap) **no tienen garantía** para uso
intensivo. Se pueden cambiar a un proveedor con SLA (MapTiler/Mapbox tienen capa
gratuita) **solo cambiando configuración, sin reprogramar** — US$0–50/mes.

### 6.4 Confiabilidad y operación — RECOMENDADO
| Ítem | Para qué | Costo aprox. |
|---|---|---|
| Dominio propio (`.gov.co`/`.com`) | Imagen institucional + Cloudflare | US$10–40 / año |
| **Cloudflare** (anti-DDoS, WAF, caché) | Protección y velocidad | **Gratis** (plan Free) |
| Monitoreo de uptime (UptimeRobot) | Aviso si se cae | US$0–10 / mes |
| Rastreo de errores (Sentry) | Detectar fallos en vivo | US$0–26 / mes |
| Respaldos de base de datos | No perder información | Incluido en VPS / plan DB |

### 6.5 Mantenimiento y soporte — CLAVE
Todo sistema 24/7 necesita **mantenimiento continuo** (parches, soporte, ajustes,
monitoreo). Se cotiza por **horas de desarrollador** o un **contrato de soporte
mensual**, según el alcance que defina la Alcaldía.

---

## 7. Presupuesto consolidado

### Costos únicos (una vez)
| Concepto | Estimado |
|---|---|
| Dominio (primer año) | ~US$15 (~$60.000 COP) |
| Rastreadores GPS (opcional, por bus) | ~US$30–80 c/u |
| Puesta en marcha (carga de rutas, cuentas, despliegue) | a acordar (soporte) |

### Recurrente mensual — **escenario económico (VPS), núcleo del sistema**
| Concepto | Estimado mensual |
|---|---|
| Hospedaje (VPS único) | US$6–15 |
| Cloudflare | US$0 |
| Mapas con SLA (opcional) | US$0–50 |
| Monitoreo + errores | US$0–30 |
| **Núcleo sin GPS ni soporte** | **~US$10–60/mes** (~$40.000–240.000 COP) |
| Datos GPS por bus | US$5–10 × nº de buses |

> Ejemplo orientativo:
> - **Fase piloto (10 buses, rastreadores):** inicial ~US$300–800 (~$1,2M–3,2M COP) +
>   mensual del núcleo + ~US$30–80 de datos.
> - **Flota completa (70 buses):** inicial ~US$2.100–5.600 + mensual del núcleo +
>   ~US$210–560 de datos. La plataforma **no** cambia: solo se suman buses.

El **mantenimiento/soporte** es adicional y es lo que sostiene la confiabilidad.

---

## 8. Plan de implementación

1. **Fase 1 — Puesta en marcha (1–2 semanas):** contratar VPS + dominio, desplegar,
   activar HTTPS y Cloudflare, backups y monitoreo. Cargar rutas y paradas reales.
   Crear el administrador y los conductores.
2. **Fase 2 — Piloto (10 buses):** equipar con GPS (celular o rastreador), capacitar
   conductores, validar en campo y comunicar a la ciudadanía.
3. **Fase 3 — Escalado a la flota completa (hasta 70):** sumar buses, ajustar y
   difundir masivamente.
4. **Continuo — Operación:** monitoreo, respaldos y soporte/mantenimiento.

---

## 9. Conclusión

El producto **ya existe, funciona y está probado**. La inversión solicitada es
principalmente **operativa** (hospedaje, GPS de los buses y soporte), no de desarrollo
desde cero. Con un presupuesto modesto, Riohacha puede ofrecer a su ciudadanía un
servicio de transporte **moderno, transparente y supervisable en tiempo real**, listo
para crecer de 10 a 70 buses sin rehacer nada.

---

**Contacto:** WhatsApp +57 314 416 7656 · Instagram [@transpadilla.co](https://www.instagram.com/transpadilla.co)

_TransPadilla — Moviendo la Ciudad · Riohacha, La Guajira_
