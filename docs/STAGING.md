# Entorno de staging — TransPadilla

Fase 2.2 de [`PLAN.md`](../PLAN.md). Hoy solo existe producción: cualquier cambio se prueba
en vivo. Staging da un entorno idéntico donde probar antes de que un cambio llegue a los
pasajeros/conductores reales.

⚠️ **Regla de oro: staging NUNCA apunta a la base de datos de producción.** Todo lo demás de
esta guía existe para sostener esa regla.

---

## Paso 1 — Base de datos de staging (Supabase)

Elige una de estas dos opciones:

**Opción A — Proyecto Supabase separado (más simple, recomendado para empezar).**
1. Crea un segundo proyecto en [supabase.com](https://supabase.com) (plan free sirve para
   staging), ej. `transpadilla-staging`.
2. Corre el esquema: `pnpm --filter @workspace/db push` con `DATABASE_URL` apuntando a este
   proyecto (usa el `.env` local temporalmente, o pásalo inline).
3. Aplica RLS: pega `packages/db/rls.sql` en su SQL Editor (igual que se hizo en producción).

**Opción B — Branching de Supabase (si tu plan lo soporta).** Supabase ofrece "branches" de
base de datos en planes de pago — una copia de la estructura (y opcionalmente datos) de
producción, aislada. Revisa disponibilidad en tu plan actual antes de elegir esta vía.

## Paso 2 — Servicio web de staging (Render)

1. Render Dashboard → **New → Web Service** (NO uses el Blueprint `render.yaml` de nuevo sobre
   el mismo repo con el mismo nombre; crea un servicio nuevo con nombre distinto, ej.
   `transpadilla-staging`).
2. Conecta el mismo repositorio de GitHub, pero configura:
   - **Branch**: `staging` (crea esta rama si no existe) — así producción sigue en `main` y
     nunca se mezclan los deploys.
   - **Build Command**: igual que producción (`pnpm install --no-frozen-lockfile && pnpm run build:prod`).
   - **Start Command**: igual (`pnpm --filter @workspace/api start`).
3. Variables de entorno — **usa el proyecto Supabase de staging**, no el de producción:
   - `DATABASE_URL` → cadena del Session pooler del proyecto de staging.
   - `JWT_SECRET` → genera uno **distinto** al de producción (`generateValue: true` si usas
     Blueprint, o uno manual).
   - `SEED_DEMO=true` (a diferencia de prod, en staging SÍ conviene tener datos demo para probar
     libremente sin miedo a romper algo real).
   - `NODE_ENV=production` (para que sirva el build, igual que prod).
4. Plan **free** alcanza para staging (no necesita estar despierto 24/7).

## Paso 3 — Despliegue automático desde ramas/PRs

Elige una:

**Opción A — Rama `staging` (más simple).** Cada push a la rama `staging` dispara el deploy
del servicio de staging automáticamente (Render lo hace solo, por estar apuntado a esa rama).
Flujo de trabajo: `feature/x → staging → main` (mergear a `staging` primero para probar, luego
a `main` para producción).

**Opción B — Preview Environments de Render (por PR).** Render puede crear un entorno temporal
por cada Pull Request automáticamente. Actívalo en el servicio → **Settings → PR Previews**.
Más granular (cada PR tiene su propia URL), pero usa más recursos/minutos del plan.

## Paso 4 — Documentar la URL

Una vez creado, anota la URL de staging aquí (o en `README.md`) para el equipo:

```
Staging: https://transpadilla-staging.onrender.com
```

---

## Qué NO hacer

- ❌ No apuntar `DATABASE_URL` de staging al proyecto Supabase de producción — un test mal
  hecho ahí puede borrar/corromper datos reales de pasajeros/conductores.
- ❌ No reusar el mismo `JWT_SECRET` de producción (un token de staging no debería servir en prod
  ni viceversa).
- ❌ No dejar `SEED_DEMO=true` en el servicio de **producción** por accidente al copiar variables
  entre servicios — production siempre `SEED_DEMO=false`.

## Verificación de que quedó bien

- Staging carga y funciona igual que producción, pero con **datos de prueba** propios.
- Un cambio en `apps/api/src/routes/*` o `apps/web/src/*` desplegado en staging **no aparece**
  en `https://transpadilla-web.onrender.com` (producción) hasta que se mergea a `main`.
- Borrar/crear datos en staging no afecta nada visible en producción.
