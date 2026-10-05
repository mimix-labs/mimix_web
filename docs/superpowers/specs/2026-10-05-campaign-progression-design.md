# Campañas y progresión — prompt 10

Base exacta: `e593e1c4ce2954593c9a38399cc380ba051cce8b`; rama
`feat/campaign-progression`. Contexto 00 y prompt 10 leídos íntegramente.

## Diagnóstico y decisión

El módulo campaigns está vacío. LearningStore ya crea intentos e inicio atómicos,
serializa append por intento y reconstruye attempt_progress. Los contratos v1
aceptan finalización y abandono declarados por el cliente. Se conservan.

Opciones: otra proyección persistida exige reconstrucción/coordinación adicional;
un catálogo solo en código dificulta conservar versiones históricas; definiciones
inmutables en PostgreSQL más agregación del historial permiten evolucionar el
catálogo sin editar el progreso. Se elige la tercera, sin paquete/framework nuevo.
Reglas puras en campaigns y esquemas públicos en contracts.

## Invariantes

- Campaña identificada por id y SemVer exacto (sin metadata build); schemaVersion 1.
- DAG no vacío de hasta 100 nodos; id de nodo único, referencias exactas a retos,
  prerequisitos existentes y únicos, sin ciclos/autorreferencias. AND entre prerequisitos.
  Una secuencia es un DAG con una dependencia por nodo. Todos los nodos son requeridos.
- Definición y asociación intento/campaña/versión/nodo son append-only, protegidas
  también contra UPDATE/DELETE/TRUNCATE. La asociación debe coincidir con el reto
  y versión del intento. No hay API de edición ni publicación pública.
- Un usuario solo consulta su progreso. Intentos fuera de campaña, de otros usuarios,
  versiones o nodos no conceden crédito, incluso si el reto es idéntico.
- Solo attempt_completed concede finalización. Respuestas correctas no bastan.
  Los hechos siguen siendo declaraciones del cliente; esto no es evaluación certificada.
- Un solo intento activo por usuario/nodo/versión. Reintentos ilimitados después de
  abandono o finalización; una finalización anterior nunca se borra por reintentos.
  Un nodo se puede repetir tras completar la campaña. No hay vencimiento automático.
- Crear intento comprueba prerequisitos y persiste intento, inicio y asociación en
  una transacción. Peticiones concurrentes con distintas claves producen un ganador;
  la misma clave y contexto devuelven el mismo intento. Una clave global de usuario
  no se puede reutilizar entre contexto independiente/campaña/versión/nodo.
- Estado, contadores y desbloqueos se derivan de learning_events y asociaciones;
  no se lee attempt_progress para decidir campaña ni se escribe estado de campaña.
  Consulta agregada acotada por nodos, con snapshot consistente de eventos.

## Versiones y retrocompatibilidad

Publicar otra definición bajo id/versión existente es conflicto, incluso un título.
Agregar/quitar nodos, cambiar prerequisitos o versión de reto requiere nueva versión.
V1 sigue consultable/ejecutable; v2 comienza sin crédito. No se mezclan intentos ni
se reinterpreta el pasado. No existe alias latest ni transferencia automática.
Los endpoints learning, eventos schemaVersion 1 y SDK siguen siendo compatibles.
La creación independiente con clave de un intento de campaña falla con 409, evitando
que una repetición cambie de significado. Asociaciones ausentes no se infieren.

## API y operación

Con MIMIX_DATA_STORE=postgres (ya exige Clerk): GET /api/campaigns con cursor
id+versión y páginas de 50 resúmenes; GET /api/campaigns/:id/versions/:version;
GET .../progress; POST .../nodes/:nodeId/attempts con idempotencyKey UUID.
Todos autenticados, no-store, cuota por plantilla, sin selector de usuario.
El endpoint learning existente registra eventos. Nest y Express deben ser equivalentes.
Sin PostgreSQL las rutas quedan 404 y fuera de OpenAPI; fallos de DB producen 503
sin detalles sensibles. Contratos estrictos; errores 400/401/404/409/429/503.

Semilla opt-in mediante CLI: una secuencia técnica de dos nodos mathematics@1.0.0
y science@1.0.0. No campaña pedagógica definitiva: las vistas actuales no emiten
finalización. El seed no fabrica eventos ni usuarios. Repetir seed es idempotente.
Migración aditiva, sin modificar historial existente; rollback binario conserva
las tablas y datos nuevos. Documentar permisos mínimos, backup/restore y operación.

## Alcance y aceptación

Sin mapa, UI, economía, ranking, sensores, robot ni prompt 11. Archivos: contracts,
modules/campaigns, integración learning, database, security, OpenAPI, pruebas y docs.
TDD reglas/contratos, PostgreSQL real (concurrencia, inmutabilidad, identidad, versiones,
rebuild y CLI), HTTP ambos runtimes, gates congelados/check/build y smoke contenedor.
Revisión independiente, correcciones verificadas, PR contra main y CI verde final;
no merge. Riesgo central: crédito incorrecto o carrera al crear intento. Sin índices
por usuario/versión las consultas crecerían; incluir índices de asociación y usar
agregación SQL, nunca cargar eventos ilimitados en memoria de aplicación.
