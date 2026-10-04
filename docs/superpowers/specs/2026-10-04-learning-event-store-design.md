# Persistencia de aprendizaje — prompt 06

Base: `da3f6f1536f57f64ba3dd59726623b1a9dd90cef`, rama `feat/learning-event-store`.
Objetivo: conservar intentos individuales y progreso consultable/reconstruible en PostgreSQL mediante Drizzle, con ownership, idempotencia y concurrencia segura.

## Contrato

`MIMIX_DATA_STORE=file` por defecto conserva identidad y endpoints legacy. `postgres`
requiere Clerk y DATABASE_URL; usa identidad SQL y habilita `/api/learning` en Nest
 y Express. No hay fallback a memoria si falla PostgreSQL. No migrar al arrancar.

- POST `/api/learning/attempts`: `{idempotencyKey: UUID, challengeId, challengeVersion}`.
  IDs de reto y versión son identificadores opacos de 1–80 caracteres ASCII
  alfanuméricos con punto, guion y guion bajo; no implican catálogo validado.
- POST `/api/learning/attempts/:id/events`: `{eventId: UUID, sequence, type, payload}`.
  `sequence` es el siguiente entero (2..1000000); secuencia 1 es `attempt_started`
  generada por servidor. Tipos: `answer_submitted` con `{correct: boolean}`,
  `hint_requested`, `attempt_completed`, `attempt_abandoned` con payload vacío.
- GET `/api/learning/attempts/:id`: intento y proyección de su propietario.
- GET `/api/learning/progress`: hasta 50 proyecciones por página, orden UUID,
  cursor `after` UUID opcional. Incluye reto/versión, estado y contadores por intento.

Respuestas de creación/evento: 201 nuevo, 200 duplicado exacto; 400 contrato inválido,
401 sesión ausente/inválida, 404 intento ajeno o ausente, 409 conflicto de clave,
secuencia o intento cerrado, 429 cuota, 503 almacenamiento no disponible.
La repetición de creación devuelve el intento estable original (sin estado mutable);
el evento repetido devuelve el evento original aun después de cerrar el intento.
No se aceptan campos extra, tiempo cliente, propietario ni identificadores de proveedor.
Los eventos representan informes del cliente autenticado, no pruebas de dominio del
contenido educativo. Sin catálogo/SDK todavía, no se conceden logros ni desbloqueos.
El endpoint legacy `/api/challenges/events` sigue efímero y nunca alimenta progreso.

## Datos e invariantes

Tablas `users`, `external_identities`, `attempts`, `learning_events`, `attempt_progress`.
UUID internos conservados al importar snapshot v1. Claves externas únicas
(provider, issuer, subject); todos los intentos referencian users. Intentos fijan
reto/versión y propietario; eventos llevan FK al intento, versión de contrato 1,
secuencia, tipo, payload acotado y received_at del servidor. Progreso por intento:
status active/completed/abandoned, last_sequence, answers, correct_answers, hints.

Índices únicos: identidad externa, (user_id,idempotency_key), (attempt_id,event_id),
(attempt_id,sequence). Índice (user_id,id) para paginación por propietario.
CHECKs/FKs y trigger bloquean UPDATE/DELETE/TRUNCATE del historial; no borrado en
cascada. Administración privilegiada puede deshabilitar triggers, fuera de la API.
No rutas de edición o borrado del historial.

Cada creación incluye intento, inicio y proyección en una transacción. Reintentos
con misma clave y contenido devuelven original; contenido distinto da 409. Append
obtiene bloqueo compartido de reconstrucción y FOR UPDATE del intento; comprueba
ownership antes de idempotencia, evento duplicado antes de terminal/orden, después
inserta y actualiza proyección en la misma transacción. Orden canónico es secuencia
por intento, nunca reloj de cliente. Huecos se rechazan y pueden reintentarse cuando
llegue el predecesor. El bloqueo por intento admite exactamente un ganador ante
escrituras simultáneas de una misma secuencia.

Reconstrucción usa bloqueo advisory exclusivo de transacción compartido por todos
los writers, borra solo proyecciones y reproduce eventos ordenados con el mismo
reductor. Transacción completa: lectores ven antes o después, nunca mitad. Migración
SQL revisable y versionada con Drizzle; CLI serializa migraciones entre procesos.
Importación de identidades explícita, transaccional e idempotente; discrepancias
aborta todo. Exportación v1 permite rollback offline sin cambiar UUID nuevos.

## Operación y límites

PostgreSQL 17, Drizzle y node-postgres; sin Redis ni workers. Pool acotado y timeouts.
Clerk sigue validando sesión por petición; credenciales robot no dan ownership.
La cuota por usuario agrupa rutas dinámicas por plantilla, no por UUID.

Solo UUID, referencias de reto, contadores y hechos mínimos; sin correo, texto de
respuesta, JWT, audio, video o biometría. Historial se conserva hasta política de
retención aprobada; eliminación administrativa de datos personales necesita un
procedimiento específico, no se afirma retención indefinida como requisito legal.
Backups cifrados con acceso restringido; pg_dump/pg_restore probados sobre DB desechable.
No importar eventos legacy sin owner ni attempt verificable. Rollback conserva DB y
backup; exportar identidades bajo parada de escritor antes de volver a file.

## Verificación

PostgreSQL real: migración repetida, importación repetida/conflictiva, concurrencia
identidad/creación/append, ownership, duplicados exactos y contradictorios, huecos,
terminal, transacción fallida sin escritura parcial, append-only SQL, reconstrucción
idempotente y concurrente, paginación privada. HTTP Nest y Express con proveedor
externo simulado y SQL real. Frozen install, lint, typecheck, suite, build, smoke,
Docker con PostgreSQL, revisión independiente y CI de nuevo PR; no merge.
