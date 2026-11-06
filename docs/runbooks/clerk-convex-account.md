# Cuenta y persistencia cloud con Clerk y Convex

Primer incremento de MIMIX, 5 de noviembre de 2026. El repositorio avanzado sigue
siendo la base; Classic y el juego Cuy son publicaciones independientes.

## Responsabilidades y configuración

- `apps/cloud`: backend Convex. No necesita ejecutar Nest ni PostgreSQL para sus datos.
- Clerk autentica; la identidad interna se vincula por emisor y sujeto, nunca correo.
- `MIMIX_DATA_BACKEND=convex` activa el nuevo adaptador web; `api` conserva el anterior.
- `MIMIX_WEB_AUTH_MODE=clerk`, ambas claves Clerk de la misma instancia y
  `NEXT_PUBLIC_CONVEX_URL` son obligatorios al seleccionar Convex.
- Convex requiere `CLERK_JWT_ISSUER_DOMAIN` y audiencia `convex`. La instancia de
  desarrollo creada para MIMIX emite `aud: "convex"` en el token normal de sesión.
  Tanto SSR como `ConvexProviderWithClerk` usan ese token; una instalación que solo
  tenga una plantilla JWT necesita adaptar SSR para pedir explícitamente la plantilla.
- Las claves privadas viven en `.env.local` y variables cifradas de Vercel. No se
  versionan, no se incluyen en variables `NEXT_PUBLIC_*` ni se muestran en evidencia.

## Recursos de desarrollo

- Vercel: `mimix-platform`, proyecto `prj_D2sZBy1lA3V09b46HuNQOB1Soacs`.
  Node 22, raíz `apps/web`, instalación con lockfile y build de dependencias con Turbo.
- Convex: equipo `edwarfin24`, proyecto `mimix-platform`, despliegue de desarrollo
  `watchful-akita-289`. Dashboard: https://dashboard.convex.dev/t/edwarfin24/mimix-platform.
- Clerk: aplicación `MIMIX`, `app_3LiHN1sR3YhwRmyPgiOych66rGT`, instancia de desarrollo
  `ins_3LiHN7vN78aWIR3GxSECJUmnXhd`. Google y código por correo; sin contraseña.
- Las variables del proyecto Vercel están configuradas en desarrollo y preview.
  No se creó una instancia Clerk de producción ni se sustituyó Classic.

## Garantías del incremento

Las mutaciones crean un UUID interno estable y realizan una transacción para intento,
evento y proyección. Una clave de creación se limita al usuario y al reto/versión;
reintentar un evento exige el mismo contenido. Se rechazan saltos de secuencia,
mutaciones tras finalizar y acceso a intentos ajenos. La lectura usa índices y páginas
acotadas a 50 intentos, con cursor perteneciente al usuario.

`catalog.install` es interna y valida manifests del contrato compartido. Cada versión
es inmutable. Solo un manifest instalado con `progress` permite crear intentos. Los
manifests exploratorios de Matemáticas y Ciencias siguen sin generar progreso por visita.
No se convierte una respuesta del navegador en una evaluación pedagógica confiable:
esta API conserva el registro de eventos del host; validar respuestas requiere lógica
del reto correspondiente. No es una medida contra trampas.

Convex valida firma, emisor, audiencia y expiración del JWT. A diferencia del adaptador
Nest, no consulta a Clerk el estado activo de la sesión en cada operación. El token
configurado dura 60 segundos; un token ya emitido puede conservar acceso hasta que
expire después de revocar la sesión. Cerrar sesión elimina la sesión del cliente.

Las cuentas `mimix-alice+clerk_test@example.com` y `mimix-bob+clerk_test@example.com`
son fixtures de desarrollo. Clerk no envía correo a esos valores reservados en Test
mode. `mimix.integration-smoke` es un manifest de prueba instalado por el operador
solo en la base de desarrollo, no un reto público ni progreso de una persona real.

## Verificación y operación

Desde la raíz, instalar con `pnpm install --frozen-lockfile` y construir contratos:
`pnpm --filter @mimix/contracts build`. Ejecutar `pnpm --filter @mimix/cloud test`
y `pnpm --filter @mimix/cloud typecheck`. Desde `apps/cloud`, `pnpm exec convex dev
--once` regenera los archivos oficiales y comprueba el despliegue configurado.
No reutilizar el archivo `.env.local` del proyecto Cuy.

Web: `pnpm exec turbo run build --filter=@mimix/web`, seguido de las pruebas de
`@mimix/web`. La configuración pública participa en la clave de caché Turbo.
La prueba HTTP aislada `auth-shell.test.ts` necesita un build sin claves públicas
Clerk reales (o con la clave ficticia de la prueba); Next incorpora esas claves
al compilar. La comprobación con la instancia real se realiza en navegador.
Para servir el standalone con el entorno privado: desde `apps/web`, ejecutar
`node --env-file=.env.local scripts/start.mjs` y elegir `PORT`/`HOSTNAME` según entorno.

Cada recurso protegido conserva su comprobación de sesión. Los enlaces privados
no precargan redirecciones anónimas; los controles de acceso son reactivos en cliente.
El componente Clerk se muestra en español. Cargar la cuenta no crea intentos
ni declara completado un reto.

## Publicación y rollback

Validar primero un preview protegido del proyecto `mimix-platform`. Conectar la
publicación a una rama revisable del repositorio; el merge y el reemplazo de Classic
siguen siendo decisiones del usuario. Un preview de la capa backend no constituye
aceptación de la bienvenida nueva, que se diseña en el chat de UI.

Volver a `MIMIX_DATA_BACKEND=api` exige configurar el origen Nest, la misma instancia
Clerk y su persistencia SQL. No sincroniza ni migra automáticamente datos de Convex.
No borrar tablas o retirar el backend anterior como procedimiento de rollback.
Agente, voz, MQTT, robot, edge y reconciliación offline no se migraron en este incremento.
