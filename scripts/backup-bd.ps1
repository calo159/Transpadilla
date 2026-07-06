# ============================================================================
#  TransPadilla — Backup de la base de datos (Windows / local) — Fase 2.1
#  Uso:  ./scripts/backup-bd.ps1 -DatabaseUrl "postgresql://..."
#  (o define la variable de entorno DATABASE_URL antes de correrlo)
#  Requiere pg_dump instalado (PostgreSQL client tools) en el PATH.
# ============================================================================

param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$BackupDir = ".\backups"
)

$ErrorActionPreference = "Stop"

if (-not $DatabaseUrl) {
    Write-Host "  [ERROR] Debes pasar -DatabaseUrl o definir la variable DATABASE_URL" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] pg_dump no esta instalado o no esta en el PATH." -ForegroundColor Red
    Write-Host "  Instala PostgreSQL (incluye pg_dump): https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    exit 1
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$fecha = Get-Date -Format "yyyy-MM-dd_HHmm"
$archivo = Join-Path $BackupDir "tp_$fecha.dump"

Write-Host "  Iniciando backup -> $archivo" -ForegroundColor Cyan
try {
    & pg_dump $DatabaseUrl -Fc -f $archivo
} catch {
    Write-Host "  [ERROR] Fallo el backup: $_" -ForegroundColor Red
    exit 1
}

$tamano = (Get-Item $archivo).Length / 1MB
Write-Host ("  Backup completado: {0:N2} MB" -f $tamano) -ForegroundColor Green

# Retencion local simple: elimina backups locales de mas de 90 dias.
Get-ChildItem -Path $BackupDir -Filter "tp_*.dump" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-90) } |
    Remove-Item -Force

Write-Host "  Retencion aplicada (backups locales > 90 dias eliminados)." -ForegroundColor Gray
Write-Host "  Backup finalizado OK: $archivo" -ForegroundColor Cyan
