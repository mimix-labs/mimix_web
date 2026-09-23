---
status: accepted
---

# ADR 0002: monorepo y modular monolith

Mimix Web evolucionará en este repositorio como monorepo pnpm/Turborepo y un backend modular monolith. Web, API, SDK, contratos, personajes y retos oficiales necesitan cambios coordinados; separarlos ahora aumentaría versionado y operación sin aportar escalado real. `mimix_robot` seguirá en su repositorio porque tiene runtime, hardware y ciclo de despliegue independientes. Los módulos solo pasarán a microservicios cuando exista una necesidad medible de escala, aislamiento o propiedad.
