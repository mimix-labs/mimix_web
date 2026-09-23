---
status: accepted
---

# ADR 0005: separar Agent Core, personaje y embodiment

La lógica pedagógica vivirá en `Agent Core`; la identidad narrativa en paquetes de personaje; y la salida digital o física en implementaciones de `Embodiment`. Wall-E será un personaje reemplazable, no nombre de API ni dependencia central. Un lease único elegirá el embodiment activo para evitar voces duplicadas, y cualquier movimiento físico se expresará como intención semántica sujeta a autorización y seguridad, nunca como comando directo de motor.
