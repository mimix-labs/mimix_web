# Coordinador de embodiment

Base: `24c26d72e60a12573b9ee1640151ab64f6561b45`. Rama: `feat/embodiment-coordinator`.

## Alcance y decisión

Una autoridad síncrona por conversación concede un único lease temporal. Estados
`virtual`, `robot`, `closed`. Se inicia en virtual. Adquirir robot requiere el ID
vigente (compare-and-swap); heartbeat requiere titular e ID exactos. Expiración o
revocación cambia a virtual con ID nuevo; cerrar es terminal. TTL por defecto 15 s,
configurable internamente entre 100 ms y 60 s. El reloj de producción es monotónico.

Cada cambio de titular invalida permisos y aborta trabajo pendiente antes de permitir
otra salida. Cada utterance se entrega como máximo una vez por conversación, incluso
tras reconexión (hasta 256 IDs; después se rechazan nuevas entregas). No se almacena
texto/audio. Los adaptadores deben detener reproducción de forma síncrona al abortar
el permiso; errores de salida no autorizan un reintento del mismo utterance.

El contrato público valida UUIDs, lease, estados e invariantes. WebEmbodiment ofrece
permisos y entrega con comprobación final; RobotEmbodiment es un stub sin transporte.
La API de voz conserva su conversación implícita por UUID interno de usuario; antes
de gastar cuota obtiene permiso web y comprueba otra vez antes de devolver audio.
La cesión a robot aborta la síntesis y devuelve `EMBODIMENT_MUTED` con subtítulo.
La conexión de UI/playback queda para su fase; no se afirma detener audio que un cliente
HTTP antiguo ya descargó. Un cliente futuro debe usar el adaptador y comprobar lease
al reproducir; no basta con silenciar una bandera visual.

El registro del servidor admite como máximo 1000 conversaciones, limpia virtuales
inactivas tras 5 min y cierra todos los leases al apagar. Solo llamadas internas
confiables adquieren robot; no hay endpoints ni credenciales para dispositivos.
No toca Agent Core, personajes, frontend, hardware, MQTT o LiveKit.

## Riesgos y aceptación

Autoridad en memoria de un proceso, sin persistencia ni consenso entre réplicas.
El reinicio invalida todo; el futuro transporte físico deberá fallar cerrado y exigir
un lease nuevo. La coordinación de voz no es control ni seguridad física.
Se aceptará con carreras CAS, heartbeat/expiración, revocación, reconexión, cierre,
exclusión de voz y respuestas tardías probadas, gates completos y Docker verde.
No commit/push/PR: handoff al coordinador con árbol preservado y evidencia.
