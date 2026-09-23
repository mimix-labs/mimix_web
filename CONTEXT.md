# Contexto de Mimix

Mimix es una plataforma de aprendizaje basada en retos consecutivos. Puede presentar la experiencia mediante un personaje digital o un robot físico sin cambiar la lógica pedagógica central.

## Aprendizaje

**Reto**:
Unidad jugable y versionada que declara objetivos, capacidades y criterios de finalización mediante el SDK de Mimix.
_Evitar_: Página, minijuego suelto, script

**Campaña**:
Secuencia o grafo de retos con reglas de desbloqueo y progresión.
_Evitar_: Curso, lista de páginas

**Intento**:
Ejecución de un reto por una persona, desde su inicio hasta su finalización, abandono o vencimiento.
_Evitar_: Sesión

**Evento de aprendizaje**:
Hecho inmutable producido durante un intento, como inicio, respuesta, pista, error o finalización.
_Evitar_: Estado de progreso

**Progreso**:
Proyección derivada de eventos de aprendizaje para consultar avance, logros y desbloqueos.
_Evitar_: Registro editable, porcentaje aislado

## Personas e identidad

**Usuario**:
Persona reconocida internamente por Mimix, independiente del proveedor usado para iniciar sesión.
_Evitar_: Cuenta de Google, usuario de Clerk

**Identidad externa**:
Vínculo entre un usuario de Mimix y el identificador de un proveedor de identidad.
_Evitar_: Usuario

## Agente y presencia

**Agent Core**:
Capacidad neutral de acompañamiento que razona con contexto pedagógico, recomienda acciones y usa herramientas autorizadas.
_Evitar_: Wall-E, chatbot

**Personaje**:
Configuración reemplazable de identidad narrativa, voz, apariencia y mapeo de animaciones.
_Evitar_: Agent Core

**Embodiment**:
Medio activo por el cual el agente se expresa y percibe, virtual en navegador o físico mediante robot.
_Evitar_: Personaje, dispositivo

**Lease de embodiment**:
Concesión temporal que determina qué embodiment puede hablar y actuar durante una conversación.
_Evitar_: Modo robot, bandera de silencio

**Intención de comportamiento**:
Petición semántica y acotada de movimiento o expresión que debe pasar por políticas y seguridad antes de llegar al hardware.
_Evitar_: Comando de motor, PWM

## Integraciones

**Proveedor de identidad**:
Adaptador intercambiable que autentica usuarios y emite evidencia verificable de identidad.
_Evitar_: Google OAuth

**Proveedor de voz**:
Adaptador intercambiable para síntesis, reconocimiento o conversación por voz.
_Evitar_: ElevenLabs

**Proveedor de medios**:
Adaptador intercambiable que transporta audio y video en tiempo real.
_Evitar_: LiveKit

**Sesión de dispositivo**:
Autorización limitada y revocable que vincula un robot con una sesión de Mimix sin entregar credenciales del usuario al robot.
_Evitar_: Token de usuario
