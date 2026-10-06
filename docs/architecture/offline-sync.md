# Progreso offline y sincronización (fase 5, prompt 19)

## Alcance y autoridad

Offline significa que el navegador conserva acceso al gateway edge y a su disco,
aunque la WAN esté cortada. No es un service worker ni una cola de eventos dentro
del iframe. SQLite guarda hechos reportados por el host; PostgreSQL sigue siendo
la autoridad del progreso cloud. Estos hechos no otorgan logros ni desbloquean
campañas. Matemáticas y ciencias actuales siguen siendo exploratorias: no se
inventan respuestas ni eventos de finalización para ellas.

El gateway y el host son componentes confiables. La capacidad local no demuestra
la identidad de quien jugó antes del login: su poseedor elige explícitamente la
primera cuenta Clerk a la cual atribuir la sesión anónima. El servidor no acepta
un userId elegido por el cliente. Después de vincular, la atribución es permanente.
No se permite seguir grabando en esa sesión: jugar de nuevo exige otra sesión local.

## Protocolo e invariantes

1. `POST /api/offline/sessions {}` entrega `sessionId` UUID y `token` aleatorio de
   256 bits. Solo el host lo conserva. SQLite guarda su hash y una clave de claim
   independiente; esta última nunca se entrega al navegador.
2. `POST /api/offline/attempts` recibe UUIDs estables `attemptId`, `startedEventId`,
   `challengeId` y `challengeVersion`. Inserta `attempt_started` en secuencia 1.
   Devuelve `lastSequence`, incluida la reanudación exacta de un intento.
3. `POST /api/offline/events` recibe `{attemptId,event}` con UUID, secuencia y un
   `LearningRecord`. Secuencias contiguas; IDs no dependen del reloj. Un replay
   idéntico es exitoso; un contenido distinto, hueco o escritura tras terminar
   responde 409. Los replays exactos siguen permitidos después del cierre.
4. Después de login explícito, `POST /api/offline/bind {}` o `/sync {}` envía
   `Authorization: Local <token>` y `X-Mimix-Sync-Token: <Clerk token vigente>`.
   El gateway sella primero la sesión en disco. El token solo vive en la petición
   y se reenvía como Bearer al origen HTTPS configurado; nunca se persiste.
   Los redirects están prohibidos. Nest y Express usan el mismo servicio/política.
5. Cloud `/api/sync/bind` verifica JWT y sesión Clerk activa, resuelve el usuario
   interno existente, y fija de forma inmutable sesión + hash de claim + usuario.
   Otro usuario o claim recibe 409, incluso si ya no hay pendientes.
6. `/api/offline/sync` manda como máximo 50 eventos de un intento por llamada a
   `/api/sync/batch`. Cloud bloquea la sesión y usa una única transacción para
   mapping, eventos y proyección. Comparte el bloqueo de escritores del rebuild
   de learning; conserva el startedEventId original. No adopta intentos online.
7. Solo un recibo válido de la nube, con propietario y lista exacta de IDs y
   secuencias, confirma los eventos locales. Se comprueban digest, ID y secuencia
   del contenido persistido **antes** de enviarlo. Un ACK perdido se reenvía con
   los mismos IDs y produce una sola proyección. Reintentos concurrentes se serializan.

Todas las rutas llevan `Cache-Control: no-store`. Las rutas locales son públicas
para el guard Clerk pero exigen la capacidad en el servicio, salvo la creación de
sesión. CORS restringe orígenes del navegador y hay cuotas HTTP; no sustituye una
red confiable. El despliegue predeterminado escucha loopback. Para exponerlo en LAN,
usar TLS y limitar acceso al gateway. No poner capacidades/tokens en URLs, logs,
telemetría ni mensajes al challenge.

## Persistencia, conflictos y límites

- SQLite: WAL, synchronous FULL, foreign keys, transacciones IMMEDIATE; archivo
  0600 y directorio de volumen 0700. Una base por gateway; Node 22.23.2 o posterior
  compatible con `node:sqlite` (API experimental en Node 22; imagen fijada).
- 1.000 sesiones y 10.000 eventos incluyendo tombstones. No se expulsa historia
  pendiente para crear espacio; 507 exige intervención del operador.
- Payloads confirmados se pueden purgar tras 30 días medidos por una respuesta
  posterior del reloj cloud. Saltos del reloj local no afectan orden ni retención.
  IDs, hashes, claims y mappings permanecen para reconocer replays y conflictos.
  Un equipo sin nuevo contacto cloud conserva los payloads más tiempo.
- No hay merge de respuestas contradictorias ni last-write-wins. El operador
  conserva el archivo y analiza un 409; nunca cambia dueño, IDs o secuencias para
  forzar el reintento. La cola no edita eventos ya confirmados.
- Corrupción o error de disco: se conserva la base original, se responde 503
  `storage_unavailable`; no se crea silenciosamente una cola vacía. Salud general
  del gateway y recursos locales pueden seguir funcionando. Vigilar ambos estados.
- Los backups restaurados conservan los IDs y pueden reenviarse. La garantía de
  idempotencia requiere conservar también el historial y mappings de PostgreSQL.

| Estado del host | Acción |
| --- | --- |
| `pending` | Cola sin confirmar; reintentar conexión con los mismos IDs |
| `login_required` | Login/renovación Clerk online; no cambiar de cuenta para forzar sync |
| `synchronized` | Todos los hechos entregados a SQLite por esa sesión están confirmados |
| `conflict` | Detener; inspección de propietario/contenido/orden |
| `storage_full` | Detener grabación; backup y archivo operativo |
| `storage_unavailable` | Detener grabación/sync; revisar disco y recuperar backup |

Clerk login, ElevenLabs/voz cloud, LLM cloud y desbloqueos cloud están explícitamente
no disponibles sin Internet. No se afirma que el browser siga grabando si también
pierde el gateway. Un fallo al grabar debe mostrarse como no confirmado al usuario.

## Adaptador del host

`@mimix/challenge-runtime` exporta `createOfflineSession`, `openOfflineProgress` y
`synchronizeOfflineSession`. La aplicación confiable persiste la capacidad y los
IDs del intento; `savePending(event|null)` debe hacer un checkpoint durable antes
de enviar y antes de olvidar un ACK. Usar un solo escritor por intento; el
adaptador rechaza operaciones de grabación concurrentes y bloquea hechos nuevos
si hay uno incierto. `retry()` usa el mismo ID. No implementar savePending como
no-op en producción; si el checkpoint falla, no se envía el hecho.

Al recargar, restaurar **todos** los handles de intentos con sus checkpoints antes
de sincronizar. Dentro del host, se coordinan por origen + capacidad, incluso si
el objeto de sesión fue reconstruido. Sync bloquea grabaciones nuevas, espera las
que están en vuelo y reintenta pendientes antes de sellar. Una vez que el gateway
pudo recibir el sello, ese handle no se vuelve a abrir para nuevas grabaciones.
Usar el mismo origen canónico, sin barra final, para todos los handles.

Conectar `host.record` a `adapters['progress.record']` únicamente en desafíos que
produzcan hechos reales. El challenge solo suministra `LearningRecord`; IDs,
usuario y token pertenecen al host. La aplicación conserva ownership de los
checkpoints y muestra estados: no se añade una pantalla ni se modifica el launcher.

Al recuperar conexión, invocar sync explícitamente con `getClerkToken` y AbortSignal.
Obtiene token fresco por petición, drena lotes y reintenta 429/503 de transporte con
backoff de 1 a 30 segundos, hasta 8 reintentos por lote. El fallo queda visible para
reintento posterior; 401/409/507/almacenamiento no se reintentan automáticamente.
No se guardan tokens Clerk ni se usa el reloj de pared para el backoff.
