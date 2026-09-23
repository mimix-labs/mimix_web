---
status: proposed
---

# ADR 0003: Next.js para cloud y Vite para edge

La plataforma web cloud usará Next.js App Router, mientras Vite seguirá construyendo la experiencia local/offline y los artefactos aislados del runtime de retos. Next.js mejora rutas de producto, carga progresiva, páginas públicas y Clerk, pero sus funciones de servidor no existen en export estático y no deben ser requisito para operar en Jetson sin Internet. El mundo Three.js se migrará de forma incremental como código cliente compartido, con paridad y medición antes de retirar la aplicación Vite actual.
