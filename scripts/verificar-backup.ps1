# ============================================================================
#  TransPadilla — Verificar integridad de un backup
#  Uso:  ./scripts/verificar-backup.ps1 -Archivo ".\backups\tp_2026-07-24_0300.dump"
#  Requiere pg_restore instalado (PostgreSQL client tools) en el PATH.
# ============================================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$Archivo
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Archivo)) {
    Write-Host "  [ERROR] No existe el archivo: $Archivo" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] pg_restore no esta instalado o no esta en el PATH." -ForegroundColor Red
    exit 1
}

Write-Host "  Verificando backup: $Archivo" -ForegroundColor Cyan
Write-Host ""

# Tamano del archivo
$tamano = (Get-Item $Archivo).Length
$tamanoMB = $tamano / 1MB
Write-Host "  Tamano: $([math]::Round($tamanoMB, 2)) MB" -ForegroundColor Gray

if ($tamano -lt 1000) {
    Write-Host "  [ERROR] Archivo demasiado pequeno - posible backup corrupto o vacio" -ForegroundColor Red
    exit 1
}

# Verificar que pg_restore puede leer el archivo
Write-Host "  Probando integridad con pg_restore..." -ForegroundColor Gray
$output = & pg_restore --list $Archivo 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] pg_restore no pudo leer el archivo - backup corrupto" -ForegroundColor Red
    Write-Host $output -ForegroundColor Red
    exit 1
}

# Contar objetos en el backup
$objetos = ($output | Select-String "^[0-9]+;").Count
Write-Host "  Objetos encontrados: $objetos" -ForegroundColor Gray

if ($objetos -lt 5) {
    Write-Host "  [ADVERTENCIA] Pocos objetos en el backup - puede estar incompleto" -ForegroundColor Yellow
}

# Verificar que contiene las tablas esperadas
$tablasEsperadas = @("usuarios", "buses", "rutas", "paradas", "novedades")
$tablasEncontradas = @()

foreach ($tabla in $tablasEsperadas) {
    if ($output -match $tabla) {
        $tablasEncontradas += $tabla
    }
}

Write-Host "  Tablas principales encontradas: $($tablasEncontradas.Count)/$($tablasEsperadas.Count)" -ForegroundColor Gray

if ($tablasEncontradas.Count -lt 3) {
    Write-Host "  [ADVERTENCIA] Faltan tablas principales - backup puede estar incompleto" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Backup VERIFICADO correctamente" -ForegroundColor Green
Write-Host "  Formato: custom (comprimido, restaurable selectivamente)" -ForegroundColor Gray
Write-Host "  Fecha del archivo: $((Get-Item $Archivo).LastWriteTime)" -ForegroundColor Gray
