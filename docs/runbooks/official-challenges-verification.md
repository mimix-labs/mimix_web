# Verificación de retos oficiales — 2026-10-05

Alcance: prompt 09, base `8a28e37`, rama
`refactor/challenges-package-migration`. Sin campañas, rediseño, merge ni prompt 10.
Diseño e inventario previo: [spec](../superpowers/specs/2026-10-05-official-challenges-design.md).
Frontera de confianza y rollback: [arquitectura](../architecture/official-challenges.md).

## Evidencia de comportamiento

Antes de modificar las vistas se capturaron Matemáticas/Pirámide y Ciencias/Mg,
12 protones, 12 neutrones, 11 electrones, carga +1. La comparación final ejecuta
legacy y paquete con el mismo viewport 1280×800, gestos y transporte sensorial.
Se inspeccionaron visualmente las cuatro capturas: distribución, textos, controles
y geometría se conservan; las diferencias de frame corresponden a animaciones.
Las pruebas generan de nuevo las capturas en `client/test-results`.

- Matemáticas: cubo 8 vértices, octaedro 6, prisma 12 y pirámide 5; igualdad de
  geometría entre legacy/paquete, arrastre de un vértice proyectado, órbita con
  puño, diálogo y efectos SDK. Conserva evento diagnóstico `lenvantarceja` por
  cambio real; se eliminan strings redundantes de construcción/arrastre.
- Ciencias: 118 elementos, click/pinch, Mg, H y Og; electrones y carga, límites
  −3/+3, nunca electrones negativos, rotación y regreso. Sin eventos pedagógicos
  inventados.
- Rutas originales, query `vision`, ayuda, navegación Jetson y rollback se
  comprueban en navegador. Cámara denegada deja la vista/ayuda operativas.
- Vídeo real de `canvas.captureStream` 640×480 pasa por el host y loop CPU real;
  se simula únicamente el decodificador MediaPipe y el transporte externo.
  Se verifican constraints, dimensiones del vídeo, cierre del tracker, tracks,
  SSE y renderers; permisos que resuelven tarde no reactivan la vista.

## RED → GREEN y revisión independiente

Contratos de paquetes y lifecycle fallaron primero por módulos ausentes; luego
pasaron con manifests, factory y hooks implementados. La migración de rutas se
comprobó contra el baseline antes de darla por terminada.

La revisión independiente encontró tres P2, reproducidos antes de corregir:

1. `pagehide` destruía la vista incluso para BFCache. `pageshow.persisted` ahora
   recarga un documento con lifecycle nuevo; regresiones en ambos retos.
2. Ciencias conservaba listeners tras dispose. Ahora cancela listeners y exige
   lifecycle running; pulsar Mg después de dispose es seguro.
3. Fallar al crear un preview posterior dejaba RAF/renderers anteriores vivos.
   Una prueba de fallo de asignación WebGL verifica su liberación y propagación
   del error.

Veredicto final del revisor: sin hallazgos pendientes en el alcance inspeccionado;
reproducción Node de Ciencias segura, 5/5 contratos y 2/2 manifests CLI válidos.
La prueba BFCache dispara eventos persisted: no certifica que el motor decida
almacenar esta página en BFCache en un dispositivo concreto.

Un fallo del fixture WebKit se aisló hasta observar `getUserMedia` nativo tras
sustituirlo en una instancia de MediaDevices. El fixture sustituye ahora el método
en el prototipo; mantiene las mismas aserciones de vídeo/tracking/cleanup. No se
omitieron motores ni se relajaron assertions.

## Resultados locales

| Verificación | Resultado |
|---|---|
| Instalación frozen | Correcta |
| `pnpm check` | 23/23 tareas; 80/80 pruebas |
| Build | 8/8 tareas |
| CLI de manifests con entrypoint construido | 2/2 |
| Runtime aislado (3 motores) | 63/63 |
| Regresiones de timeout, 3 repeticiones/motor, 2 CPU | 18/18 |
| Mensajes hostiles, 3 repeticiones/motor, 2 CPU | 45/45 |
| Retos oficiales (3 motores) | 51/51 |
| Matriz completa serial, dos pasadas consecutivas | 114/114 en cada pasada |
| Preflight WebGL local | 3/3 motores |
| Producción con paquetes / build legacy | 2/2 en cada modo |
| PostgreSQL desechable | 9/9 |
| Build Docker y smoke Nest/Express/SQL | Correcto; 5/5 |
| Navegador contra imagen Docker configurada | 2/2 |

Una ejecución concurrente inicial falló al guardar una traza porque producción y
la matriz usaban la misma salida Playwright. Se separó la salida de producción;
la matriz oficial completa posterior pasó 51/51. No fue un fallo de assertions
ni se añadió retry para ocultarlo.

El primer CI falló en `mount` de dos pruebas de timeout del sandbox, antes del
hook/operación objetivo. La comparación controlada con `taskset -c 0,1` reprodujo
el fallo tanto en paralelo como en serie: 150 ms de reloj real durante la carga
resultan frágiles con CPU limitada. Serializar por sí solo no lo resuelve.

Las dos regresiones usan ahora el reloj de Playwright pausado durante la carga,
sin modificar el runtime ni sus 150 ms. Primero confirman que empezó el hook o
adaptador; a los 149 ms verifican que aún no expiró, y al avanzar 1 ms adicional
exigen el mismo error, cancelación y estado final que antes. Los demás tests de
carga/handshake mantienen reloj real. El comando raíz ejecuta las suites en serie
para evitar competencia entre las escenas WebGL y el sandbox; no hay retries.

La matriz bajo dos CPU también reveló una carrera de la prueba hostil: el rechazo
correcto retiraba el iframe antes del retorno de `frame.evaluate`. El test instala
el envío en el hijo y lo dispara desde el padre, que permanece vivo; conserva los
cinco payloads, MessagePort real y asserts de error, cero efectos no autorizados
y retirada del iframe. No captura ni ignora la excepción. Revisión independiente
adicional: ambos ajustes conservan las condiciones probadas, sin hallazgos.

Las dos matrices completas consecutivas pasan con la afinidad normal del equipo.
Las pasadas completas limitadas a dos CPU dieron 63/63 runtime y 50/51 cliente:
trazas de Chromium muestran imports locales cancelados con `ERR_NETWORK_CHANGED`
antes de montar el reto. No se modificaron assertions ni se añadieron retries para
estos fallos del entorno. Las regresiones específicas de timeout y ataques sí
pasan bajo dos CPU (18/18 y 45/45).

CI hace un preflight de WebGL con los mismos motores y argumentos, emite logs
continuos y conserva trazas/capturas como artefacto. `--max-failures=1` interrumpe
con estado fallido para diagnóstico; una ejecución verde debe pasar toda la matriz.

Regresión reproducible en Linux, adaptando los índices a las CPU disponibles:

```bash
taskset -c 0,1 pnpm --filter @mimix/challenge-runtime test:browser --grep 'a hanging hook|operation timeout aborts' --repeat-each=3
taskset -c 0,1 pnpm --filter @mimix/challenge-runtime test:browser --grep 'host rejects .* messages' --repeat-each=3
pnpm test:browser
pnpm test:browser
```


## Comandos reproducibles

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm --filter @mimix/challenge-runtime exec playwright install --with-deps chromium firefox webkit
pnpm test:browser
pnpm --filter mimix-client test:deployment
node packages/challenge-sdk/dist/cli.js packages/challenge-mathematics/dist/manifest.json
node packages/challenge-sdk/dist/cli.js packages/challenge-science/dist/manifest.json
# Base PostgreSQL desechable; nunca ejecutar contra datos reales.
MIMIX_TEST_DATABASE_URL=postgres://... pnpm --filter @mimix/api test:postgres
docker build -t mimix:ci .
node --test test/smoke/container.test.js test/smoke/postgres-container.test.js
# Rollback global por build, además del rollback por URL probado arriba.
VITE_MIMIX_CHALLENGES_MODE=legacy pnpm build
MIMIX_TEST_CHALLENGES_MODE=legacy pnpm --filter mimix-client test:deployment
pnpm build
```

Para probar la imagen ya iniciada en vez de Vite preview, pasar
`MIMIX_TEST_BASE_URL=http://127.0.0.1:PUERTO` a `test:deployment`.
Configurar también `MIMIX_ALLOWED_ORIGINS` en el contenedor con ese origen: la
política existente rechaza assets con Origin no autorizado (403), como se observó
en la primera prueba con un puerto aleatorio sin configurar. Con origen explícito
ambas rutas y sus rollbacks pasan 2/2.
El flag de rollback participa en la caché Turbo y también es ARG de Docker.
El runtime sandbox anterior y los scripts legacy se conservan.

## Límites y deuda explícita

Los paquetes oficiales se ejecutan en un host first-party confiable, no en el
sandbox opaco. No se cambian CSP, permisos ni protocolo del runtime aislado. No
cargar terceros mediante este host. Camera/hand-tracking siguen siendo propiedad
del host durante la transición; `handleHands` es su extensión local tipada.

No se dispone de webcam física, robot Jetson ni audio real en estas pruebas.
MediaPipe/modelos, fuentes y assets legacy remotos aún dependen de red; no se
promete funcionamiento offline. Three 0.128 permanece fijado para preservar
geometría y loader existentes. La escena principal se pausa; previews decorativos
permanecen animados hasta dispose, como la vista anterior.

Este Linux necesitó bibliotecas de navegador extraídas temporalmente fuera del
repo (libevent/libmanette/libhidapi) y `--env-mode=loose` solo en la verificación
local para pasar sus rutas. CI instala dependencias oficiales con `--with-deps`.
