# Pairing y DeviceSession — fase 4

Implementación opt-in en `apps/api/src/modules/devices`, contratos v1 en
`@mimix/robot-protocol`, persistencia PostgreSQL. Nest/Fastify y el rollback Express
usan el mismo servicio. `MIMIX_DEVICE_SESSIONS_ENABLED=false` mantiene estas rutas
cerradas; activarlo requiere Clerk y PostgreSQL.

## Ceremonia y frontera de confianza

1. El robot genera localmente un verifier aleatorio de 32 bytes, codificado
   base64url sin padding. Conserva ese secreto y muestra `SHA256(verifier)` en hex.
2. El usuario obtiene ese challenge directamente del robot por un canal local
   confiable y aprueba capabilities mediante su sesión autenticada.
3. El servidor devuelve ID y código de pairing aleatorio de 16 bytes (base64url).
   El usuario entrega ambos al robot. El código no contiene credenciales Clerk.
4. El robot presenta código, verifier y capabilities anunciadas por el protocolo
   v1. El servidor valida la prueba, la sesión de usuario original y la intersección
   aprobada. Consume el código una sola vez y genera IDs de dispositivo y sesión.
5. Solo esa respuesta contiene el token opaco del dispositivo (32 bytes aleatorios).
   Se usa como `Authorization: Device <token>` sobre HTTPS. Un primer heartbeat
   confirma presencia antes de autorizar una capability.

El challenge no demuestra identidad de hardware. Su canal confiable es un requisito:
aceptar un challenge enviado por un tercero permitiría emparejar el robot de ese
tercero. El verifier debe generarse con CSPRNG y nunca acompañar al challenge.
Las capabilities anunciadas son declaración del dispositivo, no attestation.
El backend genera `deviceId`; la etiqueta anunciada por el robot no elige propietario.
Cada nuevo pairing crea una identidad de conexión nueva, no un registro de hardware.

El servidor guarda hashes SHA256 del código y token, y metadata verificada del
proveedor/issuer/subject/sessionId para comprobar la sesión Clerk original. No guarda
JWT de usuario. Ni esa metadata ni UUID de usuario se devuelven al robot. Los secretos
no aparecen en auditoría ni logs HTTP. La base de datos sigue siendo información
privada del servidor y requiere controles de acceso y backup.

## Autoridad, TTL y estados

| Elemento | Límite / comportamiento |
|---|---|
| Pairing | 5 minutos; un canje; 5 pruebas incorrectas bloquean el código |
| DeviceSession | 15 minutos absolutos; heartbeat no renueva ese vencimiento |
| Presencia | 30 segundos, acotados por vencimiento de sesión; heartbeat recomendado cada 10 s |
| Secuencia | empieza en 1; debe ser exactamente la siguiente; replay/salto devuelve 409 |
| Login original | se verifica en cada canje, operación del dispositivo y autorización; timeout de 3 s |
| Límites PostgreSQL | 10 pairings pendientes vigentes y 5 sesiones activas vigentes por usuario |
| Cuotas HTTP | pairing: min(10, cuota de usuario)/min; intercambio: cuota anónima por IP |
| Dispositivo válido | cuota machine/min conjunta por UUID verificado de sesión, separada de clientes inválidos |

Estados terminales: `revoked`, `expired`, `disconnected`. No se reactivan. El
verificador de identidad caído produce 503 y no refresca presencia. Una revocación
Clerk detectada termina la autoridad. Revocar desde otro login válido del mismo
propietario está permitido para recuperación; autorizar desde ese otro login no.

`POST /api/devices/sessions/:id/authorize` comprueba usuario interno, sesión de
login original, capability concedida, DeviceSession vigente y presencia. Su respuesta
es una observación, **no un permiso reutilizable**: el adaptador que ejecute una
operación futura debe volver a autorizar en el punto de ejecución. Esta fase no
adquiere leases de embodiment ni despacha intenciones o motores. Los tokens nuevos
no habilitan las rutas robot/bridge heredadas.

Capabilities: `presence:heartbeat` (obligatoria), `context:read`, `vision:publish`,
`speech:play`, `camera:mjpeg`, `camera:webrtc`, `behavior:greet`,
`behavior:celebrate`, `behavior:attend`, `behavior:stop`. Solo se conceden las
aprobadas y soportadas por el anuncio v1. Los contratos estrictos rechazan campos
extra, duplicados, timestamps del cliente y versiones desconocidas.

## Concurrencia y auditoría

PostgreSQL es la autoridad entre réplicas. Toda transición toma primero un advisory
lock por propietario y después los locks de filas. Así, revocación y heartbeat se
ordenan, el código no puede canjearse dos veces y el orden de IDs de auditoría por
propietario coincide con el orden de commit. La paginación no salta inserciones que
otra petición haya iniciado y aún no confirmado. No escribir directamente en estas
tablas desde otros servicios: deben respetar el mismo protocolo transaccional.

Se usa `clock_timestamp()` tras obtener locks y tras consultar identidad. Un barrido
cada segundo procesa lotes acotados de vencimientos; las operaciones también validan
caducidad de forma síncrona. Un proceso caído no prolonga autoridad. La transición
persistida puede retrasarse si PostgreSQL no está disponible; al recuperarse el
barrido registra el vencimiento sin resucitar la sesión.

`device_audit` registra creación/cancelación/caducidad de pairing, prueba incorrecta,
replay de código válido consumido, canje, heartbeat, replay de secuencia, desconexión,
revocación, expiración y decisiones de autorización. Trigger append-only impide
UPDATE/DELETE/TRUNCATE. ID desconocido, token inválido y acceso ajeno no escriben
historia de otro propietario; quedan como rechazos HTTP genéricos. Consultas y
revocaciones son solo del propietario. Listado y auditoría paginan 50 filas mediante
`after` y `nextCursor`; `null` significa fin de los resultados visibles en esa lectura.
El listado de sesiones ordena UUID y no es snapshot: nuevas sesiones pueden requerir
reiniciar el recorrido. La auditoría ordena IDs crecientes; para seguir eventos
posteriores al final, conservar el último ID observado y pasarlo como `after`.

Las cuotas HTTP son locales a cada proceso; los límites de pairing/sesiones y la
revocación son compartidos en PostgreSQL. Para múltiples réplicas, aplicar además
control de volumen en el ingress. Un token de dispositivo robado permite suplantarlo
hasta revocación o TTL; no permite asumir la identidad del usuario. Los tokens no se
transportan en URL ni cookies. No hay renovación automática ni funcionamiento offline.

[Activación, recuperación, diagnóstico y rollback](../runbooks/device-sessions.md).
