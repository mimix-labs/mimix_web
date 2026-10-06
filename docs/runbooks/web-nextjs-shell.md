# Shell web Next.js (prompt 20)

`apps/web` añade inicio `/`, `/catalogo`, `/acceso/[[...sign-in]]`, `/perfil` y
`/progreso`. El dominio sigue en Nest/Fastify. No hay escrituras, campañas jugables
nuevas, ruta `/play`, captura de sensores ni mundo Three.js dentro de Next.

## Auditoría y decisiones

Base `3e48dd170dc8c6e47a1c54d4ccd98ca37fe6be87`, posterior a sync offline. Antes de
editar se revisaron UI, rutas, contratos, despliegue, accesibilidad y bundle Vite.

- Vite: `/`, `/challenges/mathematics/`, `/challenges/science/` y rutas legacy de
  rollback. Navegación del mundo por posición y `location.assign`, sin router React.
- UI: fondo `#0b111b`, tarjetas `#141c28`, amarillo `#f5c400`, texto `#f6f7f9`, foco
  `#8fd3ff`, tipografía funcional del sistema, controles de 44 px. El shell conserva
  estas decisiones. No incluye una nueva dirección visual.
- Accesibilidad base: loading con status/progressbar, ayuda DOM, foco y reduced-motion.
  El canvas no ofrece alternativa semántica completa. El shell añade navegación DOM,
  skip link, heading por página, estados anunciados y enlaces directos a los retos.
  No se afirma que este PR remedia la accesibilidad del mundo/retos heredados.
- Bundle Vite: world 643.16 kB (gzip 167.25), host 653.82 kB (gzip 171.20); advertencia
  existente >500 kB. Las dependencias Three/MediaPipe no se importan en el shell;
  solo se consumen los JSON de manifests, validados con `@mimix/contracts`.
- No existe catálogo público HTTP de retos. `/catalogo` usa los manifests oficiales
  versionados. `/api/campaigns` es autenticado y su semilla no es campaña final jugable.
- Perfil: GET `/api/identity/me` devuelve UUID interno y `createdAt`, nunca se usa el
  subject Clerk como UUID Mimix. Progreso: GET `/api/learning/progress?after=UUID`,
  páginas de hasta 50 `{attempt,progress}`, cursor nulo al terminar. La UI no deriva
  finalizaciones desde visitas ni calcula desbloqueos.

## Desarrollo y estado

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@mimix/web...
cp apps/web/.env.example apps/web/.env.local
pnpm web                         # localhost:3100, Turbopack
```

Vite continúa en 5173 y API en 4000 (`pnpm client`, `pnpm server`). `pnpm dev` inicia
los tres. `pnpm start` sigue iniciando el runtime API/Vite actual. Producción local
shell: `pnpm --filter @mimix/web start` después del build; ejecuta el standalone con
sus activos copiados. No necesita acceso a PostgreSQL ni Clerk durante el build.

Estado global mínimo: Clerk es dueño de la sesión; no hay Redux/Zustand, tokens en
localStorage, datos privados en contextos globales ni persistencia propia. Lecturas
privadas en Server Components con `cache: no-store` y render dinámico por solicitud.
El modo/auth y origen legacy se resuelven en runtime; por eso también las rutas
públicas se renderizan en servidor en este primer shell. No hay caché compartida de
perfil/progreso. El cliente valida la proyección consumida con Zod y rechaza redirects,
respuestas inválidas y solicitudes sin token. Timeout 5 s. 400, 401, 404, 429 y fallos
upstream ofrecen mensajes y recuperación; no se expone el cuerpo privado del error.

## Activación Clerk / Google

Default `MIMIX_WEB_AUTH_MODE=disabled`: público navegable, acceso explica que las
cuentas no están habilitadas y perfil/progreso redirigen a acceso. No crea identidad
local ni permite un bypass. Para habilitar:

1. Misma instancia Clerk para web y API. Activar conexión Google en Dashboard y
   configurar dominios y redirects de esa instancia. No introducir un OAuth propio.
2. Web: `MIMIX_WEB_AUTH_MODE=clerk`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` en build y
   runtime, `CLERK_SECRET_KEY` solo en runtime. El proxy monta `clerkMiddleware`;
   proxy, layout y páginas privadas consultan la sesión. `CLERK_JWT_KEY` permite
   aportar la clave pública PEM de la instancia para verificar firma sin buscar JWKS. Claves ausentes hacen fallar cerrado.
3. API: `MIMIX_AUTH_MODE=clerk`, `CLERK_SECRET_KEY`, `CLERK_ISSUER`,
   `CLERK_AUTHORIZED_PARTIES` incluyendo el origen público web, y `MIMIX_DATA_STORE=postgres`
   con `DATABASE_URL`, migraciones y backup según el runbook learning. La API conserva
   verificación de firma, azp y sesión remota activa en cada lectura aceptada.
4. `MIMIX_API_ORIGIN`: origen fijo de la API desde el servidor Next, sin path, query,
   credenciales ni fragmento. HTTPS en cloud; HTTP solo loopback o host Compose `api`.
   No necesita CORS para estas lecturas servidor a servidor. No hay proxy HTTP abierto.
5. `MIMIX_LEGACY_ORIGIN`: origen público del Vite actual, HTTPS cloud; HTTP localhost
   permitido para desarrollo. Nunca insertar secretos en esa URL.
6. Probar Google: alta/login → `/perfil`, UUID estable al salir/entrar; `/progreso`
   vacío/real, segunda cuenta sin datos de la primera, sesión revocada y API caída.
   Verificar cierre de sesión y ausencia de cuerpos/tokens en logs y HTML.

**Límite de transición:** el frontend Vite no aporta Bearer a eventos/robot heredados.
No activar Clerk sobre la API que usa hoy la demo Vite sin completar su runbook de
identidad. Para evaluar el shell autenticado, usar una API de staging con Clerk y
Postgres y mantener el Vite actual en su despliegue/origen compatible. Los enlaces a
Vite no transfieren la sesión ni prometen registrar progreso. No confundir continuidad
del explorador con una integración de aprendizaje autenticado: esa conexión es futura.

OAuth Google real no se automatiza con credenciales ficticias. Las pruebas deterministas
verifican el cliente y backend real, sus vistas y las rutas públicas; el checklist anterior
requiere la instancia externa antes de exposición autenticada a usuarios.

## Docker y operación

Servicio opt-in separado: no se cambia Railway, Dockerfile raíz, Compose edge ni routing
actual. Esta separación permite comprobar el shell y retirarlo sin afectar Vite/API.

```bash
docker build -f apps/web/Dockerfile -t mimix-web:ci .
# Para Clerk añadir --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
docker run --rm -p 3100:3100 \
  -e MIMIX_WEB_AUTH_MODE=disabled \
  -e MIMIX_API_ORIGIN=https://api.example.com \
  -e MIMIX_LEGACY_ORIGIN=https://legacy.example.com mimix-web:ci
```

Imagen Node 22 standalone, usuario `node` sin root, sin pnpm ni árbol fuente del
repositorio en runtime. PORT=3100 por defecto, configurable por plataforma. TLS y
límites de acceso se aplican en el ingress de despliegue. No publicar el puerto de
Postgres ni las claves privadas. Una imagen por clave pública; cambiarla exige rebuild.

`GET /healthz` es liveness/configuración del shell con no-store: **no prueba** disponibilidad
API/Clerk/Postgres. El health del backend se vigila por separado. Logs JSON `api_read`
registran operación, status y duración; `render_error` solo patrón de ruta. No hay
URLs completas, tokens, user IDs, payloads ni error.message en esa telemetría. Supervisar
5xx, 401/429 y latencia. Next puede emitir sus propios diagnósticos de configuración.
Permissions-Policy impide cámara/micrófono en el shell; los retos abren el otro origen.

## Validación

```bash
pnpm check
pnpm --filter @mimix/web test:browser
MIMIX_TEST_DATABASE_URL=postgres://... pnpm --filter @mimix/web test:contracts
pnpm --filter @mimix/web test:container
```

Contratos ejecutan Nest y PostgreSQL desechable con 51 intentos, dos usuarios y cursor;
el doble se limita al proveedor externo de identidad. No se modifica PostgreSQL de
producción. Una prueba adicional ejecuta Clerk real con JWT RSA de fixture, cookies/Bearer,
SSR de perfil/progreso, aislamiento entre usuarios y rechazo de sesión inválida/revocada.
El proxy conserva la URL original (`skipProxyUrlNormalize`) para evitar reescritura
externa recursiva al normalizar un host IP como localhost (Next issue #94745).
Browser usa build de producción, teclado, móvil y axe. CI conserva gates
Vite/API/edge y añade job `web-shell`, screenshots/traces como artefactos.

## Rollback y siguiente PR

Desactivar routing o detener únicamente el servicio Next; seguir usando origen Vite
actual y su imagen previa. No hay migraciones SQL ni escrituras desde este shell.
`MIMIX_WEB_AUTH_MODE=disabled` desactiva cuentas web sin alterar backend; si se cambió
la API, aplicar su runbook de rollback, sin descartar datos PostgreSQL.

Handoff prompt 21: migrar mundo a `/play` con frontera cliente, medir paridad/bundle y
compartir runtime con Vite edge. Este PR solo conserva enlaces; no inició esa migración.

Referencias: [Clerk App Router](https://clerk.com/docs/nextjs/getting-started/quickstart),
[Next proxy y normalización](https://nextjs.org/docs/app/api-reference/file-conventions/proxy),
[Next #94745](https://github.com/vercel/next.js/issues/94745).

Resultados y límites de la ejecución: [evidencia del PR](web-nextjs-shell-evidence.md).
