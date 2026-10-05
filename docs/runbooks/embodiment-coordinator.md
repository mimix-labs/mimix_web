# Operación del coordinador de embodiment

## Activación y diagnóstico

El contrato y la guardia de síntesis web se cargan con el servicio de voz. Voz sigue
apagada por defecto (`MIMIX_VOICE_PROVIDER=disabled`). No hay bandera ni endpoint para
activar robots reales: solo existe un stub invocable por código confiable. No pasar
inputs de red directamente a `acquireRobot` sin la futura autorización DeviceSession.

`voice.embodiments.forUser(uuidInterno)` consulta el ámbito actual. `snapshot()`
expone fase, titular, token, revisión y plazo, sin texto/audio. Evitar volcar estos
IDs en logs de producción. Para una cesión interna, usar el token vigente como CAS;
si devuelve undefined, releer estado y decidir explícitamente, nunca reintentar una
adquisición física automáticamente. Heartbeat tardío exige autorización nueva.

`EMBODIMENT_MUTED` mantiene el subtítulo y debe producir silencio en un consumidor
web. Una cesión puede cancelar una petición ya cobrada por ElevenLabs: no implica
reembolso. `BUSY` puede indicar capacidad de sesiones o concurrencia de proveedor.
Los límites y política de retención del [proveedor de voz](voice-provider.md) no cambian.

Antes de conectar salida real hacen falta DeviceSession, propagación de estado y
revocaciones, un driver `stop()` verificable, auditoría durable y autoridad compartida
si hay varias réplicas. El stub no demuestra que un robot físico se detuvo.

## Migración y rollback

Sin cambios de datos ni migración SQL. La imagen incorpora `embodiment-contract` como
dependencia de ejecución. Reiniciar descarta leases; el fallback local comienza virtual.
Para detener síntesis externa usar `MIMIX_VOICE_PROVIDER=disabled` y reiniciar. Para
volver al comportamiento previo, desplegar la imagen del merge `24c26d72e60a12573b9ee1640151ab64f6561b45`.
No hacer rollback con un futuro robot habilitado sin revocar primero su sesión y
verificar que detuvo salida: el servidor anterior no conoce leases.

## Verificación

Pruebas deterministas cubren contrato, CAS, heartbeat al borde del plazo, fallback
por timer y por lectura, revocación, reconexión con token nuevo, cierre, snapshots,
una sola entrega por utterance, límites de memoria, stop obligatorio/fallido,
audio tardío y aislamiento entre usuarios. Nest y Express verifican el nuevo fallback
por HTTP autenticado y su presencia en OpenAPI. No hay llamadas pagadas ni hardware.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
pnpm check
docker build --tag mimix:embodiment-coordinator .
MIMIX_TEST_IMAGE=mimix:embodiment-coordinator node --test test/smoke/container.test.js test/smoke/postgres-container.test.js
```

Evidencia local (2026-10-05): frozen install, lint, typecheck, `pnpm test`
(138 tests), build, smoke de producción y `pnpm check` terminaron con código 0.
17 tests nuevos; la selección focal ejecutó 23 tests incluyendo HTTP previo.
Ciclos RED → GREEN observados en contrato, coordinador, integración de voz y en la
regresión de salida sin `stop()`. Revisión propia: guardias de autoridad antes/después
de await, callbacks reentrantes, memoria, identidad, cierre y empaquetado Docker.
El build conserva el aviso previo de tamaño de chunk Vite; la suite usa MockTimers
experimental en pruebas existentes. No se ejecutó una auditoría de seguridad nueva.
Docker construyó `mimix:embodiment-coordinator` (imagen `562e5d60218d`) y los cinco
smokes de contenedor/PostgreSQL pasaron. Logs de esta ejecución en
`/tmp/mimix-embodiment-{frozen,lint,typecheck,test,build,smoke,check,docker,container}.log`.
Base y HEAD preservados: `24c26d72e60a12573b9ee1640151ab64f6561b45`;
rama `feat/embodiment-coordinator`, cambios sin stage ni commits. El coordinador
puede revisar el diff más los archivos nuevos antes de preparar su commit y PR. Este trabajo debe
quedar sin commit/push/PR para revisión del coordinador, conforme a la instrucción
específica del prompt 13. No iniciar la siguiente fase desde este chat.
