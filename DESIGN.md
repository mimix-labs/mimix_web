---
status: approved
surface: play
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
