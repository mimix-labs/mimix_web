# Workspace pnpm y Turborepo

## Alcance

La fundación backend agrega ahora `apps/api` (Nest/Fastify). El diseño de la
conversión original se conserva abajo como antecedente; scripts y runtime
actuales se describen en el [runbook API](runbooks/api-foundation.md).

La migración original de Fase 0 convirtió las tres instalaciones npm en un workspace pnpm 10.34.6,
con Turborepo 2.11.7 para orquestar tareas. `client/` sigue siendo Vite y
`server/` sigue siendo Express; no cambia código de producto, rutas ni contratos.
No se crean todavía `apps/` o `packages/`: se evita mover los imports relativos,
los assets de retos y la ruta `client/dist` que Express sirve en producción.

## Instalación y migración local

Usa Node.js 22 y ejecuta desde la raíz:

```bash
npm install --global pnpm@10.34.6
pnpm install --frozen-lockfile
pnpm dev
```

Al actualizar un checkout instalado con npm, elimina únicamente sus directorios
regenerables `node_modules`, `client/node_modules` y `server/node_modules` antes
de instalar con pnpm. Conserva `.env`, assets y cualquier archivo manual.
No ejecutes `npm install` en el repositorio: recrearía lockfiles competidores.

El lockfile se importó combinando previamente los inventarios de los tres
`package-lock.json`: `pnpm import` toma preferencias del lockfile raíz, por lo
que importarlo sin consolidar permite actualizar accidentalmente los hijos.
Se verificaron las 17 versiones directas y el conjunto de versiones transitivas
contra los lockfiles anteriores: todas se conservan. Los rangos originales
tampoco cambian; Turbo es la única nueva dependencia directa. Los scripts de instalación de dependencias están limitados
a `esbuild`, necesario para Vite.

## Comandos

| Comando desde raíz | Efecto |
| --- | --- |
| `pnpm dev` | Vite y Nest/Fastify en paralelo; tareas persistentes sin caché. |
| `pnpm client` / `pnpm server` | Desarrollo de un proceso, compatible con el flujo anterior. |
| `pnpm build` | Build Vite y API; Turbo guarda `client/dist` y `apps/api/dist`. |
| `pnpm start` | API compilada con el frontend; runtime Nest o rollback Express. |
| `pnpm lint` | ESLint en todo el repositorio. |
| `pnpm typecheck` | TypeScript estricto de API y checkJs legacy/pruebas. |
| `pnpm test` | Pruebas de API, shell y contratos de ambos runtimes. |
| `pnpm test:smoke` | Build requerido y smoke de producción. |
| `pnpm check` | Lint, typecheck, tests, build y smoke en un solo grafo. |
| `pnpm ci:install` | Alias de instalación congelada. |
| `pnpm install:all` | Alias de instalación del workspace. |

Los gates de raíz permanecen como tareas explícitas `//#...` y no usan caché:
leen fuentes y pruebas de ambos paquetes. Así se conserva su cobertura sin
inventar checks vacíos por paquete. La caché local del build queda en
`.turbo/cache` dentro de este checkout; `dist/**` es su salida restaurable.
`pnpm check` no necesita un build previo. Las tareas dev reciben `PORT`, `HOST`
y `MIMIX_*`; el servidor también conserva su carga local de `.env`.

## Despliegue y validación

Docker instala con lockfile congelado en dos etapas: build completo del cliente
y dependencias de producción filtradas a `mimix-server`. La imagen final copia
el store virtual junto con los enlaces de `server/node_modules`, arranca Node
sin gestor de paquetes y conserva `USER node`, `PORT` y `/api/health`.
Railway sigue usando `/Dockerfile` desde la raíz y una réplica; no hay cambios
a variables remotas ni despliegues hechos por esta migración.

CI instala pnpm desde `packageManager`, usa caché del store con `pnpm-lock.yaml`,
ejecuta los gates y construye la imagen para probar health, inicio, ambos retos y
404 para API inexistente. La auditoría de dependencias abarca el workspace y
sigue siendo informativa, igual que Gitleaks. Los límites heredados (typecheck
parcial, reglas de lint legacy y tamaño de bundle) siguen documentados en
[quality gates](quality-gates.md).

## Rollback

1. Revertir el commit de migración mediante un PR a `main`; restaura los tres
   lockfiles npm, manifests, Dockerfile, workflow y comandos anteriores juntos.
2. En local, eliminar solo los tres directorios regenerables `node_modules` del
   checkout revertido y ejecutar `npm run ci:install`.
3. Ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y
   `npm run test:smoke`.
4. En Railway, volver al despliegue/imagen anterior o desplegar el revert cuando
   lo autorice el responsable. Comprobar `/api/health`, inicio y ambos retos.

No hay datos que revertir ni secretos que rotar por este cambio. No eliminar
archivos manuales ni alterar otro worktree. La siguiente fase es el prompt 04,
solo después de fusionar este PR; este trabajo no inicia NestJS ni Next.js.

## Referencias

- [Importación de lockfiles pnpm](https://pnpm.io/cli/import).
- [Configuración de tareas Turbo](https://turborepo.dev/docs/reference/configuration).
