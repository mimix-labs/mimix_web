# Agent Core v1

Fundación del prompt 11 / ADR 0005. Biblioteca sin estado, sin endpoints nuevos,
sin integración automática con el cliente ni proveedor externo activo.

## Límites

| Componente | Responsabilidad | No decide |
| --- | --- | --- |
| `@mimix/agent-contract` | Esquemas Zod v1, turnos, contexto, herramientas, resultados y puerto LLM | Identidad o grants reales |
| `@mimix/agent-core` | Validar, recomendar y autorizar herramientas en cada ejecución | Desbloqueos, finalización, voz o hardware |
| `@mimix/character-contract` | Identidad narrativa, estilo, referencias visuales y animaciones | Permisos o lógica pedagógica |
| `@mimix/character-wall-e` | Primer perfil en `characters/wall-e` | Comportamiento del núcleo |
| `LlmProvider` | Proponer texto y llamadas estructuradas | Autorización, acciones o recomendaciones estructuradas |
| Host autenticado futuro | Verificar usuario, conversación, snapshot y grants vigentes | Delegar autoridad al modelo/cliente |

El core no importa personajes concretos ni SDKs de proveedores. Wall-E es una
dependencia de desarrollo de sus pruebas, nunca una dependencia de producción.
El perfil usa identificadores de activos; este PR no crea ni carga modelos 3D.

## Uso desde un host de confianza

```ts
import { AgentCore } from '@mimix/agent-core'
import { wallEProfile } from '@mimix/character-wall-e'
import type { PedagogicalContext, Authorization, TurnInput } from '@mimix/agent-contract'

// El host autentica y comprueba propiedad ANTES de crear estos objetos.
const context: PedagogicalContext = {
  schemaVersion: 1, userId: user.id, conversationId: ownedConversation.id,
  objectives: manifest.objectives,
  campaign: {
    id: definition.id, version: definition.version,
    nodes: definition.nodes.map(node => {
      const state = progress.nodes.find(state => state.id === node.id)!
      return { id: node.id, challengeId: node.challengeId,
        challengeVersion: node.challengeVersion, status: state.status, canStart: state.canStart }
    }),
  },
}
const authorization: Authorization = {
  userId: user.id, conversationId: ownedConversation.id,
  permissions: ['agent:turn', 'learning:read'], // Solo tras autorización del host.
  capabilities: approvedAndAvailableCapabilities,
}
const input: TurnInput = { schemaVersion: 1, id: turnId, message, history: [] }
const result = await new AgentCore().turn(input, context, authorization, wallEProfile)
```

El ejemplo es una composición futura: no existe aún repositorio de conversaciones.
El contexto debe ser un snapshot reciente de una única versión de campaña,
proyectado desde eventos del usuario autenticado. Objetivos proceden del manifest.
`campaign: null` permite acompañamiento sin campaña. No pasar cuerpos HTTP como
contexto/autorización; el esquema valida forma y correspondencia, no procedencia.
Nunca copiar claims de autorización de mensajes, perfiles, historial o respuestas
LLM. Las capabilities deben ser la intersección declarada, aprobada y disponible
del host; para un reto se usa la política del runtime existente.

El núcleo exige coincidencia de UUID de usuario y conversación y `agent:turn` +
`agent` antes de consultar el proveedor. `listTools` filtra el catálogo;
`executeTool` vuelve a comprobar permisos, capabilities y propiedad. Las tools
`read_context` y `recommend_next` exigen además `learning:read` + `progress`.
No reciben argumentos: cualquier intento de elegir otro usuario o campaña se
rechaza. No se registran handlers arbitrarios ni acciones de escritura.
Las funciones puras `recommendNext` y los esquemas no son endpoints autorizados.

`recommendNext` prioriza el primer nodo en progreso, luego el primer nodo
`available` con `canStart`; el orden estable es el del snapshot. Omite completados
incluso cuando pueden reintentarse. Devuelve como máximo una recomendación con
versiones exactas. Recomendar no abre intentos ni desbloquea nodos.
El host debe volver a validar disponibilidad al iniciar un intento.

## Turnos y LLM

Un turno sin proveedor devuelve texto determinista, personaje y recomendaciones.
Con proveedor hay una sola llamada `generate(request, { signal })`; recibe texto,
historial, nombre/estilo, vista pedagógica y catálogo permitido. Sin permiso de
lectura recibe `context: null` y catálogo vacío. Los UUID y grants no se transmiten
en campos del protocolo; el texto libre aportado por el usuario no se anonimiza.
El adaptador es código confiable, pero la propuesta del modelo es dato no confiable.

La respuesta solo puede contener `text` y `toolCalls`; no puede elegir
recomendaciones, grants ni rutas. El core ejecuta hasta cuatro tools en orden y
retorna sus resultados estructurados al host. No hay segunda consulta al modelo
ni bucle automático. El texto del modelo debe renderizarse como texto, nunca HTML,
y no debe interpretarse como acción ni como evidencia de progreso.

Límites por turno: 12 mensajes de historial de 2.000 caracteres cada uno, mensaje
de 2.000, 50 objetivos de 500 caracteres, 100 nodos y 4 llamadas con IDs únicos.
Rechazo de campos extra y versiones desconocidas. No se recorta silenciosamente:
el host elige una ventana de historial antes de invocar el core. El núcleo no guarda
conversaciones ni identifica duplicados de turnos; el ID es para correlación.

Timeout predeterminado: 5.000 ms, configurable entre 1 y 30.000 ms enteros. El core
aborta el signal y retorna fallback; el adaptador debe respetar cancelación, limitar
bytes recibidos y gestionar recursos. No puede interrumpir código síncrono bloqueante.
Errores del proveedor nunca se copian a resultados. `fallbackReason` distingue
`PROVIDER_FAILED`, `INVALID_PROPOSAL` y `PROVIDER_TIMEOUT`. Entrada inválida o falta
de autorización rechazan el turno con `AgentError`, sin consultar al proveedor.
Grants/contexto se copian antes del primer await; son válidos para ese turno acotado.
Revocación externa inmediata exige cancelación/reautorización en el host futuro.

## Integración incremental

`apps/api/modules/agent` conserva su frontera vacía: no hay activación ni feature
flag que configurar. Una futura ruta debe añadir verificación de identidad,
propiedad de conversación, grants frescos, rate limit, límite del cuerpo, cancelación,
política de datos para proveedores y tests de transporte antes de exponerse.
No iniciar esa ampliación ni los prompts 12/13 dentro de este PR.

[Verificación y rollback](../runbooks/agent-core-verification.md).
