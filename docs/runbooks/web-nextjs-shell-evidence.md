# Evidencia — shell Next.js

Base auditada: `3e48dd170dc8c6e47a1c54d4ccd98ca37fe6be87` (`origin/main`).
Rama: `feat/web-nextjs-shell`. Fecha de trabajo: 2026-10-05 (America/Lima).

## Validación ejecutada

- Instalación congelada pnpm 10.34.6, Node 22.23.2.
- Build Turbopack Next 16.3.8, React 19.3.0, Clerk Next 7.9.11.
- `pnpm check --concurrency=2`: 56 tareas, 232 pruebas, cero fallos. Incluye lint,
  typecheck estricto, suites de paquetes/backend y smoke de producción Vite/API.
- Shell: ocho pruebas de HTTP/vistas/SSR. Clerk real verifica JWT RSA generados para
  la prueba y cookies; comprueba sesión ausente/inválida/expirada, dos usuarios,
  ausencia de token en HTML/logs, progreso y rechazo de revocación por API.
- `pnpm --filter @mimix/web test:browser`: cinco pruebas Chromium sobre standalone,
  navegación por teclado, skip link, ancho móvil de 360 px, axe WCAG A/AA sin
  infracciones detectadas en inicio/catálogo/acceso, enlaces originales y 404.
- Frontera web/Nest/PostgreSQL: dos usuarios, 51 intentos persistidos, cursor real,
  progreso derivado y autorización. Un test de integración, sin fallos.
- `pnpm --filter @mimix/api test:postgres`: 95 pruebas correctas sobre PostgreSQL
  desechable 17.6. No se usaron datos ni credenciales de producción.
- `pnpm web`: Turbopack dev, `/healthz` y `/catalogo` responden 200.
- Docker standalone: build y smoke final correctos. Comprueba health, usuario
  no-root, rutas públicas, activos JavaScript y redirección de cuenta sin sesión
  conservando el origen externo con puerto publicado dinámicamente.

## Bundle y revisión visual

Build Vite de base y rollback: world 643.16 kB / gzip 167.25; host 653.82 kB /
gzip 171.20. Advertencia existente de chunks >500 kB. No cambió `client/`.

Shell sin Clerk habilitado: nueve scripts solicitados, 187,640 bytes gzip medidos
sobre sus cuerpos en cada ruta pública; presupuesto de prueba <350,000 bytes.
No solicita modelos GLB, Draco ni MediaPipe. Esta cifra agrega scripts del shell y
no es una comparación equivalente con un chunk individual de Vite. Clerk externo
habilitado añade sus propios scripts, no incluidos en esta medición.

Se inspeccionaron capturas del loading Vite y catálogo móvil; el shell conserva los
colores y el lenguaje funcional existentes. Screenshots/traces de navegador se
producen en `apps/web/test-results` y el job CI los publica como artefactos.
La prueba automática de axe no sustituye una auditoría de accesibilidad completa
ni cubre widgets Clerk remotos o el canvas heredado.

## Fallos encontrados y resolución

- Build Vite directo sin dependencias compiladas: usar el build ordenado de Turbo.
- Docker local carece de BuildKit: el Dockerfile del shell funciona sin mounts de
  BuildKit, conservando cache de dependencias mediante capas de manifests.
- Revisión independiente detectó que start imponía puerto/interfaz y que faltaban
  pruebas de Clerk/SSR. Se respetan ahora PORT/HOSTNAME; la prueba autenticada usa
  un puerto efímero y atraviesa el proxy y las páginas reales.
- Esa prueba reprodujo Next #94745: reescritura interna sobre IP convertida a
  localhost entraba en bucle. `skipProxyUrlNormalize` conserva el origen. Las
  redirecciones anónimas salen temprano; cada recurso además valida sesión.
- Dos ejecuciones de `pnpm check` con concurrencia por defecto alcanzaron timeouts
  en `nest entrypoint respects PORT and exits with active SSE on SIGTERM` y
  `voice HTTP logs omit keys, tokens, subtitles, query values and upstream failures`.
  Las cuatro pruebas de esos archivos pasan aisladas; el gate entero pasa con
  `--concurrency=2`. No se ampliaron deadlines ni se modificó el backend para ocultarlo.

## Límites y handoff

OAuth Google real y configuración de Dashboard requieren una instancia externa y
siguen el checklist del runbook. No se afirma que se probaron con usuarios reales.
No se cambió routing productivo, Railway, Compose edge, datos ni mundo Three.js.
No se hizo merge ni se inició prompt 21. El siguiente PR debe partir del merge de
este shell y abordar `/play`/runtime compartido con su propia evidencia de paridad.
