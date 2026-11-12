---
status: approved
surface: platform-experience
reference: docs/runbooks/evidence/ui-play/before-desktop.png
---

# Contrato visual de `/play`

La referencia dominante es el mundo existente: escena oscura, acento amarillo,
detalle celeste y controles flotantes translúcidos. Este PR conserva canvas, guía,
geometría, movimiento y navegación; añade únicamente feedback de estado y una
alternativa semántica desplegable.

## Composición y tokens

- El mundo ocupa todo el viewport. La guía permanece arriba a la derecha.
- El estado se ancla abajo a la izquierda, cerrado por defecto, con máximo 440 px.
- Reutiliza `--surface`, `--text`, `--muted`, `--accent` y `--focus`; radio 14 px,
  borde blanco al 16 %, fondo oscuro translúcido y desenfoque de 14 px.
- Verde indica listo, ámbar degradación offline y rojo error. El texto siempre
  acompaña el color.
- En móvil usa márgenes de 12 px y una sola columna. El panel nunca supera el
  viewport y conserva objetivos interactivos de al menos 44 px.

## Estados y comportamiento

- Cargando, listo, offline durante carga, offline tras carga y error se anuncian
  mediante una región viva con mensajes distintos.
- El panel muestra disponibilidad del mundo, conexión y servicios en vivo.
- La ausencia real de agente, progreso y robot se comunica sin prometer conexión.
- La alternativa describe el mapa, enumera teclado/ratón y ofrece accesos directos
  a los dos retos instalados.
- Se respeta `prefers-reduced-motion`. No se añade una nueva librería visual.

## Antipatrones

- No cubrir el mundo con un panel permanente ni competir con la guía.
- No representar capacidades desconectadas como activas.
- No depender solo de color, canvas o movimiento para transmitir estado.

## UI-01: bienvenida y acceso de la plataforma

La dirección espacial aceptada se implementa en `/`: Galaxy, letras MIMIX 3D y
RobotExpressive. El repositorio Mimix Cuy aporta la referencia de motion y botones, sin
incorporar su carrera. El mundo educativo queda en `/mundo`; `/play` redirige allí.
El contrato anterior de estado/ayuda sigue aplicando al mundo.

- Invitado: «Comenzar como invitado» e «Iniciar sesión», disponibles aunque falle
  la decoración 3D. Sesión real: «Continuar» y «Mi cuenta».
- Acceso: composición lateral desktop; columna móvil con panel de altura natural.
  `SignIn withSignUp` conserva métodos configurados, alta, código, errores y pie
  de seguridad nativos. Mi cuenta usa identidad real y gestión nativa de Clerk.
- Botón dorado con relieve, panel oscuro y foco celeste; texto mínimo. En acceso
  el modelo cambia de encuadre sin crear otro renderer ni volver a descargarlo.
- RobotExpressive flota, se balancea, saluda con articulaciones y responde al cursor.
  Movimiento reducido fija la pose; pestaña oculta congela el tiempo de motion.
  Luces y materiales se restauran al pasar de la preview a exploración.
- Acceso sobre el mundo pausa bucle, teclado y cámara, mantiene el canvas y
  devuelve el foco al disparador. Una navegación completa restaura posición y
  cámara validadas, en la pestaña y hasta 30 minutos; no guarda auth ni progreso.
- Referencia editable: Figma `4onaRTdHTm9tMvJe2EhmuA`, tableros desktop `23:960`
  y móvil `23:2110`. Edwar aprobó la versión con RobotExpressive el 12/11/2026.

Evidencia histórica de UI-01 en [su entrega](docs/design/ui-01-delivery.md);
el estado vigente y la aprobación están en [RobotExpressive](docs/design/robot-expressive.md).

## Sustitución de personaje aprobada — 12/11/2026

Edwar eligió explícitamente RobotExpressive de Three.js y autorizó aplicarlo.
Se conservan composición, Galaxy, título, botones, Clerk y Convex. No se crean
variantes del personaje. GLB externo CC0 sin modificaciones, altura normalizada
1.8 unidades en el mapa; los gestos usan los clips propios del modelo.
La bienvenida conserva flotación ±0.14, inclinación por cursor y saludo periódico;
movimiento reducido mantiene pose estática. Las actividades se empaquetan junto a
Next para evitar que enlaces vigentes abran una versión Classic con otro modelo.
Procedencia y verificación: [RobotExpressive](docs/design/robot-expressive.md).
