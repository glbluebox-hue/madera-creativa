# Diagnostico de conexiones MongoDB abiertas desde ESTA maquina (22/08/2026).
#
# Nace de un incidente real: un proceso de pruebas olvidado en segundo
# plano llevaba 4 dias reintentando conectar a MongoDB Atlas sin parar,
# acumulando 1531 conexiones abiertas hasta agotar el limite del cluster
# (Flex, "Approaching Connections Limit 105%") y tumbar el acceso real.
# Nadie lo noto hasta que la app dejo de responder.
#
# Este script agrupa las conexiones TCP salientes al puerto de MongoDB
# (27017) por proceso, para detectar en segundos si algo se ha quedado
# acumulando conexiones sin motivo - sin necesidad de credenciales de Mongo
# ni de tocar la base de datos.
#
# Uso:
#   powershell -File scripts\diagnosticar-conexiones-mongo.ps1
#
# Solo ve conexiones DESDE esta maquina - no sustituye al panel de Atlas
# (Metrics > Connections), que es la fuente de verdad del cluster entero
# (incluye Render/produccion, que corre en otra maquina).

$umbralSospechoso = 50

$conexiones = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
  Where-Object { $_.RemotePort -eq 27017 }

if (-not $conexiones) {
  Write-Output "No hay ninguna conexion activa a MongoDB (puerto 27017) desde esta maquina ahora mismo."
  exit 0
}

$porProceso = $conexiones | Group-Object -Property OwningProcess

Write-Output "Conexiones a MongoDB por proceso:"
Write-Output ""

foreach ($grupo in $porProceso | Sort-Object Count -Descending) {
  $pid_ = $grupo.Name
  $cuenta = $grupo.Count
  $proceso = Get-CimInstance Win32_Process -Filter "ProcessId=$pid_" -ErrorAction SilentlyContinue
  $cmd = if ($proceso) { $proceso.CommandLine } else { "(proceso ya no existe)" }
  $marca = if ($cuenta -ge $umbralSospechoso) { " <-- SOSPECHOSO (>= $umbralSospechoso)" } else { "" }
  Write-Output "PID $pid_  -  $cuenta conexion(es)$marca"
  Write-Output "  $cmd"
  Write-Output ""
}

$total = $conexiones.Count
Write-Output "Total: $total conexion(es) desde esta maquina."
if ($total -ge $umbralSospechoso) {
  Write-Output ""
  Write-Output "AVISO: el total ya supera el umbral de $umbralSospechoso. Si no reconoces el proceso de arriba,"
  Write-Output "probablemente sea un servidor o script de prueba olvidado - terminalo con:"
  Write-Output "  taskkill /PID (el numero de PID de arriba) /F"
}
