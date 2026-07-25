# ============================================================================
#  TransPadilla — Programar backup automático en Windows (Task Scheduler)
#  Uso:  ./scripts/programar-backup.ps1
#  Requiere pg_dump instalado (PostgreSQL client tools) en el PATH.
# ============================================================================
param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$BackupDir = ".\backups",
    [int]$Hora = 3,
    [int]$Minuto = 0
)

$ErrorActionPreference = "Stop"

if (-not $DatabaseUrl) {
    Write-Host "  [ERROR] Debes pasar -DatabaseUrl o definir la variable DATABASE_URL" -ForegroundColor Red
    exit 1
}

$scriptPath = Join-Path $PSScriptRoot "backup-bd.ps1"
if (-not (Test-Path $scriptPath)) {
    Write-Host "  [ERROR] No se encontro $scriptPath" -ForegroundColor Red
    exit 1
}

$taskName = "TransPadilla-Backup-Diario"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -DatabaseUrl `"$DatabaseUrl`" -BackupDir `"$BackupDir`""

$trigger = New-ScheduledTaskTrigger -Daily -At "${Hora}:${Minuto}"

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Limited -LogonType Interactive

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Backup diario de la base de datos TransPadilla"

Write-Host ""
Write-Host "  Backup programado correctamente:" -ForegroundColor Green
Write-Host "    Nombre:     $taskName" -ForegroundColor Cyan
Write-Host "    Horario:    Diario a las ${Hora}:${Minuto}" -ForegroundColor Cyan
Write-Host "    Destino:    $BackupDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Para ver la tarea:  Get-ScheduledTask -TaskName '$taskName'" -ForegroundColor Yellow
Write-Host "  Para eliminarla:    Unregister-ScheduledTask -TaskName '$taskName'" -ForegroundColor Yellow
Write-Host "  Para ejecutar ahora: Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Yellow
