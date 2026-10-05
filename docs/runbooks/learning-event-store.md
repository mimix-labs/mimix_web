# Aprendizaje persistente — operación

## Activación incremental

`MIMIX_DATA_STORE=file` es el valor por defecto: conserva la API y el snapshot de
identidad anteriores; `/api/learning/*` devuelve 404. `postgres` requiere
`MIMIX_AUTH_MODE=clerk` y `DATABASE_URL`. En este modo identidad y aprendizaje usan
PostgreSQL; `MIMIX_IDENTITY_FILE` deja de ser obligatorio. No hay fallback a file ni
memoria cuando falla SQL. Un error de identidad/almacenamiento produce 503 genérico.
Health sigue siendo liveness del proceso, no una prueba de disponibilidad SQL.

1. Crear PostgreSQL 17 con backups, TLS verificado y acceso privado. En desarrollo:
   establecer `POSTGRES_PASSWORD` y ejecutar `docker compose -f compose.learning.yaml up -d`.
   El puerto publicado queda limitado a localhost. No usar credenciales de prueba en cloud.
2. Configurar `DATABASE_URL` en el gestor de secretos. La CLI la lee del entorno,
   **no** de `server/.env`; no pasar la URL como argumento ni imprimirla en logs.
3. Con la nueva imagen, ejecutar una vez `node apps/api/dist/database/cli.js migrate`.
   En checkout: `pnpm --filter @mimix/api build` y `pnpm --filter @mimix/api db:migrate`.
   SQL revisable vive en `apps/api/migrations`. No usar `drizzle-kit push` en producción.
   Migraciones se serializan con advisory lock y son transaccionales/idempotentes.
   No se ejecutan en el arranque de la API. Futuras migraciones se añaden, no editan
   las ya aplicadas. Para generarlas: `pnpm --filter @mimix/api db:generate`.
4. Detener el escritor de identidad file, respaldar su snapshot v1 y ejecutar
   `node apps/api/dist/database/cli.js import-identities /data/identity.json`.
   Repetir no duplica. UUID, timestamps y claves externas deben coincidir; cualquier
   conflicto o referencia rota aborta toda la importación. No hacer login SQL antes
   de importar si ya existen usuarios file. Es una operación offline.
5. Activar `MIMIX_DATA_STORE=postgres`, conservar Clerk/Google y arrancar. El proceso
   necesita conectividad a SQL; pool máximo 10, conexión 5s, sentencia 15s, lock 10s.
   Usar una réplica por las cuotas locales actuales; SQL no vuelve distribuidos los límites.
6. Verificar `/api/identity/me`: UUID anterior preservado. Crear un intento, añadir
   evento y consultar progreso. Probar 401 sin sesión y 404 con otro usuario. Reiniciar
   y repetir consultas/reintentos. Revisar OpenAPI `/api/openapi.json`.

El usuario de migración es dueño del esquema. Usar otro rol para la API con USAGE
sobre public; SELECT/INSERT sobre users, external_identities, attempts, learning_events;
SELECT/INSERT/UPDATE sobre attempt_progress; UPDATE(id) sobre attempts es necesario
para SELECT FOR UPDATE (el trigger sigue prohibiendo modificar esa columna).
Desde prompt10, añadir SELECT sobre campaign_versions y SELECT/INSERT sobre
campaign_attempts, incluso para reintentos del endpoint learning independiente.
No conceder DDL, TRUNCATE, DELETE ni
superuser al proceso HTTP. La reconstrucción/importación/exportación usan el rol
operativo adecuado. Los triggers también bloquean UPDATE/DELETE/TRUNCATE del
historial, pero un dueño de tabla puede deshabilitarlos: no son defensa contra un DBA.

No cambia el frontend. El cliente actual sigue emitiendo eventos efímeros a
`/api/challenges/events`; esos mensajes no tienen owner/attempt verificable y no se
importan. La nueva API no inventa progreso para ese historial.

## Contratos y consistencia

- `POST /api/learning/attempts`: UUID `idempotencyKey`, `challengeId` y
  `challengeVersion` de 1–80 caracteres `[A-Za-z0-9._-]`. Devuelve `{attempt,duplicate}`.
  Nuevo 201, retry idéntico 200, clave reutilizada con otro contenido 409.
- `POST /api/learning/attempts/{id}/events`: UUID `eventId`, `sequence` 2–1000000,
  `type` y `payload`. Secuencia 1 es `attempt_started` generada en servidor.
  `answer_submitted` acepta solo `{correct:boolean}`; `hint_requested`,
  `attempt_completed`, `attempt_abandoned` aceptan `{}`. Devuelve `{event,duplicate}`.
- `GET /api/learning/attempts/{id}`: `{attempt,progress}` solo para su propietario.
- `GET /api/learning/progress?after=UUID`: `{items,nextCursor}`, 50 intentos por
  página, orden UUID ascendente. Es cursor de recorrido, no orden cronológico ni
  snapshot consistente entre varias páginas; nuevas creaciones pueden requerir
  reiniciar el recorrido. No acepta filtro de usuario: se deriva de la sesión.

Campos extra, respuestas de texto libre, fecha del cliente y owner externo se
rechazan. Payload HTTP máximo 16 KiB. Body inválido 400, demasiado grande 413.
Intento ajeno y ausente dan el mismo 404. Sin sesión activa 401; conflictos de
secuencia/terminal/idempotencia 409. No avanzar localmente al recibir 409: consultar
la proyección, reenviar predecesores faltantes y reutilizar el eventId original solo
para el mismo hecho. Un retry exacto después de cierre devuelve el evento original.
No se ordena por reloj del cliente ni se aceptan huecos silenciosamente.

Cada creación/escritura confirma evento y proyección en la misma transacción.
Escrituras concurrentes del mismo número de secuencia tienen un único ganador.
GET devuelve solo datos confirmados y lleva Cache-Control: no-store. Cuotas por
sujeto firmado y plantilla de ruta (120/min default); cambiar UUID/query no las evita.
Operador/bridge no puede escribir aprendizaje en nombre de una persona.

Reto/versión aún son referencias opacas: la validación contra manifest pertenece al
prompt 07. `correct` y finalización son hechos reportados por el cliente autenticado,
no evaluación pedagógica certificada. No producen logros. Desde prompt10, solo los
intentos asociados explícitamente a una campaña conceden desbloqueos en su versión
exacta; ver [reglas de campañas](../architecture/campaign-progression.md).

## Reconstrucción

`node apps/api/dist/database/cli.js rebuild` elimina **solo** attempt_progress y
reproduce learning_events en orden (attempt_id,sequence), en una transacción.
Usa el mismo reductor que append y coordina un lock exclusivo con todos los writers.
Lectores ven la proyección anterior o la nueva; no un estado parcial. Se puede
repetir. Si falla, hace rollback y conserva la proyección anterior. No reconstruye
hechos a partir de contadores ni modifica historial.

Planificar ventana operativa: la reconstrucción completa bloquea escrituras, y
estas pueden agotar lock_timeout y devolver 503; reintentarlas con la misma clave.
La lectura es por lotes (100 intentos/500 eventos), pero el lock dura toda la
operación. Si la escala vuelve esa ventana inaceptable, introducir proyecciones
versionadas con cambio atómico en una fase específica. No ampliar timeouts sin medir.

## Backup y restauración

Con variables de conexión establecidas por el gestor y herramientas PostgreSQL 17:

```bash
pg_dump --format=custom --file=learning.dump "$DATABASE_URL"
pg_restore --exit-on-error --dbname="$RESTORE_DATABASE_URL" learning.dump
```

La base de destino debe ser nueva, aislada y creada previamente. `pg_dump` conserva
un snapshot consistente; incluye usuarios, identidades, intentos, eventos,
proyecciones, migraciones y triggers. Cifrar el archivo y restringir acceso/retención;
no incluirlo en Git. Guardar también versión de la imagen. No restaurar encima de
producción activa. En entornos donde argv es visible a otros procesos, usar
PGSERVICE/PGPASSFILE con permisos 0600 en lugar de URLs como argumentos.

Tras restaurar: contar usuarios/eventos, verificar UUID conocido, consultar progreso,
ejecutar `rebuild` en la copia y comparar. El smoke Docker ejecuta pg_dump/pg_restore
en DBs desechables y verifica el UUID y un intento completado. No equivale a haber
validado backup gestionado ni recuperación de Railway; ensayar ahí antes de activar.
Definir RPO/RTO operativos y monitorizar el éxito de los backups antes de guardar
progreso real.

## Rollback

- Runtime: `MIMIX_API_RUNTIME=express` conserva SQL, rutas protegidas y proyecciones.
- Código: preferir corregir hacia delante. Conservar base y backup; no hay down que
  borre tablas ni eventos. Revertir a la imagen anterior deshabilita la nueva API.
- Para volver a file: parar **todos** los escritores y logins; exportar primero
  `node apps/api/dist/database/cli.js export-identities /data/identity-rollback.json`.
  Crea exclusivamente un archivo nuevo con modo 0600 y fsync, nunca sobreescribe.
  Comprobar copia/UUID; configurar ese archivo como MIMIX_IDENTITY_FILE y volver a
  `MIMIX_DATA_STORE=file` (o imagen anterior). Conservar SQL intacto para reactivación.
  Usuarios nuevos durante rollback file requieren importación otra vez antes de
  reactivar SQL; un conflicto se reconcilia operativamente, nunca cambiando UUID.

## Política de datos

Se guardan UUID, vínculo externo mínimo, reto/versión, secuencia, fechas del servidor
 y hechos acotados. No se guardan JWT, correo, respuesta libre, audio/video ni
biometría. No se registran cuerpos ni strings de conexión en errores. Backups
contienen identidades: cifrado y acceso administrativo limitado.

Append-only es integridad de operación, no una exención de solicitudes de borrado.
No hay endpoint de borrado/retención automática en esta fase. Antes de producción
con datos reales, fijar retención, alcance de eliminación/anónimo y caducidad de
backups. Un procedimiento administrativo auditado deberá cubrir FK, eventos,
proyección y copias sin permitir a clientes reescribir su historial.

## Verificación reproducible

```bash
pnpm install --frozen-lockfile
pnpm check
# MIMIX_TEST_DATABASE_URL apunta a PostgreSQL desechable, con permiso CREATEDB.
pnpm --filter @mimix/api test:postgres
docker build --tag mimix:learning .
MIMIX_TEST_IMAGE=mimix:learning node --test test/smoke/container.test.js test/smoke/postgres-container.test.js
```

La suite SQL crea bases aleatorias y elimina solo esas bases al finalizar. No usar
credenciales de producción. CI ejecuta estos mismos gates con PostgreSQL 17.
