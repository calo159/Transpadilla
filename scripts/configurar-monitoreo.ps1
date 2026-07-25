# ============================================================================
#  TransPadilla — Configurar monitoreo con UptimeRobot (gratis)
#  Uso:  ./scripts/configurar-monitoreo.ps1 -UptimeRobotApiKey "your-api-key"
#  
#  Configura UptimeRobot para monitorear los endpoints de salud de TransPadilla.
#  Plan gratuito: 50 monitores, 5 minutos de intervalo.
#
#  Pasos previos:
#  1. Crea una cuenta gratis en https://uptimerobot.com
#  2. Obtén tu API Key en https://uptimerobot.com/dashboard.php#apiKeys
#  3. Ejecuta este script con tu API Key
# ============================================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$UptimeRobotApiKey,
    
    [string]$BaseUrl = "https://transpadilla-web.onrender.com",
    
    [string]$WebhookUrl = ""
)

$ErrorActionPreference = "Stop"

Write-Host "  Configurando monitoreo con UptimeRobot..." -ForegroundColor Cyan
Write-Host "  URL base: $BaseUrl" -ForegroundColor Gray
Write-Host ""

$headers = @{
    "Content-Type" = "application/x-www-form-urlencoded"
    "Cache-Control" = "no-cache"
}

$monitores = @(
    @{
        friendly_name = "TransPadilla - Health (Liveness)"
        url = "$BaseUrl/api/healthz"
        type = "1"  # HTTP
        interval = 300  # 5 minutos
    },
    @{
        friendly_name = "TransPadilla - Readiness (DB)"
        url = "$BaseUrl/api/readyz"
        type = "1"
        interval = 300
    },
    @{
        friendly_name = "TransPadilla - Buses API"
        url = "$BaseUrl/api/buses"
        type = "1"
        interval = 300
    }
)

$monitorIds = @()

foreach ($monitor in $monitores) {
    Write-Host "  Creando monitor: $($monitor.friendly_name)..." -ForegroundColor Gray
    
    $body = "api_key=$UptimeRobotApiKey" +
            "&format=json" +
            "&type=$($monitor.type)" +
            "&url=$([System.Uri]::EscapeDataString($monitor.url))" +
            "&friendly_name=$([System.Uri]::EscapeDataString($monitor.friendly_name))" +
            "&interval=$($monitor.interval)"
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.uptimerobot.com/v2/newMonitor" -Method Post -Headers $headers -Body $body
        if ($response.stat -eq "ok") {
            $monitorIds += $response.monitor.id
            Write-Host "    OK (ID: $($response.monitor.id))" -ForegroundColor Green
        } else {
            Write-Host "    Error: $($response.error.message)" -ForegroundColor Red
        }
    } catch {
        Write-Host "    Error de conexión: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Configurar webhook alerts si se proporcionó
if ($WebhookUrl -and $monitorIds.Count -gt 0) {
    Write-Host ""
    Write-Host "  Configurando alertas por webhook..." -ForegroundColor Gray
    
    foreach ($id in $monitorIds) {
        $body = "api_key=$UptimeRobotApiKey" +
                "&format=json" +
                "&id=$id" +
                "&alert_contacts=$([System.Uri]::EscapeDataString("webhook-$WebhookUrl"))"
        
        try {
            $response = Invoke-RestMethod -Uri "https://api.uptimerobot.com/v2/editMonitor" -Method Post -Headers $headers -Body $body
            if ($response.stat -eq "ok") {
                Write-Host "    Monitor ${id}: webhook configurado" -ForegroundColor Green
            }
        } catch {
            Write-Host "    Monitor ${id}: error configurando webhook" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "  Configuracion completada" -ForegroundColor Green
Write-Host "  Monitores creados: $($monitorIds.Count)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Siguiente paso:" -ForegroundColor Yellow
Write-Host "  1. Ve a https://uptimerobot.com/dashboard" -ForegroundColor Gray
Write-Host "  2. Verifica que los monitores estén activos" -ForegroundColor Gray
Write-Host "  3. Configura alertas por email/Telegram en la interfaz web" -ForegroundColor Gray
