# Operación de identidad Clerk y Google

## Variables y activación incremental

`server/.env` conserva ubicación y precedencia; Turbo propaga `CLERK_*` en dev.
Nunca usar claves secretas en Vite, imagen, argumentos CLI o repositorio.

| Variable | Contrato |
| --- | --- |
| `MIMIX_AUTH_MODE` | `legacy` por defecto; `clerk` activa identidad y permisos estrictos. |
| `MIMIX_ALLOWED_ORIGINS` | Orígenes HTTP(S) exactos separados por coma; sin ruta, comodín ni slash final. Default desarrollo: localhost:5173 y localhost:4000; producción: https://mimix-web-production.up.railway.app. Sobrescribir en otros dominios. |
| `MIMIX_RATE_LIMIT` | Entero 1–100000; default 1200 solicitudes API por IP/minuto. Health exento. |
| `MIMIX_IDENTITY_FILE` | Ruta absoluta en volumen persistente, obligatoria en Clerk. Ejemplo `/data/mimix/identity.json`. |
| `CLERK_SECRET_KEY` | Secreto de instancia del servidor, obligatorio en Clerk. |
| `CLERK_ISSUER` | Emisor HTTPS exacto de la instancia autorizada, sin slash final. |
| `CLERK_AUTHORIZED_PARTIES` | Orígenes de clientes autorizados; azp es obligatorio. |
| `CLERK_JWT_KEY` | Opcional: clave pública PEM de la instancia. Sin ella, el SDK obtiene JWKS. |
| `MIMIX_ROBOT_BRIDGE_TOKEN` / `MIMIX_ROBOT_CONTROL_TOKEN` | Secretos distintos para bridge y operador; nunca un token Clerk. |

Configurar CORS y azp con el origen del cliente (incluido puerto), no con el dominio
de Clerk. CORS no autentica clientes sin navegador. No aceptar `Origin: null`.
Las respuestas con origen permitido reflejan solo ese origen y `Vary: Origin`.

Mantener **un proceso y una réplica**. En Docker montar `/data` con propietario
UID/GID 1000 (usuario `node`) y permisos de escritura, idealmente 0700. No guardar
identidades en la capa efímera de imagen. Para local usar una ruta absoluta bajo
`.identity-data/`, ignorada por Git y Docker. El snapshot final usa 0600; respaldarlo
como dato sensible aunque no contenga credenciales. No editar mientras el servidor
esté escribiendo. Para backup consistente, detener el único escritor y copiar el
archivo; restaurar con sus permisos antes de arrancar.

El rate limit es una ventana fija de un minuto, por IP real del socket. Devuelve
429 y `Retry-After`; no confía en headers reenviados. Tras un proxy Railway los
clientes pueden compartir cuota: dimensionar según carga medida y complementar
con límites en el ingress. La telemetría de 30 FPS necesita más de 1800 solicitudes
por minuto más margen para la UI. Los límites reinician con el proceso y no son
distribuidos. Las sesiones consultan BAPI por petición: considerar latencia y cuota
Clerk al dimensionar; no habilitar caché positiva que oculte revocaciones.

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
solo retira Nest/OpenAPI. No usar `node server/src/index.js` para activación Clerk:
el lanzador antiguo la rechaza y solo permanece para compatibilidad legacy.

Para volver de Nest a Express, mantener `MIMIX_AUTH_MODE=clerk`, las claves y el
mismo volumen, reiniciar y verificar /health, /identity/me y rechazos de escritura.
Para revertir la **activación** y recuperar la web actual, cambiar explícitamente
`MIMIX_AUTH_MODE=legacy` y reiniciar: reabre las excepciones públicas inventariadas,
no borra identidades. Esta decisión reduce protección; debe ser consciente.

Si hace falta revertir el código, desplegar la imagen de `e60d461` mediante PR de
reversión, conservar el backup/volumen y recordar que esa versión no protege las
rutas con Clerk ni aplica el nuevo CORS/límite. No hacer rollback borrando snapshots.
Volver al código nuevo con el mismo archivo recupera los UUID existentes.

Fase siguiente: importar `users` y `identities` v1 en PostgreSQL conservando ambos
UUID y unicidad `(provider, issuer, subject)`, validar conteos y referencias, hacer
backup y sustituir `IdentityRepository`. No se implementa esa migración aquí.
