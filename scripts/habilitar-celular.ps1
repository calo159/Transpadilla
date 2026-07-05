# ============================================================================
#  TransPadilla — Habilitar acceso desde el CELULAR (ejecutar UNA sola vez)
#
#  IMPORTANTE: clic derecho sobre este archivo > "Ejecutar como administrador"
#  (Crea una regla de firewall para que tu celular pueda abrir la app por WiFi)
# ============================================================================

# Verificar que se ejecuta como administrador
$esAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $esAdmin) {
    Write-Host ""
    Write-Host "  [!] Este script necesita permisos de administrador." -ForegroundColor Yellow
    Write-Host "      Cierra esta ventana y haz: clic derecho sobre 'habilitar-celular.ps1'" -ForegroundColor Yellow
    Write-Host "      y elige 'Ejecutar como administrador'." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Presiona Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "  TransPadilla - Habilitando acceso desde el celular..." -ForegroundColor Cyan
Write-Host ""

# Crear / actualizar la regla de firewall
$nombre = "TransPadilla Dev (5173 + 8080)"
Get-NetFirewallRule -DisplayName $nombre -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $nombre `
    -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort 5173,8080 -Profile Any `
    -Description "Acceso desde celulares/dispositivos en la red local a TransPadilla" | Out-Null

Write-Host "  [OK] Regla de firewall creada (puertos 5173 y 8080)." -ForegroundColor Green
Write-Host ""

# Mostrar la IP local para usar en el celular
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1).IPAddress

Write-Host "  =====================================================" -ForegroundColor Cyan
Write-Host "   En tu CELULAR (conectado al mismo WiFi), abre:" -ForegroundColor White
Write-Host ""
Write-Host "        http://$($ip):5173" -ForegroundColor Green
Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  (La PC y el celular deben estar en la misma red WiFi)" -ForegroundColor Gray
Write-Host ""
Read-Host "  Listo. Presiona Enter para cerrar"
