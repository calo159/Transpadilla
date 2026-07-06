#!/bin/bash
# ============================================================================
# TransPadilla — Restaurar la base de datos desde un backup (Fase 2.1 de PLAN.md)
# ============================================================================
# Restaura un .dump (creado por backup-bd.sh) en el DATABASE_URL de destino.
# Usa --clean --if-exists: DROPEA las tablas existentes antes de recrearlas.
# Por eso exige una confirmación explícita — pensado para restaurar en una
# base VACÍA de prueba (restore test trimestral) o en una recuperación real,
# nunca por accidente contra producción.
#
# Uso:
#   ./scripts/restore-bd.sh <archivo.dump> "<DATABASE_URL destino>"
#
# La confirmación pide teclear el HOST de la cadena de conexión destino tal
# cual aparece en ella, para que quede explícito a qué base se está apuntando.
# ============================================================================
set -euo pipefail

ARCHIVO="${1:?Uso: restore-bd.sh <archivo.dump> \"<DATABASE_URL destino>\"}"
DESTINO="${2:?Uso: restore-bd.sh <archivo.dump> \"<DATABASE_URL destino>\"}"

if [ ! -f "$ARCHIVO" ]; then
  echo "ERROR: no existe el archivo $ARCHIVO" >&2
  exit 1
fi

# Extrae el host de la cadena (entre @ y : o /) solo para mostrarlo en la
# confirmación — no se usa para conectar (eso lo hace pg_restore con $DESTINO).
HOST_DESTINO="$(echo "$DESTINO" | sed -E 's#.*@([^:/]+).*#\1#')"

echo "Vas a RESTAURAR '$ARCHIVO' sobre:"
echo "  host: $HOST_DESTINO"
echo "Esto BORRA (DROP) las tablas existentes en ese destino antes de recrearlas."
echo ""
read -r -p "Escribe el host exacto de arriba para confirmar: " CONFIRMACION

if [ "$CONFIRMACION" != "$HOST_DESTINO" ]; then
  echo "Confirmación no coincide. Abortado (nada se tocó)." >&2
  exit 1
fi

echo "Restaurando..."
pg_restore "$DESTINO" --clean --if-exists --no-owner --no-privileges -v "$ARCHIVO"
echo "Restauración completada."
echo ""
echo "Siguiente paso (restore test trimestral): verifica que la app arranca"
echo "contra esta base y que las rutas/buses/usuarios clave están presentes."
