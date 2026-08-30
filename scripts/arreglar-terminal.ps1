# Devuelve PowerShell a la normalidad cuando una aplicacion de consola (Claude Code, turbo,
# vim...) muere sin apagar el seguimiento del raton, y a partir de ahi CADA MOVIMIENTO DEL RATON
# escribe basura del tipo:  [<35;62;33M[<35;62;34M...
#
# No hay nada roto: son reportes de posicion del raton que la aplicacion pidio al terminal y que
# PowerShell, al quedarse al mando, no sabe consumir y por eso imprime. Ver docs/RUNBOOK.md.
#
# Uso:   powershell -File "$HOME\Documents\Transprensa - NEO PULSE\scripts\arreglar-terminal.ps1"

$e = [char]27
[Console]::Write(
  "$e[?1000l" +   # apagar reporte de clics
  "$e[?1002l" +   # apagar reporte de arrastre
  "$e[?1003l" +   # apagar reporte de CUALQUIER movimiento  <- el culpable habitual
  "$e[?1004l" +   # apagar reporte de foco de ventana
  "$e[?1005l" +   # apagar codificacion utf8 del raton
  "$e[?1006l" +   # apagar codificacion SGR del raton
  "$e[?1015l" +   # apagar codificacion urxvt del raton
  "$e[?2004l" +   # apagar pegado entre corchetes
  "$e[?25h"   +   # volver a mostrar el cursor
  "$e[?1049l" +   # salir del buffer alternativo
  "$e[0m"         # limpiar colores y atributos
)
[Console]::ResetColor()
Clear-Host
Write-Host "Terminal restaurado." -ForegroundColor Green
