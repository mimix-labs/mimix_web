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

- `pnpm check --concurrency=1`: 60/60 tareas, sin fallos (incluye auth SSR).
- Pruebas de escala, locomoción, saludo y exclusión del asset retirado: pasando.
- Pruebas de preview/reduced motion, transición, cursor y materiales: pasando.
- Chromium plataforma: 18/18 casos ejecutados, 2 casos opt-in de cuenta real omitidos.
- Chromium cliente: 32/32 casos, incluidos legado/paquetes, sensores simulados,
  colisiones, portales, lifecycle y motion.
- Shell tras cerrar el último enlace Classic: 4/4; tipos sin errores.
- Firefox: 4/4 casos de bienvenida desktop/móvil, saludo, cursor y reduced motion.
- Contenedor: construcción completa en curso; las descargas del registro npm son
  lentas. El PR conserva la comprobación de imagen standalone en CI. El resultado
  local se añade cuando termine; no se declara aprobado antes de ejecutarlo.
- WebKit: pendiente de CI (el host local carece de sus librerías del sistema).
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
No se ha cambiado `main`, realizado merge ni desplegado esta sustitución.
