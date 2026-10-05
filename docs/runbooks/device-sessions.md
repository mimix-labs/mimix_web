# Operación de pairing y sesiones de dispositivo

## Activación y migración

Partir del despliegue Clerk + PostgreSQL del [runbook de learning](learning-event-store.md).
Usar TLS en el endpoint y desactivar cualquier registro de headers/cuerpos en el
proxy. El usuario autenticado y el robot usan clientes distintos. No copiar el JWT
Clerk al robot ni entregar al navegador tokens bridge/control para este flujo.

1. Con el flag apagado, respaldar PostgreSQL y ejecutar la migración idempotente:
   `pnpm --filter @mimix/api db:migrate` (con `DATABASE_URL` del migrador).
2. La migración `0004_device-sessions.sql` agrega `device_pairings`,
   `device_sessions`, `device_audit`, índices y trigger append-only. No transforma
   datos de learning ni invalida tokens heredados.
3. El rol runtime necesita SELECT/INSERT/UPDATE en pairings/sessions,
   SELECT/INSERT en audit y USAGE en `device_audit_id_seq`, además de permisos
   existentes de identidad/learning. El propietario de tablas/migrador debe ser
   distinto del rol runtime. Conceder estos permisos si no hay default privileges.
4. Configurar `MIMIX_AUTH_MODE=clerk`, `MIMIX_DATA_STORE=postgres`,
   `MIMIX_DEVICE_SESSIONS_ENABLED=true`, `DATABASE_URL`, Clerk/orígenes existentes y
   `MIMIX_DEVICE_TOKEN_KEY`: 32 bytes generados con CSPRNG y codificados base64url
   canónico sin padding (43 caracteres), guardados en el gestor de secretos. Usar la
   misma clave en todas las réplicas; nunca incluirla en frontend, robot, Git o logs.
   El arranque con feature activada rechaza una clave ausente o mal formada.
   Reiniciar todas las réplicas. Revisar `/api/openapi.json`: publica contratos y
   credenciales por ruta. `MIMIX_API_RUNTIME=express` conserva las mismas garantías.
5. Verificar un ciclo completo con un usuario de prueba: pairing, heartbeat,
   autorización, revocación y rechazo posterior. No hay UI de pairing en esta fase.

## Ejemplo de intercambio en dos clientes

Ejecutar este ejemplo en un proceso Node local del robot. Muestra solo el challenge;
el verifier permanece en su memoria. Mantener ese proceso abierto hasta el canje.

```js
const { randomBytes, createHash } = await import('node:crypto')
const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('hex')
console.log(challenge)
```

En el cliente del usuario, obtener el challenge por un canal local confiable y llamar
con el JWT de ese usuario, nunca con credenciales del robot:

```http
POST /api/devices/pairings
Authorization: Bearer <JWT del usuario>
Content-Type: application/json

{"schemaVersion":1,"challenge":"<SHA256 hex del robot>","capabilities":["presence:heartbeat","behavior:stop"]}
```

La respuesta 201 contiene `id`, `code`, `createdAt`, `expiresAt`. Transferir únicamente
`id` y `code` al robot. En el mismo proceso Node del robot, definir `api` con el origen
HTTPS del despliegue, `pairingId` y `code` recibidos, y efectuar:

```js
const exchanged = await fetch(`${api}/api/devices/exchange`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ schemaVersion: 1, pairingId, code, verifier,
    capabilities: { schemaVersion: 1, deviceId: 'local-label', behaviors: ['stop'],
      camera: [], handLandmarks: false, speech: false } }),
})
if (exchanged.status !== 201) throw new Error(`Pairing rejected: ${exchanged.status}`)
const { token, session } = await exchanged.json() // no imprimir token
const heartbeat = await fetch(`${api}/api/devices/heartbeat`, {
  method: 'POST', headers: { authorization: `Device ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ schemaVersion: 1, sequence: 1 }),
})
if (!heartbeat.ok) throw new Error(`Heartbeat rejected: ${heartbeat.status}`)
```

El cliente de usuario puede consultar sus sesiones con `GET /api/devices/sessions`
y comprobar `behavior:stop` con `POST /api/devices/sessions/:id/authorize` y cuerpo
`{"schemaVersion":1,"capability":"behavior:stop"}`. La misma sesión Clerk que aprobó
el challenge debe autorizar. Esto no ejecuta un movimiento. Revocar con
`DELETE /api/devices/sessions/:id`; el siguiente heartbeat debe devolver 401.

## Clave de admisión y rotación

El token devuelto ahora contiene `nonce.firma` (87 caracteres); el robot debe
tratarlo como opaco. La firma permite rechazar tokens aleatorios antes de acceder
a PostgreSQL, sin cargar sesiones válidas a la cuota compartida del proxy. La
autoridad, expiración y revocación siguen verificándose en SQL en cada operación.
Tokens de la implementación previa, sin firma, requieren nuevo pairing. No hay
cambio de esquema ni re-firma automática de credenciales anteriores.

Mantener la clave estable a través de reinicios. Para rotarla, apagar la feature
en todas las réplicas, sustituir la clave por otra aleatoria y reactivarla de forma
coordinada. La rotación invalida inmediatamente todos los tokens anteriores;
revocar las sesiones anteriores o esperar 30 s de ausencia de heartbeat para
liberar sus slots antes de repetir pairing. Evitar mezclar claves en un despliegue
gradual: causaría rechazos intermitentes. No hay keyring ni período de gracia.
Los tokens firmados históricos pueden gastar su cuota acotada de lookup hasta
rotar la clave; nunca recuperan autoridad caducada o revocada.

## Recuperación y diagnóstico

- Enviar heartbeat cada 10 s, con la siguiente secuencia recibida. Tras perder una
  respuesta, consultar `GET /api/devices/self` con el token y usar `nextSequence`;
  no reiniciar la secuencia. 409 no refresca presencia.
- Código robado sin verifier: canje 401, cinco pruebas incorrectas bloquean el
  pairing. Cancelar desde el usuario con `DELETE /api/devices/pairings/:id` y
  repetir la ceremonia con secreto/challenge nuevos.
- Respuesta de canje perdida: no se vuelve a entregar el token. El usuario puede
  identificar/revocar la sesión por listado/auditoría; repetir pairing. No reusar código.
- Desconexión voluntaria: `POST /api/devices/disconnect` usa la siguiente secuencia.
  Después es terminal. Ausencia de heartbeat durante 30 s o sesión de 15 min vencida
  también exige nuevo pairing. El tiempo de pared del cliente no determina TTL.
- Usuario salió de Clerk o revocó su sesión: el próximo canje/heartbeat/autorización
  verifica esa revocación. Un login nuevo del mismo usuario puede revocar, pero
  necesita nuevo pairing para autorizar. No se promete detección push inmediata.
- 401: código/prueba/token inválido, sesión terminal o login original revocado.
  403: origen o alcance/login incorrecto, o falta primer heartbeat. 404: feature
  apagada, ID ajeno o inexistente. 429: cuota HTTP o límite de sesiones/pairings.
  Cuotas HTTP incluyen `Retry-After`; límites persistentes requieren cancelar/revocar
  o esperar TTL. 503: comprobar PostgreSQL y Clerk; no usar modo abierto como fallback.
- `GET /api/devices/audit?after=<nextCursor>` devuelve historia propia sin secretos.
  No exportar códigos/tokens/verifiers a tickets ni logs. El barrido usa el reloj
  de PostgreSQL; para detectar retrasos observar filas activas con `expires_at` o
  `presence_expires_at` en el pasado. `/api/health` por sí solo no verifica el barrido.

## Rollback y backup

Para retirar la feature, revocar primero las sesiones activas con la API de cada
propietario y apagar `MIMIX_DEVICE_SESSIONS_ENABLED` en todas las réplicas. Si no es
posible revocar, mantener el flag apagado al menos 15 minutos antes de reactivarlo;
apagarlo no borra sesiones y reactivarlo antes del TTL podría readmitirlas.

La imagen anterior ignora las tablas nuevas. Conservar las tablas y la auditoría;
no ejecutar un down destructivo. Restaurar una base antigua puede restaurar tokens
que se habían revocado después del backup: mantener el flag apagado al menos 15
minutos desde la restauración con relojes correctos, y luego exigir nuevo pairing.
El TTL absoluto impide recuperar autoridad antigua. No tratar el dump como una
credencial pública: contiene hashes y metadata privada de identidad.

## Evidencia reproducible

```bash
pnpm install --frozen-lockfile
pnpm check
# PostgreSQL descartable con CREATEDB; fixtures crean y destruyen bases aisladas.
MIMIX_TEST_DATABASE_URL='<URL de pruebas>' pnpm --filter @mimix/api test:postgres
docker build --tag mimix:prompt15 .
MIMIX_TEST_IMAGE=mimix:prompt15 node --test test/smoke/container.test.js test/smoke/postgres-container.test.js
```

Pruebas: robo de código, cinco intentos, canje concurrente, autorización por
usuario/login/capability, replay de heartbeat, revocación concurrente, desconexión,
TTL, caída/revocación de identidad, reinicio del servicio, auditoría inmutable y
paginación con commit retrasado, cuotas aisladas detrás del mismo proxy, paridad
Nest/Express, flag apagado, CORS, headers y límites de cuerpo. La revisión independiente
detectó y se corrigieron aislamiento de cuotas, orden de commit de auditoría y
registro de replay del canje. Estas pruebas no validan hardware ni un tenant Clerk real.

Pendiente para fases posteriores: cliente de pairing, transporte de sesión, conexión
al lease de embodiment y autorización en el punto de despacho físico. El simulador
HTTP/SSE de fase 14 conserva sus credenciales heredadas; no se presenta como cliente
automático del nuevo pairing. Sin UI definitiva, MQTT, WebRTC ni cambios a `mimix_robot`.

Validación local de esta entrega (2026-10-05): instalación congelada, `pnpm check`
(47 tareas), PostgreSQL (44 pruebas), snapshot Drizzle sin drift, imagen Docker
amd64 y cinco smoke tests de contenedor/restore correctos. Revisión independiente:
24/24 pruebas de dispositivos y tres hallazgos corregidos con regresiones RED→GREEN.

También pasaron 63 pruebas del runtime en Chromium/Firefox/WebKit, 51 del cliente
y dos de rutas de producción. WebKit usó las librerías aisladas ya disponibles en
el entorno local; no se instalaron dependencias en el sistema.

Corrección posterior de revisión: firma de admisión previa a SQL, cuota aplicada
antes del lookup y causas terminales de pairing preservadas en auditoría. Nuevas
regresiones cubren rotación de tokens inválidos, ráfagas concurrentes, réplicas frías,
firma manipulada, aliases base64, clave distinta y estados terminales.

Validación de esta corrección: 6 pruebas focales de firma/admisión/configuración,
49 pruebas PostgreSQL (29 de dispositivos), revisión independiente sin bloqueantes
y `pnpm check` (47 tareas). Las pruebas Docker/navegador anteriores corresponden
a la entrega inicial; en esta corrección se repitieron las suites API y PostgreSQL.
