# ============================================================================
#  TransPadilla — Configurar el microservicio de Tráfico (Django) — UNA vez
#  Uso:  clic derecho > "Ejecutar con PowerShell"   o   ./configurar-trafico.ps1
# ============================================================================
#  Crea el entorno virtual de Python, instala Django y prepara la base de datos
#  del módulo de tráfico. Solo hace falta ejecutarlo la primera vez (o si
#  cambian las dependencias). El arranque diario es con iniciar.ps1.
# ============================================================================

$ErrorActionPreference = "Stop"
$raiz = $PSScriptRoot
$dj = Join-Path $raiz "django"

Write-Host ""
Write-Host "  TransPadilla - Configurando modulo de Trafico (Python/Django)" -ForegroundColor Cyan
Write-Host ""

# 1. Localizar Python 3 (instalado con winget queda en LocalAppData)
$pyCandidatos = @(
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
  "$env:ProgramFiles\Python312\python.exe",
  "C:\Python312\python.exe"
)
$py = $pyCandidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $py) {
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -notlike "*WindowsApps*") { $py = $cmd.Source }
}
if (-not $py) {
  Write-Host "  [ERROR] No se encontro Python. Instalalo con: winget install Python.Python.3.12" -ForegroundColor Red
  Read-Host "  Presiona Enter para salir"; exit 1
}
Write-Host "  Python: $py" -ForegroundColor Gray

# 2. Crear venv si no existe
$venvPy = Join-Path $dj "venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
  Write-Host "  Creando entorno virtual..." -ForegroundColor Gray
  & $py -m venv (Join-Path $dj "venv")
} else {
  Write-Host "  Entorno virtual ya existe." -ForegroundColor Gray
}

# 3. Instalar dependencias
Write-Host "  Instalando dependencias (Django, DRF, psycopg2)..." -ForegroundColor Gray
& $venvPy -m pip install --upgrade pip --quiet
& $venvPy -m pip install -r (Join-Path $dj "requirements.txt") --quiet
Write-Host "  [OK] Dependencias instaladas." -ForegroundColor Green

# 4. Migraciones (crea las tablas trafico_* en la misma base PostgreSQL)
Push-Location $dj
& $venvPy manage.py migrate
Pop-Location

Write-Host ""
Write-Host "  [OK] Modulo de trafico configurado." -ForegroundColor Green
Write-Host "  Ahora arranca todo con:  ./iniciar.ps1" -ForegroundColor Cyan
Write-Host ""
Read-Host "  Presiona Enter para cerrar"
