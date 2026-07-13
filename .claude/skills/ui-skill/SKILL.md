---
name: ui-skill
description: This skill should be used when the user asks to "cambia el diseño", "agrega un botón/chip/panel", "estilo de TransPadilla", "sigue el estándar de diseño", "colores de la app", "íconos de la app", or when creating/editing any UI in apps/web/src/pages/Pasajero.tsx, apps/web/src/pages/admin/*, or apps/web/src/pages/Conductor.tsx. Applies TransPadilla's visual design standard (tokens, iconography, floating-panel patterns) so new UI stays visually consistent with the rest of the app.
version: 1.1.0
---

# UI Skill — TransPadilla

Apply TransPadilla's visual design standard to any UI work in `apps/web`. The full
canonical standard lives in `docs/UI-SKILL.md` — read it before designing a new
screen or component; this file is the lean, load-bearing summary plus the deltas
that must override it (the doc predates several shipped features).

## Identity (never change)

| Token (`apps/web/src/index.css`) | Hex | Use |
|---|---|---|
| `--color-navy` | `#1B3B6F` | Bar/header backgrounds, primary elements |
| `--color-blue` | `#2558A5` | Active buttons, selected icons |
| `--color-sky` | `#7BB8D5` | Secondary accents, hover states |
| `--color-gold` | `#F5B731` | Alerts, "EN VIVO" badge, highlighted CTAs |
| `--color-white` | `#FFFFFF` | Text over dark backgrounds |
| `--color-gray-light` | `#F4F6F9` | Card background over light background |
| `--color-gray-text` | — | Secondary/muted text |
| `--color-danger` / `--color-success` | — | Error / success states |

Never hardcode hex values in `className` or inline `style` — always reference the
CSS variable (`style={{ color: "var(--color-navy)" }}` or a Tailwind class bound
to it). Tagline: **"Moviendo la Ciudad."** Logo only over navy or white backgrounds,
never over sky/gold.

## Hard rules (apply to every change)

1. **Icons: `lucide-react` only.** No emoji as a production icon — this includes
   Leaflet markers (use `L.divIcon` with an SVG/CSS shape, not `🚌`).
2. **No native `<form>`, no `alert/confirm/prompt`.** Use the existing dialog/toast
   patterns already in the codebase (`ConfirmDialog`, `toast()` from the shared
   hook).
3. **No `fetch` inside a component.** Data comes through the generated
   `apps/web/src/api-client` hooks (TanStack Query), never a raw `fetch` in JSX/handlers.
4. **No hardcoded route/bus strings.** Route names, colors, stop names come from
   the API response, never a literal string in a component.
5. **No new UI dependency without asking first** — the app already has shadcn/ui +
   lucide-react; reach for those before adding a library.
6. **Mobile-first (375–430px viewport).** Design and test at that width before
   checking desktop (`md:` breakpoint).
7. **The map is the protagonist.** Anything that floats over it is
   `absolute`/`fixed` and dismissible (✕, swipe, or a manual close action) — never
   a modal that blocks the map indefinitely without an escape.
8. **Floating panels/sheets slide from the bottom** (`translateY`, ~200–300ms
   ease-out), capped at `max-h-[60vh]` with internal scroll, closed by a handle,
   ✕, swipe-down, or Escape — mirror the existing sheet/drawer pattern already in
   `Pasajero.tsx` rather than inventing a new one.
9. **Prefer Tailwind transitions** (`animate-pulse`, `transition-transform`)
   before reaching for Framer Motion or another animation library.

## Design craft (beyond consistency)

Reusing the existing tokens and patterns keeps things *consistent*; the rules
below make a given screen feel *well designed* within those constraints. Never
invent new colors/fonts/spacing scales to satisfy these — they operate strictly
inside the token table and Tailwind's default spacing scale above.

1. **Spend the highlight budget in one place.** Gold (`--color-gold`) reads as
   "pay attention to this." When two gold elements compete on screen at once
   (e.g. two dismissible cards stacked, or a badge next to a CTA that's also
   gold), the eye has nowhere to land and neither wins. Before adding a gold
   element, check what else on screen is already gold and either mute one or
   make them mutually exclusive (see how `mostrarPromptUbicacion` and the old
   route-guide chip were kept from stacking — same principle for anything new).
2. **Typographic hierarchy is a scale, not a guess.** The app already has a
   working ladder: `text-[9px]` uppercase/tracked-wide for eyebrow labels,
   `text-[11px]`/`text-xs` for secondary/meta text, `text-sm` for body/buttons,
   `text-base`/`text-lg` for section titles, up to `text-2xl` for screen
   headers, paired with a weight ladder (`font-semibold` → `font-bold` →
   `font-extrabold` → `font-black` as importance rises). Pick a rung from this
   ladder instead of an arbitrary size — a new label at `text-[13px]` for no
   reason breaks the rhythm even if no single rule technically forbids it.
3. **Spacing follows Tailwind's 4px grid with intent, not eyeballing.** Group
   tightly-related elements with small gaps (`gap-1`/`gap-1.5`), separate
   distinct groups with a full step up (`gap-2.5`/`gap-3`), and give a card's
   outer padding room to breathe (`p-3.5`/`p-4`) relative to its inner element
   gaps. Inconsistent or arbitrary padding (`pl-3 pr-7` for no visible reason)
   should have a reason — e.g. reserving room for an absolutely-positioned close
   button — or it should match its siblings.
4. **Motion earns its place.** The app already uses entrance motion
   (`animate-in fade-in slide-in-from-*`) for things appearing over the map and
   `animate-pulse` for live/attention state (the EN VIVO dot, a followed bus).
   Reuse those two vocabularies; do not add a third distinct animation style for
   a similar situation. Skip motion entirely for anything that doesn't need to
   announce its arrival (e.g. static layout content).
5. **Empty and error states are content, not an afterthought.** Follow the
   existing voice: a specific, plain-language explanation of the situation
   (`"Sin buses activos · 5:00 am – 10:00 pm"`, `"Esta ruta no tiene buses
   circulando ahora mismo"`) rather than a generic "No hay datos." Give an empty
   state a way forward when one exists (a button, a suggestion), like the
   existing `Estado()` helper in `Pasajero.tsx` does.
6. **Copy is active voice, from the user's side of the screen.** Match
   existing patterns: buttons/instructions name the action the user takes
   ("Activar", "Ver rutas", "Toca tu destino en el mapa"), not the system
   internals. Keep a control's label consistent through its whole flow — if a
   button says "Activar", the state it produces should not be described with a
   different verb elsewhere.
7. **Quality floor, always:** responsive at 375–430px (rule 6 above), visible
   focus/active states (`active:scale-95`/`active:scale-[0.98]` is the existing
   tactile-press convention — reuse it on new tappable elements), and dismiss
   paths that actually work (✕, swipe, Escape, or tapping the equivalent nav
   item — check which ones apply before shipping a new floating element).
8. **Before finishing, self-critique against what already exists**: does the
   new element compete with something already on screen for the same attention
   budget (see rule 1)? Does it introduce a size, spacing, or motion value that
   has no sibling elsewhere in the file? If so, either justify it or conform.

## Delta vs. `docs/UI-SKILL.md` (verified against the shipped code)

`docs/UI-SKILL.md` was written before the current navigation shipped and states
"sin BottomBar en pasajero" / lists `BottomNavigation` under "NO hacer". That rule
is **superseded**: `Pasajero.tsx` has a real, deliberately-built bottom nav
(`Inicio / Rutas / Favoritos / Paraderos`, gold active-pill, badge counts) that has
gone through several rounds of UX iteration and is the current standard — do not
remove or contradict it on the basis of that older rule. When in doubt about
whether a rule in `docs/UI-SKILL.md` still matches reality, verify against the
current `Pasajero.tsx` rather than trusting the doc blindly; note any other
mismatch found so it can be reconciled instead of silently picking one side.

Everything else in `docs/UI-SKILL.md` (tokens, icon rule, dismissible-panel
pattern, "acción → respuesta" table) is current and in force — read it directly
for the full table and the panel-by-panel breakdown (`NearestRoutePanel`,
`BusDetailPanel`, `CustomerSupportPanel`) when building something in that space.

## Workflow

1. Before adding UI, grep `Pasajero.tsx` (or the relevant page) for an existing
   pattern that does something similar — floating chip, drawer, FAB, spotlight
   overlay — and match its structure/spacing/animation instead of inventing a new
   one. The file has accumulated a consistent visual language across many
   iterations; consistency with *it* matters more than re-deriving from first
   principles.
2. Pick colors only from the token table above.
3. Pick icons only from `lucide-react`, matched in size/weight to nearby icons
   (`w-4 h-4` / `w-5 h-5` are the two sizes in active use).
4. If the change is dismissible/first-time-only UI, follow the existing
   `localStorage` "seen once" flag pattern (see `tp_ubicacion_pedida`,
   `tp_guia_visto` in `Pasajero.tsx`) rather than inventing new state-persistence
   logic.
5. After any visual change, verify at the 375–430px width first, then desktop.
