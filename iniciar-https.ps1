# ============================================================================
#  TransPadilla — Arranque en HTTPS (para que el GPS funcione en el celular)
#  Uso:  clic derecho > "Ejecutar con PowerShell"   o   ./iniciar-https.ps1
# ============================================================================
#  Igual que iniciar.ps1 pero el frontend se sirve por HTTPS, que es lo que
#  exigen los navegadores móviles para dar la ubicación GPS.
#  La primera vez, en cada dispositivo, el navegador mostrará una advertencia
#  de seguridad ("conexión no privada") — es normal con certificados locales:
#  toca "Avanzado" y luego "Continuar de todos modos".
# ============================================================================

$ErrorActionPreference = "Stop"
$raiz = $PSScriptRoot

Write-Host ""
Write-Host "  TransPadilla - Moviendo la Ciudad (modo HTTPS)" -ForegroundColor Cyan
Write-Host "  Iniciando servidores locales..." -ForegroundColor Gray
Write-Host ""

if (-not (Test-Path "$raiz\.env")) {
    Write-Host "  [ERROR] No existe el archivo .env" -ForegroundColor Red
    Read-Host "  Presiona Enter para salir"; exit 1
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] pnpm no esta instalado. Ejecuta: npm install -g pnpm" -ForegroundColor Red
    Read-Host "  Presiona Enter para salir"; exit 1
}

# Arrancar API server (sigue en HTTP local; Vite le hace de proxy seguro)
Write-Host "  -> Servidor API     (interno, puerto 8080)" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$raiz'; pnpm --filter @workspace/api run dev"

Start-Sleep -Seconds 2

# Arrancar frontend en HTTPS (variable de entorno HTTPS=true)
Write-Host "  -> Frontend (app)   HTTPS, puerto 5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$raiz'; `$env:HTTPS='true'; pnpm --filter @workspace/web run dev"

# Arrancar microservicio de Trafico (Django) si esta configurado
$venvPy = Join-Path $raiz "services\trafico\venv\Scripts\python.exe"
if (Test-Path $venvPy) {
    Write-Host "  -> Trafico (Django) puerto 8000 (interno)" -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$raiz\services\trafico'; .\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"
} else {
    Write-Host "  -> Trafico: sin configurar (ejecuta 'configurar-trafico.ps1' una vez)" -ForegroundColor DarkYellow
}

Start-Sleep -Seconds 1

Write-Host ""
Write-Host "  Listo (puede tardar unos segundos en compilar)." -ForegroundColor Cyan
Write-Host ""
Write-Host "  En esta PC:    https://localhost:5173" -ForegroundColor Cyan

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1).IPAddress
if ($ip) {
    Write-Host "  En tu celular: https://$($ip):5173" -ForegroundColor Cyan
    Write-Host "                 (mismo WiFi + ejecuta 'habilitar-celular.ps1' como admin una vez)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  NOTA: la 1a vez cada dispositivo mostrara 'conexion no privada'." -ForegroundColor Yellow
Write-Host "        Toca 'Avanzado' > 'Continuar de todos modos'. Es seguro (es tu red local)." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Cuentas demo:  admin@transpadilla.co / admin123" -ForegroundColor Gray
Write-Host "                 conductor@transpadilla.co / conductor123" -ForegroundColor Gray
Write-Host ""
Write-Host "  (Para detener: cierra las dos ventanas de PowerShell que se abrieron)" -ForegroundColor DarkGray
Write-Host ""
