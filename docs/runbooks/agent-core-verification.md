# Verificación de Agent Core

## Alcance y rollback

No hay cambios de base de datos, variables, endpoints ni comportamiento servido.
Se añaden cuatro workspaces y sus manifests al build Docker. La imagen de runtime
no incorpora estos paquetes todavía porque la API no los consume. Revertir el PR
y reconstruir permite rollback sin pérdida de datos ni cambios de configuración.

## Gates

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
pnpm check
pnpm exec turbo run test --filter @mimix/agent-core --filter @mimix/agent-contract --filter @mimix/character-contract --filter @mimix/character-wall-e
docker build --tag mimix:agent-core .
MIMIX_TEST_IMAGE=mimix:agent-core node --test test/smoke/container.test.js
MIMIX_TEST_IMAGE=mimix:agent-core node --test test/smoke/postgres-container.test.js
```

TDD: contratos y perfil fallaron contra exports vacíos; después 6/6 verdes.
Las 10 pruebas iniciales del núcleo fallaron por APIs ausentes; después 10/10 verdes.
Incluyen cambio Wall-E/Luna, tools denegadas, aislamiento por usuario/conversación,
inyección de argumentos, mutation durante await, historial sin estado y fallback.
No se invoca un servicio LLM real; se prueba el puerto mediante adaptadores locales.

Verificación local: instalación congelada, lint, typecheck, 99 pruebas de la suite
completa, build, smoke de producción y `pnpm check` pasaron. Revisión independiente
sin hallazgos accionables; verificó 16/16 pruebas focalizadas y probes adicionales
de catálogo/snapshot, rechazo tardío del proveedor y tamaños máximos.

Se mantienen los límites documentados: snapshot de grants por turno, cancelación
cooperativa del adaptador, procedencia confiable de contexto/historial, texto LLM
no ejecutable y paquetes aún no consumidos por la API de producción. Envelopes de
tools sin identificadores válidos lanzan validación en lugar de inventar IDs.
Build Docker y 5/5 pruebas de contenedor (Nest, Express, seguridad y persistencia
con backup/restore PostgreSQL) pasaron. El estado de CI se registra en el PR.

## Handoff

Esperar la fusión de este PR y la confirmación del coordinador. Solo entonces crear
la rama del prompt 12 desde `origin/main` actualizado; la voz debe permanecer fuera
de Agent Core. Mantener Character como configuración y el proveedor como puerto.
No iniciar prompt 13 hasta que el PR 12 esté fusionado y confirmado.
