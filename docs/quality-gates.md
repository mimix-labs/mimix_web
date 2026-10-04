# Quality gates de Fase 0

Los gates cubren el código actual de Express y Vite. Los comandos se ejecutan
desde la raíz con Node.js 22 y pnpm 10.34.6, orquestados por Turborepo.

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
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
# O todos los gates, incluido build y smoke:
pnpm check
```

La instalación usa el único `pnpm-lock.yaml` para raíz, cliente y servidor.
`test` cubre el shell del frontend, `/api/health` y defaults seguros de rutas
críticas. `test:smoke` depende del build y comprueba la aplicación servida en
producción, Matemáticas, Ciencias y el límite `/api/*`. Los gates de raíz no
usan caché; el build de Vite almacena y restaura `client/dist`.

## Gates obligatorios

El job `Quality gates` bloquea el merge cuando falla cualquiera de estos pasos:

1. instalación congelada;
2. lint de JavaScript;
3. typecheck del servidor y los smoke tests;
4. tests smoke sin build;
5. build Vite;
6. smoke test del artefacto de producción;
7. build Docker y smoke HTTP del contenedor como usuario `node`.

La rama `main` debe protegerse en GitHub exigiendo el check `Quality gates`.
Esa configuración vive fuera del repositorio y debe activarla un administrador.

## Gates temporales e informativos

- `Dependency audit (informational)` no bloquea mientras se clasifica la deuda
  heredada. `pnpm audit` inspecciona el lockfile completo del workspace.
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

No hay migración de datos ni contratos. El rollback de pnpm/Turbo y de sus gates
se describe en [la guía del workspace](pnpm-workspace.md#rollback).
