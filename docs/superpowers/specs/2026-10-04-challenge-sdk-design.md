# Challenge SDK y manifest — prompt 07

Base: `origin/main` en `1d0825fab1b6d5f56c4de6b969463b0d5b2ff7fe` (PR #7).
Rama: `feat/challenge-sdk-manifest`. Un solo PR, sin merge.

## Diagnóstico previo a edición

Matemáticas (`client/public/challenges/mathematics/main.js`) inicia webcam o
visión Jetson, escena Three.js y listeners. Selección de figura actualiza contexto;
crear figura envía `lenvantarceja` por el adaptador HTTP legacy. `shapeDialogue.js`
muestra texto local. Ciencias (`science/main.js`, `sidebarShapes.js`, `atomLab.js`)
comparte cámara/gestos, selecciona elementos de una tabla DOM y ajusta cargas/órbitas.
Ambos requieren preparación, pausa/reanudación y liberación de recursos. Ninguno
define hoy respuestas evaluadas ni finalización pedagógica: seleccionar no implica
`correct: true`. Los retos actuales permanecerán intactos.

| Necesidad | Frontera propuesta | Límite de esta entrega |
| --- | --- | --- |
| Iniciar, pausar, reanudar, terminar | Hooks initialize/start/pause/resume/dispose | El futuro host serializa y controla lifecycle |
| Cámara/gestos | Declaraciones camera y hand-tracking | Sin API de sensores ni transporte todavía |
| Explicar figura/elemento | agent.speak({text}) | Sin personaje/proveedor/credenciales |
| Respuesta/pista/final | progress.record({type,payload}) | Solo hechos ya soportados por PR #7 |
| Expresión | embodiment.perform({intent}) | celebrate/encourage/acknowledge; nunca motores |

## Decisiones

Paquetes ESM TypeScript estrictos, privados, versión 1.0.0. `@mimix/contracts`
publica esquemas Zod 4.6.5 sin dependencias Node; `@mimix/challenge-sdk` publica
tipos, definición de reto, validación de manifest y CLI Node en entrada separada.
Se descarta duplicar los payloads de progreso (deriva entre SDK/API) y construir
un bridge ahora (corresponde al prompt 08). API importa el esquema compartido,
preservando UUID, secuencia, validación y wire format existentes.

Manifest: schemaVersion=1, apiVersion=1, id compatible con learning, version
SemVer sin build metadata (compatibilidad con referencia learning de 80 caracteres),
title, description, entrypoint local relativo .js, objetivos con id/descripción,
criterio de finalización textual y capacidades required/optional sin duplicados ni
solapamientos. Desconocidos se rechazan. Compatibilidad exacta de schema/API v1;
no rangos implícitos. Rutas sin traversal, URLs, encoding, query o fragment.

SDK: `defineChallenge(manifest, factory)` valida y devuelve definición; factory
recibe `ChallengeContext` con mimix, capacidades otorgadas y AbortSignal, devuelve
hooks lifecycle. Son contratos para inyección por el host, sin ejecución del host,
credenciales, HTTP, sandbox, grants automáticos ni acceso a hardware. Puertos async
retornan void; rechazo usa error estructurado documentado. El host enlaza progreso
a un intento autenticado y aporta eventId/sequence/idempotencia. No los decide el reto.

CLI valida JSON y existencia del entrypoint dentro de la raíz del manifest
(incluido realpath de symlinks), nunca importa/ejecuta código. Salida JSON estable,
código 0 válido, 1 inválido, 2 uso/lectura. Fixture ESM mínimo ejercita API y hooks
con host de prueba; no se publica ni se monta en frontend.

## Aceptación, riesgos y exclusiones

Pruebas de Zod, invariantes, lifecycle tipado, API neutral, CLI y fixture. Negativas
de tipos con @ts-expect-error, compatibilidad del contrato learning y pruebas
existentes. Instalación congelada, lint, typecheck, tests, build, smoke, Docker y CI.
Riesgo principal: contrato temprano; el host futuro conserva autorización, lifecycle,
revocación, reintentos y validación en cada frontera. La CLI no certifica seguridad.
Sin sandbox, migración de retos, frontend, nuevos proveedores ni cambios de datos.
Rollback por revert del PR/imagen previa; no migraciones ni flags de producto.
