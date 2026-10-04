# Manifest y Challenge SDK v1

`@mimix/contracts` contiene contratos Zod compartidos, sin APIs Node.
`@mimix/challenge-sdk` ofrece `defineChallenge`, `validateManifest` y tipos de
puertos/lifecycle. Ambos son paquetes ESM privados del workspace, versión 1.0.0.
No hay publicación npm ni integración automática con los retos actuales.

## Comparación previa con Matemáticas y Ciencias

La [especificación](../superpowers/specs/2026-10-04-challenge-sdk-design.md)
registra la comparación realizada antes de editar. Matemáticas crea/selecciona
figuras, muestra diálogo y emite un evento legacy; Ciencias selecciona elementos
en DOM y manipula átomos Three.js. Comparten cámara, gestos y contexto del robot.
La futura migración necesitará hooks para liberar cámara, listeners, SSE y recursos
Three.js; seleccionar una figura/elemento no es una respuesta evaluada. Por eso no
se inventan puntuaciones ni traducciones automáticas de esos eventos.

## Manifest

Ejemplo ejecutable: `packages/challenge-sdk/fixtures/minimal/manifest.json`.

- `schemaVersion: 1`: formato del manifest; `apiVersion: 1`: puertos/lifecycle.
- `id`: referencia de 1–80 caracteres (`A-Z`, `a-z`, `0-9`, `.`, `_`, `-`).
- `version`: SemVer, máximo 80 caracteres, admite prerelease, sin `+metadata`
  porque el contrato learning existente no admite `+`. Identifica contenido
  inmutable; un cambio de contenido requiere otra versión.
- `title`, `description`: texto no vacío, límites 120 y 2000.
- `entrypoint`: módulo `.js` relativo a la carpeta del manifest, sin traversal,
  URL, query, fragmento, encoding, barra invertida ni prefijo `./`.
- `objectives`: entre 1 y 50 `{id, description}`; IDs únicos y texto hasta 500.
- `completion: {description}`: criterio pedagógico legible (hasta 1000), no código
  ejecutable ni regla de desbloqueo. El reto emite `attempt_completed` cuando lo
  satisface; el backend conserva autoridad sobre la proyección.
- `capabilities: {required, optional}`: listas explícitas sin duplicados ni
  solapamiento. No declarar una capacidad equivale a no solicitarla.

Todos los objetos son estrictos: campos desconocidos se rechazan. La CLI y el
validador aceptan exclusivamente schema/API v1; no deducen compatibilidad por la
versión de contenido. Formatos/API incompatibles requieren otra versión mayor del
contrato, actualización explícita del host y pruebas nuevas. Cambios compatibles
al SDK se publican como minor/patch conservando esta API; nuevos valores del
manifest requieren coordinación con validadores existentes (que fallan cerrados).

## Capacidades y API neutral

| Capacidad | API v1 | Política del futuro host |
| --- | --- | --- |
| `agent` | `mimix.agent.speak({text})` | Mensaje no vacío, máximo 2000; personaje/voz se resuelven en host |
| `progress` | `mimix.progress.record({type,payload})` | Vincular al intento del usuario; persistir antes de resolver |
| `embodiment` | `mimix.embodiment.perform({intent})` | Solo celebrate/encourage/acknowledge; aplicar lease y política física |
| `camera` | Solo declaración | Permiso, acceso y transporte se definirán en runtime |
| `hand-tracking` | Solo declaración | Adquisición de gestos se definirá en runtime |

Cada llamada devuelve `Promise<void>`: una resolución confirma aceptación del
host; no promete que un robot haya terminado una acción física. No existen
puertos Clerk, DB, motores, voz, media ni proveedores en el SDK. Hablar no concede
micrófono/cámara ni permiso para mover un dispositivo.

El host debe rechazar el inicio si no puede otorgar todas las capacidades
requeridas. Las opcionales pueden faltar: el reto consulta `context.capabilities`
y mantiene una alternativa local. Los tres puertos permanecen presentes; una
llamada sin grant rechaza con `CAPABILITY_DENIED`. La declaración nunca autoriza:
el host debe validar, autorizar y comprobar revocación en **cada llamada**.
Este PR define esa obligación; no implementa un mecanismo de seguridad/bridge.

```ts
import { defineChallenge, type ChallengeContext } from '@mimix/challenge-sdk'

// manifest se lee como JSON y se valida sin ejecutar la factory.
const definition = defineChallenge(manifest, (context: ChallengeContext) => ({
  async initialize() { /* preparar recursos locales */ },
  async start() {
    context.signal.throwIfAborted()
    await context.mimix.progress.record({
      type: 'answer_submitted', payload: { correct: true },
    })
  },
  async pause() { /* detener animaciones/entrada */ },
  async resume() { /* reanudar recursos pausados */ },
  async dispose() { /* liberar recursos incluso tras fallo parcial */ },
}))
```

La entrada exporta `createChallenge(context): ChallengeLifecycle`; el host futuro
carga el módulo, valida el manifest y usa `defineChallenge(manifest, createChallenge)`.
`defineChallenge` no ejecuta la factory ni impone estados. El fixture no crea DOM,
network ni hardware; solo demuestra una respuesta conocida con puertos inyectados.

## Lifecycle

El host crea una instancia por intento y serializa estas transiciones; los hooks
son obligatorios, async y no deben ejecutarse concurrentemente:

| Estado | Llamada | Estado después de resolver |
| --- | --- | --- |
| creado | initialize | listo |
| listo | start | activo |
| activo | pause | pausado |
| pausado | resume | activo |
| cualquiera salvo eliminado | abort signal, después dispose | eliminado |
| eliminado | dispose | eliminado (idempotente) |

Una llamada fuera de orden se rechaza como `INVALID_LIFECYCLE` por el host. Ante
fallo de un hook, el host aborta trabajo pendiente y garantiza `dispose`, incluso
si `initialize` falló parcialmente. El reto escucha `signal` y cancela sus tareas;
no basta comprobarlo solo al iniciar. El fixture comprueba abort entre operaciones.
`pause` no finaliza el intento; `dispose` no genera por sí solo abandono ni éxito.
Los estados de intento learning (`active/completed/abandoned`) son independientes:
tras completar, el host puede mostrar feedback antes de liberar la instancia.
Un nuevo intento crea otra instancia; `start` se llama una sola vez por instancia.

## Progreso compartido con PR #7

| type | payload |
| --- | --- |
| answer_submitted | `{correct: boolean}` |
| hint_requested | `{}` |
| attempt_completed | `{}` |
| attempt_abandoned | `{}` |

`@mimix/contracts.learningRecordSchema` es la misma fuente que usa la API para
los payloads. La API añade UUID `eventId` y `sequence` (2–1000000), preservando el
wire format y validación anteriores. El host crea el intento/`attempt_started`,
enlaza identidad, asigna UUID/secuencia y reutiliza exactamente el mismo sobre
en reintentos idempotentes. El reto no puede elegir usuario/intento, reescribir
porcentajes ni enviar payloads arbitrarios. No se añade HTTP al SDK, cola offline
ni inferencia de `correct` a partir de selecciones exploratorias.

## Errores

`ChallengeError` / `challengeErrorSchema` describen `{code, message}` serializable.
El futuro host rechaza sus Promises con ese contrato; no transmite excepciones,
stack traces, tokens ni respuestas crudas de proveedores.

| Código | Significado / reacción |
| --- | --- |
| INVALID_MANIFEST | Corregir campos según issues; no iniciar |
| UNSUPPORTED_VERSION | Usar versión compatible; no intentar adivinar |
| INVALID_INPUT | Payload fuera del contrato; corregir llamada |
| CAPABILITY_DENIED | No declarada, no otorgada o revocada; usar alternativa |
| CAPABILITY_UNAVAILABLE | Capacidad temporalmente indisponible; feedback local |
| INVALID_LIFECYCLE | Orden incorrecto de hooks; error del host/integración |
| ABORTED | Intento/operación cancelada; liberar recursos |
| HOST_UNAVAILABLE | Transporte/host indisponible; no reintentar escrituras sin idempotencia |

`validateManifest(unknown)` devuelve una unión `{ok:true, manifest}` o
`{ok:false, error, issues:[{path,message}]}`. `defineChallenge` lanza un `Error`
con esos campos ante manifest inválido. Son errores locales; no certifican que
el host/retos cumplan sus obligaciones ni sustituyen validación de transporte.

## CLI y verificación

Desde la raíz, después de instalar dependencias:

```bash
pnpm --filter @mimix/challenge-sdk... build
pnpm --filter @mimix/challenge-sdk validate fixtures/minimal/manifest.json
```

El paquete registra el bin `mimix-challenge-validate <manifest.json>` para futuros
consumidores. Ruta relativa al cwd del proceso. Produce un objeto JSON en stdout:
0 válido; 1 JSON/manifest/entrypoint inválido; 2 uso incorrecto o archivo ilegible.
Códigos adicionales de CLI: `USAGE`, `READ_ERROR`, `INVALID_JSON`,
`INVALID_ENTRYPOINT`. Comprueba que entrypoint existe, es archivo y su realpath
permanece dentro de la carpeta real del manifest, incluso a través de symlinks.
No importa el módulo ni valida sus exports/imports, no ejecuta código y no es un
escáner de seguridad o un sandbox. `typecheck` verifica el fixture y un consumidor
público TS con casos negativos, también sin tipos Node para la entrada de navegador.

## Entrega, rollback y siguiente PR

El runtime de API consume `@mimix/contracts` desde la imagen Docker; los paquetes
se compilan por el grafo Turbo y el runtime recibe dist y symlinks necesarios.
El SDK/fixture no se sirven en producción ni modifican el frontend. No hay datos
que migrar, secretos nuevos ni feature flags de comportamiento.

Rollback: revertir este PR completo (incluidos lockfile, workspace, Docker y el
import learning), instalar congelado, ejecutar gates y desplegar imagen anterior
si hace falta. Mantener PostgreSQL y sus datos intactos.

Después de revisión y merge del usuario, prompt 08 podrá consumir estos contratos
para aislamiento, bridge, validación, grants, revocación y control del lifecycle.
Deberá implementar puertos con identidad/intento del host y reintentos idempotentes,
sin convertir capabilities de sensores en permisos automáticos. Prompt 09 abordará
la migración de los retos y sus criterios pedagógicos. Ninguno se inicia aquí.
