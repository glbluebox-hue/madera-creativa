# Backup automático del código en Google Drive

Copia de seguridad del **código fuente** del repositorio, independiente de GitHub, en Google Drive — para poder recuperar el proyecto si alguna vez hay un problema con GitHub, el repositorio o el entorno de desarrollo.

Distinto de `backup-mongo.mjs` (mismo directorio), que hace copias de la **base de datos**. Son dos mecanismos separados y complementarios: este no toca datos de clientes, aquel no toca código.

## Cómo funciona

Disparado automáticamente por `.github/workflows/backup-drive.yml` en cada push a `main` y a `feature/fase-0-security` (fase actual — ver la nota dentro del propio workflow para cuándo retirar esta segunda rama), y también a mano desde GitHub cuando haga falta (ver más abajo).

El trabajo real lo hace `scripts/backup-codigo-drive.sh`, en este orden:

1. **`git archive` desde el commit exacto** — nunca copia la carpeta de trabajo a mano. Solo puede incluir lo que Git ya tiene registrado como seguimiento, así que `node_modules/`, `dist/` y `.env` quedan fuera por construcción, no por una lista de exclusión que alguien tendría que recordar mantener.
2. Comprueba que el `.tar.gz` generado no está corrupto.
3. Lo extrae a una carpeta temporal y lo escanea con **gitleaks** buscando claves, tokens o contraseñas — sobre el contenido real que va a subirse. Si encuentra algo, el proceso para aquí y no sube nada.
4. Genera un `metadata.json` junto al archivo: commit (completo y corto), rama, autor, mensaje, fecha UTC, número de archivos, y su checksum SHA-256.
5. Sube ambos archivos a Google Drive con **rclone**, autenticado con OAuth2 (nunca una Service Account — una Service Account no tiene cuota propia en un Drive personal).
6. Verifica con `rclone check` que lo subido coincide exactamente con lo generado en local.

Cada backup es un archivo con nombre único — nunca se sobrescribe ni se borra uno anterior. El nombre ya identifica el commit sin necesidad de abrir nada:

```
madera-creativa_2026-09-02T10-15-00Z_1f569a9.tar.gz
madera-creativa_2026-09-02T10-15-00Z_1f569a9.json
```

Si cualquier paso falla, el workflow queda en rojo en GitHub (con notificación automática) y **no se sube nada** — el contenido de Drive queda exactamente igual que antes del intento.

**Retención**: ninguna por ahora — se conservan todos los backups sin borrado automático (ver la propuesta original para los números: a este tamaño, no es un problema real durante años).

## Configuración inicial (una sola vez)

### 1. Google Cloud — habilitar la API y crear credenciales OAuth

1. Ve a [console.cloud.google.com](https://console.cloud.google.com/) y crea un proyecto nuevo (o usa uno existente).
2. En **APIs y servicios → Biblioteca**, busca "Google Drive API" y actívala.
3. En **APIs y servicios → Pantalla de consentimiento OAuth**, configúrala como tipo "Externo" (o "Interno" si tienes Google Workspace) y añade tu propio correo como usuario de prueba.
4. En **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**, elige tipo **"App de escritorio"**. Guarda el `Client ID` y el `Client secret` que te da — los necesitarás en el paso 3.

### 2. Google Drive — la carpeta destino

Crea (o elige) la carpeta donde quieres que caigan los backups. Abre la carpeta en el navegador y copia el ID de la URL:

```
https://drive.google.com/drive/folders/ESTE_TROZO_ES_EL_FOLDER_ID
```

### 3. Autorizar rclone contra tu propia cuenta (en tu ordenador, no en GitHub)

Instala rclone en tu máquina ([rclone.org/downloads](https://rclone.org/downloads/)) y ejecuta, sustituyendo tus valores del paso 1:

```bash
rclone authorize "drive" --drive-client-id "TU_CLIENT_ID" --drive-client-secret "TU_CLIENT_SECRET" --drive-scope drive.file
```

Se abrirá el navegador — inicia sesión en tu cuenta de Google y aprueba el acceso. El scope `drive.file` limita el acceso solo a los archivos que esta aplicación cree, nunca al resto de tu Drive. La terminal imprimirá un bloque JSON de una sola línea parecido a:

```json
{"access_token":"…","token_type":"Bearer","refresh_token":"…","expiry":"…"}
```

Guarda ese JSON completo — es el valor exacto que va en el secret `GDRIVE_RCLONE_TOKEN` del siguiente paso. No caduca mientras no revoques el acceso desde tu cuenta de Google.

### 4. GitHub — Secrets y Variables

En el repositorio: **Settings → Secrets and variables → Actions**.

**Secrets** (pestaña "Secrets", cada uno con "New repository secret"):

| Nombre | Valor |
|---|---|
| `GDRIVE_CLIENT_ID` | El Client ID del paso 1 |
| `GDRIVE_CLIENT_SECRET` | El Client secret del paso 1 |
| `GDRIVE_RCLONE_TOKEN` | El JSON completo del paso 3, tal cual, en una sola línea |

**Variables** (pestaña "Variables", con "New repository variable" — no es información sensible, no hace falta que sea un secret):

| Nombre | Valor |
|---|---|
| `GDRIVE_FOLDER_ID` | El ID de la carpeta del paso 2 |

## Primera prueba manual

Antes de dejarlo corriendo solo en cada push, comprueba que funciona de punta a punta:

1. En GitHub, pestaña **Actions → Backup de código a Google Drive → Run workflow** → elige la rama → **Run workflow**.
2. Espera a que termine (unos 1-2 minutos) y comprueba que queda en verde.
3. Abre la carpeta de Google Drive del paso 2 — debe haber aparecido un `.tar.gz` y un `.json` nuevos.
4. Descarga el `.json` y comprueba que el `commitSha` coincide con el último commit real de la rama que elegiste.
5. Descarga el `.tar.gz`, descomprímelo, y confirma que reconoces el contenido (por ejemplo, que `presupuestos/presupuestos-service/package.json` está ahí) y que **no** hay ningún `.env` dentro.
6. Comprueba el checksum localmente y compáralo con el `sha256` del `.json`:
   ```bash
   sha256sum madera-creativa_*.tar.gz
   ```

Si los 6 puntos salen bien, el sistema está verificado de punta a punta — recuperable de verdad, no solo "parece que subió algo".

## Restaurar desde un backup

1. Descarga el `.tar.gz` del backup que quieras (identifícalo por el `commitSha`/fecha en el nombre o en su `.json`).
2. Descomprímelo en una carpeta vacía:
   ```bash
   mkdir restaurado && tar -xzf madera-creativa_<fecha>_<sha>.tar.gz -C restaurado
   ```
3. Eso es exactamente el estado del repositorio en ese commit (sin `.git`, sin `node_modules`). Para volver a tener historial de Git sobre esa copia, inicialízalo de nuevo (`git init`, `git add -A`, `git commit`) o, si GitHub sigue disponible, simplemente usa `git checkout <commitSha>` directamente sobre el repositorio real — este backup es la red de seguridad para cuando esa opción no esté disponible.
4. Para reinstalar dependencias: `pnpm install` en la raíz (monorepo Bit) y `npm ci` dentro de `presupuestos/presupuestos-service` y `presupuestos/presupuestos-prototype` (tienen su propio `package-lock.json`, despliegue combinado en Render — ver `.gitignore` de la raíz).
