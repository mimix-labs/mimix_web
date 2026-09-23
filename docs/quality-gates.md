# Quality gates de Fase 0

Esta fase fija una base verificable para el código actual, antes de migrar a
pnpm, Turborepo, Next.js o NestJS. Los comandos se ejecutan desde la raíz con
Node.js 22.

## Inventario previo

Medido el 23 de septiembre de 2026 sobre `main` (`5dbe6b4`), antes de editar:

| Comando | Tiempo aproximado | Resultado inicial |
| --- | ---: | --- |
| `npm ci --prefix client` | 2.01 s | Pasa; informa 4 vulnerabilidades (1 moderada, 3 altas). |
| `npm ci --prefix server` | 1.38 s | Pasa; informa 3 vulnerabilidades moderadas. |
| `npm run lint` | 0.17 s | Falla: el script no existía. |
| `npm run typecheck` | 0.06 s | Falla: el script no existía. |
| `npm test` | 0.08 s | Falla: el script no existía. |
| `npm run build` | 1.27 s | Pasa; Vite avisa de un chunk mayor de 500 kB. |
| Gitleaks | — | No estaba instalado localmente. |

No había workflows en `.github/workflows/`. Los lockfiles de cliente y servidor
sí estaban versionados; el lockfile raíz estaba ignorado.

## Comandos locales

```bash
npm run ci:install
npm run lint
npm run typecheck
npm test
npm run build
npm run test:smoke
```

`ci:install` usa únicamente `npm ci` y los tres lockfiles versionados. `test`
cubre el shell del frontend, `/api/health` y defaults seguros de rutas críticas.
`test:smoke` se ejecuta después del build y comprueba la aplicación servida en
producción, Matemáticas, Ciencias y el límite `/api/*`.

## Gates obligatorios

El job `Quality gates` bloquea el merge cuando falla cualquiera de estos pasos:

1. instalación congelada;
2. lint de JavaScript;
3. typecheck del servidor y los smoke tests;
4. tests smoke sin build;
5. build Vite;
6. smoke test del artefacto de producción.

La rama `main` debe protegerse en GitHub exigiendo el check `Quality gates`.
Esa configuración vive fuera del repositorio y debe activarla un administrador.

## Gates temporales e informativos

- `Dependency audit (informational)` no bloquea mientras se clasifica la deuda
  heredada. Cada subproyecto se audita por separado para mostrar el origen.
- `Secret audit (informational)` escanea el historial completo con Gitleaks
  8.30.1, binario y checksum fijados. No bloquea hasta revisar falsos positivos
  y establecer un proceso de rotación.
- El typecheck cubre el servidor y las pruebas. El cliente legacy se incorpora
  cuando sus scripts globales se migren a módulos tipables.
- `no-unused-vars` permanece desactivado por helpers legacy intencionalmente
  inactivos. Se vuelve obligatorio durante la migración de retos a paquetes.
- Los scripts clásicos de `client/public` conservan excepciones acotadas para
  declaraciones en `case`, miembros duplicados y asignaciones heredadas; lint
  sigue validando sintaxis y globals conocidos (`THREE` e `io`).
- El aviso de chunk Vite mayor de 500 kB queda visible pero no bloquea; dividir
  bundles pertenece a una fase de frontend con medición propia.

Convertir cualquiera de estos controles en obligatorio requiere primero dejar
la rama base verde y actualizar este documento en el mismo PR.

## Rollback

Este cambio no migra datos ni contratos. El rollback consiste en revertir el
commit de CI: elimina workflows, configuración y pruebas, y restaura el arranque
directo del servidor. Los endpoints y el artefacto de producción no cambian.
