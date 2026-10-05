# Plan de migración de retos oficiales

Spec: docs/superpowers/specs/2026-10-05-official-challenges-design.md.
Ejecución nativa con TDD y revisor independiente final. La instrucción expresa del
usuario permite continuar tras presentar inventario/diseño sin pedir aprobación.

## Global Constraints

Base 8a28e37; rama exacta refactor/challenges-package-migration. Un PR; sin merge,
prompt 10, rediseño ni campañas. SDK neutral; host sensorial temporal confiable,
sandbox v1 intacto. Preservar rutas y rollback legacy.

## Review Focus

- Cámara/modelo que resuelven después de cancelar: cerrar recursos tardíos.
- Lifecycle repetido/pausa/errores de setup: sin duplicar loops ni efectos SDK.
- Paridad gestos: espejo, tamaño viewport, pinch sostenido, carga y selección.
- Paquetes no acceden a red/robot ni falsean resultados de aprendizaje.
- Build Vite/Docker y rutas legacy conservan query vision y todos sus assets.

### Task 1: Baseline y contratos de paquetes

**Files:** tests browser/paridad; paquetes manifests/fixtures; helpers lifecycle.
**Interfaces:** createChallenge(ChallengeContext) → ChallengeLifecycle más
handleHands para el host confiable; manifest v1; importaciones ESM sin globals.
- [x] Baseline existente capturado; escribir contratos RED para paquetes ausentes.
- [x] Implementar paquetes/shared lifecycle y observar GREEN.
- [x] Commit coherente con evidence RED/GREEN.

### Task 2: Host y rutas de transición

**Files:** client/src/challenges; entradas HTML Vite; legacy HTML; build/config.
**Interfaces:** host posee camera/landmarks, sdk adapters y navegación; vista solo
procesa resultados mientras running, dispose es idempotente.
- [x] Pruebas RED de rutas paquete y rollback/paridad antes de cablear host.
- [x] Integrar host con recursos acotados y vistas conservadas.
- [x] Pruebas de errores cámara, abort tardío y fixture de gestos por reto.

### Task 3: Verificación y entrega

**Files:** CI/Docker/scripts, README, runbook de migración/paridad.
- [x] Frozen install, pnpm check/build/browser/smoke/PostgreSQL/Docker.
- [x] Revisar capturas/paridad y documentar límites de simulación/hardware.
- [x] Revisión independiente y correcciones RED→GREEN necesarias.
- Entrega: commit/push, único PR adjunto y espera de CI; sin merge ni prompt 10.

Evidencia y límites: [verificación](../../runbooks/official-challenges-verification.md).
