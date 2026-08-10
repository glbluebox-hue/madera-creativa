# Restaurar un backup de MongoDB

Guía de recuperación para los backups generados por `backup-mongo.mjs` (Incremento 1.6). Sigue estos pasos en orden — no ejecutes el paso 3 sin haber hecho antes el 1 y el 2.

## Requisitos

- MongoDB Database Tools instaladas (`mongorestore` en el `PATH`) — mismo requisito que `backup-mongo.mjs`. Descarga: https://www.mongodb.com/try/download/database-tools
- El archivo de backup que quieres restaurar, en `presupuestos-platform/backups/backup-<fecha>.gz`.
- El `MONGO_URL` correcto en `presupuestos-platform/.env`.

## 1. Antes de nada: identifica qué backup necesitas

Lista los backups disponibles y elige por fecha (el nombre del archivo incluye la fecha y hora UTC de cuando se generó):

```bash
ls presupuestos/presupuestos-platform/backups/
```

## 2. Restaura primero a una base de prueba, nunca directo a producción

`mongorestore` puede sobrescribir datos existentes. Antes de tocar la base real, restaura el backup a una base temporal para comprobar que el archivo está bien y que el contenido es el que esperas:

```bash
mongorestore --uri "mongodb+srv://<usuario>:<password>@<cluster>/prueba_restauracion?retryWrites=true&w=majority" \
  --gzip --archive=presupuestos/presupuestos-platform/backups/backup-<fecha>.gz
```

Cambia solo el nombre de la base al final de la URL (aquí `prueba_restauracion`) — mismo clúster, misma cuenta, base distinta. Comprueba en Atlas (o con un script) que las colecciones `clientes`, `facturas` y `usuarios` tienen el número de documentos esperado y que el contenido de alguno es correcto.

Cuando termines de comprobar, borra esa base de prueba desde Atlas.

## 3. Restaurar a la base real (solo cuando estés seguro)

Hay dos formas, según lo que necesites:

**A) Restaurar añadiendo/actualizando datos, sin borrar lo que ya existe** (más seguro — `mongorestore` no borra por defecto, solo inserta o actualiza documentos con el mismo `_id`):

```bash
mongorestore --uri "$MONGO_URL" --gzip --archive=presupuestos/presupuestos-platform/backups/backup-<fecha>.gz
```

**B) Restaurar sustituyendo completamente las colecciones** (`--drop` borra cada colección del backup *antes* de restaurarla — usa esto solo si quieres volver exactamente al estado del backup, perdiendo todo lo escrito después):

```bash
mongorestore --uri "$MONGO_URL" --gzip --archive=presupuestos/presupuestos-platform/backups/backup-<fecha>.gz --drop
```

⚠️ **`--drop` es irreversible sin otro backup.** Si dudas, usa la opción A, o repite el paso 2 en una base de prueba las veces que haga falta hasta estar seguro.

## 4. Verifica después de restaurar

- Arranca el backend y comprueba `GET /` → debe responder `{"ok":true,"db":"conectada"}` (Incremento 1.6).
- Inicia sesión en la app y comprueba que al menos un cliente y una factura conocidos aparecen con los datos correctos.
- Revisa el log de arranque (Pino, Incremento 1.4) por si hay algún error de conexión o migración.
