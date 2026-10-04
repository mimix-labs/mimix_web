# Operación de identidad Clerk y Google

## Variables y activación incremental

`server/.env` conserva ubicación y precedencia; Turbo propaga `CLERK_*` en dev.
Nunca usar claves secretas en Vite, imagen, argumentos CLI o repositorio.

| Variable | Contrato |
| --- | --- |
| `MIMIX_AUTH_MODE` | `legacy` por defecto; `clerk` activa identidad y permisos estrictos. |
| `MIMIX_ALLOWED_ORIGINS` | Orígenes HTTP(S) exactos separados por coma; sin ruta, comodín ni slash final. Default desarrollo: localhost:5173 y localhost:4000; producción: https://mimix-web-production.up.railway.app. Sobrescribir en otros dominios. |
| `MIMIX_RATE_LIMIT` | Default 1200/min por IP/ruta pública legacy, excepto landmarks. Se conserva la variable anterior con alcance reducido. |
| `MIMIX_RATE_LIMIT_ANONYMOUS` | Default 60/min por IP: buckets separados para desconocidas (todas juntas), credenciales inválidas (juntas), preflight inválido y cada ruta pública. |
| `MIMIX_RATE_LIMIT_USER` | Default 120/min por proveedor/emisor/sujeto verificado y ruta. |
| `MIMIX_RATE_LIMIT_MACHINE` | Default 600/min por rol autenticado (operador o bridge) y ruta; no depende de IP. |
| `MIMIX_RATE_LIMIT_LANDMARKS` | Default 3600/min para POST landmarks: por bridge autenticado, o IP en legacy. Acepta 1800/min más margen. |
| `MIMIX_IDENTITY_FILE` | Ruta absoluta en volumen persistente, obligatoria en Clerk con MIMIX_DATA_STORE=file. Ejemplo `/data/mimix/identity.json`. |
| `CLERK_SECRET_KEY` | Secreto de instancia del servidor, obligatorio en Clerk. |
| `CLERK_ISSUER` | Emisor HTTPS exacto de la instancia autorizada, sin slash final. |
| `CLERK_AUTHORIZED_PARTIES` | Orígenes de clientes autorizados; azp es obligatorio. |
| `CLERK_JWT_KEY` | Opcional: clave pública PEM de la instancia. Sin ella, el SDK obtiene JWKS. |
| `MIMIX_ROBOT_BRIDGE_TOKEN` / `MIMIX_ROBOT_CONTROL_TOKEN` | Secretos distintos para bridge y operador; nunca un token Clerk. |

Configurar CORS y azp con el origen del cliente (incluido puerto), no con el dominio
de Clerk. CORS no autentica clientes sin navegador. No aceptar `Origin: null`.
Las respuestas con origen permitido reflejan solo ese origen y `Vary: Origin`.

Con `MIMIX_DATA_STORE=file`, mantener **un proceso y una réplica**. En Docker montar `/data` con propietario
UID/GID 1000 (usuario `node`) y permisos de escritura, idealmente 0700. No guardar
identidades en la capa efímera de imagen. Para local usar una ruta absoluta bajo
`.identity-data/`, ignorada por Git y Docker. El snapshot final usa 0600; respaldarlo
como dato sensible aunque no contenga credenciales. No editar mientras el servidor
esté escribiendo. Para backup consistente, detener el único escritor y copiar el
archivo; restaurar con sus permisos antes de arrancar.

Todas las cuotas aceptan enteros 1–100000 y usan ventanas fijas de un minuto;
GET/HEAD health y preflights CORS válidos de rutas inventariadas están exentos. 429 incluye `Retry-After`. Cada ruta usa método +
pathname canónico: HEAD comparte GET, mayúsculas, slash final y query no cambian
bucket. No hay una cuota global compartida entre tráfico anónimo, usuarios y robot.
Los nombres arbitrarios de rutas inexistentes usan un solo bucket `unknown` por IP.

Antes de consumir una cuota de usuario, el SDK verifica firma, expiración, emisor y
azp. La clave es el sujeto **firmado**, no el JWT crudo ni un claim sin verificar.
Después del límite se consulta siempre el estado de sesión; no se cachea una sesión
activa. Cambiar token/sesión del mismo sujeto no restablece la cuota. Una sesión
revocada o error BAPI consume solo la cuota de su sujeto y ruta, nunca la de otro.
Las credenciales de operador y bridge se comparan primero; en modo Clerk las
incorrectas consumen la cuota anónima. En legacy usan la cuota de su ruta legacy y
el handler conserva su autenticación histórica donde corresponde. Las válidas
tienen cuotas propias incluso en modo legacy.

Hay cinco pools de memoria independientes (anónimo, legacy, usuario, operador,
bridge), cada uno acotado a 10 000 claves; llenarlos no expulsa contadores vivos.
Un pool lleno devuelve 429 con `Retry-After: 60` para nuevas claves de ese pool,
sin impedir acceso a otros pools. Los límites reinician con el proceso y no son
distribuidos. Requieren una réplica. La rotación de secreto requiere reinicio.

No se confía en X-Forwarded-For ni se activa trust proxy. Tras Railway, clientes
anónimos de la misma IP del socket siguen compartiendo cuota **en la misma clase y
ruta**. El usuario verificado y los roles de máquina quedan aislados; sin identidad
no se puede distinguir de forma fiable a dos anónimos tras ese proxy. Un atacante
anónimo no consume las cuotas autenticadas enviando rutas desconocidas ni secretos
incorrectos. El preflight no tiene credenciales de actor: si el origen, método,
ruta y headers pedidos están permitidos, responde 204 sin gastar cuota. No accede
a dominio ni BAPI. Preflights desconocidos/malformados comparten una cuota anónima
independiente y no bloquean los válidos. El ingress debe controlar el abuso
volumétrico de estas respuestas estáticas, como hace con health.

La firma se verifica antes de limitar un Bearer para no permitir que una IP anónima
sature la cuota de usuarios válidos. Esto tiene coste criptográfico; JWKS también
puede requerir red cuando no está en caché. Configurar `CLERK_JWT_KEY` permite
verificación local sin JWKS. La consulta de **sesión** BAPI queda después de la cuota.
Complementar con protección de ingress y medir capacidad/latencia; el rate limit
aplicativo no es protección completa contra DDoS. No habilitar caché positiva que
oculte revocaciones. OpenAPI publica la cuota efectiva en `x-rate-limit` y el header
`Retry-After` de 429, incluidos los overrides del entorno.

## Google en Clerk

1. Usar una aplicación/instancia Clerk de desarrollo. En **SSO connections**,
   añadir Google para todos los usuarios y habilitar sign-up/sign-in. Desarrollo
   permite credenciales OAuth compartidas por Clerk.
2. Para producción crear el cliente OAuth web en Google Cloud, configurar pantalla
   de consentimiento, orígenes autorizados y URI de redirección exacta indicada
   por Clerk. Pegar Client ID/Client Secret en la conexión Google de Clerk y
   habilitarla. El secreto Google permanece en Clerk, no en Mimix.
3. Configurar dominios/redirects del cliente y variables servidor de la misma
   instancia. Probar con usuario de prueba antes de activar el modo estricto.

Referencia: [Google como conexión social de Clerk](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google).
Verificación: [verifyToken](https://clerk.com/docs/reference/backend/verify-token) y
[getSession](https://clerk.com/docs/reference/backend/sessions/get-session).
Se usa el método de bajo nivel porque esta API acepta exclusivamente Bearer y
comprueba emisor, azp, sid y estado remoto expresamente; no hay cookie handshake.

## Harness mínimo y aceptación externa pendiente

Sin modificar frontend, usar una página de prueba Clerk del origen permitido y su
Account Portal/SignIn con Google. Desde la consola de **ese cliente autenticado**:

```js
const response = await fetch('https://YOUR_API/api/identity/me', {
  headers: { Authorization: `Bearer ${await Clerk.session.getToken()}` },
})
console.log(response.status, await response.json())
```

No imprimir tokens, pegarlos en logs ni enviarlos al robot. El backend requiere
HTTPS en cloud; el harness utiliza únicamente la clave pública del cliente.

Antes de activar `clerk` en un despliegue:

- Montar y respaldar el volumen; probar el modo con claves de desarrollo.
- Google: alta nueva → 200 y UUID; logout/login → mismo UUID; otra cuenta → otro UUID.
- Reiniciar proceso conservando volumen → mismo UUID.
- Capturar token solo en memoria del harness, revocar sesión desde Clerk y volver
  a usarlo → 401 inmediato en la siguiente petición, incluso sin expirar JWT.
- Token inválido, expirado, otra instancia u otro origen → 401; caída BAPI → 503.
- Revisar CORS, límites, bridge/control y clientes de streams con headers explícitos.
- Comprobar que frontend/harness envía credenciales en cada ruta protegida; EventSource
  nativo no permite headers arbitrarios: usar fetch streaming en un cliente futuro.

La suite local cubre firma real y HTTP con proveedor de sesión remoto simulado;
no equivale a un login Google real. Esta aceptación externa queda pendiente de
configuración de instancia y credenciales de despliegue.

## Compatibilidad, migración y rollback

Instalar con lockfile congelado, construir y arrancar mediante `pnpm start` o
`node apps/api/dist/main.js`. `MIMIX_API_RUNTIME=express` conserva la política y /me;
retira Nest y conserva el documento OpenAPI compatible. No usar `node server/src/index.js` para activación Clerk:
el lanzador antiguo la rechaza y solo permanece para compatibilidad legacy.

Para volver de Nest a Express, mantener `MIMIX_AUTH_MODE=clerk`, las claves y el
mismo volumen, reiniciar y verificar /health, /identity/me y rechazos de escritura.
En modo file, para revertir la **activación** y recuperar la web actual, cambiar explícitamente
`MIMIX_AUTH_MODE=legacy` y reiniciar: reabre las excepciones públicas inventariadas,
no borra identidades. Esta decisión reduce protección; debe ser consciente.

Si hace falta revertir el código, desplegar la imagen de `e60d461` mediante PR de
reversión, conservar el backup/volumen y recordar que esa versión no protege las
rutas con Clerk ni aplica el nuevo CORS/límite. No hacer rollback borrando snapshots.
Volver al código nuevo con el mismo archivo recupera los UUID existentes.

El prompt 06 añade importación de `users` y `identities` v1 en PostgreSQL conservando ambos
UUID y unicidad `(provider, issuer, subject)`, validar conteos y referencias, hacer
backup y sustituir `IdentityRepository`; la operación se describe en el runbook enlazado abajo.

Activación SQL, importación/exportación de UUID y rollback: [runbook de aprendizaje](learning-event-store.md).
Con `MIMIX_DATA_STORE=postgres`, el repositorio de identidad es asíncrono y transaccional;
las cuotas HTTP siguen siendo locales y requieren una réplica.
