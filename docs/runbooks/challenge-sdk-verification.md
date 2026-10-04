# Verificación del Challenge SDK — 2026-10-04

## Base y alcance

- Rama `feat/challenge-sdk-manifest`, base `1d0825f` (PR #7 fusionado).
- [Diseño y comparación previa](../superpowers/specs/2026-10-04-challenge-sdk-design.md).
- [Contrato, compatibilidad, errores y rollback](../architecture/challenge-sdk.md).
- Implementación aditiva; ningún archivo de Matemáticas/Ciencias modificado.

## Evidencia local

Node 22.23.2, pnpm 10.34.6. Instalación congelada sin cambios adicionales del
lockfile; no se actualizaron versiones transitivas. Las advertencias de
subdependencias deprecadas y script opcional `@scarf/scarf` ignorado ya existían.

| Comprobación | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK |
| `pnpm lint` | OK, cero warnings |
| `pnpm typecheck` | OK; incluye fixture y consumidor público Node/browser |
| `pnpm test` | 71 tests pasan: 4 contratos, 5 SDK/CLI, 12 raíz, 45 API, 5 legacy sobre Nest |
| `pnpm build` | OK; contratos, SDK, API y cliente |
| `pnpm test:smoke` | 1/1; producción sirve aplicación y ambos retos |
| `pnpm check` | 14 tareas completadas |
| `pnpm --filter @mimix/api test:postgres` | 9/9 con PostgreSQL 17 desechable |
| CLI del fixture | JSON `ok: true`, exit 0 |
| Consumidor temporal con tarballs | Instala ambos paquetes y ejecuta bin `mimix-challenge-validate` |

Los tarballs se probaron solo en un directorio temporal, con override local del
paquete privado `@mimix/contracts`; no se publicaron paquetes npm. El primer
intento offline no pudo resolver el paquete privado sin override ni descargar
Zod ausente del store del consumidor; con override y descarga normal pasó.

## TDD y revisión

Contratos: 4/4 tests fallaron inicialmente por esquemas ausentes, después 4/4
pasaron. SDK/CLI: 5/5 fallaron antes de implementar, después 5/5 pasaron. El
consumidor TS falló antes de existir exports, luego compiló manteniendo efectivos
los `@ts-expect-error` para identidad, DB, motores, voz y progreso no autorizado.
Una prueba adicional fija paridad SDK/API, UUID en minúscula y límites de secuencia.

El primer build mostró pérdida de la tupla no vacía al componer Zod con `map`;
se conservó explícitamente la primera variante. Lint detectó un parámetro de
prueba sin usar; se corrigió usando el contexto en el ejemplo tipado.

Revisión independiente del diff completo: sin hallazgos accionables. Verificó
10 tests dirigidos (contratos, SDK, CLI y API), contención de rutas, Docker y
consumidor browser con `types: []` y `skipLibCheck: false`. La revisión estática
no reemplaza los smoke de imagen.

## Decisiones y límites

El host futuro debe aplicar grants/revocación, ordenar hooks, validar cada llamada,
autorizar progreso e idempotencia y aislar código. Se mantuvieron explícitamente
fuera del SDK; implementarlos aquí habría invadido el prompt 08. Los tests con
puertos inyectados prueban el contrato y fixture, no aislamiento ni persistencia
real a través de un bridge. Los tests PostgreSQL cubren el backend real existente.

`pnpm dev` y `pnpm server` compilan la dependencia compartida antes de arrancar
API; un consumidor que invoque directamente scripts de paquete debe preparar
sus dependencias de workspace. No se necesitan migraciones SQL ni nuevas variables.

## Handoff

Revisar el PR y sus checks antes de que el usuario decida el merge. Solo después,
prompt 08 puede implementar el host aislado sobre los contratos v1. Prompt 09
resolverá migración y criterios evaluables de Matemáticas/Ciencias. No hay deuda
correctiva de revisión ni cambios de producto pendientes de activar en este PR.
