// Definición de aristas para el cubo (pares de índices de vértices)
export const CUBE_EDGES = [
  // Aristas de la cara frontal
  [0, 1], // abajo-izquierda a abajo-derecha
  [1, 3], // abajo-derecha a arriba-derecha
  [3, 2], // arriba-derecha a arriba-izquierda
  [2, 0], // arriba-izquierda a abajo-izquierda
  
  // Aristas de la cara trasera
  [4, 5], // abajo-izquierda a abajo-derecha
  [5, 7], // abajo-derecha a arriba-derecha
  [7, 6], // arriba-derecha a arriba-izquierda
  [6, 4], // arriba-izquierda a abajo-izquierda
  
  // Aristas que conectan frente y atrás
  [0, 4], // frente-abajo-izquierda a atrás-abajo-izquierda
  [1, 5], // frente-abajo-derecha a atrás-abajo-derecha
  [2, 6], // frente-arriba-izquierda a atrás-arriba-izquierda
  [3, 7]  // frente-arriba-derecha a atrás-arriba-derecha
];

//   6------7
//  /|     /|
// 2------3 |
// | |    | |
// | 4----|-5
// |/     |/
// 0------1

// ...existing code...

// Definición de aristas para el octaedro (6 vértices)
export const OCTAHEDRON_EDGES = [
  // Conexiones desde el punto inferior (0) a los puntos medios
  [0, 1], // inferior a derecho
  [0, 2], // inferior a frontal
  [0, 3], // inferior a izquierdo
  [0, 4], // inferior a trasero
  
  // Conexiones desde los puntos medios al punto superior (5)
  [1, 5], // derecho a superior
  [2, 5], // frontal a superior
  [3, 5], // izquierdo a superior
  [4, 5], // trasero a superior
  
  // Conexiones entre puntos medios (cuadrado en el medio)
  [1, 2], // derecho a frontal
  [2, 3], // frontal a izquierdo
  [3, 4], // izquierdo a trasero
  [4, 1]  // trasero a derecho
];

// Definición de aristas para el prisma hexagonal (12 vértices: 6 abajo + 6 arriba)
export const PRISM_EDGES = [
  // Aristas de la base inferior (hexágono)
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
  
  // Aristas de la base superior (hexágono)
  [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 6],
  
  // Aristas verticales (conectan base inferior con superior)
  [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]
];

// Definición de aristas para la pirámide (5 vértices: 4 en base + 1 en punta)
export const PYRAMID_EDGES = [
  // Aristas de la base cuadrada
  [0, 1], // base-frente-izquierda a base-frente-derecha
  [1, 2], // base-frente-derecha a base-atrás-derecha
  [2, 3], // base-atrás-derecha a base-atrás-izquierda
  [3, 0], // base-atrás-izquierda a base-frente-izquierda
  
  // Aristas desde la base hasta la punta
  [0, 4], // base-frente-izquierda a punta
  [1, 4], // base-frente-derecha a punta
  [2, 4], // base-atrás-derecha a punta
  [3, 4]  // base-atrás-izquierda a punta
];
