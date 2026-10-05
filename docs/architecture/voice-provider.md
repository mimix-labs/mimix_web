# VoiceProvider v1 — prompt 12

`@mimix/voice-contract` contiene schemas Zod, `VoiceProvider`, `VoiceAudio` y
`VoiceError`. No depende de ElevenLabs, personajes, Agent Core ni NestJS.
El adaptador y la coordinación viven solo en `apps/api/src/modules/voice`.
El fake produce un marcador MP3 determinista para tests; no habla ni se activa por env.

## Flujo

1. Host cliente solicita `POST /api/voice/utterances` con Bearer Clerk y JSON
   `{schemaVersion:1,id:<UUID>,text:<texto>}`. No admite usuario, URL, voice ID,
   modelo, clave, personaje ni campos extra. Cuerpo máximo 16 KiB; texto 1000
   unidades UTF-16, no vacío. Una nueva solicitud admitida reemplaza la activa
   del mismo usuario interno; no hay conversación ni lease de embodiment aquí.
2. La política comprueba sesión activa/UUID, CORS y límite HTTP general. VoiceService
   reserva cuota de solicitudes/caracteres antes del primer await; no reembolsa
   errores o cancelaciones porque podrían haberse facturado externamente.
3. ElevenLabs recibe únicamente texto, modelo fijo `eleven_flash_v2_5`, voz elegida
   por configuración servidor y clave en header. No recibe identidad ni historial
   Mimix. El texto libre puede contener datos personales: no se anonimiza mágicamente.
4. Se lee el stream upstream en memoria, con AbortSignal y máximo 1 MiB real,
   incluso sin Content-Length. Se exige audio/mpeg, cuerpo no vacío, frames MPEG-1 Layer III completos a 44,1 kHz y tamaño ID3 válido,
   y longitud coherente si está declarada. Se rechazan redirects; host HTTPS fijo
   `api.elevenlabs.io`, ID alfanumérico sin segmentos ni URLs. No hay reintentos.
5. Respuesta JSON `no-store`: `ready` con audio `{contentType:'audio/mpeg',base64}`,
   o `text_only` con motivo. Ambos conservan `id`, `schemaVersion` y `subtitle`
   idéntico al texto aceptado. El subtítulo no tiene tiempos por palabra.

El audio se entrega completo después de validarlo; no hay streaming hacia el
cliente, URLs de descarga, almacenamiento ni reproducción automática. El cliente
futuro debe renderizar subtítulos como texto, decodificar base64 como audio/mpeg,
detener la reproducción anterior y descartar respuestas de IDs ya sustituidos.
Este PR no cambia la UI. No hay micrófono, STT ni conversación offline.

## Estados y cancelación

| Resultado | Motivo | Acción del host |
| --- | --- | --- |
| ready | Audio validado | Reproducir solo si sigue siendo el ID actual |
| text_only | DISABLED | Mostrar subtítulo |
| text_only | QUOTA_EXCEEDED / BUSY | Mostrar texto; no reintentar automáticamente |
| text_only | RATE_LIMITED / PROVIDER_UNAVAILABLE | Mostrar texto, revisar proveedor sin exponer su error |
| text_only | INVALID_AUDIO | Descartar audio completo; mostrar texto |
| text_only | TIMEOUT | Abortar generación; mostrar texto |
| text_only | CANCELLED / INTERRUPTED | No reproducir; conservar texto si corresponde |

`DELETE /api/voice/utterances/:id` cancela exclusivamente la emisión activa de ese
usuario y devuelve `{cancelled:boolean}`. Un UUID ajeno/inactivo devuelve false.
No permite enumerar usuarios. Desconexión HTTP y cierre del servidor abortan el
trabajo. La cancelación de un proveedor que ignora el signal limita la espera;
la liberación de recursos depende de su cooperación. El adaptador real usa fetch
y cancela el lector. Una finalización tardía no entrega audio ni elimina la emisión
más reciente. El audio ya entregado debe detenerlo el consumidor, no este servidor.

Entradas inválidas devuelven 400, MIME HTTP incompatible 415 y cuerpo >16 KiB 413.
Sesión inválida/revocada devuelve 401; identidad no disponible 503; cuota HTTP 429.
No son resultados de síntesis porque ocurren antes de admitir la solicitud.
En auth legacy las rutas no se exponen (404). Con Clerk y proveedor desactivado,
las solicitudes válidas obtienen text_only DISABLED sin acceso a red.

IDs son correlación, no idempotencia durable: repetir un ID ya completado puede
consumir cuota/costo. Duplicar un ID activo devuelve BUSY sin cancelar. Solicitudes
inválidas o rechazadas por cuota no interrumpen trabajo aceptado.

## Recursos, cuotas y alcance

Defaults por instancia: 15 s por generación (headers + body), 4 activas, 6
solicitudes y 3000 caracteres por usuario/minuto, 50000 caracteres por ventana de
24 h. Hasta 1000 buckets de usuario vigentes; saturación deniega nuevas reservas.
Los buckets guardan UUID y contadores durante como máximo un minuto de vigencia;
se limpian al siguiente uso o cierre, no contienen texto ni audio. El contador
global no contiene identidad. No hay almacenamiento persistente.

No es un límite de facturación distribuido: reinicios reinician presupuesto y cada
réplica tiene el suyo. Antes de escalar, usar límites compartidos y coordinación
entre instancias; cancelación/interrupción actuales requieren la misma instancia.
Usar además una API key dedicada y su límite de créditos. No se hacen llamadas
reales a ElevenLabs en tests ni se prometen reintegros al cancelar.

## Fronteras y retención

VoiceProvider no selecciona personajes ni conoce Wall-E. La voz del deployment es
configuración operativa del adaptador, independiente del perfil visual. El prompt
13 coordinará embodiments más adelante; no iniciar desde este PR.

Mimix no escribe texto/audio en disco, PostgreSQL, caché o logs. Solo mantiene
payloads mientras vive la petición. Los logs HTTP existentes omiten cuerpos,
headers y query; errores upstream no se registran ni devuelven. Revisar asimismo
observabilidad/proxies externos antes de activar, pues están fuera de este código.

Retención ElevenLabs se elige explícitamente al habilitar: `standard` envía
`enable_logging=true`; `zero` envía false y requiere habilitación Enterprise.
No se degrada automáticamente de zero a standard. Si el proveedor rechaza acceso,
se devuelve text_only. El modo por defecto del proveedor retiene datos conforme a
su política; no se afirma un número de días ni retención cero en planes no aptos.

Fuentes oficiales consultadas el 2026-10-05: [API de streaming](https://elevenlabs.io/docs/api-reference/text-to-speech/stream),
[Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode).
[Operación, costos y rollback](../runbooks/voice-provider.md).
