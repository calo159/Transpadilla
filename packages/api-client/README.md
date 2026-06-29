# @workspace/api-client — Hooks de React (generados)

Hooks de TanStack Query generados con orval a partir de
[`@workspace/api-spec`](../api-spec) (`openapi.yaml`). Los usa el frontend para hablar
con el API: `useGetBuses`, `useGetRutas`, `useUpdateGps`, etc.

## ⚠️ No editar a mano
El contenido de `src/` es **generado**. Para cambiarlo, edita la spec y regenera:
```bash
pnpm --filter @workspace/api-spec run codegen
```

## Útiles que sí se mantienen a mano
- `src/custom-fetch.ts` — el `fetch` base de los hooks. Expone `setBaseUrl()` (lo usa el
  APK para apuntar al backend remoto) y `setAuthTokenGetter()` (adjunta el JWT).
