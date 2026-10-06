# Shell Next.js — plan y registro

Spec: prompts 00 y 20; base `3e48dd170dc8c6e47a1c54d4ccd98ca37fe6be87`.
Rama exacta `feat/web-nextjs-shell`. Ejecución directa autorizada sin otro gate.

1. [x] Cliente HTTP tipado con validación runtime, no-store, timeout, Bearer solo servidor y errores seguros. Pruebas de sesión ausente, dos usuarios, respuestas inválidas, cursor, redirecciones y caída de API.
2. [x] App Router: inicio, catálogo desde manifests, acceso Clerk, perfil UUID Mimix y progreso paginado. Estado compartido limitado a Clerk; datos privados por solicitud. Sin mutaciones de dominio ni progreso inventado. Pruebas de rutas, estados, teclado y accesibilidad.
3. [x] Docker standalone opt-in, health, logs JSON sin tokens/PII, Turbopack, gates Turbo/CI y runbook. Smoke real de imagen, build Vite de rollback y gates del repositorio.
4. [x] Revisión independiente, correcciones, commits, push y PR hacia main. No merge ni prompt 21.

Archivos: apps/web (app, lib, proxy, instrumentation, tests, config, Dockerfile),
package.json, pnpm-lock.yaml, turbo.json, eslint.config.js, ignores, CI, README y docs.

Decisiones: mantener tokens en Server Components, sin proxy genérico de API ni store
cliente. Catálogo estático importado de manifests porque el backend no publica catálogo
público de retos. Learning tiene contratos de salida internos: validar la proyección
consumida en web y comprobar compatibilidad contra el handler real en pruebas.
Vite permanece en su origen actual; URL configurada en servidor, sin ruta /play nueva.
OAuth Google real exige instancia Clerk y configuración externa; prueba manual de
activación separada de pruebas deterministas sin secretos.

Auditoría previa: client/index.html, src/ui/styles.css, ChallengeZone, vite.config.js;
rutas / y /challenges/{mathematics,science}/; legacy /legacy/challenges/. Semántica
DOM parcial con dialogs y foco, canvas sin contenido alternativo. Bundle base:
world 643.16 kB / gzip 167.25; host 653.82 kB / gzip 171.20. Vite advierte >500 kB.
Build directo inicial falló por dist de paquetes ausentes; build ordenado con Turbo
pasó. Ninguna modificación necesaria al cliente Vite.

Review focus: no filtración de sesión por caché; no Bearer a redirect; ninguna clave
privada en bundle; progreso paginado real; fallback sin Clerk con rutas públicas útiles.

Registro: cliente y superficies completos. Revisión independiente encontró arranque
con puerto fijo y ausencia de cobertura Clerk/SSR; ambos corregidos. La prueba nueva
reprodujo Next #94745, resuelto conservando URL en proxy. Gate completo pasa con
concurrencia 2; límites, timeouts previos y métricas constan en el runbook de evidencia.

Cierre: build standalone y smoke Docker verificados. Vite y despliegue actual intactos.
