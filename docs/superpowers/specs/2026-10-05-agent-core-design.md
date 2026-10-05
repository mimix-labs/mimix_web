# Agent Core foundation — prompt 11

Base verificada: `5c68bc040d9f6ef16bcbd29cbdd1c70b35e646ab`.
Rama: `feat/agent-core-foundation`. Solo este PR; no iniciar 12/13.

## Contrato de diseño

Agent Core será una biblioteca TypeScript sin estado persistente ni transporte.
El host autenticado entrega un snapshot pedagógico acotado y su autorización;
ningún dato del cliente o del LLM puede construir grants. Contexto y autorización
comparten UUID interno y conversación. El core valida esa correspondencia.
El host es responsable de obtener datos actuales y de su veracidad.

`agent-contract` define contexto, turnos, recomendaciones, catálogo, errores y
puerto LLM. `character-contract` define identidad narrativa, estilo y referencias
visuales sin comportamiento ejecutable. `characters/wall-e` contiene el primer
perfil y solo depende del contrato de personaje. Core recibe cualquier perfil.
El proveedor recibe datos pedagógicos y estilo, nunca identidad o autorización.

Recomendación determinista: continuar primer nodo en progreso; en su ausencia,
comenzar primer nodo disponible con canStart. Nunca desbloquear ni escribir
progreso. Dos tools de lectura: `read_context` y `recommend_next`; ambas exigen
`learning:read` y capabilities `agent`, `progress`. Todo turno exige `agent:turn`
y `agent`. Catálogo cerrado; herramientas desconocidas/denegadas no se ejecutan.

LLM opcional: una propuesta de texto y hasta cuatro llamadas de argumentos vacíos.
La validación y autorización permanecen en el núcleo. No hay recursión ni bucle
de herramientas. Respuesta inválida, excepción o timeout: fallback explícito.
El proveedor recibe AbortSignal; el timeout limita la espera, el adaptador debe
cancelar sus recursos. Sin proveedor se produce un turno determinista utilizable.

## Límites y aceptación

12 mensajes de historial; 2.000 caracteres por mensaje; 100 nodos; 50 objetivos;
4 tools por propuesta. No memoria interna. Versionado v1, objetos estrictos.
Pruebas de contratos, recomendación, cambio de personaje, propiedad, grants,
inyección en argumentos, proveedor inválido/fallido/lento y aislamiento de turnos.
Sin endpoint público, SDK nuevo de proveedor, voz, robot, motores ni cambios UI.
No migración de datos. Rollback: revertir el PR; no cambia el runtime servido.
