# @workspace/api-spec — Contrato del API (OpenAPI)

**Fuente de verdad** del contrato entre frontend y backend. A partir de aquí se
**generan** los hooks (`@workspace/api-client`) y los tipos Zod (`@workspace/api-types`)
con [orval](https://orval.dev).

## Contenido
```
openapi.yaml      Especificación OpenAPI del API (endpoints, modelos)
orval.config.ts   Configuración de orval (qué genera y dónde)
```

## Regenerar el cliente y los tipos
Tras editar `openapi.yaml`:
```bash
pnpm --filter @workspace/api-spec run codegen
```
Esto regenera `packages/api-client/src` y `packages/api-types/src` y corre el typecheck.

## Flujo para añadir/cambiar un endpoint
1. Edita `openapi.yaml` (define ruta, parámetros y modelos).
2. `pnpm --filter @workspace/api-spec run codegen` (genera hooks + tipos).
3. Implementa el endpoint en `apps/api/src/routes/`.
4. Úsalo en el frontend con el hook generado.

> Nota: algunos endpoints recientes (p. ej. `/reportes/*`) se consumen con `apiFetch`
> directo en vez de hooks orval; para esos no hace falta tocar la spec.
