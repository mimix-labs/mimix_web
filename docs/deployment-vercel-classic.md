# Mimix clásico: publicación estática

Esta rama conserva el frontend Vite/Three.js anterior a la arquitectura de octubre.
No debe fusionarse automáticamente sobre el desarrollo nuevo.

## Procedencia

Base: `c3fa02cb3e4e11baf0f0e29c407299037fa8569f` (15 de septiembre de 2026).
Un despliegue Railway anterior identifica `99a8f4a`; `git diff 99a8f4a c3fa02c -- client`
está vacío. Por ello ambos commits tienen el mismo frontend. El último despliegue
Railway no expone un hash Git que permita certificar la imagen completa exacta.

Se conservan los modelos, las escenas, los retos, los gestos y los estilos originales.
La adaptación añade `mimix-static.js` antes del código de las tres entradas HTML.
Ese modo impide abrir SSE, enviar eventos/contexto, consultar configuración remota y
montar controles de la Jetson. `?vision=robot` usa cámara local en esta publicación.
El robot 3D de la interfaz continúa disponible; el control del robot físico queda inactivo.

## Desarrollo y pruebas

```bash
npm ci --prefix client
npm test
npm run build
npm run test:browser --prefix client
```

Playwright utiliza Chromium con cámara simulada. Para instalar el navegador cuando
no exista: `cd client && npx playwright install chromium`.
Las pruebas verifican mundo escritorio/móvil, onboarding, cámara del navegador,
cambio de forma, selección de átomo/carga y ausencia de conexiones al backend.
Los gestos de manos reales requieren una persona y su webcam; no se certifican
con el patrón de vídeo de la cámara simulada.

Para inspeccionar el build:

```bash
npm run preview --prefix client -- --host 127.0.0.1 --port 5175
```

Para probar la publicación:

```bash
MIMIX_BASE_URL=https://mimix-classic.vercel.app npm run test:browser --prefix client
```

## Vercel

Proyecto independiente: `mimix-classic`, equipo `edwarmkaers-projects`.
Raíz `client`; preset Vite; instalación `npm ci`; build `npm run build`; salida `dist`.
`client/vercel.json` conserva acceso a cámara desde el mismo origen y añade cabeceras
básicas. No hay funciones, secretos, base de datos ni proceso Express en este despliegue.
No añadir una regla global SPA: los retos son páginas HTML reales, y `/api/*` debe
seguir ausente. Mantener la publicación fijada a `codex/mimix-classic-vercel` y a un
commit comprobado; no usar `main`, que contiene el trabajo de arquitectura posterior.

Las dependencias CDN originales de Three.js legacy, MediaPipe, su modelo y fuentes
siguen necesitando Internet. Los modelos del mundo se sirven desde este mismo sitio.
El build conserva la advertencia original sobre el chunk principal de más de 500 kB.

## Robot y servicios futuros

El sitio público funciona sin Convex, Supabase o Railway. Conectar un robot físico
requerirá un adaptador de coordinación en frontend y Jetson, identidad y autorización
de operador/dispositivo, expiración de comandos y parada local. Convex es una opción
para coordinación y estado; no sustituye al controlador local ni al proceso físico.
No habilitar una API pública anónima de movimiento para activar esta demo.

El backend histórico permanece como fuente, pero no se instala ni se ejecuta en
Vercel. Las instrucciones Railway de documentos anteriores son referencia histórica.

## Publicación verificada — 26 de octubre de 2026

URL: https://mimix-classic.vercel.app

Commit desplegado: `95cc91328e6ea3fed4afc0c4209a2050a0454b0e`.
Deployment: `dpl_3QNenUXuik96JPTCWBi6kadthL3r`, estado READY, production.
Rama fuente: https://github.com/mimix-labs/mimix_web/tree/codex/mimix-classic-vercel

6/6 pruebas unitarias, 4/4 Chromium locales y 4/4 Chromium en la URL pública.
Se inspeccionaron capturas de mundo escritorio/móvil y ambos retos. HTML,
configuración y modelos sirven 200; `/api/health` sirve 404. Cabeceras de cámara,
frame, referrer y nosniff verificadas. El modo browser persistió en URLs robot.
La revisión independiente no encontró problemas accionables. El equipo Vercel
quedó configurado con Node 22 para próximos builds; la salida publicada es estática.

`npm audit --omit=dev` no reporta vulnerabilidades de dependencias de producción.
Se conservan los avisos de dependencias históricas de desarrollo/build y del chunk
principal de más de 500 kB; no se actualizaron librerías para este rescate visual.
Los gestos reales y el control físico no se certificaron con esta cámara simulada.
