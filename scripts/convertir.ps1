<#
.SYNOPSIS
    Genera los .docx y los .pdf de los documentos oficiales de entrega.

.DESCRIPTION
    UNA sola fuente, tres formatos:

      .html   el original. Se lee en pantalla y es la semilla del futuro
              modulo de bienvenida dentro de Ascent.
      .docx   para que el cliente lo edite y lo firme.
      .pdf    para archivar y enviar.

    NI WORD NI LIBREOFFICE.

    El camino evidente era Word por COM. No sirve en esta maquina: Word ABRE
    los archivos pero no puede GUARDARLOS. Falla igual con un documento en
    blanco, que es justo lo que hace un Office sin licencia activa. Y
    LibreOffice no esta instalado. Asi que:

      .docx  lo escribe  scripts\html-a-docx.mjs  (OOXML a mano, sin dependencias)
      .pdf   lo imprime  Chrome sin ventana

    Chrome ademas respeta el diseno de verdad, Fraunces incluida, asi que el
    PDF sale mejor de lo que habria salido pasando por Word.

.NOTES
    Chrome necesita su propio --user-data-dir. Sin eso, si ya hay un Chrome
    abierto, el proceso nuevo le pasa el encargo a la ventana existente y
    termina en el acto: exito aparente y ningun PDF.

.EXAMPLE
    .\scripts\convertir.ps1

.EXAMPLE
    .\scripts\convertir.ps1 -SoloPdf
#>

[CmdletBinding()]
param(
    [string[]] $Archivos,
    [switch]   $SoloPdf,
    [switch]   $SoloDocx
)

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot

if (-not $Archivos -or $Archivos.Count -eq 0) {
    $docs = Join-Path $raiz 'docs\entrega'
    # La ficha de acceso vive FUERA del repositorio a proposito: lleva una
    # contrasena, y dentro un "git add ." distraido la subiria.
    $fuera = 'C:\Users\Prueba\Documents\ASCENT - ENTREGA TRANSPRENSA'

    $Archivos = @(
        (Join-Path $docs  'acta-de-entrega.html'),
        (Join-Path $docs  'anexo-tecnico.html'),
        (Join-Path $fuera 'ficha-de-acceso.html')
    )
}

$faltan = $Archivos | Where-Object { -not (Test-Path $_) }
if ($faltan) {
    Write-Host "No se encontraron estos archivos:" -ForegroundColor Red
    $faltan | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
$Archivos = $Archivos | ForEach-Object { (Resolve-Path $_).Path }

Write-Host ""
Write-Host "  ASCENT - documentos oficiales de entrega" -ForegroundColor Cyan
Write-Host "  ---------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# -- .docx ------------------------------------------------------------------
if (-not $SoloPdf) {
    Write-Host "  Word (.docx)" -ForegroundColor White
    $generador = Join-Path $PSScriptRoot 'html-a-docx.mjs'
    & node $generador @Archivos
    if ($LASTEXITCODE -ne 0) { throw "Fallo la generacion de los .docx" }
    Write-Host ""
}

# -- .pdf -------------------------------------------------------------------
if (-not $SoloDocx) {
    $chrome = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $chrome) { throw "No se encontro Chrome ni Edge para imprimir los PDF." }

    $perfil = Join-Path $env:TEMP 'ascent-chrome-perfil'
    Write-Host "  PDF" -ForegroundColor White

    foreach ($html in $Archivos) {
        $nombre = [System.IO.Path]::GetFileNameWithoutExtension($html)
        $pdf    = Join-Path (Split-Path -Parent $html) "$nombre.pdf"
        $uri    = ([uri]$html).AbsoluteUri

        if (Test-Path $pdf) { Remove-Item $pdf -Force }

        $argumentos = @(
            '--headless=new'
            '--disable-gpu'
            '--no-first-run'
            '--hide-scrollbars'
            "--user-data-dir=`"$perfil`""
            '--no-pdf-header-footer'
            # Margen para que las tipografias remotas lleguen antes de imprimir.
            # Sin esto el PDF sale con el respaldo (Georgia) y se nota.
            '--virtual-time-budget=15000'
            "--print-to-pdf=`"$pdf`""
            "`"$uri`""
        )
        Start-Process -FilePath $chrome -ArgumentList $argumentos -NoNewWindow -Wait | Out-Null

        if (Test-Path $pdf) {
            Write-Host ("    {0}.pdf  {1:N1} KB" -f $nombre, ((Get-Item $pdf).Length / 1KB)) -ForegroundColor Green
        } else {
            Write-Host "    $nombre.pdf  NO SE GENERO" -ForegroundColor Red
        }
    }
    Write-Host ""
}

Write-Host "  REVISAR ANTES DE ENVIAR:" -ForegroundColor Yellow
Write-Host "   - que no quede ningun hueco amarillo [entre corchetes] sin rellenar" -ForegroundColor DarkYellow
Write-Host "   - que ninguna tabla se parta a mitad de fila entre dos paginas" -ForegroundColor DarkYellow
Write-Host "   - que los siete valores del apartado 11 del acta coincidan con el contrato" -ForegroundColor DarkYellow
Write-Host ""
