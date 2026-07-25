# ADR 0001: tabla periódica en DOM

## Contexto

La interacción de Ciencia se realiza con landmarks de mano y debe mostrar los
118 elementos en una pantalla de cámara.

## Decisión

La tabla será HTML/CSS con una rejilla de 18 columnas. Three.js se reserva para
la vista atómica de un elemento ya seleccionado.

## Consecuencias

- El pinch se calcula contra el rectángulo visible de cada celda.
- La tabla completa es legible y no crea 118 luces ni texturas WebGL.
- La cámara continúa siendo el fondo de la experiencia.
