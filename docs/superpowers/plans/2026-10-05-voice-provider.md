# VoiceProvider Implementation Plan

Ejecución nativa con TDD y revisión independiente. El prompt autoriza continuar.
Spec: `docs/superpowers/specs/2026-10-05-voice-provider-design.md`.

1. Contrato y adaptador: pruebas RED de schemas/puerto y transporte; implementación
   mínima GREEN. Archivos `packages/voice-contract`, `apps/api/src/modules/voice`.
2. Servicio: pruebas RED de interrupción, cancelación, timeout, límites y fallback;
   implementación sin persistencia con snapshots y presupuesto por proceso.
3. Integración: pruebas RED de configuración y rutas autenticadas en Nest/Express;
   wiring, OpenAPI y seguridad. Default disabled; claves solo servidor.
4. Documentación de flujo, costos, retención, rollout/rollback y límites de escalado.
   Workspace/Docker alineados. Gates completos, revisión independiente y regresiones
   para hallazgos. Commit/push/PR contra main, adjuntar y esperar CI. No fusionar.

Foco de revisión: carrera entre solicitudes nuevas y finalización tardía; cuota
atómica antes del await; aborto durante lectura sin límite Content-Length;
redirección y voice ID malicioso; tokens/cuerpos/errores privados en logs; paridad
y autorización por usuario en ambos runtimes; dependencias runtime Docker.
