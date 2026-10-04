# Runtime aislado — prompt 08

Base `288991af905148f2b9e1677c55f19868e6cf97f0`, rama
`feat/challenge-sandbox-runtime`. Solo este PR; sin migrar retos ni UI.

## Amenaza y frontera (presentadas antes de editar)

Código del reto, mensajes, payloads, errores y navegación no son confiables.
Se protegen DOM, cookies/storage y servicios del host. El host nunca entrega
credenciales, identidad, DB ni proveedores. La página host, su bundle, sus
adaptadores y el catálogo que elige el artefacto sí son de confianza.

`iframe srcdoc` con `sandbox="allow-scripts"`, origen opaco; sin same-origin,
forms, popups, downloads, top-navigation o sensores. CSP en primer meta:
`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none';
object-src 'none'; base-uri 'none'; form-action 'none'`.
Inline es deliberado dentro del realm no confiable; no se usa unsafe-eval ni
nonces reutilizables para cargar scripts externos. Se recibe un bundle IIFE
HTML-safe (máximo 512 KiB) que exporta `MimixChallenge.createChallenge`.
No HTML arbitrario ni URLs externas; assets/remotes quedan para migración futura.

No se promete aislamiento de CPU/memoria ni bloqueo universal de navegación
propia/WebRTC del navegador: sandbox no equivale a contenedor de red. Una carga
posterior del iframe invalida el canal y elimina la instancia; una solicitud de
navegación puede haber salido antes. No poner secretos en el contexto del reto.
CSP sí bloquea fetch/WebSocket/scripts externos/subframes/forms en el documento.

## Bridge y permisos

Handshake window.postMessage estricto v1, sesión aleatoria y source===contentWindow,
origin==='null'. Hijo verifica parent/source/origen HTTP(S) exacto configurado.
Solo bootstrap usa targetOrigin '*' hacia origen opaco; se transfiere un
MessageChannel una sola vez. Tráfico posterior usa canal dedicado, sesión,
esquemas Zod estrictos y request IDs enteros monotónicos. Prohibido devolver
excepciones/payloads crudos de adaptadores. Campos desconocidos, versión/sesión
incorrecta, IDs repetidos o saltados causan error y teardown.

Grants = capacidades declaradas y aprobadas explícitamente por host, con adaptador
implementado. Solo agent/progress/embodiment tienen operaciones. Required faltante
impide mount; sensores required fallan unavailable. Optional sin adaptador no se
otorga. Se comprueba grant vigente y estado activo en cada llamada; revocación
aborta operaciones pendientes. Revocar required cancela instancia. La política de
usuario/intento/lease físico sigue en adaptador/backend, no en el reto.

Cada operación recibe AbortSignal y una clave session:id que el adaptador puede
usar para idempotencia. Máximo 8 llamadas simultáneas, 1000 por instancia, 16 KiB
por mensaje. Timeouts de carga/hook/operación (default 5s, configurable 50–30000ms).
Timeout/cancelación abortan trabajo y suprimen respuestas tardías; un adaptador
que ignore AbortSignal puede haber completado efectos: no se reintenta solo.

## Lifecycle y telemetría

mount→loading→initialize→ready. start: ready→starting→running;
pause: running→pausing→paused; resume: paused→resuming→running.
Operaciones del SDK solo durante starting/running/resuming. Comandos concurrentes
o fuera de orden rechazan INVALID_LIFECYCLE. dispose aborta operaciones, solicita
cleanup del hijo con deadline y elimina iframe/canal/listeners; idempotente.
cancel/AbortSignal y fallo son terminales e invalidan pendientes inmediatamente;
cleanup de hijo es best-effort, remoción no espera código no confiable.

API retorna `ready`, estado, start/pause/resume/dispose/cancel/revoke.
Callbacks de estado/telemetría no pueden romper el runtime. Telemetría acotada,
sin texto de usuario/payloads/excepciones, solo categorías/códigos/métodos/estados.
Harness de desarrollo muestra estado/error/cancelar y puertos fake; no se sirve
por la aplicación de producción.

## Pruebas y aceptación

Node:test para protocolo/grants; consumidor TS; Playwright Chromium/Firefox/WebKit
para fixture real y ataques: origen/source, versión/esquema/sesión/replay, grants,
revocación, hook/call deadlines, cancelación, cleanup, DOM/cookies/storage,
fetch y recursos externos/subframes bloqueados, navegación invalida sesión.
Sin engines móviles/reales certificados. CI instala los browsers fijados por
Playwright; pruebas obligatorias de tres engines sin skips.
Instalación congelada, lint, tipos, tests/build/smoke y Docker. Revisión independiente.
Rollback: revert del PR; sin datos ni rutas de producto que migrar.
