# Mimix clásico en Vercel

Alcance aprobado en la conversación el 26 de octubre de 2026: conservar la
experiencia clásica de Railway y publicarla de forma independiente, sin backend.
El usuario autorizó proceder y usar Convex solo si resulta necesario.

## Base y límites

- Base: `c3fa02cb3e4e11baf0f0e29c407299037fa8569f`, último commit del
  15 de septiembre anterior a la evolución de arquitectura de octubre.
  El despliegue Railway anterior menciona `99a8f4a`; la única diferencia
  posterior de c3fa02c afecta la latencia del servidor, no el frontend.
  No se dispone de hash de fuente para certificar la imagen Railway exacta.
- Rama independiente: `codex/mimix-classic-vercel`.
- Conservar mundo, Wall-E, onboarding, Matemáticas, Ciencias y cámara local.
- Desactivar peticiones `/api`, SSE y control físico en la publicación estática.
- No cambiar el checkout de arquitectura nueva, Railway ni `mimix-cuy`.
- No hace falta Convex para estas funciones. Una futura integración de robot
  requerirá adaptar cliente y Jetson y autenticar el control del dispositivo.
- Publicación autorizada como nuevo proyecto Vercel `mimix-classic`.

## Ejecución

- [x] Recuperar base histórica en worktree independiente.
- [x] Probar primero que las conexiones de backend quedan inactivas en modo estático.
- [x] Añadir configuración estática compartida a las tres entradas HTML y guards
      en los adaptadores existentes; conservar el código de integración futuro.
- [x] Configurar Vercel para servir `client/dist`, sin funciones ni SPA fallback
      que convierta endpoints inexistentes en HTML.
- [x] Instalar desde lockfile y compilar Vite.
- [x] Probar navegador real: mundo y controles, retos, interacción de formas,
      selección de elementos, cámara simulada y ausencia de tráfico `/api`/SSE.
- [x] Documentar procedencia, operación, límites y validación.
- [ ] Guardar y publicar únicamente la rama clásica y desplegar el proyecto nuevo.
- [ ] Verificar la URL pública y entregar enlaces al sitio y a su fuente.

## Aceptación

Tres entradas cargan desde un servidor estático; recursos y modelos responden;
la cámara procesa en navegador y `?vision=robot` no activa Jetson en este build.
Los adaptadores no abren conexiones al backend. Las pruebas automáticas no
sustituyen una calibración real de gestos con una persona y su webcam.
