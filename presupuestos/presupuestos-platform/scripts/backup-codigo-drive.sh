#!/usr/bin/env bash
#
# Backup del CÓDIGO FUENTE a Google Drive (distinto de backup-mongo.mjs,
# que hace copias de la BASE DE DATOS — dos mecanismos separados y
# complementarios). Pensado para ejecutarse dentro de
# .github/workflows/backup-drive.yml, en un runner de GitHub Actions con
# rclone y gitleaks ya instalados — pero es un script normal, se puede
# ejecutar igual en local para probarlo (ver BACKUP-CODIGO.md).
#
# Qué hace, en orden, y por qué en ese orden:
#   1. Genera una copia limpia con `git archive` — nunca copia la carpeta
#      de trabajo a mano: `git archive` solo puede incluir lo que Git ya
#      tiene registrado como seguimiento, así que node_modules/, dist/ y
#      .env quedan fuera por construcción, no por una lista de exclusión
#      que alguien tendría que mantener al día.
#   2. Comprueba que el .tar.gz generado no está corrupto ANTES de seguir
#      (tar -tzf) — no tiene sentido escanear ni subir un archivo roto.
#   3. Extrae esa copia a una carpeta temporal y la escanea con gitleaks
#      buscando claves/tokens/contraseñas — sobre el CONTENIDO REAL que va
#      a subirse, no sobre el historial completo de Git (que podría dar
#      falsos positivos de secretos ya rotados hace tiempo). Si encuentra
#      algo, el script termina aquí — no se sube nada.
#   4. Genera un metadata.json junto al archivo: commit, rama, autor,
#      mensaje, fecha UTC, número de archivos, checksum SHA-256— así
#      cualquier backup se puede identificar sin necesidad de descomprimirlo.
#   5. Sube ambos archivos a Google Drive con rclone (autenticado por
#      OAuth2, nunca una Service Account — ver la propuesta original para
#      el porqué).
#   6. Verifica con `rclone check` que lo que quedó en Drive coincide
#      bit a bit con lo que se generó en local — no basta con que el
#      comando de subida no diera error.
#
# Cualquier fallo en cualquiera de estos pasos hace que el script termine
# con código de salida distinto de cero (gracias a `set -e`) — eso deja el
# paso de GitHub Actions en rojo, con el motivo exacto en el log. Como
# cada backup es un archivo con nombre único (nunca se reutiliza un
# nombre), un fallo a mitad de camino nunca deja una copia a medias
# sustituyendo a una buena: simplemente no llega a subirse nada nuevo, y
# lo que ya había en Drive queda intacto.

set -euo pipefail

: "${GDRIVE_CLIENT_ID:?Falta la variable de entorno GDRIVE_CLIENT_ID}"
: "${GDRIVE_CLIENT_SECRET:?Falta la variable de entorno GDRIVE_CLIENT_SECRET}"
: "${GDRIVE_RCLONE_TOKEN:?Falta la variable de entorno GDRIVE_RCLONE_TOKEN}"
: "${GDRIVE_FOLDER_ID:?Falta la variable de entorno GDRIVE_FOLDER_ID}"

RAIZ_REPO="$(git rev-parse --show-toplevel)"
cd "$RAIZ_REPO"

# Carpeta temporal para todo lo que genera este script (el archivo, sus
# metadatos, la copia extraída para escanear, y la configuración de rclone
# con el token dentro) — se borra siempre al terminar, tanto si todo va
# bien como si falla algo (trap en EXIT), para no dejar el token de Drive
# tirado en el disco del runner más tiempo del necesario.
DIR_TRABAJO="$(mktemp -d)"
trap 'rm -rf "$DIR_TRABAJO"' EXIT

FECHA_UTC="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
SHA_CORTO="$(git rev-parse --short HEAD)"
SHA_COMPLETO="$(git rev-parse HEAD)"
RAMA="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}"
AUTOR="$(git log -1 --format='%an <%ae>')"
MENSAJE="$(git log -1 --format='%s')"
NUM_ARCHIVOS="$(git ls-files | wc -l | tr -d ' ')"
DISPARADO_POR="${GITHUB_EVENT_NAME:-manual}"

NOMBRE_BASE="madera-creativa_${FECHA_UTC}_${SHA_CORTO}"
ARCHIVO="${DIR_TRABAJO}/${NOMBRE_BASE}.tar.gz"
METADATA="${DIR_TRABAJO}/${NOMBRE_BASE}.json"

echo "→ Generando copia limpia desde HEAD (${SHA_CORTO}, rama ${RAMA})…"
git archive --format=tar.gz --output="$ARCHIVO" HEAD

echo "→ Comprobando que el archivo no está corrupto…"
tar -tzf "$ARCHIVO" > /dev/null

echo "→ Buscando secretos en el contenido con gitleaks…"
DIR_EXTRAIDO="${DIR_TRABAJO}/contenido"
mkdir -p "$DIR_EXTRAIDO"
tar -xzf "$ARCHIVO" -C "$DIR_EXTRAIDO"
if ! gitleaks detect --no-git --source="$DIR_EXTRAIDO" --redact --exit-code 1; then
  echo "✗ gitleaks encontró algo que parece un secreto en el contenido del backup — no se sube nada." >&2
  exit 1
fi

# Escapa solo lo imprescindible para que quepan sin romper el JSON en una
# línea (autor/mensaje de un commit real nunca deberían traer saltos de
# línea) — sin depender de ninguna herramienta externa de por medio.
escapar_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

CHECKSUM="$(sha256sum "$ARCHIVO" | awk '{print $1}')"
TAMANO_BYTES="$(stat -c%s "$ARCHIVO")"
AUTOR_JSON="$(escapar_json "$AUTOR")"
MENSAJE_JSON="$(escapar_json "$MENSAJE")"

cat > "$METADATA" <<JSON
{
  "commitSha": "${SHA_COMPLETO}",
  "commitShaCorto": "${SHA_CORTO}",
  "rama": "${RAMA}",
  "autor": "${AUTOR_JSON}",
  "mensaje": "${MENSAJE_JSON}",
  "fechaUtc": "${FECHA_UTC}",
  "numArchivos": ${NUM_ARCHIVOS},
  "tamanoBytes": ${TAMANO_BYTES},
  "sha256": "${CHECKSUM}",
  "disparadoPor": "${DISPARADO_POR}"
}
JSON

echo "→ Preparando la configuración de rclone (efímera, solo en este runner)…"
CONFIG_RCLONE="${DIR_TRABAJO}/rclone.conf"
cat > "$CONFIG_RCLONE" <<EOF
[gdrive]
type = drive
client_id = ${GDRIVE_CLIENT_ID}
client_secret = ${GDRIVE_CLIENT_SECRET}
scope = drive.file
token = ${GDRIVE_RCLONE_TOKEN}
root_folder_id = ${GDRIVE_FOLDER_ID}
EOF

# Carpeta de subida: solo contiene el .tar.gz y el .json de este backup
# (nada más de $DIR_TRABAJO) — se copia entera para no tener que listar
# los dos nombres por separado en cada comando de rclone.
DIR_SUBIDA="${DIR_TRABAJO}/subida"
mkdir -p "$DIR_SUBIDA"
cp "$ARCHIVO" "$METADATA" "$DIR_SUBIDA/"

echo "→ Subiendo a Google Drive…"
rclone --config="$CONFIG_RCLONE" copy "$DIR_SUBIDA" gdrive: --stats=0

echo "→ Verificando que lo subido coincide exactamente con lo generado…"
rclone --config="$CONFIG_RCLONE" check "$DIR_SUBIDA" gdrive: --one-way

echo "✓ Backup completado: ${NOMBRE_BASE}.tar.gz (${TAMANO_BYTES} bytes, sha256 ${CHECKSUM})"
