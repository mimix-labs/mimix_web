# Identidad interna — prompt 05

Base: `e60d461`; rama `feat/identity-clerk-google`. Alcance: API e identidad,
sin migrar frontend, introducir PostgreSQL, persistir aprendizaje o implementar
DeviceSession. Operación y rollback: [runbook](../runbooks/identity-clerk.md).

## Inventario y amenazas previo al cambio

Health/config/status, streams de navegador y POST contexto, landmarks y eventos
estaban abiertos. GET contexto y POST commands comprobaban bridge solo si había
secreto configurado. Motion exigía credenciales separadas. Amenazas: suplantación,
abuso de escrituras, JWT revocado todavía firmado, origen hostil, confusión de
credenciales, pérdida de UUID al reiniciar y lectura de estado global entre usuarios.

## Contrato y decisiones

- `IdentityProvider.authenticate(token)` devuelve proveedor, emisor, sujeto y sesión
  verificados. Clerk comprueba firma, expiración, nbf, emisor exacto, azp obligatorio,
  sujeto y sid; rechaza sesiones pendientes. Consulta `getSession` en cada petición
  y exige sesión activa, id/sujeto coincidentes y vencimiento futuro. No hay caché
  positiva de sesiones revocables. Un fallo BAPI devuelve 503 (404 de sesión: 401).
- `User.id` y `ExternalIdentity.id` son UUID v4 internos. La clave externa única es
  `(provider, issuer, subject)`; nunca email. Google pertenece a Clerk, no es el
  identificador interno. Cambiar emisor o proveedor crea un vínculo nuevo: no hay
  vinculación automática de cuentas ni migración entre instancias Clerk.
- `IdentityRepository` aísla un snapshot JSON v1 temporal. Una transacción síncrona
  lee, resuelve o crea, escribe con permisos 0600, fsync, rename y fsync de directorio.
  Conserva UUID tras concurrencia HTTP/reinicio. Datos corruptos, huérfanos o UUID
  duplicados se rechazan; no se reinicia el archivo silenciosamente. Requiere un
  solo proceso escritor y almacenamiento persistente. No es una base multiinstancia.
- `GET /api/identity/me` devuelve solo `{id, createdAt}` con `Cache-Control: no-store`.
  Primer acceso válido: alta local; otro login del mismo sujeto: mismo UUID. No se
  almacenan emails, JWT ni sessionId. Alta/login OAuth y revocación se realizan en
  Clerk; Mimix no crea una segunda contraseña ni un endpoint OAuth propio.
- Política HTTP común antes del parsing y de la delegación a Express; guard global
  Nest como segunda frontera. Un endpoint nuevo requiere entrada en la política y,
  si es controlador Nest, metadata explícita. Lo no inventariado devuelve 404,
  incluso si alguien registra un handler nuevo. HEAD hereda GET. No se autentica
  con cookies ni query string. El frontend estático es explícitamente público.
- Se conserva la política compartida al cambiar `MIMIX_API_RUNTIME=express`.
  El lanzador histórico directo de `server` rechaza modo Clerk sin política.
- CORS exacto en ambos runtimes y límite por IP/minuto antes de verificar tokens.
  No se confía en X-Forwarded-For. Mapa acotado a 10 000 IP, en memoria y por proceso.

## Acceso explícito por modo

| Método y ruta | `legacy` (default de transición) | `clerk` |
| --- | --- | --- |
| GET health, openapi.json, vision/config | Público | Público |
| GET identity/me | 401 sin Bearer; 503 con Bearer, identidad desactivada | Sesión Clerk válida |
| POST challenges/events | Público, recepción sin persistencia | Sesión Clerk válida |
| POST vision/hand-landmarks | Público | Bridge configurado |
| GET robot/context; POST robot/commands | Bridge opcional según configuración previa | Bridge configurado obligatorio |
| GET robot/motion/stream | Bridge configurado obligatorio | Bridge configurado obligatorio |
| POST robot/motion | Control válido y bridge configurado | Igual; además política común |
| POST robot/context | Público | Control de operador |
| GET vision/status, vision/stream, vision/video | Público | Control de operador |
| GET robot/commands/stream, robot/status | Público | Control de operador |
| OPTIONS API | Público, sujeto a CORS y límite | Igual |
| Cualquier otra ruta/método API | 404 | 404 |

`Bridge` = `X-Mimix-Robot-Token`; `Control` = `X-Mimix-Control-Token`.
Los dos secretos deben diferir. Un token Clerk no sustituye ninguno. Los datos de
robot/visión siguen globales y por ello solo se entregan a operadores/bridge, no a
cualquier usuario autenticado. Estos secretos temporales no equivalen a roles de
usuario: DeviceSession deberá sustituirlos con grants acotados/revocables.

El evento legacy solo valida y registra aceptación sin payload ni datos personales;
no ofrece almacenamiento ni autorización de progreso por propietario. El prompt 06
deberá usar el UUID verificado y autorizar usuario/intento antes de persistir eventos.

## Límites aceptados

El modo legacy permite las excepciones anteriores para que la web actual funcione.
Activar Clerk requiere un cliente que aporte Bearer en eventos y credencial de
operador en las rutas globales; el frontend actual no lo hace. No activar en la demo
sin completar el checklist del runbook. Streams existentes con secretos compartidos
no comprueban revocación de usuario; rotar secreto y reiniciar los cierra.

No se realizaron OAuth Google real ni cambios en Dashboard: pruebas deterministas
usan RSA real y un doble únicamente para la consulta remota de sesión. El checklist
manual de integración externa debe completarse con una instancia Clerk de prueba.
