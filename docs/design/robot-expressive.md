# RobotExpressive en MIMIX

## Decisión y alcance

El 12/11/2026 Edwar seleccionó RobotExpressive después de revisar propuestas y
pidió aplicar los cambios necesarios. La pregunta sobre fabricar más personajes
con ese estilo fue conceptual; no autoriza variantes. Se conserva la UI aprobada.

Se reemplaza el modelo en bienvenida, mundo y acompañante de Matemáticas;
Ciencias conserva su exploración atómica sin introducir un personaje nuevo.
Los enlaces de mundo y catálogo abren las actividades empaquetadas en el mismo
origen de Next, evitando depender de mimix-classic.vercel.app. No se modifica
Mimix Cuy, robot físico, proveedores de identidad, progreso ni contratos de datos.

## Procedencia

Recurso de terceros, no creación original ni propiedad exclusiva de MIMIX:
Tomás Laulhé, con modificaciones de Don McCurdy. Copia distribuida en Three.js,
commit `b924f0cad4058dc4dde71445c796980c3cd5b5ed`.

- [Fuente y README CC0](https://github.com/mrdoob/three.js/tree/b924f0cad4058dc4dde71445c796980c3cd5b5ed/examples/models/gltf/RobotExpressive)
- GLB: `packages/world/assets/robot-expressive/RobotExpressive.glb`.
- SHA-256: `047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319`.
- `README.md`, `LICENSE.txt` (CC0-1.0) y `provenance.json` acompañan al modelo.
- El GLB no se altera; escala, selección de clips e iluminación son de ejecución.

Se documenta esta edición concreta; no se atribuye CC0 a cualquier descarga
futura del autor. CC0 no otorga exclusividad ni garantiza derechos de terceros.
Los documentos y capturas históricos conservan el personaje anterior como evidencia
histórica, sin incorporarse al artefacto público de la plataforma.

## Integración

- Altura de 1.8 unidades, base alineada al ancla de colisión; rig intacto.
- `Idle`, `Walking`, `Running`, `Wave`, `Jump`, `Dance`: correspondencias explícitas.
- Saludo vuelve a reposo y puede interrumpirse al caminar. Bienvenida usa clips
  propios y conserva flotación, cursor, luces frías y movimiento reducido.
- Copiado de assets por lista explícita; limpia la copia generada obsoleta `walle`.
- Vite empaqueta únicamente las dos actividades existentes en `apps/web/public`.
  Next publica `/challenges/{mathematics,science}/index.html` y sus alias.
  Este empaquetado desactiva el desvío `challengeRuntime=legacy` para la plataforma;
  el cliente independiente conserva su fallback. No migra todo Classic.
- Las actividades mantienen los seis transportes existentes de visión/contexto/
  comandos/eventos mediante un relay con lista explícita hacia `MIMIX_API_ORIGIN`.
  No abre endpoints privados ni crea capacidades nuevas. Sin backend, la cámara
  local conserva su fallback y las capacidades opcionales siguen no disponibles.
- La política permite cámara `(self)` solo en `/challenges/*`; el resto conserva
  cámara deshabilitada. La captura requiere el permiso del navegador.
- El compañero de Matemáticas normaliza tamaño, adapta canvas al contenedor,
  respeta movimiento reducido y evita listeners/temporizadores de saludo repetidos.

## Verificación y entrega

Resultados técnicos del commit `1f3e34454a4b3000a29bb122a537acb025cb6629`:

- `pnpm check --concurrency=1`: 60/60 tareas, sin fallos (incluye auth SSR).
- Pruebas de escala, locomoción, saludo y exclusión del asset retirado: pasando.
- Pruebas de preview/reduced motion, transición, cursor y materiales: pasando.
- Chromium plataforma: 18/18 casos ejecutados, 2 casos opt-in de cuenta real omitidos.
- Chromium cliente: 32/32 casos, incluidos legado/paquetes, sensores simulados,
  colisiones, portales, lifecycle y motion.
- Shell tras cerrar el último enlace Classic: 4/4; tipos sin errores.
- Firefox: 4/4 casos de bienvenida desktop/móvil, saludo, cursor y reduced motion.
- Docker local: imagen `mimix-web:robot-expressive` construida; `test:container`
  1/1. Verifica rutas, assets por hash, permisos de cámara, ausencia del GLB
  retirado y guardas privadas desde la imagen standalone.
- [CI del commit](https://github.com/mimix-labs/mimix_web/actions/runs/43324309873):
  ocho jobs en SUCCESS, incluidos Chromium/Firefox/WebKit y contenedor; Vercel
  también SUCCESS. WebKit se verificó en CI, no en el host local.
- PR de entrega: [#27](https://github.com/mimix-labs/mimix_web/pull/27).
- Revisión independiente: atendidos caché de builds, navegación de regreso y
  emotes repetidos; sin bloqueos adicionales reportados.
- Los escenarios de sensores usan el transporte simulado de la suite existente;
  cámara física, Jetson y firmware no forman parte de esta validación.
- Los dos casos de acceso nativo con cuenta real son opt-in; no se crean usuarios
  ni se cambian claves. El contrato SSR de Clerk sí se valida con firmas de prueba.

## Desarrollo y rollback

`pnpm --filter @mimix/web dev` empaqueta las actividades antes de iniciar Next.
Clerk/Convex usan las variables existentes; no se cambia ningún valor ni proveedor.
El nuevo empaquetado mantiene contenido público y capacidades opcionales existentes.
El rollback es revertir este PR completo; no requiere migraciones ni cambios de datos.
El despliegue público y la actualización final del expediente quedan para coordinación
con registro de software, después de revisar el PR.


## Capturas

Evidencia nueva; no sustituye ni borra las capturas históricas del expediente:

- [Bienvenida desktop](previews/robot-expressive-2026-11-12/robot-welcome-desktop.png)
- [Bienvenida móvil](previews/robot-expressive-2026-11-12/robot-welcome-mobile.png)
- [Mundo](previews/robot-expressive-2026-11-12/robot-world-desktop.png)
- [Matemáticas](previews/robot-expressive-2026-11-12/robot-mathematics-desktop.png)
- [Ciencias](previews/robot-expressive-2026-11-12/robot-science-desktop.png)


## Vista local de revisión

`http://127.0.0.1:4312/`, desde este worktree. Las variables de desarrollo se leen
al proceso desde el checkout de integración existente, sin copiarlas ni modificarlas.
`main` no se ha modificado ni se ha realizado merge o despliegue manual.
La automatización del repositorio generó una preview de Vercel al abrir el PR.


## Aprobación coordinada y criterio para registro — 12/11/2026

Edwar aprobó visualmente la web. El chat «MIMIX · Registro de software y permisos»
aprobó técnicamente el reemplazo del commit `1f3e344`: comprobó por separado
procedencia y hash upstream, pruebas del modelo, capturas, CI y ausencia del
asset retirado en los artefactos. Es aprobación técnica para la entrega, sin
certificar la admisión del expediente ni autorizar merge o publicación.

El requerimiento del revisor recibido el 10/11 pide sustituir el personaje no
autorizado en interfaz, capturas, figuras y referencias de los documentos,
manteniendo concordancia. Acepta un recurso con licencia válida. No exige
reescribir Git. Para preparar la nueva versión del expediente:

1. Usar la versión corregida y sus capturas; incluir procedencia y CC0 del recurso
   externo. Retirar referencias que describan al personaje anterior como vigente.
2. Conservar separados los commits, correos, PDFs y capturas ya enviados como
   evidencia histórica. No incluirlos en la nueva revisión del expediente ni
   realizar force-push, purga del historial o borrado de evidencia.
3. `characters/wall-e` es un fixture independiente sin modelo, fuera del código
   activo comprobado. No bloquea la aprobación técnica; excluirlo de la selección
   de código/soporte presentada para registro y no identificarlo como personaje
   vigente. Conservar los tests que exigen 404 para la URL del asset retirado.
4. Generar capturas y selección final de código del commit que se publique y
   valide; no confundir estas capturas locales con la evidencia final publicada.

### Pendiente de publicación: distribución antigua en Classic

Comprobación HTTP del 12/11/2026: la URL
`https://mimix-classic.vercel.app/assets/models/walle/walle.glb`
aún responde 200 y entrega 250772 bytes, SHA-256
`56b658397025a238be7d42b6a9a6e105ad5a5b958dc08e64044dee03f2742376`.
Desvincular Classic de la plataforma nueva no retira esa copia pública.

Al coordinar la publicación hay que retirar esa distribución antigua o redirigir
las rutas de Classic a la plataforma corregida, verificando que la URL del GLB
anterior deje de servirlo. El cierre del expediente queda pendiente de publicar,
verificar y actualizar coherentemente sus documentos. Esta entrega no elimina
proyectos/despliegues ni autoriza reescribir historial. No afirmar todavía que el
modelo desapareció de todas las URLs públicas.
