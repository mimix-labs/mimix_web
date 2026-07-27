# Progreso de Mimix Web

Actualizado: 27 de julio de 2026.

## Estado actual

Mimix Web contiene el mundo 3D, los retos de Matematicas y Ciencias, el
puente local con el robot y la visualizacion de vision nativa de la Jetson. El
backend Express corre en el puerto 4000 y el cliente Vite en el puerto 5173.

## Entregas realizadas

- **Mundo 3D y navegacion:** se corrigieron la carga del mundo, la posicion
  inicial de Wall-E, los limites del mapa, el terreno y la continuidad del
  cruce por el puente.
- **Entradas a retos:** las entradas de Matematicas y Ciencias se ubicaron
  cerca del mundo inicial para que la navegacion sea directa.
- **Integracion con robot:** el cliente mantiene un puente de eventos con el
  backend para recibir ordenes semanticas y conectar los retos con la vision
  de la Jetson.
- **Vision nativa:** al usar `?vision=robot`, las zonas y retos reciben el
  flujo de vision de la Jetson. Con `vision_service.py` activo, los retos
  detectan la fuente nativa automaticamente; el parametro queda disponible
  para forzar el modo durante depuracion.
- **Tabla periodica:** se eliminaron los contenedores visuales sobrantes y el
  mensaje flotante de ayuda. El encabezado ahora dice **Explora los
  elementos**.
- **Modelo atomico:** el lienzo Three.js ahora se ajusta al panel de foco y
  el escalado de orbitas depende de las capas visibles. Los atomos grandes ya
  no se deforman ni desbordan el panel.

## Ejecucion en desarrollo

Desde este repositorio se pueden iniciar los dos procesos de forma separada:

```bash
npm run server
npm run client
```

En la demostracion fisica, `mimix_robot/deploy/jetson/start_mimix.sh
--physical` inicia ambos automaticamente.

## Acceso desde un celular en la red local

Con el cliente iniciado en la Jetson y el telefono en la misma red Wi-Fi:

```bash
hostname -I
```

Abrir en el telefono:

```text
http://IP_DE_LA_JETSON:5173/?vision=robot
```

La camara y el procesamiento de manos continuan en la Jetson; el telefono se
usa como pantalla e interfaz remota.

## Dependencias y control de cambios

- Las dependencias reales estan bloqueadas en `client/package-lock.json` y
  `server/package-lock.json`.
- El `package-lock.json` de la raiz no contiene dependencias y se ignora para
  evitar versionar un archivo vacio generado por ejecutar `npm install` en la
  carpeta equivocada.

## Archivos de referencia

- `client/src/core/World.js`: mundo 3D y modo de vision del robot.
- `client/src/core/RobotWebBridge.js`: eventos entre Web y robot.
- `client/public/challenges/science/`: tabla periodica y modelo atomico.
- `server/`: API local, vision y puente de ordenes del robot.
