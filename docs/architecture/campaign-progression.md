# Campañas y progresión v1

Una campaña es un DAG versionado de retos, publicado como definición inmutable.
Una secuencia se representa con una dependencia por nodo. No hay mapa ni UI nueva.
El dominio vive en `apps/api/src/modules/campaigns`; los contratos públicos en
`@mimix/contracts`. No depende de personaje, robot, sensores ni runtime de vistas.

## Definición

```json
{
  "schemaVersion": 1,
  "id": "official-intro",
  "version": "1.0.0",
  "title": "Exploración inicial (semilla técnica)",
  "nodes": [
    {"id":"shapes","challengeId":"mathematics","challengeVersion":"1.0.0","prerequisites":[]},
    {"id":"elements","challengeId":"science","challengeVersion":"1.0.0","prerequisites":["shapes"]}
  ]
}
```

El esquema rechaza campos desconocidos, nodos vacíos/duplicados, prerequisitos
repetidos/inexistentes y ciclos. Máximo 100 nodos. IDs de campaña/nodo: 1–80 caracteres
`[A-Za-z0-9._-]`, sensibles a mayúsculas, excepto `.` y `..` (segmentos
normalizados por el navegador). Referencias de reto usan el esquema del
manifest y versiones SemVer exactas sin build metadata. No rangos ni `latest`.
El catálogo no descarga paquetes ni prueba su disponibilidad: quien publica debe
verificar sus manifests/artefactos. La semilla fija las dos versiones oficiales.

Todos los nodos son requeridos y todos los prerequisitos se combinan con AND.
No hay ramas opcionales, límites de intentos, vencimiento automático ni puntuaciones.
Estas extensiones requerirían reglas y contratos explícitos en otra versión.

## Reglas derivadas

`campaign_versions` conserva definición y metadatos de catálogo. `campaign_attempts`
asocia un intento con campaña/versión/nodo. Ninguna tabla guarda desbloqueos ni
estado de campaña. Triggers impiden UPDATE, DELETE y TRUNCATE; una FK compuesta
exige versión existente y un trigger comprueba nodo/reto/versión del intento.

Una consulta SQL agrupa learning_events de los intentos vinculados, filtrados por
usuario y versión exactos; produce contadores y el UUID activo por nodo. La regla
pura `projectCampaign` calcula:

- `locked`: falta completar algún prerequisito; `blockedBy` enumera sus IDs.
- `available`: puede iniciar un intento.
- `in_progress`: tiene intento activo y aún no ha completado este nodo.
- `completed`: existe al menos un `attempt_completed` de ese nodo/contexto.

`canStart` exige prerequisitos completos y ausencia de intento activo, incluso si
el nodo ya está completado. `attempts` cuenta intentos; `completedAttempts` cuenta
finalizaciones; `activeAttemptId` permite retomar la ejecución. Abandonar permite
reintentar. Un éxito previo conserva crédito durante intentos posteriores, incluso
abandonados. `answer_submitted.correct=true` nunca completa por sí solo.

La campaña pasa de `not_started` a `in_progress` al iniciar el primer nodo, y a
`completed` cuando todos tienen un éxito. No se inserta otro evento de finalización
de campaña: sería un hecho redundante con estas reglas. La consulta ignora
`attempt_progress`; borrarlo/reconstruirlo no cambia el resultado de campaña.

Las finalizaciones siguen siendo declaraciones del cliente autenticado, como en
learning v1; desbloquean navegación pedagógica, no certifican dominio ni otorgan
recompensas. Los retos oficiales actuales son exploratorios y no emiten finalización:
la semilla es una prueba técnica de API, no una campaña jugable final. No se inventan
hechos a partir de visitas, gestos, selección de figuras o eventos legacy.

## Consistencia

El inicio toma un advisory lock transaccional por UUID interno de usuario, comprueba
prerequisitos y crea intento, evento inicial, proyección learning y asociación en
una sola transacción. El lock funciona entre procesos; colisiones del hash solo
serializan usuarios adicionales. El bloqueo global de learning sigue coordinando
rebuild. Append conserva su lock por intento y secuencias contiguas.

La comprobación ve eventos confirmados. Si una finalización concurrente aún no se
confirmó, el inicio puede responder 409 conservador: consultar y reintentar. Dos
inicios con distinta clave para un nodo activo tienen un único ganador. La misma
clave/contexto devuelve el mismo intento, también después del cierre. Claves se
reservan por usuario entre todas las creaciones: cambiar campaña, versión, nodo o
pasar a/desde intento independiente devuelve 409. Usuarios distintos sí pueden
usar la misma clave. Un intento independiente jamás se adopta retroactivamente.

La lectura agrega en una sentencia con snapshot consistente. La salida está
acotada por 100 nodos; no se carga todo el historial en memoria de Node. El trabajo
SQL sí crece con intentos/eventos de ese usuario/versión; medir antes de introducir
materialización. Índices sobre dueño/intento, asociación y secuencia ayudan al join.

## Versiones y retrocompatibilidad

| Cambio | Comportamiento |
| --- | --- |
| Repetir publicación idéntica | Idempotente; misma definición |
| Cambiar título/reglas/nodos bajo misma versión | 409; definición original intacta |
| Añadir/quitar nodo o cambiar prerequisitos | Publicar nueva versión; progreso separado |
| Cambiar versión de un reto | Nueva versión de campaña; intentos previos conservan referencia |
| Iniciar/terminar v1 tras publicar v2 | Funciona con reglas de v1 |
| Mismo reto en dos nodos/campañas | Crédito por asociación; no se comparte |
| Consultar v2 con éxito en v1 | Sin crédito automático en v2 |
| Historial learning anterior o fuera de campaña | Se conserva; no desbloquea campaña |

No hay migración automática de crédito ni borrado de versiones viejas. Una futura
política de equivalencias requerirá hechos y reglas versionados; nunca editar
learning_events. Los contratos SDK/eventos learning schemaVersion 1 no cambian.

## API

Todos los endpoints exigen Clerk activo y `MIMIX_DATA_STORE=postgres`; usuario se
deriva de la sesión. No aceptan selector de usuario. Respuestas `Cache-Control:
no-store`, cuota por sujeto verificado y plantilla de ruta. Nest y Express ofrecen
los mismos contratos. OpenAPI publica esquemas de solicitudes y respuestas.

| Método y ruta | Resultado |
| --- | --- |
| GET `/api/campaigns` | `{items:[{id,version,title}],nextCursor}` |
| GET `/api/campaigns/{id}/versions/{version}` | Definición exacta |
| GET `/api/campaigns/{id}/versions/{version}/progress` | Estado y nodos derivados propios |
| POST `/api/campaigns/{id}/versions/{version}/nodes/{nodeId}/attempts` | `{attempt,duplicate}`; body `{idempotencyKey:UUID}` |

Catálogo: páginas de 50, cursor `{afterId,afterVersion}` que se reenvía como ambos
query params. Orden lexicográfico de DB por id/versión, no precedencia SemVer. No es
snapshot entre páginas; publicaciones concurrentes pueden requerir nuevo recorrido.
Otras rutas rechazan query params. Nueva creación 201; repetición exacta 200.
400 contrato inválido, 401 sesión, 404 versión/nodo ausente o feature apagada,
409 prerequisitos/activo/clave conflictiva, 429 cuota, 503 almacenamiento/identidad.
No existe PATCH/PUT progreso ni publicación por HTTP.

Para registrar aprendizaje usar el endpoint existente
`POST /api/learning/attempts/{id}/events`, eventId UUID, sequence 2 en adelante,
`type` y `payload` estrictos. Consultar el intento si se necesita la última secuencia.
Cambiar propietario produce el mismo 404 que intento inexistente. Recuperar fallos
con la misma clave/eventId, sin fabricar eventos ni incrementar secuencias a ciegas.

Operación, rollback y evidencia: [runbook](../runbooks/campaign-progression.md).
