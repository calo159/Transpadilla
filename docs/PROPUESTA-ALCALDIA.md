# Propuesta — TransPadilla para el Distrito de Riohacha

**Sistema de rastreo de transporte público en tiempo real para el Distrito Especial,
Turístico y Cultural de Riohacha, La Guajira.**
*Moviendo la Ciudad.*

> 🌐 **Demostración en vivo:** https://transpadilla-web.onrender.com
> (en el plan gratuito de prueba, la primera carga puede tardar ~30–50 s mientras el
> servidor "despierta"; en operación real esto no ocurre).

> **Sobre las cifras:** los valores económicos de este documento son de **referencia
> de mercado (Colombia, sector público)** y están **sujetos a acuerdo**. Se expresan en
> pesos colombianos (COP); cuando se menciona USD es por insumos internacionales
> (tasa de referencia ~$4.000/US$1).

---

## 1. Contexto

Riohacha es **Distrito Especial, Turístico y Cultural**, con cerca de **330.000
habitantes** y un flujo importante de **turismo** (puerta de entrada a La Guajira).
Un sistema de transporte **visible y predecible** mejora la vida del ciudadano que
madruga a trabajar y, además, da una imagen **moderna y confiable** al visitante.

Hoy no existe forma de saber **dónde está el bus** ni **cuánto falta para que pase**:
los pasajeros esperan sin información, los conductores no reportan novedades y la
administración no tiene visibilidad de la flota. **TransPadilla resuelve exactamente
eso.**

---

## 2. Resumen ejecutivo

TransPadilla es una plataforma **ya construida, probada y funcionando** (ver demo) que
ofrece, en una sola solución web:

- **Ciudadanía (sin necesidad de cuenta ni instalar nada):** ve los buses **en vivo**
  en el mapa, busca su ruta, consulta **en cuántos minutos llega el próximo bus** y,
  tocando su destino, recibe **qué ruta tomar y cuál es el bus más cercano**.
- **Conductores:** inician su recorrido, transmiten su ubicación y reportan ocupación
  y novedades (accidente, desvío, demora) que la gente ve al instante.
- **Distrito / empresa operadora:** gestiona rutas, paradas, buses y conductores, y
  supervisa la flota en tiempo real.

La inversión propuesta es un **modelo de servicio mensual (SaaS) "todo incluido"**: el
Distrito **no compra ni mantiene servidores ni equipos de desarrollo**, sino que accede
a la plataforma operada, soportada y actualizada, por una cuota. Esto reduce el riesgo
y el costo frente a construir un sistema desde cero.

---

## 3. El problema que resuelve (en detalle)

- **Para el ciudadano:** incertidumbre y tiempo perdido en el paradero. No sabe si el
  bus ya pasó, si viene lleno o cuánto falta. TransPadilla le da **información en vivo**.
- **Para el turista:** desconoce las rutas; con el mapa y la función "¿A dónde vas?"
  llega a su destino sin preguntar.
- **Para el conductor:** no tiene canal para avisar una novedad; ahora la reporta y los
  pasajeros la ven.
- **Para el Distrito/operador:** no tiene datos de su servicio; ahora ve la flota,
  estados y novedades, base para **tomar decisiones y rendir cuentas**.

---

## 4. Qué hace el sistema (funcionalidades)

| Para | Funciones |
|---|---|
| **Pasajero** (público) | Mapa en vivo de buses · buscar y seleccionar ruta · **tiempo de llegada (ETA)** del próximo bus por parada · **"¿A dónde vas?"** (toca tu destino → ruta recomendada + bus más cercano) · seguir un bus en el mapa · rutas favoritas · ver ocupación (vacío/medio/lleno) · alertas de novedades · **aplicación instalable (PWA)** · atención por WhatsApp |
| **Conductor** | Iniciar y finalizar recorrido · transmisión de GPS · reportar **ocupación** y **novedades** en vivo · aviso si el GPS falla · cambio de contraseña |
| **Administrador** | Alta/baja/edición de **rutas, paradas, buses y conductores** · asignar bus ↔ conductor · panel con estado de la flota · cambio de contraseña |

---

## 5. Arquitectura y nivel técnico

- **Un solo servicio** (Node.js + Express + Socket.IO) que entrega la API, el tiempo
  real, el cálculo de tiempos de llegada **y** la aplicación web, sobre **una base de
  datos PostgreSQL**. Una arquitectura de un solo servicio es **más simple, más barata
  y más fácil de operar** que las de varios componentes.
- **Tiempo real** por WebSockets: los buses se ven moverse sin recargar.
- **Aplicación instalable (PWA):** el ciudadano la "instala" desde el navegador.
- **Calidad de producto:** TypeScript estricto, **pruebas automatizadas** e
  **integración continua** (cada cambio se verifica antes de publicarse).

---

## 6. Seguridad (apto para una entidad pública)

- **Autorización en el servidor, no en el cliente:** el registro público solo crea
  cuentas de *pasajero*; las de conductor las crea un administrador; un conductor solo
  puede operar **su** bus (evita suplantación). La gestión exige rol de administrador.
- **Contraseñas cifradas** (bcrypt) y **cambio de contraseña** autogestionado.
- **Defensa anti-abuso / DDoS de capa de aplicación:** límite de solicitudes por IP,
  límites de tamaño de petición, tiempos de espera (anti *slow-loris*) y canal en
  tiempo real endurecido.
- **Listo para Cloudflare** (anti-DDoS de borde, **gratis**): la plataforma rechaza el
  tráfico que intente esquivar la protección. Requiere un dominio propio.
- **HTTPS forzado**, cabeceras de seguridad y secretos obligatorios en producción.

---

## 7. Escala: pensado para crecer con el Distrito

- Riohacha ≈ **330.000 habitantes**.
- Flota: **10 buses hoy**, con ampliación prevista a **70**.
- La arquitectura **soporta con holgura** ese volumen. El sistema **no cambia** al
  crecer: solo se suman buses. El factor de costo al escalar es el **plan de hospedaje**
  y el **GPS por bus**, no rehacer la plataforma.

---

## 8. Valor económico

Esta sección detalla **el valor de todo**: el producto en sí, el servicio profesional y
la operación. El modelo propuesto es **SaaS (cuota mensual todo incluido)**, **sin costo
de implementación** (la puesta en marcha va absorbida en la cuota). Las cifras están
pensadas para un **presupuesto público de La Guajira** y son **ajustables**.

### 8.1 Valor del producto (desarrollo ya realizado)

Construir desde cero una plataforma equivalente (web en tiempo real + app de conductor +
panel administrativo + ETA + seguridad + pruebas) implica un equipo de desarrollo durante
varios meses. **Valor de desarrollo equivalente: ~$25.000.000 – $50.000.000 COP.**

> **El Distrito no paga esa cifra.** El producto **ya está construido**; se accede a él
> mediante la cuota mensual de abajo, eliminando el riesgo y el costo de un desarrollo a
> la medida desde cero.

### 8.2 Servicio profesional incluido (en la cuota)

La cuota mensual cubre **todo el servicio profesional**:

- Personalización de marca y datos del Distrito (rutas, paradas, buses reales).
- Despliegue y operación **24/7** (hospedaje, HTTPS, dominio, Cloudflare).
- **Soporte y mantenimiento:** parches de seguridad, corrección de incidencias,
  monitoreo y respaldos de la base de datos.
- **Actualizaciones y mejoras** evolutivas de la plataforma.
- Capacitación a administradores y conductores.

### 8.3 Implementación / puesta en marcha — **incluida (sin costo de entrada)**

La personalización, carga de rutas/paradas reales, configuración de dominio + Cloudflare,
despliegue 24/7 y capacitación **no tienen costo inicial**: van absorbidas en la cuota
mensual. Esto baja la barrera para que el Distrito arranque.

> Para hacer sostenible la puesta en marcha sin cobro de entrada, se sugiere una
> **permanencia mínima de 12 meses** en el contrato (a acordar).

### 8.4 Cuota mensual — Plataforma como servicio (SaaS, todo incluido)

Incluye plataforma + hospedaje + soporte + monitoreo + respaldos + actualizaciones +
**puesta en marcha** (sin costo de entrada). Planes por tamaño de flota:

| Plan | Flota | Cuota mensual de referencia (COP) |
|---|---|---|
| **Piloto** | hasta 10 buses | **$900.000 – $1.500.000** |
| **Crecimiento** | hasta 30 buses | **$1.500.000 – $2.500.000** |
| **Distrito** | hasta 70 buses | **$2.500.000 – $3.500.000** |

> La cuota es **operativa** (no es compra de licencia perpetua): mientras el servicio
> esté activo, el Distrito tiene la plataforma operada, soportada y al día. Cifras de
> referencia, ajustables según el alcance final.

### 8.5 GPS de los buses (se cotiza aparte)

Es el rubro que **depende del hardware** elegido para que cada bus reporte su posición.
No está incluido en la cuota porque son equipos/planes de datos físicos.

| Opción | Confiabilidad | Inversión inicial por bus (COP) | Mensual por bus (COP) |
|---|---|---|---|
| **A) Celular del conductor + Wake Lock** (ya soportado) | Media (pantalla encendida) | Smartphone (si no tienen) | Datos $20.000 – $40.000 |
| **B) App nativa Android** (reusa el código) | Alta (GPS en segundo plano) | ~$100.000 (cuenta Google Play, única, para toda la flota) | Datos $20.000 – $40.000 |
| **C) Rastreador GPS dedicado** (recomendado) | **Máxima** (no depende del conductor) | $120.000 – $320.000 c/u | SIM datos $12.000 – $32.000 |

> Solo el **conductor** necesitaría app; pasajeros y administración siguen como web.
> **Android es suficiente** (se evita el costo de Apple).

### 8.6 Resumen — "el valor de todo"

| Rubro | Tipo | Valor de referencia (COP) |
|---|---|---|
| Producto (desarrollo equivalente, ya construido) | Informativo | $25.000.000 – $50.000.000 |
| Implementación / puesta en marcha | Único | **Incluida ($0)** |
| Plataforma como servicio (según plan: 10/30/70 buses) | Mensual | $900.000 – $3.500.000 |
| GPS por bus (equipo) | Único | $0 – $320.000 c/u |
| GPS por bus (datos) | Mensual | $12.000 – $40.000 c/u |
| Dominio `.gov.co`/`.com` | Anual | ~$60.000 |
| Cloudflare (anti-DDoS) | Mensual | $0 (incluido) |

> Todos los valores son **de referencia y ajustables**, sujetos a acuerdo y al alcance
> que defina el Distrito.

---

## 9. Por qué conviene (retorno)

- **Sin desarrollo desde cero:** se accede a un producto valorado en decenas de millones
  por una cuota mensual.
- **Riesgo bajo:** el Distrito no administra servidores ni equipos técnicos; el servicio
  los cubre.
- **Escalable:** de 10 a 70 buses sin rehacer nada.
- **Imagen de Distrito moderno y turístico:** transporte transparente y en tiempo real.
- **Datos para decidir:** estado de la flota y novedades, base para gestión y rendición
  de cuentas.

---

## 10. Plan de implementación

1. **Fase 1 — Puesta en marcha (1–2 semanas):** despliegue 24/7, dominio + HTTPS +
   Cloudflare, respaldos y monitoreo. Carga de rutas y paradas reales. Creación del
   administrador y los conductores. Capacitación.
2. **Fase 2 — Piloto (10 buses):** equipar con GPS (celular o rastreador), validar en
   campo y comunicar a la ciudadanía.
3. **Fase 3 — Escalado (hasta 70 buses):** sumar la flota completa y difundir
   masivamente.
4. **Continuo — Operación:** monitoreo, respaldos, soporte y mejoras (incluido en la cuota).

---

## 11. Soporte y garantías

- **Disponibilidad:** operación 24/7 con monitoreo y respaldos automáticos.
- **Soporte:** atención a incidencias y mantenimiento continuo dentro de la cuota.
- **Transparencia:** *ningún software es 100% "sin errores"*; lo que el servicio
  garantiza es **alta disponibilidad, detección temprana de fallos, respaldo de datos y
  corrección oportuna**.

---

## 12. Próximos pasos

1. Validar el alcance y el plan (número de buses de la fase piloto).
2. Acordar el **plan mensual** y la permanencia (sin costo de implementación).
3. Definir el método de GPS para el piloto.
4. Firmar y arrancar la **Fase 1**.

---

**Contacto:** WhatsApp +57 314 416 7656 · Instagram [@transpadilla.co](https://www.instagram.com/transpadilla.co)

_TransPadilla — Moviendo la Ciudad · Distrito de Riohacha, La Guajira_
