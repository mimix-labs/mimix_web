# Verificación del Challenge Runtime — 2026-10-04

## Base y alcance

Rama `feat/challenge-sandbox-runtime`, desde `288991a` de `origin/main`, merge del
PR #8. [Diseño previo](../superpowers/specs/2026-10-04-challenge-runtime-design.md)
y [contrato operativo](../architecture/challenge-runtime.md). Implementación
aditiva y harness de desarrollo; ningún reto real ni interfaz de producto migrado.

## Evidencia local

Node 22.23.2, pnpm 10.34.6, Playwright 1.63.0. Dependencias congeladas; el lockfile
solo agrega el workspace runtime y Playwright, sin actualizar paquetes existentes.

| Comprobación | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK |
| `pnpm check` | 17/17 tareas; lint, tipos, 74 tests más 1 smoke de producción |
| `pnpm build` | 5/5 tareas; build completo también ejecutado sin caché dentro de Docker |
| `pnpm test:smoke` | 1/1 |
| Política/protocolo runtime | 3/3 tests node:test; tipos públicos y direcciones del bridge verificados |
| Chromium 153.0.8010.12, revisión 1243 | 21/21 |
| Firefox 155.0, revisión 1543 | 21/21 |
| WebKit 26.6, revisión 2359 | 21/21 |
| `docker build --tag mimix:challenge-runtime .` | OK |
| Smoke Docker Nest/Express y PostgreSQL | 5/5; persistencia y backup/restore |

La matriz original de 19×3 queda en **57/57**. Dos regresiones de revisión por
engine amplían el resultado final a **63/63**, sin skips. Prueban fixture SDK,
lifecycle, carga, errores, cancelación, grants/revocación, límites, replay,
source/origen/sesión/versión/esquemas, aislamiento DOM/storage/CSP y navegación.
WebKit de Playwright no certifica Safari/iOS ni dispositivos reales.

### Entorno WebKit local

Ubuntu 26.04 carecía de `libevent-2.1.so.7`, `libmanette-0.2.so.0` y
`libhidapi-hidraw.so.0`. Se descargaron sus paquetes con apt y se extrajeron en
`/tmp/mimix-runtime-webkit-libs`, sin sudo ni cambios al sistema. Se copió el
WebKit fijado por Playwright a ese directorio y sus bibliotecas a los directorios
`minibrowser-{wpe,gtk}/sys/lib`, porque el launcher reemplaza LD_LIBRARY_PATH.

Chromium/Firefox pasaron con `pnpm test:browser`. Turbo filtra las variables de
entorno locales y ese intento volvió a lanzar el WebKit original sin bibliotecas;
no se contabiliza como éxito. WebKit completo se verificó directamente con:

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/mimix-runtime-webkit-libs \
LD_LIBRARY_PATH=/tmp/mimix-runtime-webkit-libs/root/usr/lib/x86_64-linux-gnu \
pnpm --filter @mimix/challenge-runtime exec playwright test --project=webkit
```

En CI Ubuntu se ejecuta `playwright install --with-deps chromium firefox webkit`
y la matriz raíz completa en el job obligatorio `Challenge runtime browsers`.
No hay bypass, skips ni dependencia de rutas temporales locales en el repositorio.
WebKit devuelve cookie vacía donde otros engines lanzan SecurityError; la prueba
verifica que no lee una cookie secreta preparada por el host, admitiendo ambos
mecanismos. La prueba de red cuenta peticiones recibidas por el servidor, no los
eventos de intento de Playwright que también se emiten con CSP bloqueando.

## TDD y revisión independiente

- Política: 3 fallos RED antes de implementación, después 3 GREEN.
- Fixture browser: fallo RED por export mount ausente antes de implementar host.
- Cancelación desde observador: se reprodujo ejecución indebida del adaptador;
  se revalida estado/grant/operación después de emitir telemetría, antes de ejecutar.
- Tipos: `@ts-expect-error` inicialmente sin efecto mostró discriminante ensanchado
  entre ack/result; helper genérico conserva dirección y ahora las negativas compilan.
- Revisor independiente leyó diff completo, fuentes, contratos, harness, build,
  Docker, CI y documentación; ejecutó 3 tests de política y dos reproducciones.
  Encontró dos P2, ambos corregidos con regresiones RED→GREEN:
  1. Error durante evaluación antes de conectar se perdía. Se retiene fault,
     aborta contexto y rechaza ready sin invocar initialize al conectar.
  2. HTTP no-loopback fallaba por randomUUID disponible solo en contexto seguro.
     Se generan 16 bytes con getRandomValues, conservando sesión hexadecimal aleatoria.
- Segunda revisión de esas correcciones: aprobada, sin nuevos hallazgos. La matriz
  final prueba ambas regresiones en los tres engines.

Lint detectó inicializaciones redundantes en pruebas; se retiraron. Las advertencias
existentes del bundle cliente >500 kB y script opcional @scarf/scarf ignorado no
impiden los gates; no se habilitaron scripts adicionales.

## Riesgos, rollback y handoff

No se promete aislamiento duro de CPU/memoria, perímetro universal de red/WebRTC,
cleanup de código hostil tras cancelación ni reversión de efectos de adaptadores.
Una navegación propia puede emitir una petición antes de invalidar su autoridad.
Los adaptadores de confianza deben autorizar usuario/intento/lease, respetar señal
AbortSignal y conservar idempotencia. El harness no conecta servicios reales.

No hay migraciones SQL ni variables/secretos nuevos. Rollback: revertir este PR y
restaurar imagen anterior, conservando datos PostgreSQL. No se copian harness/tests
al contenedor de producción. Compatibilidad v1 del SDK y retos actuales preservada.

Un único PR hacia main; comprobar su commit final en GitHub antes de merge. CI
vuelve a verificar instalación, lint/tipos/tests, PostgreSQL, build, smoke/Docker
y matriz de tres engines. Auditorías de dependencias/secretos siguen informativas
por configuración existente. El usuario decide el merge; prompt 09 queda fuera
hasta nueva instrucción después de la integración.
