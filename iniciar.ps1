# ============================================================================
#  TransPadilla — Script de arranque local (Windows / PowerShell)
#  Uso:  clic derecho > "Ejecutar con PowerShell"   o   ./iniciar.ps1
# ============================================================================
#  Abre DOS ventanas: una para el servidor API (puerto 8080) y otra para el
#  frontend (puerto 5173). Cierra las ventanas para detener los servidores.
# ============================================================================

$ErrorActionPreference = "Stop"
$raiz = $PSScriptRoot

Write-Host ""
Write-Host "  TransPadilla - Moviendo la Ciudad" -ForegroundColor Cyan
Write-Host "  Iniciando servidores locales..." -ForegroundColor Gray
Write-Host ""

# Verificar que existe .env
if (-not (Test-Path "$raiz\.env")) {
    Write-Host "  [ERROR] No existe el archivo .env" -ForegroundColor Red
    Write-Host "  Copia .env.example como .env y completa los valores." -ForegroundColor Yellow
    Read-Host "  Presiona Enter para salir"
    exit 1
}

# Verificar pnpm
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] pnpm no esta instalado. Ejecuta: npm install -g pnpm" -ForegroundColor Red
    Read-Host "  Presiona Enter para salir"
    exit 1
}

# Verificar que PostgreSQL este corriendo
$pg = Get-Service -Name "*postgres*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
if (-not $pg) {
    Write-Host "  [AVISO] El servicio de PostgreSQL no parece estar corriendo." -ForegroundColor Yellow
    Write-Host "  El login y los datos no funcionaran sin la base de datos." -ForegroundColor Yellow
    Write-Host ""
}

# Arrancar API server en ventana nueva
Write-Host "  -> Servidor API     http://localhost:8080" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$raiz'; pnpm --filter @workspace/api-server run dev"

Start-Sleep -Seconds 2

# Arrancar frontend en ventana nueva
Write-Host "  -> Frontend (app)   http://localhost:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$raiz'; pnpm --filter @workspace/transpadilla run dev"

# Arrancar microservicio de Trafico (Django) si esta configurado
$venvPy = Join-Path $raiz "django\venv\Scripts\python.exe"
if (Test-Path $venvPy) {
    Write-Host "  -> Trafico (Django) http://localhost:8000 (interno)" -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$raiz\django'; .\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"
} else {
    Write-Host "  -> Trafico: sin configurar (ejecuta 'configurar-trafico.ps1' una vez)" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "  Listo." -ForegroundColor Cyan
Write-Host ""
Write-Host "  En esta PC:    http://localhost:5173" -ForegroundColor Cyan

# Mostrar la URL para abrir desde el celular (misma red WiFi)
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1).IPAddress
if ($ip) {
    Write-Host "  En tu celular: http://$($ip):5173" -ForegroundColor Cyan
    Write-Host "                 (mismo WiFi; si no carga, ejecuta 'habilitar-celular.ps1' como admin una vez)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  Cuentas demo:" -ForegroundColor Gray
Write-Host "    admin@transpadilla.co / admin123" -ForegroundColor Gray
Write-Host "    conductor@transpadilla.co / conductor123" -ForegroundColor Gray
Write-Host ""
Write-Host "  (Para detener: cierra las dos ventanas de PowerShell que se abrieron)" -ForegroundColor DarkGray
Write-Host ""
