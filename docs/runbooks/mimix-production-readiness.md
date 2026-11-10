# Preparación de producción de MIMIX

Estado comprobado el 9 de noviembre de 2026. El usuario pidió continuar servicios;
la adaptación visual pertenece a «Mimix · Web y Three.js».

## Inventario comprobado

| Recurso | Estado actual |
| --- | --- |
| Clerk MIMIX | `app_3LiHN1sR3YhwRmyPgiOych66rGT`; solo instancia development |
| Convex desarrollo | `watchful-akita-289`; Clerk y datos por propietario verificados |
| Convex producción | `handsome-cheetah-204`; existe y no tiene variables de entorno configuradas |
| Vercel avanzado | `mimix-platform`, `prj_D2sZBy1lA3V09b46HuNQOB1Soacs`; preview READY desde `7598cf3` |
| Dominio Vercel adjunto | `mimix-platform.vercel.app`; ningún dominio propio adjunto |
| Repositorio | PR #24 abierto, sin merge, con ocho checks SUCCESS |
| UI integrada | Trabajo local del chat UI; pendiente de su commit/PR y preview actualizado |

No se publicaron claves de producción ni se migraron usuarios o fixtures de prueba.
Crear una instancia Clerk de producción requiere el dominio que el usuario elija;
la operación no se puede deshacer. El dominio y su proveedor DNS se han consultado
al usuario. No comprar un dominio ni reutilizar los de otra aplicación por inferencia.

## Secuencia de activación

1. Recibir el dominio propio y acceso a sus DNS. Clerk no admite `*.vercel.app`
   para su instancia de producción. Conservar la beta actual hasta definirlo.
2. Crear Clerk production con ese dominio, copiar los ajustes compatibles y
   completar los registros DNS/certificados que devuelva Clerk. Volver a comprobar
   correo sin contraseña, Google, audiencia `convex` y duración de sesión.
3. Configurar credenciales OAuth de Google propias de producción. Las compartidas
   de desarrollo no se pueden reutilizar. Usar el redirect URI mostrado por Clerk.
   Introducir secretos en los servicios, nunca en chat ni archivos versionados.
4. En Convex production fijar `CLERK_JWT_ISSUER_DOMAIN` al emisor definitivo de
   Clerk production; desplegar el mismo schema/funciones revisados. Conservar
   separadas las identidades development/production: no enlazarlas por correo.
5. Configurar exclusivamente el entorno Production de Vercel según la matriz;
   validar dominio y callbacks definitivos. Mantener Development/Preview actuales.
6. Publicar una revisión Git concreta que incluya servicios y la UI entregada por
   su chat. Probar correo, Google, cuenta nueva, reingreso, cierre, rechazo anónimo,
   aislamiento de usuarios y retorno al mundo en esa revisión.
7. Activar la publicación definitiva tras la revisión del usuario; el merge a main
   sigue correspondiéndole. Classic y el juego Cuy conservan sus proyectos separados.

## Matriz de configuración

| Destino | Variable | Valor que corresponde |
| --- | --- | --- |
| Vercel Production | `MIMIX_WEB_AUTH_MODE` | `clerk` |
| Vercel Production | `MIMIX_DATA_BACKEND` | `convex` |
| Vercel Production | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` de MIMIX production |
| Vercel Production | `CLERK_SECRET_KEY` | `sk_live_…` de esa misma instancia; cifrada |
| Vercel Production | `NEXT_PUBLIC_CONVEX_URL` | URL del despliegue production, no `watchful-akita-289` |
| Vercel Production | `MIMIX_WORLD_MODE` | `next` |
| Vercel Production | `MIMIX_LEGACY_ORIGIN` | Origen HTTPS verificado de los retos oficiales; evitar el valor localhost por defecto |
| Convex Production | `CLERK_JWT_ISSUER_DOMAIN` | Emisor HTTPS de Clerk production |
| Vercel Production, si se automatiza el deploy Convex | `CONVEX_DEPLOY_KEY` | Clave de production con permiso `deployment:deploy`; cifrada y solo Production |

El despliegue actual de Vercel construye la web y no despliega automáticamente
Convex. No añadir una clave de producción a Preview. Al automatizar ambos en el
monorepo, ejecutar Convex desde `apps/cloud` y el build Turbo de la web desde la
raíz; verificar que la URL inyectada corresponde al backend que acaba de publicarse.

## Progreso de aprendizaje

El almacén Convex acepta intentos/eventos autorizados y la web lee el progreso.
Matemáticas y Ciencias actuales son exploración abierta y no declaran `progress`.
Por tanto, visitar o cerrar esas experiencias no es una finalización de aprendizaje.
El siguiente incremento necesita un reto con eventos y criterio de finalización
explícitos, o un historial de exploración diferenciado; no habilitar resultados
ficticios para demostrar la base de datos. El juego Cuy y su ranking permanecen fuera.

## Reversión

Conservar los despliegues y entornos de desarrollo actuales. Si falla la activación,
volver a la revisión/configuración previa del proyecto avanzado sin borrar usuarios,
eventos ni tablas. Cambiar a `MIMIX_DATA_BACKEND=api` exige el Nest/SQL existente;
no migra ni sincroniza automáticamente los datos Convex.

## Fuentes de requisitos

- https://clerk.com/docs/guides/development/deployment/vercel
- https://clerk.com/docs/guides/development/deployment/production
- https://docs.convex.dev/production/hosting/vercel
