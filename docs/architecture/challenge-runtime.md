# Runtime de retos v1

`@mimix/challenge-runtime` ejecuta un artefacto SDK en un iframe opaco y concede
operaciones solo a través de adaptadores elegidos por el host. Es una librería de
navegador; el harness es de desarrollo. No se integra aún en `/play` ni altera
Matemáticas o Ciencias. El [diseño previo](../superpowers/specs/2026-10-04-challenge-runtime-design.md)
registra amenaza, CSP, protocolo, navegadores y decisiones antes de editar.

## Uso

Construir dependencias antes de importar el paquete:

```bash
pnpm install --frozen-lockfile
pnpm --filter @mimix/challenge-runtime... build
pnpm --filter @mimix/challenge-runtime harness
```

Abrir `http://127.0.0.1:4178`. El harness muestra loading/ready/running/paused,
error/cancelled; permite cargar, iniciar, pausar, reanudar y cancelar el fixture
mínimo del SDK. Sus adaptadores solo registran llamadas en memoria. Nunca lo
exponer como servicio de producción ni suministrarle credenciales reales.

```ts
import { mountChallenge } from '@mimix/challenge-runtime'

const handle = mountChallenge({
  container: document.getElementById('challenge')!,
  manifest, // JSON v1 validado también por el host
  bundle,   // IIFE autocontenido, export global MimixChallenge.createChallenge
  approvedCapabilities: ['progress'],
  adapters: {
    'progress.record': async (record, { signal, requestId }) => {
      // Adaptador de confianza enlaza usuario/intento y conserva idempotencia.
      // No devolver datos de backend ni credenciales al iframe.
      await recordInOwnedAttempt(record, { signal, idempotencyKey: requestId })
    },
  },
  timeoutMs: 5000,
  signal: controller.signal,
  onTelemetry: event => reportRuntimeEvent(event),
})
await handle.ready
await handle.start()
await handle.pause()
await handle.resume()
await handle.dispose()
```

`recordInOwnedAttempt`, `reportRuntimeEvent`, `manifest`, `bundle` y `controller`
representan dependencias del integrador, no servicios incorporados al paquete.
No se agrega autenticación, intentos, HTTP, voz o hardware dentro del runtime.
Los adaptadores conservan autorización por usuario/intento/lease. La clave
`session:requestId` identifica una única operación durante una instancia; el
adaptador debe conservar el sobre UUID/secuencia en reintentos hacia learning.
El runtime no reintenta automáticamente ni promete rollback de efectos ya hechos.

## Artefacto admitido

Se recibe texto JavaScript previamente seleccionado por catálogo/host de confianza,
no una URL ni HTML arbitrario. Bundle máximo 512 KiB UTF-8, IIFE autocontenido que
expone `MimixChallenge.createChallenge(context)` y los cinco hooks del SDK.
Se rechaza `</script` incluso dentro de strings: empaquetar con esbuild, que escapa
cierres de script para HTML. El build del harness demuestra el formato con el
fixture SDK. No se interpretan automáticamente manifest.entrypoint ni imports
remotos; el host debe asociar manifest/version y artefacto correctos. El límite
no certifica seguridad ni autoría; firma/integridad de catálogo queda al integrador.

El contexto lleva API neutral, lista de grants y AbortSignal; no identidad, token,
DB ni proveedor. Cambiar localmente la lista o monkey-patchear el bootstrap no
concede autoridad: el host valida cada llamada por su propio estado y grants.

## Sandbox y CSP

`iframe sandbox="allow-scripts"` sin allow-same-origin/forms/popups/downloads/
top-navigation. Permissions Policy deniega camera, microphone, geolocation,
payment, USB y fullscreen. Referrer policy `no-referrer`.

La primera política del srcdoc es:

```text
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none';
object-src 'none'; base-uri 'none'; form-action 'none'
```

Inline se permite deliberadamente en el realm no confiable: el reto ya ejecuta
código allí. No se permite unsafe-eval, scripts remotos, importaciones externas,
workers, subframes, formularios, fetch ni WebSocket. No se usan nonces que un
script hostil pueda reutilizar para cargar un script externo. El CSP del padre
puede restringir adicionalmente srcdoc: si bloquea el bootstrap, mount termina
por timeout; nunca se relaja la política del producto automáticamente.

La separación de origen protege DOM/cookies/storage del host, no disponibilidad
absoluta ni un perímetro de red universal. Un bucle infinito puede bloquear el
hilo y retrasar deadlines; no hay límite duro de CPU/memoria. La navegación del
propio iframe puede iniciar una petición antes de que el evento load invalide
la instancia; no se afirma bloquear universalmente WebRTC ni APIs fuera de CSP.
No entregar secretos al reto. Un load posterior termina la instancia y el canal;
no se transfiere otro puerto ni se reutiliza la autoridad al navegar.

## Protocolo

Contratos Zod estrictos en `@mimix/contracts`: helloSchema, connectSchema,
commandSchema, callSchema, childMessageSchema y hostMessageSchema. Bridge v1 es
independiente de schemaVersion/apiVersion del manifest (también v1).

1. Hijo envía hello v1 con sesión aleatoria del host al origen HTTP(S) exacto del
   padre. Host exige `event.source === iframe.contentWindow`, `event.origin ===
   'null'`, esquema y sesión. Mensajes de otras ventanas se ignoran.
2. Host transfiere un MessagePort una sola vez. Solo ese postMessage usa `'*'`,
   necesario para el destinatario de origen opaco. Hijo comprueba source padre,
   origen exacto, esquema, sesión y un único puerto.
3. Todo lo demás cruza el canal privado como JSON string, máximo 16384 unidades
   UTF-16 antes del parseo. Campos y payloads estrictos; respuestas no contienen
   resultados o errores crudos de servicios.
4. Requests hijo→host tienen IDs consecutivos desde 1, hasta 1000 por instancia.
   Host conserva el contador aunque rechace el permiso. Replay, saltos, sesión,
   versión o esquema incorrectos terminan la instancia antes de otro efecto.
5. Comandos host→hijo tienen contador independiente y ack correlacionado. Hijo y
   host validan comandos/estados; ack inesperado es fatal. Respuestas tardías de
   operaciones vencidas se descartan.

Operaciones: `agent.speak`, `progress.record`, `embodiment.perform`, con los
payloads del SDK. Éxito `{ok:true}`; error con código estable y mensaje genérico.
El host nunca confía en un ack como evidencia pedagógica, autoría o seguridad del
reto; solo sirve para coordinar el lifecycle de la instancia.

## Grants y lifecycle

Aprobación explícita ∩ declaración ∩ adaptadores disponibles. Aprobaciones repetidas
o no declaradas son INVALID_INPUT. Required no aprobado falla CAPABILITY_DENIED;
required sin adaptador falla CAPABILITY_UNAVAILABLE. Optional sin adaptador no
se concede. Camera/hand-tracking siguen siendo declarativos: required no soportado
se rechaza, optional no otorga sensores.

| Operación | Estado permitido | Estado durante/después |
| --- | --- | --- |
| mount/initialize | nuevo | loading → initializing → ready |
| start | ready | starting → running |
| pause | running | pausing → paused |
| resume | paused | resuming → running |
| dispose | ready/running/paused | disposing → disposed; idempotente |
| cancel/AbortSignal | cualquier no terminal | cancelled |
| error fatal | cualquier no terminal | error |

Llamadas SDK solo en starting/running/resuming. pause aborta operaciones pendientes;
comandos concurrentes o fuera de orden rechazan INVALID_LIFECYCLE. dispose durante
una transición equivale a cancelación para no invocar hooks concurrentes. Error,
cancelled y disposed son terminales; crear otro intento exige otra instancia.

`revoke(capability)` invalida inmediatamente el grant del host y aborta operaciones
pendientes de esa capacidad; si era required, cancela la instancia. Para optional
se actualiza además la lista del hijo, sin depender de que el hijo coopere.

Carga, hooks y operaciones tienen deadline: 5000ms por defecto, configurable entero
50–30000ms. Como máximo 8 llamadas en vuelo. La operación 9 recibe HOST_UNAVAILABLE;
una secuencia agotada es fatal. Timeout de operación aborta su adaptador; si el reto
captura el rechazo puede continuar. Timeout/fallo de hook o carga termina la
instancia. Un error de evaluación previo al handshake se conserva y rechaza ready
al conectar, antes de initialize. Los timers dependen del event loop y no son aislamiento de CPU.

dispose controlado solicita hook cleanup con deadline. cancel/error abortan puertos
y eliminan frame/canal/listeners inmediatamente; el aviso al hijo es best-effort,
no se espera ni garantiza que código no confiable termine cleanup. Remover frame
no deshace efectos ya enviados: adaptadores deben respetar AbortSignal y mantener
idempotencia. El runtime observa remoción externa del contenedor para cancelar.

## Errores y telemetría

Errores públicos conservan códigos del SDK: INVALID_MANIFEST, UNSUPPORTED_VERSION,
INVALID_INPUT, CAPABILITY_DENIED, CAPABILITY_UNAVAILABLE, INVALID_LIFECYCLE,
ABORTED y HOST_UNAVAILABLE. Timeouts y fallos de ejecución/adaptador usan este
último; eventos telemetry `timeout` permiten distinguirlos sin filtrar excepciones.

`onTelemetry` recibe solo categoría (`state`, `rejected`, `denied`, `timeout`,
`operation`), estado, código y método de lista cerrada. Nunca incluye payloads,
texto de speech, usuario, credenciales, stack trace o mensaje arbitrario del reto.
El número de operaciones está acotado y no se instrumentan mensajes de ventanas
ajenas. Una excepción del observador no rompe el runtime; cancelar desde él se
comprueba antes de despachar al adaptador.

## Verificación y despliegue

```bash
pnpm --filter @mimix/challenge-runtime exec playwright install --with-deps chromium firefox webkit
pnpm test:browser
pnpm check
```

Playwright 1.63.0 fija sus engines Chromium, Firefox y WebKit. Los tres corren en
CI obligatoria. No se certifican Safari/iOS ni dispositivos reales por ejecutar
WebKit de Playwright. Harness prueba fixture, origen/source, protocolo hostil,
replay, grants, revocación, límites, timeout, cancelación, CSP y navegación. La
aserción de red consulta solicitudes recibidas por servidor, porque Playwright
puede emitir request incluso cuando CSP bloquea la transferencia.

Docker instala y construye el nuevo workspace. El harness no se copia al runtime
de producción ni se agrega ruta de producto. Sin migración SQL, secretos ni feature
flags nuevos. Rollback: revertir este PR completo y usar imagen anterior; mantener
los datos PostgreSQL. Prompt 09, solo tras merge del usuario, podrá empaquetar los
retos reales y definir su contenido/assets dentro de estas restricciones.

Evidencia de ejecución: [runbook de verificación](../runbooks/challenge-runtime-verification.md).

Fuentes de plataforma: [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe),
[postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage),
[CSP script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src),
[engines Playwright](https://playwright.dev/docs/browsers).
