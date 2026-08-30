# TU stack, en puertos propios. No lo tumba nada de lo que se haga en el repo.
#
# El problema que resuelve: las pruebas y los builds mandan en 3100/3002, asi que cada vez que se
# compila o se corre la suite, la aplicacion que estabas mirando se cae con ERR_CONNECTION_REFUSED.
# Esto levanta una copia aparte en 3200/3012 que nadie mas toca.
#
# Ademas va en modo DESARROLLO: recompila sola al guardar un archivo, asi que no hay que
# reconstruir nada para ver un cambio.
#
#   Uso:   .\scripts\mirar.ps1
#   Abrir: http://localhost:3200/login?tenant=transprensa
#
# Nota: se usa $env: y no -Environment porque este equipo corre Windows PowerShell 5.1, donde ese
# parametro de Start-Process todavia no existe. El proceso hijo hereda el entorno al arrancar.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

Write-Host "Levantando TU stack en 3200 (web) y 3012 (api)..." -ForegroundColor Cyan

$env:PORT = '3012'
$env:FRONTEND_URL = 'http://localhost:3200'
Start-Process -FilePath 'pnpm.cmd' -ArgumentList '--filter','@neo-pulse/api','dev' -WorkingDirectory $raiz -WindowStyle Minimized

$env:PORT = $null
$env:NEXT_PUBLIC_API_URL = 'http://localhost:3012'
$env:NEXT_DIST_DIR = '.next-mirar'   # carpeta propia: un build no te tumba la pantalla
Start-Process -FilePath 'pnpm.cmd' -ArgumentList '--filter','@neo-pulse/web','dev:mirar' -WorkingDirectory $raiz -WindowStyle Minimized

Write-Host ""
Write-Host "Listo en unos segundos:" -ForegroundColor Green
Write-Host "  http://localhost:3200/login?tenant=transprensa"
Write-Host ""
Write-Host "Los puertos 3100/3002 quedan para las pruebas. Si esos se caen, da igual." -ForegroundColor DarkGray
