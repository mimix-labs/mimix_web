# Campaign Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Campañas versionadas con progreso derivado y API compatible.
**Architecture:** Definiciones/asociaciones inmutables en PostgreSQL; agregación de eventos más reglas puras. Reutilizar creación atómica y append de learning.
**Tech Stack:** TypeScript, Zod, Drizzle/PostgreSQL, Nest/Fastify y Express.
**Spec:** `docs/superpowers/specs/2026-10-05-campaign-progression-design.md`

## Global Constraints

Rama feat/campaign-progression desde e593e1c; no UI ni prompt11 ni merge.
Versiones exactas y aisladas, todos los prerequisitos AND, todos los nodos requeridos.
Hasta 100 nodos; páginas de 50. Sin estado de progreso editable duplicado.
Un activo por nodo/usuario/versión; reintento ilimitado tras terminal; finalización monotónica.
Conservar contratos learning v1 y proteger claves entre contextos.

## Review Focus

- Misma clave entre intento independiente y campaña: 409 en ambos sentidos (tarea 2).
- Reintento activo después de éxito no revoca crédito ni permite segundo activo (tareas 1–2).
- Cambio de versión/reto no mezcla historial ni modifica versión anterior (tareas 1–2).
- Autorización/cuotas en rutas con ids variables, variantes de caso y query (tarea 3).
- Reconstrucción y restore conservan progreso sin depender de attempt_progress (tareas 2–3).

### Task 1: Contratos y reglas puras

**Files:** packages/contracts/src/campaign.ts, src/index.ts, test/campaign.test.js;
apps/api/src/modules/campaigns/projection.ts; apps/api/test/campaign.test.js.
**Interfaces:** produce CampaignDefinition, campaignDefinitionSchema, campaignStartSchema,
campaignPageQuerySchema y projectCampaign(definition, facts): CampaignProgress.
Facts por nodo: nodeId, attempts, completedAttempts, activeAttemptId.

- [ ] Escribir tests: DAG secuencia/diamante, ciclos, referencias ausentes, duplicados,
  límites, versiones; desbloqueo AND, sin crédito por respuesta, reintento conserva
  éxito, finalización total y nodos con mismo reto separados. Esperados literales.
- [ ] Ejecutar node --test de los archivos; comprobar RED por exports ausentes.
- [ ] Implementar schemas estrictos y proyección pura con estados locked/available/in_progress/completed, canStart, blockedBy, completedNodes/totalNodes/status.
- [ ] Compilar y ejecutar contratos/API completos; esperado PASS. Commit feat(campaigns).

### Task 2: Historial y persistencia

**Files:** database/schema.ts, migrations/0003 y metadata; learning/store.ts;
campaigns/store.ts y seed.ts; database/cli.ts; test/postgres/campaign.test.js.
**Interfaces:** consume tarea1, Database y LearningStore; produce CampaignStore con
publish(value), list(query), get(id,version), progress(user,id,version), start(user,id,version,node,input).
LearningStore.createInTransaction(tx,user,input,context?) reutiliza escritura atómica.

- [ ] Tests PostgreSQL de publicaciones inmutables, conflicto; bindings exactos y
  append-only; AND, reintento/terminal, concurrencia misma/distinta clave, aislamiento
  usuario/nodo/versión/independiente, rebuild independiente y seed CLI dos veces.
- [ ] Ejecutar con DB desechable y verificar RED antes de implementar.
- [ ] Migración aditiva + índices; helper transaccional y clave contextual; serializar
  start por usuario; agregar eventos en SQL sin leer attempt_progress; seed opt-in.
- [ ] Ejecutar suite PostgreSQL completa y suite API; esperado PASS. Commit feat(campaigns).

### Task 3: API, operación y entrega

**Files:** campaigns/{http,express,campaigns.controller,campaigns.module,openapi}.ts;
app.ts/app.module.ts, database/services.ts, security/{policy,legacy}.ts;
test/postgres/campaign-http.test.js, test/smoke/postgres-container.test.js;
docs/architecture/campaign-progression.md, docs/runbooks/campaign-progression.md, README.md.
**Interfaces:** consume CampaignStore; produce cuatro rutas autenticadas documentadas,
Nest/Express equivalentes, cache no-store, cuotas por plantilla, flag postgres existente.

- [ ] HTTP RED: 401, 400 estricto, 404 desconocido/disabled, 409 bloqueo/activo/clave,
  429 IDs variables, 503 DB, usuario aislado, OpenAPI y flujo completo ambos runtimes.
- [ ] Conectar store/rutas/política; documentar schemas de respuesta y reglas/versiones.
- [ ] Ampliar smoke real para seed/progreso de campaña persistido tras backup/restore.
- [ ] pnpm install --frozen-lockfile; pnpm check; test:postgres; Docker build y smoke.
  Esperado PASS; revisión independiente sobre rama completa, corregir con RED→GREEN.
- [ ] Commit docs/evidencia, push, PR contra main, adjuntar y esperar CI final verde.
