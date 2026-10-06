# Operación de la cola offline

## Activación gradual

1. Conservar backup completo PostgreSQL y del volumen edge. Aplicar migración
   aditiva `0008_offline-sync.sql` con `pnpm --filter @mimix/api db:migrate`.
2. Cloud: `MIMIX_AUTH_MODE=clerk`, `MIMIX_DATA_STORE=postgres`, configuración Clerk
   existente y `MIMIX_SYNC_ENABLED=true`. No habilitar el flag local en cloud.
3. Edge: Node 22.23.2; `MIMIX_AUTH_MODE=legacy`, `MIMIX_DATA_STORE=file`,
   `MIMIX_OFFLINE_ENABLED=true`, `MIMIX_OFFLINE_DB_PATH` absoluto en disco durable,
   `MIMIX_SYNC_CLOUD_ORIGIN=https://<cloud-origin>` sin path ni barra final.
   Solo desarrollo permite HTTP loopback con `MIMIX_SYNC_ALLOW_LOOPBACK=true`.
4. Compose usa el override explícito y el mismo nombre de proyecto en cada arranque:

   ```bash
   docker compose -p mimix-edge -f infra/docker/compose.yaml \
     -f infra/docker/offline.compose.yaml --profile edge \
     up -d --wait --pull never
   ```

   Precargar la imagen de la arquitectura correcta. El volumen `offline-progress`
   se inicializa con dueño node y persiste al recrear el contenedor. **Nunca usar
   `down -v` en producción.** El override no cambia la UI ni crea hechos por sí solo.
   La aplicación host debe adoptar el adaptador y sus checkpoints durables.

El script `edge-release.sh` de prompt 18 gestiona el perfil base sin este override.
No usarlo sobre un despliegue con la cola activada: realizar actualizaciones con
los mismos dos archivos Compose y una imagen precargada; conservar el volumen.
No se modifica el launcher físico ni la política de releases en esta fase.

## Verificación y backup SQLite

Desde el contenedor en ejecución (backup usa la API SQLite e incluye WAL):

```bash
docker compose -p mimix-edge -f infra/docker/compose.yaml \
  -f infra/docker/offline.compose.yaml --profile edge exec edge-gateway \
  node apps/api/dist/modules/sync/cli.js check /data/offline/progress.sqlite

docker compose -p mimix-edge -f infra/docker/compose.yaml \
  -f infra/docker/offline.compose.yaml --profile edge exec edge-gateway \
  node apps/api/dist/modules/sync/cli.js backup \
  /data/offline/progress.sqlite /data/offline/backup-001.sqlite
```

`check` verifica integridad SQLite, versión, referencias y hashes de eventos.
`backup` no sobreescribe destinos; hace snapshot consistente, verifica, fsync y
publica atómicamente. Copiar el backup a almacenamiento protegido fuera del equipo
según la política operativa. Contiene capacidades de claim e información de progreso.
No copiar solo el `.sqlite` activo omitiendo WAL; no enviar el archivo a logs/tickets.

## Corrupción y recuperación

1. Detener el gateway. Conservar `.sqlite`, `-wal` y `-shm` originales juntos para
   diagnóstico, con acceso restringido. No borrar ni intentar inicializar encima.
2. En un entorno con la misma versión de runtime y el volumen montado, ejecutar:

   ```bash
   node apps/api/dist/modules/sync/cli.js restore \
     /data/offline/backup-001.sqlite /data/offline/recovered.sqlite
   node apps/api/dist/modules/sync/cli.js check /data/offline/recovered.sqlite
   ```

3. Configurar `MIMIX_OFFLINE_DB_PATH=/data/offline/recovered.sqlite` (con un override
   adicional al ejemplo), arrancar y revisar status con la capacidad del host.
   El destino debe ser nuevo: restore rechaza cualquier archivo existente.
4. Login con la cuenta vinculada y reenviar pendientes. Un backup antiguo puede
   traer eventos ya confirmados; sus IDs originales impiden sumar progreso otra vez.
   Los hechos posteriores al backup que no llegaron a cloud pueden perderse; no se
   promete recuperación automática de una base corrupta o de checkpoints perdidos.

Si se alcanza capacidad, primero sincronizar y verificar que no quedan pendientes,
hacer backup/archivo protegido, retirar la base anterior conservándola y crear un
nuevo archivo y nuevas sesiones. No reiniciar contadores dentro de una base activa.
Los handles de la base archivada no son válidos en una nueva cola.

## Cloud y rollback

Usar backup PostgreSQL completo (`pg_dump`/restauración del clúster según el runbook
existente), incluyendo `sync_sessions`, `sync_attempts`, usuarios, identidades,
attempts, learning_events y proyecciones. El export JSON de identidades **no es** un
backup de learning/sync. Los triggers impiden UPDATE/DELETE/TRUNCATE de bindings y
mappings: no eliminarlos para resolver un conflicto.

Desactivar `MIMIX_SYNC_ENABLED` o `MIMIX_OFFLINE_ENABLED` oculta las rutas con 404;
no borra datos. Conservar el volumen al volver a una imagen anterior. No deshacer
la migración aditiva ni restaurar una copia cloud que omita mappings mientras
existan colas/backup capaces de reenviar eventos. Restaurar el conjunto coherente.
El healthcheck general no certifica SQLite: comprobar `/api/offline/status` y el
estado visible del host; un 503 local exige intervención aunque `/api/health` sea 200.

## Evidencia y límites

Las pruebas automatizadas cubren SQLite real, PostgreSQL real, HTTP Nest/Express,
replay concurrente, ACK perdido, cambio/revocación de cuenta, reloj incorrecto,
redirect rechazado, corrupción conservada y backup WAL. La prueba Docker crea una
cola sin interfaz de red, recrea el contenedor y verifica IDs/eventos en el volumen.
CI ejecuta ese caso en amd64 y ARM64 nativo. Esto no certifica Jetson físico,
energía cortada durante un fsync, ni una UI de progreso offline de los desafíos
exploratorios actuales.
