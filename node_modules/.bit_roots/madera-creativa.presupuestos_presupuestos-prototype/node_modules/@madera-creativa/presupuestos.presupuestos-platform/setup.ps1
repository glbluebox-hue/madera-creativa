#Requires -Version 5.1
<#
.SYNOPSIS
  Madera Creativa — recuperación automática del proyecto desde Bit Cloud.

.DESCRIPTION
  Instala Bit si hace falta, crea el workspace, verifica la sesión de
  Bit Cloud, importa los 3 componentes, configura workspace.jsonc,
  instala dependencias y verifica que todo quedó correcto.

.PARAMETER ProjectDir
  Nombre de la carpeta donde se recupera el proyecto. Por defecto "madera-creativa".

.EXAMPLE
  .\setup.ps1
  .\setup.ps1 -ProjectDir mi-carpeta
#>

param(
    [string]$ProjectDir = "madera-creativa"
)

$ErrorActionPreference = "Stop"
$Scope = "madera-creativa.presupuestos"
$Components = @("presupuestos-platform", "presupuestos-prototype", "presupuestos-service")

function Step($msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  ✔ $msg" -ForegroundColor Green }
function WarnMsg($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "  ✘ $msg" -ForegroundColor Red; exit 1 }

Write-Host "Madera Creativa — recuperación automática del proyecto" -ForegroundColor White

# ── 1. Bit ──
Step "Comprobando instalación de Bit"
if (-not (Get-Command bit -ErrorAction SilentlyContinue)) {
    Write-Host "  Bit no encontrado. Instalando con bvm..."
    npx @teambit/bvm install
    if ($LASTEXITCODE -ne 0) { Fail "No se pudo instalar Bit" }
}
if (-not (Get-Command bit -ErrorAction SilentlyContinue)) {
    Fail "Bit sigue sin estar disponible en el PATH. Abre una terminal nueva e inténtalo de nuevo."
}
Ok "Bit disponible"

# ── 2. Carpeta de trabajo ──
Step "Creando carpeta de trabajo: $ProjectDir"
if ((Test-Path $ProjectDir) -and (Get-ChildItem $ProjectDir -ErrorAction SilentlyContinue)) {
    Fail "La carpeta '$ProjectDir' ya existe y no está vacía. Elige otro nombre o vacíala primero."
}
New-Item -ItemType Directory -Force -Path $ProjectDir | Out-Null
Set-Location $ProjectDir
Ok "Carpeta lista: $(Get-Location)"

# ── 3. Inicializar workspace ──
Step "Inicializando workspace de Bit"
bit init
if ($LASTEXITCODE -ne 0) { Fail "bit init falló" }
Ok "Workspace inicializado"

# ── 4. Sesión de Bit Cloud ──
Step "Verificando sesión de Bit Cloud"
bit whoami 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Se abrirá el navegador para iniciar sesión en Bit Cloud..."
    bit login
    if ($LASTEXITCODE -ne 0) { Fail "No se pudo iniciar sesión en Bit Cloud" }
    Ok "Sesión iniciada"
} else {
    Ok "Sesión activa"
}

# ── 5. Importar los 3 componentes ──
Step "Importando componentes de $Scope"
bit import "$Scope/**"
if ($LASTEXITCODE -ne 0) { Fail "bit import falló" }
Ok "Importación completada"

# ── 6. Configurar defaultScope en workspace.jsonc ──
Step "Configurando defaultScope en workspace.jsonc"
$wsFile = "workspace.jsonc"
if (-not (Test-Path $wsFile)) { Fail "No se encontró $wsFile" }
$content = Get-Content $wsFile -Raw
if ($content -match '"defaultScope"\s*:\s*"[^"]*"') {
    $content = $content -replace '"defaultScope"\s*:\s*"[^"]*"', "`"defaultScope`": `"$Scope`""
} else {
    $content = $content -replace '("teambit\.workspace/workspace"\s*:\s*\{)', "`$1`n    `"defaultScope`": `"$Scope`","
}
Set-Content -Path $wsFile -Value $content -NoNewline
if ((Get-Content $wsFile -Raw) -match [regex]::Escape("`"defaultScope`": `"$Scope`"")) {
    Ok "defaultScope configurado: $Scope"
} else {
    Fail "No se pudo configurar defaultScope automáticamente — revísalo a mano"
}

# ── 7. Instalar dependencias ──
Step "Instalando dependencias (puede tardar varios minutos)"
bit install
if ($LASTEXITCODE -ne 0) { Fail "bit install falló" }
Ok "Dependencias instaladas"

# ── 8. Verificar los 3 componentes ──
Step "Verificando componentes importados"
$listOutput = bit list 2>$null
Write-Host $listOutput
foreach ($comp in $Components) {
    if ($listOutput -notmatch $comp) { Fail "Falta el componente $comp — la importación no se completó correctamente" }
}
Ok "Los 3 componentes están presentes"

# ── 9. Estado del workspace ──
Step "Comprobando estado del workspace"
bit status

# ── 10. Preparar archivo de entorno ──
Step "Preparando archivo de variables de entorno"
$envExample = "presupuestos/presupuestos-platform/env.example"
if ((Test-Path $envExample) -and (-not (Test-Path ".env"))) {
    Copy-Item $envExample ".env"
    Ok "Creado .env a partir de env.example — RELLENA tus valores reales antes de arrancar"
} elseif (Test-Path ".env") {
    WarnMsg ".env ya existe — no se sobrescribe"
} else {
    WarnMsg "No se encontró env.example — crea .env manualmente"
}

# ── 11. Prueba de arranque (best-effort, no bloqueante) ──
Step "Probando arranque de la plataforma (verificación final)"
$logFile = New-TemporaryFile
$proc = Start-Process -FilePath "bit" -ArgumentList "run", "presupuestos-platform" `
    -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 25
$logContent = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
if ($logContent -match "(?i)ready|running|listening|server") {
    Ok "La plataforma arrancó sin errores detectados"
} else {
    WarnMsg "No se confirmó el arranque automáticamente — revisa el log: $logFile"
}
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue

Write-Host "`n✅ Recuperación completada en: $(Get-Location)" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos pasos:"
Write-Host "  1. Edita .env con tus credenciales reales (MONGO_URL, APP_USER, APP_PASSWORD, etc.)"
Write-Host "  2. Arranca la app con:  bit run presupuestos-platform"
Write-Host "  3. Abre en el navegador la URL que la terminal te indique"
