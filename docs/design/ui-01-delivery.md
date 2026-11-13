# UI-01 · bienvenida Wall-E y acceso de MIMIX

> Documento histórico de UI-01, anterior al reemplazo aprobado el 12/11/2026.
> Se conserva como evidencia; no describe el personaje vigente ni debe adjuntarse
> a la nueva revisión del expediente. Estado y capturas actuales en
> [RobotExpressive](robot-expressive.md).

Base apilada explícita: `7598cf3`, PR de servicios #24. Rama
`feat/ui-01-platform-welcome`; este PR solo entrega UI y sus dependencias de render.
No ejecutar merge ni despliegue desde este trabajo.

## Resultado

La plataforma abre una bienvenida mínima con Galaxy, título MIMIX 3D, Wall-E y
entrada de invitado o cuenta. `/mundo` carga directamente el mapa educativo;
`/play` conserva compatibilidad mediante redirect. La portada previa permanece
en `/inicio-anterior`. Catálogo, retos y guardas de sesión siguen disponibles.

La escena se mantiene entre bienvenida/acceso y se reencuadra en desktop/móvil.
El acceso usa `SignIn withSignUp`, Appearance y localización de Clerk; no se crea
un formulario de alta propio ni se cambian métodos de acceso. Cuenta presenta la
identidad actual, abre la gestión nativa y permite cerrar sesión con error real.

Acceso abierto desde mundo conserva el montaje y pausa entrada/bucle. Cancelar
restaura foco; login vuelve al origen interno validado o a bienvenida. La posición
y cámara de la pestaña tienen un snapshot acotado, validado contra terreno y con
caducidad de 30 minutos para restauración tras navegación completa. No es progreso
persistido ni autenticación almacenada.

## Referencia y motion

[Figma desktop](https://www.figma.com/design/4onaRTdHTm9tMvJe2EhmuA?node-id=23-960)
y [móvil](https://www.figma.com/design/4onaRTdHTm9tMvJe2EhmuA?node-id=23-2110).
La dirección visual fue aceptada; la revisión final en producto sigue pendiente.

[Mimix Cuy](https://github.com/Edwarmkaer/mimix-cuy), revisión
`c4b70f8f54f835b9287817fb818abad914fc0ce2`, es referencia de animación/estilo:
flotación ±0,14, balanceo ±0,025 rad, cursor amortiguado y botón con relieve.
Wall-E usa su animador procedural existente porque su GLB no tiene clips Float
ni Wave. Los materiales conservan la paleta, con luz frontal y contorno frío.
Movimiento reducido mantiene la pose estática y se limpian eventos/recursos al salir.

## Selección y exclusiones

Se incluyen las rutas/componentes de experiencia, API de pausa/contexto del mundo,
Galaxy/partículas/título/luces y sus licencias, pruebas unitarias y de navegador.
Se conserva la corrección offline de la base de servicios.

Quedan fuera la carrera Cuy, sus fuentes/modelos/sonidos, la ruta floor-is-lava,
la excepción de cámara y sus scripts de distribución, maquetas .pen e historial
local. Todos siguen intactos en el checkout de origen. No cambian configuración,
credenciales, sesión, proxy, proveedores, datos, contratos ni despliegues. El layout
raíz solo cambia la localización UI de Clerk. No se incluyen trazas de sesiones.

## Verificación

Selección limpia verificada el 9 de noviembre:

- `pnpm install --frozen-lockfile`: correcto.
- Build completo: 20/20 tareas.
- `pnpm check --concurrency=1`: 60/60 tareas (lint, tipos, suites y smoke),
  281 comprobaciones aprobadas entre las suites; mundo 42/42, web 15/15.
- Chromium web: 15/15; dos casos Clerk opcionales omitidos.
- Chromium de mundo/motion/luces/retorno: 7/7, incluyendo 1280 y 390 px,
  movimiento reducido y liberación de recursos.
- Tipos web y lint dirigido finales: correctos; diff sin errores de whitespace.
- Revisión independiente: corregida una reentrada automática al restaurar una
  posición de portal; prueba nueva falló antes de la corrección y pasó después.
  El portal exige salir y volver a entrar. Segunda revisión sin bloqueos.

El primer intento paralelo tuvo agotamientos de tiempo de CPU, resueltos al
separar los procesos pesados de WebGL y ejecutar la comprobación general en serie.
La prueba de entrada espera la carga real del mundo antes de comprobar su URL.
Los dos recorridos Clerk reales se validaron en el incremento integrado previo;
esta extracción no repite Google personal ni crea cuentas. CI remota se verifica
al abrir el PR; Docker y pruebas remotas quedan a ese flujo.

[Bienvenida](previews/ui-01-platform/experience-home-desktop.png) ·
[Acceso](previews/ui-01-platform/experience-access-desktop.png) ·
[Error móvil](previews/ui-01-platform/experience-code-error-mobile.png) ·
[Cuenta móvil](previews/ui-01-platform/experience-account-mobile.png) ·
[Mundo](previews/ui-01-platform/experience-world-desktop.png).
Bienvenida y mundo se recapturaron desde la selección limpia; las tres vistas
Clerk proceden del incremento de desarrollo previamente comprobado. No acreditan
publicación ni producción.

Auth opcional: con Next local en 4311 y el entorno privado de desarrollo existente,
`MIMIX_AUTH_SMOKE=1 pnpm --filter @mimix/web exec playwright test -c playwright.auth.config.ts`.
La suite normal omite esos casos. No se crean usuarios nuevos ni se cambian claves.
Dos nombres accesibles internos del SDK siguen en inglés (código y cierre del modal).

## Riesgo y rollback

Riesgo medio: cambian rutas y ciclo de vida de WebGL/acceso. Revisar entrada sin
3D, foco al cancelar, retorno tras login y controles de ayuda en móvil. Producción
Clerk/Convex y la revisión visual definitiva quedan fuera de esta entrega.
Rollback: revertir los commits de UI en orden inverso; no hay migraciones de datos
ni escrituras de progreso que revertir. Mantener el PR de servicios como base.

## Ajuste de estabilidad de CI — 9 de noviembre

La primera corrida remota aprobó siete de ocho jobs. El único fallo fue el
retorno al centro en la prueba de bienvenida: WebGL por software produjo menos
fotogramas que los necesarios dentro del plazo original de cinco segundos. El
test conserva el límite angular de 0,01 rad y permite hasta 30 segundos para
ese paso, dentro de un caso de 120 segundos. No cambia el código de animación.
Los seis casos Chromium/Firefox pasan localmente. WebKit local carece de dos
librerías del sistema; el workflow remoto instala sus dependencias y es la
validación para ese motor. El estado vigente se consulta en los checks del PR #26.

## Integración autorizada — 10 de noviembre

Edwar autorizó fusionar el trabajo probado tras coordinar con registro de software.
Servicios confirmó la compatibilidad; #24 se integró en main (`99203b4`). #25 y
#26 se retargetearon a main. La prueba de intro comparte ahora el margen de espera
para frames lentos: no cambian sus umbrales ni código de animación. Ocho casos
Chromium/Firefox pasan; los checks del SHA final deben estar verdes antes del merge
de UI. No se habilita producción ni se realiza despliegue por esta coordinación.

Las esperas de render se unificaron en `client/test/browser/rendering.js` para no
repetir la suposición de cinco segundos en distintas pruebas del mismo motor.
Los umbrales e imágenes no cambian; no se modifica la configuración de CI ni el
producto. Pasan los veinte casos locales de esos archivos en Chromium/Firefox.
