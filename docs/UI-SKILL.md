# TRANSPADILLA — UI Skill (estándar de diseño de la vista Pasajero)

> **Notas de realidad (2026-06-25)** — el resto del documento es el estándar a seguir,
> con estas correcciones sobre el stack real:
> - **No hay Django ni capa de tráfico.** El backend es Node (Express + Socket.IO) y el
>   tráfico se descartó por falta de datos. NO prometer "capa de tráfico" en la UI.
> - **Archivos reales:** la vista del pasajero es `apps/web/src/pages/Pasajero.tsx`
>   (un solo archivo, no `PassengerMap.tsx` ni `components/panels/`). Si se refactoriza a
>   `components/panels/` + `PassengerMap.tsx`, hacerlo como tarea explícita.
> - **Tokens ya definidos** en `apps/web/src/index.css`: `--color-navy/blue/sky/gold/white`
>   (+ `--color-gray-light`, `--color-gray-text`, `--color-danger`, `--color-success`).
>   `--color-surface (#F4F7FB)` ≈ el `--color-gray-light (#F4F6F9)` existente.

---

## Identidad visual (no cambiar nunca)

| Token | Valor | Uso |
|---|---|---|
| `--color-navy` | `#1B3B6F` | Fondo de barras, headers, elementos primarios |
| `--color-blue` | `#2558A5` | Botones activos, íconos seleccionados |
| `--color-sky` | `#7BB8D5` | Acentos secundarios, hover states |
| `--color-gold` | `#F5B731` | Alertas, badges "EN VIVO", CTAs destacados |
| `--color-white` | `#FFFFFF` | Texto sobre fondos oscuros |
| `--color-surface` | `#F4F7FB` | Fondo de tarjetas sobre fondo claro |

Tagline: **"Moviendo la Ciudad"**. Logo solo sobre navy o blanco (nunca sobre sky/gold).

## Principios
1. **Mobile-first** (375–430px). El mapa ocupa el 100% del alto (`h-dvh`). Paneles flotan **sobre** el mapa, nunca lo empujan.
2. **El mapa es el protagonista.** Todo lo que flota es `absolute`/`fixed` y **dismissible** (✕ o swipe-down). El fondo del mapa siempre visible.
3. **TopBar** = único nav permanente: Logo/nombre (izq) · **Badge EN VIVO** (gold, punto parpadeante) · **acciones** (der, **máx 4 íconos**; si hay más → menú "Más").
4. **Sin BottomBar** en pasajero. Todo el control en la TopBar o paneles flotantes.
5. **Paneles = drawer que sube desde abajo** (`translateY`, 200–300ms ease-out), `max-h-[60vh]`, scroll interno, con handle (pill gris) o ✕.

## Componentes y reglas
- **`<TopBar/>`**: `absolute top-0 inset-x-0 z-50 bg-tp-navy/95 backdrop-blur h-14`. Íconos de acción 40×40px, blancos.
- **`<LiveBadge/>`**: pill `bg-tp-gold/20 text-tp-gold` con punto `animate-pulse` + texto "EN VIVO".
- **`<FloatingPanel/>`** (drawer genérico): props `isOpen`, `onClose`, `title`, `children`; slide-up; `max-h-[60vh]`; cierre por swipe-down o ✕. Estado de apertura vive en el padre.
- **`<NearestRoutePanel/>`**: al tocar el mapa sin bus → ruta más cercana + ETA + distancia a pie. Ícono `<MapPin/>`.
- **`<CustomerSupportPanel/>`**: WhatsApp + reporte + FAQ. Ícono `<MessageCircle/>`.
- **`<BusDetailPanel/>`**: al tocar un marcador → ruta, ocupación, velocidad, próximos paraderos.

## Reglas de código
- **TS**: props con `interface`; nada de `any` (usar `unknown` + narrowing); retorno tipado.
- **Tailwind**: utilitarias en JSX; usar tokens `tp-navy/tp-blue/tp-sky/tp-gold`, **nunca hex hardcodeado** en className.
- **Íconos**: siempre `lucide-react`. **Nada de emoji como ícono en producción** (incluye los markers de Leaflet → usar SVG, no 🚌).
- Animaciones: Tailwind (`animate-pulse`, `transition-transform`) antes de Framer Motion.
- No `<form>` nativo, no `alert/confirm/prompt`, no fetch directo en componentes (usar hooks), no strings de rutas/buses hardcodeados, no nuevas deps de UI sin consultar (ya hay shadcn/ui + lucide).

## UX (acción → respuesta)
| Acción | Respuesta |
|---|---|
| Toca el mapa (sin bus) | Abre `NearestRoutePanel` |
| Toca un marcador de bus | Abre `BusDetailPanel` |
| Toca ícono de soporte | Abre `CustomerSupportPanel` |
| Toca ícono de rutas | Muestra/oculta capa de rutas |
| Swipe down / toca fuera | Cierra el panel |

## NO hacer
BottomNavigation en pasajero · texto no-dismissible sobre el mapa · colores fuera de paleta · `<form>` nativo · `alert/confirm/prompt` · fetch en componentes · strings hardcodeados de rutas/buses · deps de UI sin consultar.
