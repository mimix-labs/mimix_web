# Evidencia — prompt 06, 2026-10-04

Base remota verificada: `da3f6f1536f57f64ba3dd59726623b1a9dd90cef` (merge PR #6).
Rama exacta `feat/learning-event-store`, creada desde origin/main con worktree limpio.
Esquema, invariantes, transacciones, índices y datos presentados antes de implementar;
diseño/plan versionados en `docs/superpowers`.

## Desarrollo y TDD

- Prueba de almacén escrita antes del código: fallo inicial por persistencia ausente.
  Sobre SQL real se observó RED al permitir UPDATE del historial; migración de
  triggers lo volvió GREEN. Otro RED probó el CHECK con payload sin `correct`:
  SQL NULL no debe permitirlo; migración 0002 lo rechaza.
- Cinco escenarios HTTP iniciales fallaron (rutas inexistentes y flag no validado).
  Tras integración, ambos runtimes conservan ownership, idempotencia, orden,
  privacidad de consultas, cuotas de plantilla y errores SQL genéricos.
- CLI ausente RED → importación/exportación/migración/rebuild GREEN, con permisos
  0600, no sobrescritura y conservación de UUID. Rol restringido inicialmente no
  podía FOR UPDATE; guía/fixture conceden UPDATE(id), manteniendo trigger inmutable.
- Suite SQL confirma carreras de 12 creaciones/reintentos, 8 escritores por
  secuencia, terminal/retry, fallo posterior a INSERT con rollback, reconstrucción
  repetida y concurrente. Usa PostgreSQL 17 desechable, sin mock de persistencia.
- Revisión independiente completa: un Important P2, Turbo filtraba DATABASE_URL.
  Test real de `pnpm exec turbo run dev --filter=@mimix/api` reprodujo RED.
  Tras añadir passThroughEnv apareció otro fallo de arranque: health 500 bajo tsx
  porque Reflector no se inyectaba sin metadata emitida. Se comprobó metadata
  undefined y se añadió @Inject(Reflector). El test terminó GREEN con health 200.
  No se atribuye una segunda aprobación del revisor a las correcciones del autor.
- El revisor ejecutó 8/8 escenarios SQL y comprobaciones adicionales de importación
  con inserción previa al conflicto, paginación privada de 51 intentos y cuerpos
  HTTP malformados/excesivos. No encontró otros hallazgos Critical/Important/Minor.

## Gates

Instalación congelada y `pnpm check` ejecutados tras corregir el arranque y alinear
Express 4.22.2 con el adaptador existente. `pnpm check`: 8 tareas, 58 pruebas
(12 raíz + 40 API + 5 contratos Nest + 1 smoke producción), lint/typecheck y builds.
Suite PostgreSQL: 9/9, incluido arranque real de desarrollo. Docker: imagen con CLI
 y migraciones; 4 escenarios previos y un escenario PostgreSQL con pg_dump/pg_restore,
reconstrucción, UUID preservado y ambas APIs protegidas. La imagen final y CI se
registran en el PR con su commit exacto. Imagen local final `ea12bcc3cd88`, 5/5
smokes Docker; total **72 pruebas locales** (58 + 9 + 5). No se ejecuta merge ni despliegue.

## Decisiones y límites

- Implementación propia y una revisión independiente al final. Los scripts de
  bookkeeping del skill no eran ejecutables (Permission denied); se mantuvo este
  registro junto al plan y commits, sin modificar permisos del entorno.
- Proyección síncrona: consistencia inmediata, bloqueo durante reconstrucción;
  un rebuild largo puede causar 503 retriable por lock_timeout. El historial queda
  intacto. Coste si se supera la escala: ventana de mantenimiento o proyección versionada.
- Catálogo/evaluación pedagógica, campañas/logros, UI y prompt07 excluidos. Reto y
  versión opacos; los hechos son informes del cliente. No prometen dominio educativo.
- Cuotas locales: una réplica. PostgreSQL sí serializa los writers, pero no reparte cuotas.
- Retención/borrado administrativo y recuperación gestionada Railway requieren
  política/ensayo antes de activar con datos reales; no se presentan como implementados.
- OAuth Google real sigue pendiente del checklist anterior; estas pruebas sustituyen
  solo al proveedor externo en HTTP, nunca a PostgreSQL.
- Audit informativo: 13 advisories (5 high, 7 moderate, 1 low). Respecto a la base,
  una ruta moderate adicional a esbuild 0.18.20 viene de drizzle-kit/esm-loader
  (herramienta de desarrollo, no incluida en imagen prod; no se usa su servidor).
  Los otros advisories son deuda previa Vite/Tailwind/Express. Warning previo de
  chunk Vite >500 KiB y script ignorado @scarf/scarf permanecen.

Handoff tras revisión/merge del usuario: prompt07 `feat/challenge-sdk-manifest`,
desde main actualizado; usar challengeId/challengeVersion y schemaVersion 1 sin
reescribir eventos anteriores. Este chat no inicia esa fase.

## Estabilidad de readiness — corrección posterior a 8d55dd8

La verificación coordinadora observó un fallo intermitente de runtime.test.js con
la suite paralela: el proceso Nest no estaba listo dentro de 100 intentos separados
por 25 ms, aunque aislado pasó cinco veces. Se extrajo la espera para reproducir
un arranque controlado de 3 segundos; el algoritmo anterior falló. También se
comprobó que una conexión aceptada sin respuesta podía dejar el sondeo pendiente.

El helper de pruebas ahora espera una respuesta HTTP completa con deadline global
de 15 segundos, cancela fetch y pausas al vencer o terminar el hijo y solo reintenta
ECONNREFUSED. Conserva código/señal de salida y diagnóstico; errores HTTP y contenido
incorrecto se comprueban una sola vez fuera del retry. No cambia código productivo.
Cuatro regresiones cubren arranque lento, salida temprana, HTTP 503 e in-flight timeout;
RED observado con el algoritmo anterior, GREEN 7/7 con runtimes reales incluidos.

Después del ajuste final de lint (preservar la causa capturada): instalación
congelada exit 0 y **tres `corepack pnpm check` completos consecutivos**, sin reducir
paralelismo ni reintentar automáticamente tests fallidos: 30.000 s, 27.389 s y
24.714 s. Cada corrida pasó 8/8 tareas y **62 pruebas** (12 raíz + 44 API + 5 contratos
Nest + 1 producción). PostgreSQL repitió 9/9; Docker build y smoke 5/5, incluido
backup/restauración y ambos runtimes. Total vigente: **76 pruebas**. La imagen
productiva no cambia por archivos exclusivos de test. CI del nuevo commit se
registra en el mismo PR #7. Sin merge ni prompt07.
