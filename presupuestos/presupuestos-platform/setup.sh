#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────
# Madera Creativa — recuperación automática del proyecto desde Bit Cloud
#
# Uso:
#   chmod +x setup.sh
#   ./setup.sh                  # crea la carpeta "madera-creativa"
#   ./setup.sh mi-carpeta       # o elige el nombre de carpeta
#
# Qué hace, de principio a fin:
#   1. Instala Bit si no está presente
#   2. Crea la carpeta de trabajo e inicializa el workspace
#   3. Verifica la sesión de Bit Cloud (o pide iniciar sesión)
#   4. Importa los 3 componentes del proyecto con su código fuente
#   5. Configura "defaultScope" en workspace.jsonc automáticamente
#   6. Instala todas las dependencias
#   7. Verifica que los 3 componentes están presentes
#   8. Prepara el archivo .env a partir de env.example
#   9. Intenta arrancar la plataforma para confirmar que no hay errores
# ─────────────────────────────────────────────────────────────────────────

PROJECT_DIR="${1:-madera-creativa}"
SCOPE="madera-creativa.presupuestos"
COMPONENTS=("presupuestos-platform" "presupuestos-prototype" "presupuestos-service")

step() { printf "\n\033[1;34m▶ %s\033[0m\n" "$1"; }
ok()   { printf "  \033[1;32m✔ %s\033[0m\n" "$1"; }
warn() { printf "  \033[1;33m⚠ %s\033[0m\n" "$1"; }
fail() { printf "  \033[1;31m✘ %s\033[0m\n" "$1"; exit 1; }

printf "\033[1mMadera Creativa — recuperación automática del proyecto\033[0m\n"

# ── 1. Bit ──
step "Comprobando instalación de Bit"
if ! command -v bit >/dev/null 2>&1; then
  echo "  Bit no encontrado. Instalando con bvm..."
  npx @teambit/bvm install || fail "No se pudo instalar Bit"
  export PATH="$HOME/bin:$PATH"
fi
command -v bit >/dev/null 2>&1 || fail "Bit sigue sin estar disponible en el PATH. Abre una terminal nueva e inténtalo de nuevo."
ok "Bit disponible"

# ── 2. Carpeta de trabajo ──
step "Creando carpeta de trabajo: $PROJECT_DIR"
if [ -d "$PROJECT_DIR" ] && [ "$(ls -A "$PROJECT_DIR" 2>/dev/null)" ]; then
  fail "La carpeta '$PROJECT_DIR' ya existe y no está vacía. Elige otro nombre o vacíala primero."
fi
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
ok "Carpeta lista: $(pwd)"

# ── 3. Inicializar workspace ──
step "Inicializando workspace de Bit"
bit init || fail "bit init falló"
ok "Workspace inicializado"

# ── 4. Sesión de Bit Cloud ──
step "Verificando sesión de Bit Cloud"
if bit whoami >/dev/null 2>&1; then
  ok "Sesión activa: $(bit whoami 2>/dev/null)"
else
  echo "  Se abrirá el navegador para iniciar sesión en Bit Cloud..."
  bit login || fail "No se pudo iniciar sesión en Bit Cloud"
  ok "Sesión iniciada"
fi

# ── 5. Importar los 3 componentes ──
step "Importando componentes de $SCOPE"
bit import "$SCOPE/**" || fail "bit import falló"
ok "Importación completada"

# ── 6. Configurar defaultScope en workspace.jsonc ──
step "Configurando defaultScope en workspace.jsonc"
WS_FILE="workspace.jsonc"
[ -f "$WS_FILE" ] || fail "No se encontró $WS_FILE"
if grep -q '"defaultScope"' "$WS_FILE"; then
  sed -i.bak -E "s#\"defaultScope\"[[:space:]]*:[[:space:]]*\"[^\"]*\"#\"defaultScope\": \"$SCOPE\"#" "$WS_FILE"
else
  sed -i.bak -E "s#(\"teambit\.workspace/workspace\"[[:space:]]*:[[:space:]]*\{)#\1\n    \"defaultScope\": \"$SCOPE\",#" "$WS_FILE"
fi
rm -f "$WS_FILE.bak"
grep -q "\"defaultScope\": \"$SCOPE\"" "$WS_FILE" && ok "defaultScope configurado: $SCOPE" || fail "No se pudo configurar defaultScope automáticamente — revísalo a mano"

# ── 7. Instalar dependencias ──
step "Instalando dependencias (puede tardar varios minutos)"
bit install || fail "bit install falló"
ok "Dependencias instaladas"

# ── 8. Verificar los 3 componentes ──
step "Verificando componentes importados"
LIST_OUTPUT="$(bit list 2>/dev/null || true)"
echo "$LIST_OUTPUT"
for COMP in "${COMPONENTS[@]}"; do
  echo "$LIST_OUTPUT" | grep -q "$COMP" || fail "Falta el componente $COMP — la importación no se completó correctamente"
done
ok "Los 3 componentes están presentes"

# ── 9. Estado del workspace ──
step "Comprobando estado del workspace"
bit status || true

# ── 10. Preparar archivo de entorno ──
step "Preparando archivo de variables de entorno"
ENV_EXAMPLE="presupuestos/presupuestos-platform/env.example"
if [ -f "$ENV_EXAMPLE" ] && [ ! -f ".env" ]; then
  cp "$ENV_EXAMPLE" ".env"
  ok "Creado .env a partir de env.example — RELLENA tus valores reales antes de arrancar"
elif [ -f ".env" ]; then
  warn ".env ya existe — no se sobrescribe"
else
  warn "No se encontró env.example — crea .env manualmente"
fi

# ── 11. Prueba de arranque (best-effort, no bloqueante) ──
step "Probando arranque de la plataforma (verificación final)"
LOG_FILE="$(mktemp)"
( bit run presupuestos-platform > "$LOG_FILE" 2>&1 & echo $! > /tmp/madera-creativa.pid ) || true
sleep 25
if grep -qiE "ready|running|listening|server" "$LOG_FILE" 2>/dev/null; then
  ok "La plataforma arrancó sin errores detectados"
else
  warn "No se confirmó el arranque automáticamente — revisa el log: $LOG_FILE"
fi
if [ -f /tmp/madera-creativa.pid ]; then
  kill "$(cat /tmp/madera-creativa.pid)" 2>/dev/null || true
  rm -f /tmp/madera-creativa.pid
fi

printf "\n\033[1;32m✅ Recuperación completada en: %s\033[0m\n\n" "$(pwd)"
echo "Próximos pasos:"
echo "  1. Edita .env con tus credenciales reales (MONGO_URL, APP_USER, APP_PASSWORD, etc.)"
echo "  2. Arranca la app con:  bit run presupuestos-platform"
echo "  3. Abre en el navegador la URL que la terminal te indique"
