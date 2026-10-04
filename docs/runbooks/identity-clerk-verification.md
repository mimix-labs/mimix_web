# Evidencia del prompt 05 — 2026-10-04

Base remota verificada: `e60d461998deabc1e89445897fc56a83b2bcc064` (PR #5 fusionado).
Rama: `feat/identity-clerk-google`. Node 22.23.2, pnpm 10.34.6, Docker 29.1.3.

## Evidencia inicial (commit 383ed51)

- `pnpm install --frozen-lockfile`: exit 0; lockfile consistente.
- `pnpm lint`: exit 0, sin warnings ESLint.
- `pnpm typecheck`: exit 0, TypeScript estricto API y checkJs legacy/tests.
- `pnpm test`: exit 0; 12 pruebas raíz, 29 API y 5 contratos Nest (46 total).
- `pnpm build`: exit 0, API y cliente; warning preexistente Vite por chunk >500 kB.
- `pnpm test:smoke`: exit 0, 1 prueba producción.
- `pnpm check`: exit 0, 8 tareas; repite todos los gates anteriores (47 pruebas).
- `docker build --tag mimix:identity-clerk .`: exit 0; imagen final `e739d3b74157`, reconstruida después del arreglo de revisión.
- `MIMIX_TEST_IMAGE=mimix:identity-clerk node --test test/smoke/container.test.js`: 4/4, Nest/Express en legacy y Clerk.
- Total: 47 pruebas de `pnpm check` + 4 Docker = 51.
- `git diff --check`: sin errores.

## TDD y revisión

Las pruebas iniciales HTTP fallaron por /me inexistente, falta de rechazo/CORS/límite
y configuración incompleta. Tras reconciliar implementaciones concurrentes se
conservó una política compartida, los contratos con emisor y las pruebas RSA.

Regresiones RED → GREEN verificadas:

- `expireAt` real del SDK es número: falló `getTime is not a function`, se corrigió
  comparación numérica; fixtures reflejan el SDK.
- UUID de identidad externa duplicado en snapshot: faltaba rechazo; ahora no se carga.
- Lanzador directo legacy con modo Clerk: aceptaba configuración sin política;
  ahora exige entrypoint protegido.
- OpenAPI del modo estricto: faltaba declarar Bearer/bridge/control; ahora coincide
  con permisos efectivos y documenta 429.
- **Revisión independiente:** identificó bypass crítico de autenticación y límite
  mediante request-target absoluto en ambos runtimes. Prueba `node:http` devolvió
  200 sin credenciales; la política ahora rechaza ese formato con 400 antes de
  clasificar rutas públicas. Regresión GET estado y POST eventos en ambos runtimes,
  suite security 7/7 y después `pnpm check` completo verde. No hubo otros hallazgos
  Critical/Important/Minor. El veredicto original del revisor requería ese arreglo;
  el autor verificó la corrección con RED/GREEN, sin fingir una segunda aprobación.

## Corrección de cuotas por actor y ruta

El límite global por IP permitía que tráfico desconocido agotara la cuota de
usuarios y máquinas detrás del proxy; además, rechazaba el frame 1201 de la
telemetría de 30 FPS. Se sustituyó por pools independientes, sujeto firmado/ruta
para usuarios, rol/ruta para máquinas y cuotas separadas para tráfico anónimo.
Landmarks dispone de 3600/min por defecto. La consulta de sesión revocable ocurre
después de la cuota del sujeto y antes del mapeo de identidad.

- TDD: las nueve regresiones iniciales fallaron, incluyendo bloqueo por tráfico
  anónimo y frame 1201 en Nest/Express, legacy/Clerk; pasaron tras el arreglo.
- Suite nueva: 11/11, incluidos 2160 frames por combinación de runtime/modo,
  rotación de token/sesión, rutas canónicas, X-Forwarded-For no fiable, aislamiento
  al llenar el pool anónimo, expiración de ventanas y OpenAPI/configuración.
- La revisión independiente encontró otro P1: OPTIONS compartía cuota de IP y
  podía impedir el preflight autenticado. Regresión HTTP 2/2 RED → GREEN; ahora
  los preflights de origen, ruta, método y headers permitidos están exentos.
  Los desconocidos/malformados conservan su cuota anónima. El revisor ejecutó
  nuevamente ambas regresiones y cerró sin Critical, Important ni Minor pendientes.
- Verificación final tras ese arreglo: `pnpm install --frozen-lockfile` exit 0 y
  `pnpm check` exit 0, 8/8 tareas. Son 12 pruebas raíz + 40 API + 5 contratos Nest
  + 1 smoke de producción = 58. Incluye lint, typecheck y builds requeridos.
- Docker reconstruido: `mimix:identity-clerk`, imagen `7164856c6af1`; smoke 4/4
  (Nest/Express, legacy/Clerk), con aislamiento de cuotas y preflight en modo Clerk.
- Total final: **62 pruebas**; `git diff --check` sin errores.

Los límites son por proceso y requieren una réplica. Anónimos tras el mismo proxy
comparten cuota de su clase/ruta. Health y preflights válidos requieren protección
volumétrica en ingress; verificar la firma/JWKS antes de identificar al sujeto
también tiene coste. La consulta BAPI de sesión sí queda limitada por sujeto/ruta.

## Límites de la evidencia y decisiones

No se verificó OAuth Google/Dashboard real: necesita instancia de desarrollo y
credenciales externas. Queda checklist reproducible en el runbook. Tampoco se
midieron ingress Railway, carga BAPI, telemetría Jetson ni restauración destructiva
de volumen. Antes de activar Clerk, comprobar estos puntos operativos.

Se conserva un único escritor/volumen; multiinstancia no está soportada. PostgreSQL,
autorización de progreso por usuario/intento y DeviceSession/grants pertenecen a
fases siguientes. Frontend autenticado queda fuera de este PR; activar el flag sin
actualizar consumidores provoca 401/503 en llamadas antiguas, por diseño.

`pnpm audit --json` informativo: 12 advisories (5 high, 6 moderate, 1 low), todos
con rutas de dependencias existentes de Vite/Tailwind o Express; ninguno en Clerk.
No se actualiza deuda ajena al alcance. La instalación conserva el aviso existente
de script ignorado `@scarf/scarf`.
