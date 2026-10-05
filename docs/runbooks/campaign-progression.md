# Campañas — operación y verificación

## Migración y activación

Requiere la base de aprendizaje PostgreSQL y Clerk del
[runbook learning](learning-event-store.md). La migración `0003_campaign-progression`
es aditiva: crea catálogo, asociaciones, índices y triggers; no cambia eventos,
usuarios ni intentos anteriores. Aplicarla antes de iniciar el nuevo binario,
incluso si se usa solo learning: sus reintentos consultan la nueva asociación.

```bash
pnpm install --frozen-lockfile
pnpm build
# DATABASE_URL viene del gestor de secretos; no imprimirla.
node apps/api/dist/database/cli.js migrate
# Opcional, solo para entorno de demostración/pruebas:
node apps/api/dist/database/cli.js seed-campaigns
```

La CLI de seed publica `official-intro@1.0.0`, shapes → elements. Es idempotente y
no crea usuario, intento ni progreso. Un contenido distinto bajo esa versión falla.
El operador puede publicar otras definiciones validadas mediante `CampaignStore.publish`
en una herramienta administrativa controlada; no hay endpoint público ni selección
implícita de versión. Conservar versiones anteriores y verificar artefactos/manifests
antes de publicar. La semilla no transforma vistas exploratorias en ejercicios con
criterios de finalización: esas vistas todavía no emiten `attempt_completed`.

Rol HTTP, además de permisos learning existentes:

```sql
GRANT SELECT ON campaign_versions TO mimix_api;
GRANT SELECT, INSERT ON campaign_attempts TO mimix_api;
```

Publicar requiere rol operador con INSERT/SELECT en campaign_versions; HTTP no lo
necesita. No conceder UPDATE/DELETE/TRUNCATE/DDL ni superuser al proceso. Los triggers
no protegen frente al dueño de esquema que puede deshabilitarlos. Las asociaciones
son parte del historial y deben incluirse en políticas administrativas de retención.

Las rutas se habilitan con `MIMIX_DATA_STORE=postgres`; el flag existente exige Clerk.
Sin PostgreSQL quedan 404 y no aparecen en OpenAPI. No hay fallback silencioso en
memoria. Límites de pool/lock y cuotas locales siguen siendo los de learning.

## Comprobación y recuperación

1. Consultar catálogo y definición con sesión válida, 401 sin sesión.
2. Consultar progreso vacío; intentar elements debe dar 409.
3. Crear shapes con UUID de idempotencia; repetir devuelve el mismo intento/200.
4. Registrar finalización por learning; elements queda disponible. Otro usuario sigue
   sin crédito. En la semilla este paso se verifica mediante API, no por la UI.
5. Abandono permite nuevo intento; otro intento activo produce 409. Finalización
   previa persiste durante reintentos. Una nueva versión empieza sin crédito.
6. `node apps/api/dist/database/cli.js rebuild` reconstruye solo attempt_progress;
   no hay cache de campaña que reconstruir. Progreso antes/después debe coincidir.

El backup completo `pg_dump`/`pg_restore` de learning incluye catálogo, asociaciones,
eventos y triggers. Restaurar en DB nueva y aislada, comparar UUID y progreso de una
versión conocida. El smoke contenedor verifica este recorrido y ambos runtimes HTTP.
Nunca restaurar encima de producción activa ni borrar asociaciones para reiniciar.

## Rollback

`MIMIX_API_RUNTIME=express` conserva la API de campañas. Volver a la imagen previa
al prompt10 deshabilita las rutas de campaña y conserva tablas/historial; detener
primero escritores de campaña. No ejecutar down destructivo ni quitar la migración
del journal. Restaurar nueva imagen reactiva el progreso original. La imagen previa
no conoce la semántica de claves entre contextos: durante rollback no reenviar
creaciones de campaña a la ruta independiente de learning.

Volver a `MIMIX_DATA_STORE=file` oculta aprendizaje/campañas y exige el procedimiento
de conservación de identidad del runbook learning. Mantener PostgreSQL intacto.

## Evidencia reproducible

```bash
pnpm install --frozen-lockfile
pnpm check
# PostgreSQL desechable con CREATEDB; nunca producción.
pnpm --filter @mimix/api test:postgres
docker build -t mimix:campaign .
MIMIX_TEST_IMAGE=mimix:campaign node --test test/smoke/container.test.js test/smoke/postgres-container.test.js
```

TDD cubre DAG/ciclos, AND, reintentos y finalización, idempotencia/concurrencia,
contextos independientes, dos usuarios, versiones antiguas/nuevas, inmutabilidad,
rebuild, cursor y seed CLI. HTTP prueba Nest/Express, autenticación, campos extra,
cuotas por plantilla, DB indisponible y feature deshabilitada. El smoke usa backup
real. El PR enlaza el resultado de CI del commit final y la revisión independiente.

Alcance excluido: UI, mapa, ranking, economía y prompt11. No certifica evaluación
pedagógica, hardware ni disponibilidad de recursos remotos de los retos.

### Resultado local de esta entrega (2026-10-05)

- Instalación congelada y `pnpm check`: 23/23 tareas, 84/84 pruebas.
- PostgreSQL completo: 20/20; incluye los dos runtimes y rol SQL restringido.
- Imagen `mimix:campaign` compilada y smoke contenedor: 5/5; la campaña restaurada
  conserva exactamente su proyección y el desbloqueo del segundo nodo.
- Revisión independiente de la rama y corrección de segmentos URL: 15/15 pruebas
  focalizadas, sin hallazgos pendientes. IDs `.`/`..` fallaron primero y ahora se
  rechazan, evitando definiciones sin una ruta utilizable en navegador.
- El primer smoke ampliado detectó un error en la URL de la DB restaurada del test:
  una sustitución de texto cambiaba el usuario. Se corrigió asignando URL.pathname;
  el smoke completo posterior pasó conservando sus aserciones de restore.

El resultado de CI está ligado al SHA final en el PR. No se verificó hardware ni
se introdujeron cambios a vistas/sensores; la matriz existente se mantiene en CI.
