# TU stack, en puertos propios y —por defecto— EN MODO PRODUCCION, que es el que no se cae.
#
#   .\scripts\mirar.ps1          compila y levanta estable. Tarda ~1 min y despues aguanta todo.
#   .\scripts\mirar.ps1 -Dev     modo desarrollo: recompila al guardar, pero se cae mientras lo hace.
#
#   Abrir: http://localhost:3200/login?tenant=transprensa
#
# POR QUE PRODUCCION POR DEFECTO (2026-08-30). El modo desarrollo recompila SOLO cada vez que un
# archivo cambia, asi que mientras se trabaja en el repo —o mientras corre la suite de pruebas, o
# un build— la pantalla que se esta mirando deja de responder y sale "No pudimos conectar con el
# servidor". En produccion nada de eso la toca: el servidor sirve codigo ya compilado y no vigila
# ningun archivo. El precio es que un cambio nuevo NO aparece hasta volver a ejecutar esto.
#
# Los puertos 3100 (web) y 3002 (api) son de las PRUEBAS: solo estan vivos mientras corre la suite,
# asi que abrir 3100 fuera de una corrida da exactamente ese mismo error. No es un fallo.
#
# Nota: se usa $env: y no -Environment porque este equipo corre Windows PowerShell 5.1, donde ese
# parametro de Start-Process todavia no existe. El proceso hijo hereda el entorno al arrancar.

param([switch]$Dev)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

# SE COMPILA EN EL REPO, SE LLAME DESDE DONDE SE LLAME (2026-09-04).
#
# `Start-Process` ya recibia `-WorkingDirectory $raiz`, pero las tres compilaciones de abajo se
# invocan directamente y corrian en la carpeta ACTUAL. Llamando al script desde `Documents` —que es
# lo normal si uno escribe la ruta entera— pnpm se ponia a rastrear `Documents` entera y moria en
# `EPERM: scandir 'Mi musica'`, un enlace del sistema. El mensaje que se veia era "Fallo la
# compilacion de shared", que no se parece en nada a la causa.
Set-Location $raiz

# Lo que hubiera quedado vivo en esos puertos se para primero: dos servidores sobre el mismo puerto
# dan un fallo que no se parece a nada —el segundo arranca, no escucha, y la pantalla dice que no
# hay conexion—.
foreach ($puerto in 3200, 3012) {
  Get-NetTCPConnection -State Listen -LocalPort $puerto -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      Write-Host "Parando lo que estaba en el puerto ${puerto} (proceso $_)..." -ForegroundColor DarkGray
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 1

$env:PORT = '3012'
$env:FRONTEND_URL = 'http://localhost:3200'
$env:NEXT_PUBLIC_API_URL = 'http://localhost:3012'
# Carpeta de compilacion propia: un build o una corrida de pruebas escribe en `.next` y no toca esto.
$env:NEXT_DIST_DIR = '.next-mirar'

if ($Dev) {
  Write-Host "Levantando TU stack en modo DESARROLLO (3200 web / 3012 api)..." -ForegroundColor Cyan
  Start-Process -FilePath 'pnpm.cmd' -ArgumentList '--filter', '@neo-pulse/api', 'dev' -WorkingDirectory $raiz -WindowStyle Minimized
  Start-Process -FilePath 'pnpm.cmd' -ArgumentList '--filter', '@neo-pulse/web', 'dev:mirar' -WorkingDirectory $raiz -WindowStyle Minimized
  Write-Host ""
  Write-Host "Listo en unos segundos: http://localhost:3200/login?tenant=transprensa" -ForegroundColor Green
  Write-Host "OJO: en -Dev, cualquier cambio en el repo lo recompila y la pantalla se cae un momento." -ForegroundColor Yellow
  return
}

Write-Host "Compilando (una vez) para que despues no se caiga..." -ForegroundColor Cyan

# Se invocan `nest build` y `next build` directamente, sin turbo: turbo cachea por tarea y podria
# devolver el resultado de un build hecho con OTRA carpeta de salida u otra URL de API.
& pnpm.cmd --filter '@neo-pulse/shared' build
if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion de shared' }

& pnpm.cmd --filter '@neo-pulse/api' exec nest build
if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion de la API' }

# NEXT_PUBLIC_API_URL se INCRUSTA al compilar, no se lee al arrancar: por eso el build va aqui
# dentro, con el entorno ya puesto, y no fuera.
& pnpm.cmd --filter '@neo-pulse/web' exec next build
if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion de la web' }

Write-Host "Levantando TU stack ESTABLE (3200 web / 3012 api)..." -ForegroundColor Cyan
Start-Process -FilePath 'pnpm.cmd' -ArgumentList '--filter', '@neo-pulse/api', 'start' -WorkingDirectory $raiz -WindowStyle Minimized
Start-Process -FilePath 'pnpm.cmd' -ArgumentList '--filter', '@neo-pulse/web', 'start:mirar' -WorkingDirectory $raiz -WindowStyle Minimized

Write-Host ""
Write-Host "Listo:" -ForegroundColor Green
Write-Host "  http://localhost:3200/login?tenant=transprensa"
Write-Host ""
Write-Host "No se cae aunque se trabaje en el repo o corran las pruebas." -ForegroundColor DarkGray
Write-Host "Para ver un cambio nuevo, vuelve a ejecutar este script." -ForegroundColor DarkGray
