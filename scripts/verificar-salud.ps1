# ============================================================================
#  TransPadilla — Verificar salud del sistema
#  Uso:  ./scripts/verificar-salud.ps1
#  Verifica que la app este respondiendo correctamente.
# ============================================================================
param(
    [string]$BaseUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

Write-Host "  Verificando salud de TransPadilla..." -ForegroundColor Cyan
Write-Host "  URL base: $BaseUrl" -ForegroundColor Gray
Write-Host ""

$resultados = @()

# 1. Healthz (liveness)
try {
    $healthz = Invoke-RestMethod -Uri "$BaseUrl/api/healthz" -TimeoutSec 5
    $resultados += @{ endpoint = "healthz"; estado = "OK"; detalle = $healthz.status }
} catch {
    $resultados += @{ endpoint = "healthz"; estado = "FALLO"; detalle = $_.Exception.Message }
}

# 2. Readiness (verifica DB)
try {
    $readyz = Invoke-RestMethod -Uri "$BaseUrl/api/readyz" -TimeoutSec 10
    $estadoDb = if ($readyz.db -eq "ok") { "OK" } else { "FALLO" }
    $resultados += @{ endpoint = "readyz"; estado = $estadoDb; detalle = "db: $($readyz.db)" }
} catch {
    $resultados += @{ endpoint = "readyz"; estado = "FALLO"; detalle = $_.Exception.Message }
}

# 3. Buses (flujo critico)
try {
    $buses = Invoke-RestMethod -Uri "$BaseUrl/api/buses" -TimeoutSec 10
    $cantidad = if ($buses -is [array]) { $buses.Count } else { "?" }
    $resultados += @{ endpoint = "buses"; estado = "OK"; detalle = "$cantidad buses" }
} catch {
    $resultados += @{ endpoint = "buses"; estado = "FALLO"; detalle = $_.Exception.Message }
}

# 4. Metrics (solo si hay token o es admin)
try {
    $metrics = Invoke-RestMethod -Uri "$BaseUrl/api/metrics" -TimeoutSec 10 -ErrorAction SilentlyContinue
    $resultados += @{ endpoint = "metrics"; estado = "OK"; detalle = "uptime: $($metrics.uptime_s)s" }
} catch {
    $resultados += @{ endpoint = "metrics"; estado = "SKIP"; detalle = "requiere autenticacion" }
}

# Mostrar resultados
Write-Host "  Resultados:" -ForegroundColor White
Write-Host "  ------------------------------------------" -ForegroundColor Gray

$todoOk = $true
foreach ($r in $resultados) {
    $color = switch ($r.estado) {
        "OK"    { "Green" }
        "FALLO" { "Red"; $todoOk = $false }
        "SKIP"  { "Yellow" }
    }
    Write-Host ("  {0,-12} [{1}] {2}" -f $r.endpoint, $r.estado, $r.detalle) -ForegroundColor $color
}

Write-Host ""
if ($todoOk) {
    Write-Host "  Sistema SALUDABLE" -ForegroundColor Green
    exit 0
} else {
    Write-Host "  Sistema con PROBLEMAS" -ForegroundColor Red
    exit 1
}
